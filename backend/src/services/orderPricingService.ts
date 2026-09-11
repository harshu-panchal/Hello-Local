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
  discountAmount?: number;
}

export interface OrderPricing {
  subtotal: number;
  tax: number;
  shipping: number;
  platformFee: number;
  discount: number;
  couponCode?: string;
  couponFunding?: "PLATFORM" | "SELLER";
  tip: number;
  total: number;
  deliveryDistanceKm: number;
  /** Human-readable note when a requested coupon was not applied. */
  couponRejectionReason?: string;
  isFreeDelivery?: boolean;
  freeDeliverySubsidy?: number;
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
 * Preserves the actual physical delivery route distance for fair courier payout,
 * even when customer shipping fee is ₹0 (free delivery).
 * The client's suggestion is never used.
 */
export async function computeDeliveryFee(params: {
  subtotal: number;
  sellerIds: string[];
  deliveryLat: number;
  deliveryLng: number;
}): Promise<{
  fee: number;
  distanceKm: number;
  isFreeDelivery: boolean;
  originalFee: number;
}> {
  const { subtotal, sellerIds, deliveryLat, deliveryLng } = params;

  const settings = await AppSettings.getSettings();
  const freeThreshold = Number(settings?.freeDeliveryThreshold) || 0;
  const config = settings?.deliveryConfig;

  let standardFee = 0;
  let computedDistanceKm = 0;

  if (!config?.isDistanceBased) {
    // Flat charge from settings — not from the request body.
    standardFee = round2(Number(settings?.deliveryCharges) || 0);
    computedDistanceKm = 0;
  } else {
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
    if (origins.length === 0) {
      standardFee = base;
      computedDistanceKm = 0;
    } else {
      const distances = await getRoadDistances(
        origins,
        { lat: deliveryLat, lng: deliveryLng },
      );

      const usable = (distances || []).filter((d) => Number.isFinite(d) && d >= 0);
      if (usable.length === 0) {
        standardFee = base;
        computedDistanceKm = 0;
      } else {
        computedDistanceKm = Math.max(...usable);
        const extraKm = Math.max(0, computedDistanceKm - (Number(config.baseDistance) || 0));
        standardFee = Math.ceil(base + extraKm * (Number(config.kmRate) || 0));
      }
    }
  }

  const isFreeDelivery = freeThreshold > 0 && subtotal >= freeThreshold;
  const finalFee = isFreeDelivery ? 0 : round2(standardFee);

  return {
    fee: finalFee,
    distanceKm: round2(computedDistanceKm),
    isFreeDelivery,
    originalFee: round2(standardFee),
  };
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
}): Promise<{
  discount: number;
  code?: string;
  reason?: string;
  funding?: "PLATFORM" | "SELLER";
  applicableTo?: string;
  applicableIds?: string[];
}> {
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

  return {
    discount,
    code: coupon.code,
    funding: coupon.funding as ("PLATFORM" | "SELLER" | undefined),
    applicableTo: coupon.applicableTo || "All",
    applicableIds: (coupon.applicableIds || []).map((id) => id.toString()),
  };
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
    // Prices are tax-inclusive: tax is embedded within the selling price (MRP)
    const taxAmount = taxRate > 0 ? round2((lineTotal * taxRate) / (100 + taxRate)) : 0;

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
      discountAmount: 0,
    });
  }

  const sellerIds = [...new Set(params.lines.map((l) => l.sellerId))];
  const { fee: shipping, distanceKm, isFreeDelivery, originalFee } = await computeDeliveryFee({
    subtotal,
    sellerIds,
    deliveryLat: params.deliveryLat,
    deliveryLng: params.deliveryLng,
  });

  // All product prices are tax-inclusive; subtotal already accounts for merchandise value.
  const eligibleAmount = round2(subtotal + shipping + platformFee);
  const { discount, code, reason, funding, applicableTo, applicableIds } = await computeCouponDiscount({
    code: params.couponCode,
    customerId: params.customerId,
    eligibleAmount,
  });

  const couponFunding: "PLATFORM" | "SELLER" =
    funding || (settings as any)?.couponSettings?.defaultFunding || "PLATFORM";

  // Proportional item discount allocation
  if (discount > 0 && priced.length > 0) {
    let eligibleLines = priced;
    if (applicableTo === "Seller" && applicableIds && applicableIds.length > 0) {
      const sellerSet = new Set(applicableIds);
      const matched = priced.filter((l) => sellerSet.has(l.sellerId));
      if (matched.length > 0) eligibleLines = matched;
    } else if (applicableTo === "Product" && applicableIds && applicableIds.length > 0) {
      const prodSet = new Set(applicableIds);
      const matched = priced.filter((l) => prodSet.has(l.productId));
      if (matched.length > 0) eligibleLines = matched;
    }

    const eligibleSubtotal = round2(eligibleLines.reduce((sum, l) => sum + l.lineTotal, 0));
    const merchandiseDiscount = Math.min(discount, eligibleSubtotal);
    let allocatedSum = 0;
    let maxLine: PricedLine | null = null;
    let maxLineTotal = -1;

    for (const line of priced) {
      if (eligibleLines.includes(line) && eligibleSubtotal > 0) {
        const rawLineDiscount = Math.floor(((line.lineTotal / eligibleSubtotal) * merchandiseDiscount) * 100) / 100;
        const lineDiscount = Math.min(line.lineTotal, rawLineDiscount);
        line.discountAmount = lineDiscount;
        allocatedSum = round2(allocatedSum + lineDiscount);
        if (line.lineTotal > maxLineTotal) {
          maxLineTotal = line.lineTotal;
          maxLine = line;
        }
      } else {
        line.discountAmount = 0;
      }
    }

    // Remainder paise goes to line with largest total, clamped to line.lineTotal
    const remainder = round2(merchandiseDiscount - allocatedSum);
    if (remainder > 0 && maxLine) {
      const newDiscount = round2((maxLine.discountAmount || 0) + remainder);
      maxLine.discountAmount = Math.min(maxLine.lineTotal, newDiscount);
    }
  }

  // A tip is customer-chosen and additive, governed by admin AppSettings policy.
  // It is passed through to the courier rather than silently dropped. (#C-11)
  const tipConfig = (settings as any)?.tipSettings ?? { enabled: true, minTip: 0, maxTip: 1000 };
  const rawTip = Number(params.tipAmount) || 0;
  let tip = 0;

  if (tipConfig.enabled !== false && Number.isFinite(rawTip) && rawTip > 0) {
    const minTip = typeof tipConfig.minTip === "number" && tipConfig.minTip >= 0 ? tipConfig.minTip : 0;
    const maxTip = typeof tipConfig.maxTip === "number" && tipConfig.maxTip > 0 ? tipConfig.maxTip : 10000;
    if (rawTip >= minTip) {
      tip = round2(Math.min(rawTip, maxTip));
    }
  }

  const total = round2(Math.max(0, eligibleAmount - discount + tip));

  return {
    pricing: {
      subtotal,
      tax,
      shipping,
      platformFee,
      discount,
      couponCode: code,
      couponFunding: code ? couponFunding : "PLATFORM",
      tip,
      total,
      deliveryDistanceKm: distanceKm,
      couponRejectionReason: reason,
      isFreeDelivery: Boolean(isFreeDelivery),
      freeDeliverySubsidy: isFreeDelivery ? round2(Math.max(0, (originalFee || 0) - shipping)) : 0,
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
