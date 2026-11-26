import { randomInt } from "crypto";
import type { AdloggsCreateOrderRequest } from "./adloggsTypes";
import { ADLOGGS_COD_ALLOWED } from "./adloggsConfig";

/**
 * Builds the create-order payload for ONE seller shipment (API doc V2 §1).
 * Pure and fully validated: every missing or doubtful value is reported as a
 * problem instead of being guessed. Never invented: coordinates, pincodes,
 * weights, categories, pickup deadlines, OTPs or COD amounts.
 */

export const ADLOGGS_ORDER_CATEGORIES = ["Food and Beverage", "Grocery"] as const;
/** India (IST) — the doc's own example value; Hello Local operates in India only (INR, +91, 6-digit pincodes). */
export const INDIA_UTC_OFFSET_MINUTES = 330;
const COUNTRY = "India";
const MAX_ADDRESS = 500;

export interface PickupSnapshot {
  contactName: string; address: string; city: string; state: string; pincode: string;
  lat: number; lng: number; category: string; weightKg: number;
}

export interface PayloadInput {
  shipment: { shipmentNumber: string; adloggs?: { partnerOrderId?: string; pickupSnapshot?: PickupSnapshot;
    otps?: { pickup?: string; delivery?: string; return?: string } } };
  order: {
    customerName?: string; customerPhone?: string; paymentMethod?: string; paymentStatus?: string;
    deliveryAddress?: { address?: string; city?: string; state?: string; pincode?: string; landmark?: string; latitude?: number; longitude?: number };
  };
  /** This seller's order items (cancelled ones are ignored here as well). */
  items: Array<{ productName?: string; quantity?: number; total?: number; status?: string; isManualItem?: boolean; product?: unknown }>;
  seller: {
    storeName?: string; sellerName?: string; mobile?: string; address?: string; city?: string;
    pickupState?: string; pickupPincode?: string; adloggsOrderCategory?: string;
    location?: { coordinates?: number[] }; latitude?: string; longitude?: string;
  };
  /** Shipping weight per unit (kg) by product id; missing = unknown. */
  productWeightsKg: Map<string, number | undefined>;
  pickupWindowMinutes: number | null;
  now: Date;
  /** COD only: what the rider collects for THIS shipment (see allocateCodCollectible). */
  codCollectibleAmount?: number;
}

export type PayloadResult =
  | { ok: true; payload: AdloggsCreateOrderRequest; snapshot: PickupSnapshot; problems: [] }
  | { ok: false; problems: string[] };

const PINCODE = /^[1-9][0-9]{5}$/;
const money = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

/** 10-digit Indian mobile; a +91/91 prefix is removed, nothing else is guessed. */
export function indianMobile(value: unknown): number | null {
  let digits = String(value ?? "").replace(/[\s-]/g, "").replace(/^\+/, "");
  if (/^91\d{10}$/.test(digits)) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? Number(digits) : null;
}

function coordinate(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = typeof lat === "string" ? Number(lat) : lat;
  const lo = typeof lng === "string" ? Number(lng) : lng;
  if (typeof la !== "number" || typeof lo !== "number" || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180 || (la === 0 && lo === 0)) return null;
  return { lat: la, lng: lo };
}

