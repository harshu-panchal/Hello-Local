import mongoose from "mongoose";
import AppSettings from "../models/AppSettings";
import Coupon from "../models/Coupon";
import Seller from "../models/Seller";
import Tax from "../models/Tax";
import { getRoadDistances } from "./mapService";

/**
 * Server-authoritative order pricing.
 *
 * Nothing here trusts the client. Previously `createOrder` took `platformFee`
 * and `deliveryFee` straight from the request body (so a customer could post
 * `deliveryFee: 0`), never computed tax at all, and ignored `couponCode`
 * entirely — while the checkout screen showed the customer a discounted total.
 * The customer was then charged the undiscounted amount. (#C-11 / #H-03 / #H-04)
 */

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export interface PricedLine {
  productId: string;
  sellerId: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  taxRate: number;
  taxAmount: number;
}

export interface OrderPricing {
  subtotal: number;
  tax: number;
  shipping: number;
  platformFee: number;
  discount: number;
  couponCode?: string;
  tip: number;
  total: number;
  deliveryDistanceKm: number;
  /** Human-readable note when a requested coupon was not applied. */
  couponRejectionReason?: string;
}

export class PricingError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

/**
 * Resolve the tax rate for a product. Products reference a Tax document; when
 * none is set the platform default applies, and when that is absent tax is 0.
 */
export async function resolveTaxRate(
  taxRefId: mongoose.Types.ObjectId | string | undefined | null,
  defaultRate: number,
): Promise<number> {
  if (!taxRefId) return defaultRate;
  try {
    const tax = await Tax.findById(taxRefId).select("percentage rate status isActive");
    if (!tax) return defaultRate;
    const t = tax as any;
    if (t.status === "Inactive" || t.isActive === false) return defaultRate;
    const rate = Number(t.percentage ?? t.rate);
    return Number.isFinite(rate) && rate >= 0 ? rate : defaultRate;
  } catch {
    return defaultRate;
  }
}

/**
 * Compute the delivery fee from platform settings + real seller distances.
 * The client's suggestion is never used.
 */
export async function computeDeliveryFee(params: {
  subtotal: number;
  sellerIds: string[];
  deliveryLat: number;
  deliveryLng: number;
}): Promise<{ fee: number; distanceKm: number }> {
  const { subtotal, sellerIds, deliveryLat, deliveryLng } = params;

  const settings = await AppSettings.getSettings();
  const freeThreshold = Number(settings?.freeDeliveryThreshold) || 0;

  if (freeThreshold > 0 && subtotal >= freeThreshold) {
    return { fee: 0, distanceKm: 0 };
  }

  const config = settings?.deliveryConfig;

  if (!config?.isDistanceBased) {
    // Flat charge from settings — not from the request body.
    return { fee: round2(Number(settings?.deliveryCharges) || 0), distanceKm: 0 };
  }

  const ids = sellerIds.map((id) => new mongoose.Types.ObjectId(id));
  const sellers = await Seller.find({ _id: { $in: ids } }).select(
    "location latitude longitude",
  );

  const origins: { lat: number; lng: number }[] = [];
  for (const s of sellers) {
    let lat: number | undefined;
    let lng: number | undefined;
    if (s.location?.coordinates?.length === 2) {
      lng = s.location.coordinates[0];
      lat = s.location.coordinates[1];
    } else if (s.latitude && s.longitude) {
      lat = parseFloat(s.latitude);
      lng = parseFloat(s.longitude);
    }
    // Note: `0` is a valid coordinate, so check for finiteness, not truthiness.
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      origins.push({ lat: lat as number, lng: lng as number });
    }
  }

  const base = round2(Number(config.baseCharge) || 0);
  if (origins.length === 0) return { fee: base, distanceKm: 0 };

  const distances = await getRoadDistances(
    origins,
    { lat: deliveryLat, lng: deliveryLng },
  );

  const usable = (distances || []).filter((d) => Number.isFinite(d) && d >= 0);
  if (usable.length === 0) return { fee: base, distanceKm: 0 };

  const distanceKm = Math.max(...usable);
  const extraKm = Math.max(0, distanceKm - (Number(config.baseDistance) || 0));
  const fee = Math.ceil(base + extraKm * (Number(config.kmRate) || 0));

  return { fee: round2(fee), distanceKm: round2(distanceKm) };
}

/**
 * Validate a coupon and compute its discount against a server-computed base.
 * Returns 0 with a reason rather than throwing, so a stale coupon does not
 * block an otherwise valid order.
 */
