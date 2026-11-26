import crypto from "crypto";
import { AdloggsClient } from "./adloggsClient";
import { AdloggsError } from "./adloggsErrors";
import { INDIA_UTC_OFFSET_MINUTES } from "./adloggsPayload";

/**
 * Adloggs serviceability for checkout (API doc V2 §2). Every seller → customer
 * route is checked independently; checkout is eligible only when ALL are
 * serviceable. Fails closed: missing data, provider errors and timeouts all
 * mean "not eligible". `estimated_price` is provider cost information only —
 * it never changes the customer's delivery fee.
 *
 * Network calls happen BEFORE the checkout transaction. The transaction then
 * re-derives the route key from its own reads and accepts the verification
 * only if it matches and has not expired.
 */

export interface RouteInput {
  sellerId: string;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupPincode: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryPincode: string | null;
  paymentType: "Online" | "COD";
}

export interface RouteResult {
  sellerId: string;
  serviceable: boolean;
  reason?: "MISSING_DATA" | "NOT_SERVICEABLE" | "PROVIDER_ERROR";
  message?: string;
  estimatedPrice: number | null;
  distanceKm: number | null;
}

export interface CheckoutServiceability {
  allServiceable: boolean;
  routes: RouteResult[];
  routesKey: string;
  verifiedAt: Date;
  expiresAt: Date;
}

export const SERVICEABILITY_TTL_MS = 2 * 60 * 1000;
const MAX_CONCURRENCY = 3;
const MAX_ROUTES = 20;
const PINCODE = /^[1-9][0-9]{5}$/;

const cache = new Map<string, { result: RouteResult; expiresAt: number }>();
export function clearServiceabilityCache() { cache.clear(); }

/** Stable key over every input that affects the answer (order-independent). */
export function routesKeyFor(routes: RouteInput[]): string {
  const normalized = routes
    .map(route => [route.sellerId, route.pickupLat, route.pickupLng, route.pickupPincode, route.deliveryLat, route.deliveryLng, route.deliveryPincode, route.paymentType])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function missingData(route: RouteInput): string | null {
  const finite = (value: number | null) => typeof value === "number" && Number.isFinite(value);
  if (!finite(route.pickupLat) || !finite(route.pickupLng)) return "Seller pickup location is missing.";
  if (!route.pickupPincode || !PINCODE.test(route.pickupPincode)) return "Seller pickup pincode is missing.";
  if (!finite(route.deliveryLat) || !finite(route.deliveryLng)) return "Delivery location is missing.";
  if (!route.deliveryPincode || !PINCODE.test(route.deliveryPincode)) return "Delivery pincode is missing or invalid.";
  return null;
}

async function checkRoute(client: AdloggsClient, route: RouteInput, now: number): Promise<RouteResult> {
  const missing = missingData(route);
  const base = { sellerId: route.sellerId, estimatedPrice: null, distanceKm: null };
  if (missing) return { ...base, serviceable: false, reason: "MISSING_DATA", message: missing };
  const key = routesKeyFor([route]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.result;
  let result: RouteResult;
  try {
    const answer = await client.checkServiceAvailability({
      partner_order_id: `SVC-${key.slice(0, 16)}`, // a check, not an order: never reused as a booking id
      pickup_lat: route.pickupLat!, pickup_long: route.pickupLng!, pickup_pincode: route.pickupPincode!,
      delivery_lat: route.deliveryLat!, delivery_long: route.deliveryLng!, delivery_pincode: route.deliveryPincode!,
      utc_offset: INDIA_UTC_OFFSET_MINUTES, payment_type: route.paymentType,
    });
    result = answer.available
      ? { ...base, serviceable: true, estimatedPrice: answer.estimatedPrice, distanceKm: answer.distanceKm }
      : { ...base, serviceable: false, reason: "NOT_SERVICEABLE", message: answer.message };
  } catch (error) {
    // Fail closed and do not cache failures.
    return { ...base, serviceable: false, reason: "PROVIDER_ERROR", message: error instanceof AdloggsError ? error.message : "Serviceability could not be verified." };
  }
  cache.set(key, { result, expiresAt: now + SERVICEABILITY_TTL_MS });
  return result;
}

/** Check every route with bounded concurrency. Never throws. */
export async function checkCheckoutServiceability(routes: RouteInput[], options: { client?: AdloggsClient; now?: Date } = {}): Promise<CheckoutServiceability> {
  const now = options.now ?? new Date();
  const client = options.client ?? new AdloggsClient();
  const routesKey = routesKeyFor(routes);
  if (!routes.length || routes.length > MAX_ROUTES) {
    return { allServiceable: false, routes: [], routesKey, verifiedAt: now, expiresAt: now };
  }
  const results: RouteResult[] = new Array(routes.length);
  let next = 0;
  const worker = async () => {
    while (next < routes.length) {
      const index = next++;
      results[index] = await checkRoute(client, routes[index], now.getTime());
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, routes.length) }, worker));
  return {
    allServiceable: results.every(result => result.serviceable),
    routes: results,
    routesKey,
    verifiedAt: now,
    expiresAt: new Date(now.getTime() + SERVICEABILITY_TTL_MS),
  };
}

/** Inside the checkout transaction: accept only a matching, unexpired, all-serviceable verification. */
export function verificationCovers(verification: CheckoutServiceability | null | undefined, routes: RouteInput[], now = new Date()): boolean {
  return !!verification && verification.allServiceable && verification.expiresAt > now && verification.routesKey === routesKeyFor(routes);
}

/** Route inputs for one cart, from already-loaded sellers and the delivery address. */
export function routesForCheckout(sellers: Array<{ _id: unknown; location?: { coordinates?: number[] }; latitude?: string; longitude?: string; pickupPincode?: string }>,
  delivery: { latitude: number; longitude: number; pincode?: string }, paymentType: "Online" | "COD"): RouteInput[] {
  return sellers.map(seller => {
    const lat = seller.location?.coordinates?.[1] ?? (seller.latitude ? Number(seller.latitude) : null);
    const lng = seller.location?.coordinates?.[0] ?? (seller.longitude ? Number(seller.longitude) : null);
    return {
      sellerId: String(seller._id),
      pickupLat: typeof lat === "number" && Number.isFinite(lat) ? lat : null,
      pickupLng: typeof lng === "number" && Number.isFinite(lng) ? lng : null,
      pickupPincode: seller.pickupPincode ?? null,
      deliveryLat: delivery.latitude, deliveryLng: delivery.longitude,
      deliveryPincode: delivery.pincode ?? null,
      paymentType,
    };
  });
}