/** "YYYY-MM-DD HH:mm" in the given UTC offset (doc §1 pickup_date_time). */
export function formatProviderDateTime(date: Date, utcOffsetMinutes = INDIA_UTC_OFFSET_MINUTES): string {
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

function sellerPickup(input: PayloadInput, problems: string[]): Omit<PickupSnapshot, "weightKg"> | null {
  const s = input.seller;
  const point = coordinate(s.location?.coordinates?.[1] ?? s.latitude, s.location?.coordinates?.[0] ?? s.longitude);
  if (!point) problems.push("Seller pickup coordinates are missing or invalid.");
  if (!s.address?.trim()) problems.push("Seller pickup address is missing.");
  else if (s.address.trim().length > MAX_ADDRESS) problems.push("Seller pickup address exceeds 500 characters.");
  if (!s.city?.trim()) problems.push("Seller pickup city is missing.");
  if (!s.pickupState?.trim()) problems.push("Seller pickup state is missing (set it in the seller's Adloggs profile).");
  if (!s.pickupPincode || !PINCODE.test(s.pickupPincode)) problems.push("Seller pickup pincode is missing or invalid (set it in the seller's Adloggs profile).");
  if (!s.adloggsOrderCategory || !(ADLOGGS_ORDER_CATEGORIES as readonly string[]).includes(s.adloggsOrderCategory)) {
    problems.push("Seller has no verified Adloggs order category (Food and Beverage or Grocery).");
  }
  const contactName = (s.storeName || s.sellerName || "").trim();
  if (!contactName) problems.push("Seller pickup contact name is missing.");
  if (!point || problems.length) return null;
  return {
    contactName, address: s.address!.trim(), city: s.city!.trim(), state: s.pickupState!.trim(), pincode: s.pickupPincode!,
    lat: point.lat, lng: point.lng, category: s.adloggsOrderCategory!,
  };
}

export function buildAdloggsCreatePayload(input: PayloadInput): PayloadResult {
  const problems: string[] = [];
  const { order, seller } = input;

  // Payment: Online (must be paid) or COD (rider collects the allocated amount).
  const cod = order.paymentMethod === "COD";
  const prepaid = order.paymentMethod === "Online" && ["Paid", "PartiallyRefunded"].includes(String(order.paymentStatus));
  if (cod) {
    if (!ADLOGGS_COD_ALLOWED) problems.push("Adloggs COD is not enabled; COD shipments cannot be booked.");
    else if (typeof input.codCollectibleAmount !== "number" || !Number.isFinite(input.codCollectibleAmount) || input.codCollectibleAmount < 0) {
      problems.push("COD collectible amount was not computed.");
    }
  } else if (!prepaid) problems.push("Online payment is not confirmed.");

  // Items of this seller only, excluding cancelled lines.
  const items = input.items.filter(item => item.status !== "Cancelled");
  if (!items.length) problems.push("The shipment has no active items.");
  let weightKg = 0;
  const lines: AdloggsCreateOrderRequest["items"] = [];
  let totalValue = 0;
  for (const item of items) {
    const name = (item.productName || "").trim();
    const quantity = Number(item.quantity);
    const lineValue = Number(item.total); // OrderItem.total is already unit price × quantity (doc: item price × quantity)
    if (item.isManualItem) problems.push("A manual (POS) item cannot be shipped by Adloggs.");
    if (!name) problems.push("An item has no name.");
    if (!Number.isInteger(quantity) || quantity <= 0) problems.push(`Item "${name || "?"}" has an invalid quantity.`);
    if (!Number.isFinite(lineValue) || lineValue < 0) problems.push(`Item "${name || "?"}" has an invalid value.`);
    const unitWeight = input.productWeightsKg.get(String((item.product as any)?._id ?? item.product));
    if (typeof unitWeight !== "number" || !(unitWeight > 0)) problems.push(`Item "${name || "?"}" has no shipping weight.`);
    else weightKg += unitWeight * quantity;
    if (name && Number.isFinite(lineValue)) {
      totalValue += lineValue;
      lines.push({ name: name.slice(0, 200), quantity: String(quantity), price: money(lineValue) });
    }
  }

  // Pickup: frozen snapshot from the first attempt, otherwise the seller profile.
  const frozen = input.shipment.adloggs?.pickupSnapshot;
  const pickup = frozen ? { ...frozen } : sellerPickup(input, problems);

  // Delivery: the order's own stored address.
  const address = order.deliveryAddress || {};
  const drop = coordinate(address.latitude, address.longitude);
  if (!drop) problems.push("Customer delivery coordinates are missing or invalid.");
  if (!address.address?.trim() || address.address === "N/A") problems.push("Customer delivery address is missing.");
  else if (address.address.trim().length > MAX_ADDRESS) problems.push("Customer delivery address exceeds 500 characters.");
  if (!address.city?.trim() || address.city === "N/A") problems.push("Customer delivery city is missing.");
  if (!address.state?.trim()) problems.push("Customer delivery state is missing.");
  if (!address.pincode || !PINCODE.test(address.pincode)) problems.push("Customer delivery pincode is missing or invalid.");
  const deliveryPhone = indianMobile(order.customerPhone);
  if (deliveryPhone === null) problems.push("Customer mobile number is missing or invalid.");
  const pickupPhone = indianMobile(seller.mobile);
  if (pickupPhone === null) problems.push("Seller mobile number is missing or invalid.");

  if (input.pickupWindowMinutes === null) problems.push("No pickup deadline policy is configured (ADLOGGS_PICKUP_WINDOW_MINUTES).");

  const partnerOrderId = input.shipment.adloggs?.partnerOrderId || input.shipment.shipmentNumber;
  if (!partnerOrderId) problems.push("Shipment has no stable identifier.");

  if (problems.length || !pickup || !drop || deliveryPhone === null || pickupPhone === null) return { ok: false, problems: [...new Set(problems)] };

  const roundedWeight = Math.round(weightKg * 1000) / 1000;
  const snapshot: PickupSnapshot = { ...pickup, weightKg: roundedWeight };
  const payload: AdloggsCreateOrderRequest = {
    partner_order_id: partnerOrderId,
    pickup_contact_name: pickup.contactName.slice(0, 120),
    pickup_contact_no: pickupPhone,
    pickup_address: pickup.address,
    pickup_address_details: { city_name: pickup.city, state_name: pickup.state, country_name: COUNTRY, pincode: pickup.pincode },
    pickup_date_time: formatProviderDateTime(new Date(input.now.getTime() + input.pickupWindowMinutes! * 60000)),
    pickup_lat: pickup.lat,
    pickup_long: pickup.lng,
    delivery_contact_name: (order.customerName || "").trim().slice(0, 120) || undefined,
    delivery_contact_no: deliveryPhone,
    delivery_address: address.address!.trim(),
    delivery_address_details: { city_name: address.city!.trim(), state_name: address.state!.trim(), country_name: COUNTRY, pincode: address.pincode! },
    delivery_lat: drop.lat,
    delivery_long: drop.lng,
    order_category: pickup.category as AdloggsCreateOrderRequest["order_category"],
    order_total_price: money(totalValue),
    order_total_weight_in_kg: roundedWeight.toFixed(3),
    items: lines,
    utc_offset: INDIA_UTC_OFFSET_MINUTES,
    payment_type: cod ? "COD" : "Online",
    collectible_amount: cod ? Math.round((input.codCollectibleAmount ?? 0) * 100) / 100 : 0,
    // Our own shipment codes (4 digits, sent as integers per the API doc); omitted if absent.
    ...otpFields(input.shipment.adloggs?.otps),
  };
  return { ok: true, payload, snapshot, problems: [] };
}

/**
 * Seller/product eligibility for Adloggs (approved policy: sellers with missing
 * pickup information, product weights or unsupported categories stay ineligible).
 * The same rules the booking payload enforces, checked at checkout so an
 * ineligible cart is never committed to Adloggs. Pure; returns store names.
 */
export function adloggsIneligibleStores(
  sellers: Array<{ _id: unknown; storeName?: string; pickupPincode?: string; pickupState?: string; adloggsOrderCategory?: string }>,
  products: Array<{ seller: unknown; shippingWeightKg?: number | null }>,
): string[] {
  const missingWeight = new Set(products.filter(p => typeof p.shippingWeightKg !== "number" || !(p.shippingWeightKg > 0)).map(p => String(p.seller)));
  return sellers.filter(s => !s.pickupState?.trim() || !s.pickupPincode || !PINCODE.test(s.pickupPincode)
    || !s.adloggsOrderCategory || !(ADLOGGS_ORDER_CATEGORIES as readonly string[]).includes(s.adloggsOrderCategory)
    || missingWeight.has(String(s._id)))
    .map(s => s.storeName || "A store");
}

const OTP = /^[1-9][0-9]{3}$/;
/** 4-digit OTPs as integers (the doc's type); anything malformed is simply not sent. */
function otpFields(otps?: { pickup?: string; delivery?: string; return?: string }) {
  const out: { pickup_otp?: number; delivery_otp?: number; return_otp?: number } = {};
  if (otps?.pickup && OTP.test(otps.pickup)) out.pickup_otp = Number(otps.pickup);
  if (otps?.delivery && OTP.test(otps.delivery)) out.delivery_otp = Number(otps.delivery);
  if (otps?.return && OTP.test(otps.return)) out.return_otp = Number(otps.return);
  return out;
}

/** Three independent random 4-digit codes (1000-9999, so they survive integer encoding). */
export function generateShipmentOtps(now = new Date()) {
  const code = () => String(randomInt(1000, 10000));
  return { pickup: code(), delivery: code(), return: code(), createdAt: now };
}

/**
 * COD: how much each seller's rider collects. Every active item counts net of
 * its own discount; order-level charges (delivery, platform fee, tip) are shared
 * in proportion. Computed in paise with largest-remainder rounding, so the
 * shipments ALWAYS add up exactly to `orderTotal` (what the customer owes).
 * Ties go to the lower seller id, so the result is deterministic.
 */
export function allocateCodCollectible(orderTotal: number,
  items: Array<{ seller: unknown; total?: number; discountAmount?: number; status?: string }>): Map<string, number> {
  const net = new Map<string, number>();
  for (const item of items) {
    if (item.status === "Cancelled") continue;
    const seller = String(item.seller);
    net.set(seller, (net.get(seller) ?? 0) + Math.max(0, Math.round(((item.total || 0) - (item.discountAmount || 0)) * 100)));
  }
  const sellers = [...net.keys()].sort();
  const result = new Map<string, number>();
  if (!sellers.length) return result;
  const totalPaise = Math.max(0, Math.round(orderTotal * 100));
  const weightSum = sellers.reduce((sum, seller) => sum + net.get(seller)!, 0);
  const shares = sellers.map(seller => {
    const exact = weightSum > 0 ? (totalPaise * net.get(seller)!) / weightSum : totalPaise / sellers.length;
    return { seller, base: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remainder = totalPaise - shares.reduce((sum, share) => sum + share.base, 0);
  for (const share of [...shares].sort((a, b) => b.fraction - a.fraction || (a.seller < b.seller ? -1 : 1))) {
    if (remainder <= 0) break;
    share.base += 1;
    remainder -= 1;
  }
  for (const share of shares) result.set(share.seller, share.base / 100);
  return result;
}