export async function computeCouponDiscount(params: {
  code?: string | null;
  customerId: string;
  eligibleAmount: number;
}): Promise<{ discount: number; code?: string; reason?: string }> {
  const { code, eligibleAmount } = params;
  if (!code) return { discount: 0 };

  const coupon = await Coupon.findOne({ code: String(code).toUpperCase().trim() });
  if (!coupon) return { discount: 0, reason: "Coupon not found" };
  if (!coupon.isActive) return { discount: 0, reason: "Coupon is not active" };

  const now = new Date();
  if (now < coupon.startDate || now > coupon.endDate) {
    return { discount: 0, reason: "Coupon has expired" };
  }
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return { discount: 0, reason: "Coupon usage limit reached" };
  }
  if (coupon.minimumPurchase && eligibleAmount < coupon.minimumPurchase) {
    return {
      discount: 0,
      reason: `Order must be at least Rs.${coupon.minimumPurchase} to use this coupon`,
    };
  }

  let discount =
    coupon.discountType === "Percentage"
      ? (eligibleAmount * coupon.discountValue) / 100
      : coupon.discountValue;

  if (coupon.maximumDiscount && discount > coupon.maximumDiscount) {
    discount = coupon.maximumDiscount;
  }

  // Never discount below zero, and never more than the eligible amount.
  discount = round2(Math.min(Math.max(discount, 0), eligibleAmount));

  return { discount, code: coupon.code };
}

/**
 * Compute the definitive money for an order.
 */
export async function priceOrder(params: {
  lines: Array<{
    productId: string;
    sellerId: string;
    unitPrice: number;
    quantity: number;
    taxRefId?: mongoose.Types.ObjectId | string | null;
  }>;
  customerId: string;
  deliveryLat: number;
  deliveryLng: number;
  couponCode?: string | null;
  tipAmount?: number | null;
}): Promise<{ pricing: OrderPricing; lines: PricedLine[] }> {
  const settings = await AppSettings.getSettings();
  const defaultTaxRate = Number((settings as any)?.taxSettings?.defaultRate) || 0;
  const platformFee = round2(Number(settings?.platformFee) || 0);

  const priced: PricedLine[] = [];
  let subtotal = 0;
  let tax = 0;

  for (const l of params.lines) {
    const lineTotal = round2(l.unitPrice * l.quantity);
    const taxRate = await resolveTaxRate(l.taxRefId, defaultTaxRate);
    const taxAmount = round2((lineTotal * taxRate) / 100);

    subtotal = round2(subtotal + lineTotal);
    tax = round2(tax + taxAmount);

    priced.push({
      productId: l.productId,
      sellerId: l.sellerId,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      lineTotal,
      taxRate,
      taxAmount,
    });
  }

  const sellerIds = [...new Set(params.lines.map((l) => l.sellerId))];
  const { fee: shipping, distanceKm } = await computeDeliveryFee({
    subtotal,
    sellerIds,
    deliveryLat: params.deliveryLat,
    deliveryLng: params.deliveryLng,
  });

  // The coupon applies to goods + tax + fees, matching what the customer sees.
  const eligibleAmount = round2(subtotal + tax + shipping + platformFee);
  const { discount, code, reason } = await computeCouponDiscount({
    code: params.couponCode,
    customerId: params.customerId,
    eligibleAmount,
  });

  // A tip is customer-chosen and additive. It is passed through to the courier
  // rather than silently dropped, which is what used to happen. (#C-11)
  const rawTip = Number(params.tipAmount) || 0;
  const tip = rawTip > 0 && Number.isFinite(rawTip) ? round2(Math.min(rawTip, 10000)) : 0;

  const total = round2(Math.max(0, eligibleAmount - discount + tip));

  return {
    pricing: {
      subtotal,
      tax,
      shipping,
      platformFee,
      discount,
      couponCode: code,
      tip,
      total,
      deliveryDistanceKm: distanceKm,
      couponRejectionReason: reason,
    },
    lines: priced,
  };
}

/** Increment a coupon's usage once an order that used it is created. */
export async function consumeCoupon(
  code: string | undefined,
  session?: mongoose.ClientSession,
): Promise<void> {
  if (!code) return;
  // Usage was never counted, so limits were unenforceable. (#H-29)
  await Coupon.updateOne(
    { code: code.toUpperCase().trim() },
    { $inc: { usageCount: 1 } },
    session ? { session } : {},
  );
}

/** Give a coupon use back when the order it belonged to is cancelled. */
export async function releaseCoupon(
  code: string | undefined,
  session?: mongoose.ClientSession,
): Promise<void> {
  if (!code) return;
  await Coupon.updateOne(
    { code: code.toUpperCase().trim(), usageCount: { $gt: 0 } },
    { $inc: { usageCount: -1 } },
    session ? { session } : {},
  );
}
