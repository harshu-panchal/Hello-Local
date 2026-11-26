/**
 * Phase 6 — Adloggs integration, MOCKED. Every provider response below is a
 * documented sample from "Adloggs Ordering Partner API Doc V2" (or a
 * deliberate failure). No network, database, gateway or notification is used.
 * These tests prove our handling of the documented contract; they do NOT
 * prove Adloggs behaves this way (that needs the development sandbox).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import axios from "axios";
import Shipment from "../models/Shipment";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import Product from "../models/Product";
import AppSettings from "../models/AppSettings";
import ShipmentReconciliation from "../models/ShipmentReconciliation";
import AdloggsWebhookEvent from "../models/AdloggsWebhookEvent";
import { loadAdloggsConfig, adloggsCapabilities, ADLOGGS_HOSTS, ADLOGGS_PATHS, ADLOGGS_WEBHOOK_AUTH_CONTRACT_CONFIRMED,
  ADLOGGS_ACTIVATION_REQUIREMENTS, ADLOGGS_APPROVED_PICKUP_WINDOW_MINUTES, ADLOGGS_PICKUP_SEMANTICS_CONFIRMED, adloggsActivationBlockers } from "../services/adloggs/adloggsConfig";
import { adloggsIneligibleStores, allocateCodCollectible } from "../services/adloggs/adloggsPayload";
import { sellerCancellationRefundAmount } from "../services/orderLifecycleService";
import { ADDLOGS_INTEGRATION_AVAILABLE } from "../services/deliveryProviderService";
import OrderEffect from "../models/OrderEffect";
import { runRtoEscalationSweep } from "../services/adloggs/adloggsCancellationWorkflow";
import { aggregateExternalOutcome, shipmentOutcomeClass, releaseHeldExternalSettlements } from "../services/adloggs/adloggsOrderOutcomeService";
import { AdloggsClient, axiosTransport, AdloggsTransportRequest } from "../services/adloggs/adloggsClient";
import { AdloggsError, sanitizeProviderText } from "../services/adloggs/adloggsErrors";
import { ADLOGGS_STATUS_BY_CODE, judgeProviderTransition, shipmentStatusForProvider, safeTrackingUrl } from "../services/adloggs/adloggsStatus";
import { buildAdloggsCreatePayload, formatProviderDateTime, indianMobile } from "../services/adloggs/adloggsPayload";
import { checkCheckoutServiceability, clearServiceabilityCache, routesKeyFor, verificationCovers, SERVICEABILITY_TTL_MS, RouteInput } from "../services/adloggs/adloggsServiceability";
import { runAdloggsBookingOnce, resolveUnknownBookingOutcome } from "../services/adloggs/adloggsBookingService";
import { applyAdloggsStatus, pollAdloggsStatuses } from "../services/adloggs/adloggsTrackingService";
import { processAdloggsWebhookPayload, handleAdloggsWebhook, replayUnmatchedWebhookEvents, authenticateAdloggsWebhook } from "../services/adloggs/adloggsWebhookService";
import { runAdloggsCancellationOnce } from "../services/adloggs/adloggsCancellationService";
import { checkAdloggsWallet, updateSellerAdloggsProfile, getAdloggsAdminStatus } from "../services/adloggs/adloggsAdminService";
import { summarizeShipments, externalView } from "../services/shipmentService";

const oid = () => new mongoose.Types.ObjectId();
const src = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const fe = (rel: string) => fs.readFileSync(path.join(__dirname, "..", "..", "..", "frontend", "src", rel), "utf8");
const KEY = "dev-test-key-0123456789";
const DEV_ENV = { ADLOGGS_ENVIRONMENT: "development", ADLOGGS_API_KEY: KEY, ADLOGGS_INTEGRATION_ENABLED: "true",
  ADLOGGS_BOOKING_WORKER_ENABLED: "true", ADLOGGS_PICKUP_WINDOW_MINUTES: "30", ADLOGGS_STATUS_POLLING_ENABLED: "true",
  ADLOGGS_CANCELLATION_WORKER_ENABLED: "true" } as NodeJS.ProcessEnv;
const t0 = new Date("2026-11-25T06:30:00Z");

// Documented responses (doc V2 pp.5–8, 11).
const DOC = {
  created: { status: true, code: 200, message: "Order Created", data: { order_uuid: "ed573c62-d463-404c-b8ac-e1b433d648c9",
    trackUrl: "https://dev.adloggs.com/app/full/to?key=ed573c62-d463-404c-b8ac-e1b433d648c9", partner_order_id: "ORD1-S1", partner_merchant_id: "1322", fee: 85, distance: 9.47, meta_data: "{}" } },
  validation: { status: false, message: "Pickup address missing.", code: 202, data: {} },
  auth: { status: false, message: "Auth Error", code: 400, err: "Api key have auth issue" },
  riders: { status: false, code: 202, message: "Riders not available", data: {} },
  available: { status: true, code: 200, message: "Service available.", data: { service_available: true, to_pickup: { eta_min: 1 }, distance: 1, estimated_price: 59 } },
  unserviceable: { status: false, code: 202, message: "Currently service not available in the location", data: { service_availability: false, code: "currently_service_not_available" } },
  tooLong: { status: false, code: 202, message: "Distance too long", data: { service_available: false, code: "distance_too_long" } },
  cancelled: { status: true, code: 200, message: "The order has been successfully cancelled", data: {} },
  cancelPicked: { status: false, message: "Order already picked up.", code: 202, data: {} },
  cancelDelivered: { status: false, message: "Order already delivered.", code: 202, data: {} },
  cancelInvalid: { status: false, message: "Invalid order uuid", code: 202, data: {} },
  wallet: { status: true, code: 200, message: "Success", data: { wallet_balance: "1100.00" } },
  walletOff: { status: true, code: 200, message: "Wallet not enabled", data: { code: "wallet_not_enabled" } },
};

/** Scripted transport: responses (or thrown errors) by path; records every request. */
function transport(script: Record<string, any | any[]>) {
  const calls: AdloggsTransportRequest[] = [];
  const fn = async (request: AdloggsTransportRequest) => {
    calls.push(request);
    const pathName = request.url.replace(/^https:\/\/[^/]+/, "");
    let entry = script[pathName];
    if (Array.isArray(entry)) entry = entry.length > 1 ? entry.shift() : entry[0];
    if (typeof entry === "function") entry = await entry(request);
    if (entry instanceof Error) throw entry;
    if (entry === undefined) throw new Error(`unscripted ${pathName}`);
    return { httpStatus: entry.__http ?? 200, body: entry };
  };
  return { fn, calls };
}
const devClient = (script: Record<string, any>, env: NodeJS.ProcessEnv = DEV_ENV) => {
  const t = transport(script);
  return { client: new AdloggsClient({ transport: t.fn, env }), calls: t.calls };
};

// ==========================================================================
// Configuration and secrets
// ==========================================================================
test("config: everything is disabled by default and fails closed", () => {
  const caps = adloggsCapabilities(loadAdloggsConfig({}));
  assert.equal(caps.apiAccessAllowed, false);
  assert.equal(caps.bookingReady, false);
  assert.equal(caps.webhookReady, false);
  assert.equal(caps.codReady, false);
  assert.equal(caps.productionActivationEligible, false);
  assert.ok(caps.blockers.some(b => /ADLOGGS_ENVIRONMENT is not set/.test(b)));
});

test("config: production host is never reachable in this phase; only documented hosts exist", () => {
  const config = loadAdloggsConfig({ ...DEV_ENV, ADLOGGS_ENVIRONMENT: "production" });
  assert.equal(config.baseUrl, null);
  assert.equal(adloggsCapabilities(config).apiAccessAllowed, false);
  assert.deepEqual(ADLOGGS_HOSTS, { development: "https://dev.adloggs.com", production: "https://app.adloggs.com" });
  assert.equal(loadAdloggsConfig({ ...DEV_ENV, ADLOGGS_ENVIRONMENT: "Development" }).environment, null, "exact value required");
  assert.doesNotMatch(src("services/adloggs/adloggsConfig.ts"), /ADLOGGS_(BASE_)?URL|process\.env\.ADLOGGS_HOST/, "no configurable URL");
});

test("config: a key alone is not enough; each capability has its own gate; COD stays off", () => {
  const keyOnly = adloggsCapabilities(loadAdloggsConfig({ ADLOGGS_ENVIRONMENT: "development", ADLOGGS_API_KEY: KEY }));
  assert.equal(keyOnly.configured, true);
  assert.equal(keyOnly.apiAccessAllowed, false, "integration flag still required");
  const badWindow = adloggsCapabilities(loadAdloggsConfig({ ...DEV_ENV, ADLOGGS_PICKUP_WINDOW_MINUTES: "abc" }));
  assert.equal(badWindow.bookingReady, false, "an invalid pickup window is never replaced by a guess");
  const full = adloggsCapabilities(loadAdloggsConfig({ ...DEV_ENV, ADLOGGS_COD_ENABLED: "true", ADLOGGS_WEBHOOK_ENABLED: "true" }));
  assert.deepEqual([full.apiAccessAllowed, full.bookingReady, full.codReady, full.webhookReady, full.productionActivationEligible], [true, true, true, false, false],
    "COD is a capability of its own (env flag + booking-ready); production stays blocked");
  const codOff = adloggsCapabilities(loadAdloggsConfig({ ...DEV_ENV, ADLOGGS_COD_ENABLED: "false" }));
  assert.equal(codOff.codReady, false, "COD needs ADLOGGS_COD_ENABLED");
  assert.equal(JSON.stringify(full).includes(KEY), false, "capabilities never contain the key");
});

// ==========================================================================
// Client
// ==========================================================================
test("client: documented endpoints, POST, x-api-key, development host", async () => {
  const { client, calls } = devClient({
    [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.currentStatus]: { status: true, code: 200, message: "Success", data: { order_uuid: "u1", order_status_id: 3 } },
    [ADLOGGS_PATHS.cancelOrder]: DOC.cancelled, [ADLOGGS_PATHS.walletBalance]: DOC.wallet, [ADLOGGS_PATHS.createOrder]: DOC.created,
  });
  await client.checkServiceAvailability({ partner_order_id: "X", pickup_lat: 1, pickup_long: 1, pickup_pincode: "641654", delivery_lat: 1, delivery_long: 1, delivery_pincode: "641654", utc_offset: 330, payment_type: "Online" });
  await client.getCurrentStatus("u1");
  await client.cancelOrder("u1", "Changed my mind");
  await client.getWalletBalance();
  await client.createOrder({ partner_order_id: "ORD1-S1" } as any);
  assert.deepEqual(calls.map(c => c.url), [
    "https://dev.adloggs.com/aa/oporder/v1.2/service/availability", "https://dev.adloggs.com/aa/oporder/getcurrentstatus",
    "https://dev.adloggs.com/aa/oporder/v1.2/cancel", "https://dev.adloggs.com/aa/oporder/wallet/balance", "https://dev.adloggs.com/aa/oporder/v2/create",
  ]);
  assert.ok(calls.every(c => c.headers["x-api-key"] === KEY && c.timeoutMs === 10000 && c.maxResponseBytes > 0));
  assert.deepEqual(calls[1].body, { order_uuid: "u1" });
  assert.deepEqual(calls[2].body, { order_uuid: "u1", order_cancel_description: "Changed my mind" });
});

test("client: not configured → nothing is sent", async () => {
  const { client, calls } = devClient({}, {});
  await assert.rejects(client.getWalletBalance(), (e: any) => e.kind === "NOT_CONFIGURED" && e.mayHaveReachedProvider === false);
  assert.equal(calls.length, 0);
});

test("client: documented failures are classified from the envelope, not the HTTP code", async () => {
  const create = (body: any) => devClient({ [ADLOGGS_PATHS.createOrder]: body }).client.createOrder({ partner_order_id: "P" } as any);
  await assert.rejects(create(DOC.validation), (e: any) => e.kind === "BUSINESS_REJECTION" && e.definitive && e.providerCode === 202);
  await assert.rejects(create(DOC.auth), (e: any) => e.kind === "AUTH" && e.definitive);
  await assert.rejects(create(DOC.riders), (e: any) => e.kind === "RIDER_UNAVAILABLE" && e.definitive);
  await assert.rejects(create({ status: true, code: 200, message: "Order Created", data: {} }), (e: any) => e.kind === "MALFORMED_RESPONSE" && e.mayHaveReachedProvider);
  await assert.rejects(create("<html>gateway</html>"), (e: any) => e.kind === "MALFORMED_RESPONSE" && e.mayHaveReachedProvider);
  await assert.rejects(create({ __http: 502, oops: true }), (e: any) => e.kind === "HTTP_ERROR");
  const ok = await create(DOC.created);
  assert.deepEqual(ok, { orderUuid: DOC.created.data.order_uuid, partnerOrderId: "ORD1-S1", trackUrl: DOC.created.data.trackUrl, fee: 85, distanceKm: 9.47 });
});

test("client: serviceability handles both documented field spellings; 'no' is an answer, not an error", async () => {
  const check = (body: any) => devClient({ [ADLOGGS_PATHS.serviceAvailability]: body }).client.checkServiceAvailability({} as any);
  assert.deepEqual(await check(DOC.available), { available: true, etaToPickupMin: 1, distanceKm: 1, estimatedPrice: 59 });
  assert.equal((await check(DOC.unserviceable)).available, false);
  assert.equal((await check(DOC.tooLong)).available, false);
  // Shape observed from the real development API (Phase 7): status:false, code 202, reason in data.code.
  const observed = { status: false, code: 202, message: "Distance is higher than 15.00km.", data: { service_available: false, code: "distance_too_long" } };
  assert.deepEqual(await check(observed), { available: false, code: "distance_too_long", message: "Distance is higher than 15.00km." });
  assert.equal(((await check(DOC.unserviceable)) as any).code, "currently_service_not_available");
  assert.equal((await check({ status: true, code: 200, message: "", data: { service_availability: true } })).available, true);
});

test("client: cancel rejections, wallet states and status correlation", async () => {
  const cancel = (body: any) => devClient({ [ADLOGGS_PATHS.cancelOrder]: body }).client.cancelOrder("u", "x");
  assert.deepEqual(await cancel(DOC.cancelled), { cancelled: true });
  assert.equal(((await cancel(DOC.cancelPicked)) as any).reason, "ALREADY_PICKED_UP");
  assert.equal(((await cancel(DOC.cancelDelivered)) as any).reason, "ALREADY_DELIVERED");
  assert.equal(((await cancel(DOC.cancelInvalid)) as any).reason, "INVALID_ORDER_UUID");
  const wallet = (body: any) => devClient({ [ADLOGGS_PATHS.walletBalance]: body }).client.getWalletBalance();
  assert.deepEqual(await wallet(DOC.wallet), { state: "VERIFIED", balance: "1100.00" });
  assert.deepEqual(await wallet(DOC.walletOff), { state: "WALLET_NOT_ENABLED" });
  await assert.rejects(wallet({ status: true, code: 200, message: "Success", data: {} }), (e: any) => e.kind === "MALFORMED_RESPONSE");
  const status = devClient({ [ADLOGGS_PATHS.currentStatus]: { status: true, code: 200, message: "Success", data: { order_uuid: "other", order_status_id: 4 } } });
  await assert.rejects(status.client.getCurrentStatus("u1"), (e: any) => e.kind === "MALFORMED_RESPONSE", "a response for another order is rejected");
});

test("client transport: timeouts and dropped connections may have reached Adloggs; refused ones did not", async t => {
  const send = (code: string) => {
    t.mock.method(axios, "post", async () => { throw Object.assign(new Error("x"), { code }); });
    return axiosTransport({ url: "https://dev.adloggs.com/x", headers: {}, body: {}, timeoutMs: 10, maxResponseBytes: 10 });
  };
  await assert.rejects(send("ECONNABORTED"), (e: any) => e.kind === "TIMEOUT" && e.mayHaveReachedProvider);
  await assert.rejects(send("ECONNRESET"), (e: any) => e.kind === "TRANSPORT" && e.mayHaveReachedProvider);
  await assert.rejects(send("ECONNREFUSED"), (e: any) => e.kind === "CONNECTION_REFUSED" && !e.mayHaveReachedProvider);
  t.mock.method(axios, "post", async (_url: string, _body: unknown, options: any) => {
    assert.equal(options.maxRedirects, 0);
    assert.equal(options.timeout, 1234);
    return { status: 200, data: { ok: 1 } };
  });
  await axiosTransport({ url: "https://dev.adloggs.com/x", headers: {}, body: {}, timeoutMs: 1234, maxResponseBytes: 10 });
});

test("errors: provider text is sanitised (no phone numbers, OTPs or long ids)", () => {
  const error = new AdloggsError("BUSINESS_REJECTION", "Rider 9500303975 OTP 6698", { providerMessage: "call 9090909090" });
  assert.doesNotMatch(error.message + error.providerMessage, /9500303975|6698|9090909090/);
  assert.equal(sanitizeProviderText("x".repeat(500)).length, 200);
});

// ==========================================================================
// Status model and tracking URLs
// ==========================================================================
test("status: all documented codes map; transitions use an explicit model, not numeric order", () => {
  assert.deepEqual(Object.keys(ADLOGGS_STATUS_BY_CODE).map(Number).sort((a, b) => a - b), [2, 3, 4, 5, 6, 8, 9, 11, 13, 14]);
  assert.equal(judgeProviderTransition("ARRIVED_AT_PICKUP", "PICKED_UP"), "APPLY", "11 → 4 is forward although 4 < 11");
  assert.equal(judgeProviderTransition(null, "DELIVERED"), "APPLY", "skipped intermediates are allowed");
  assert.equal(judgeProviderTransition("PICKED_UP", "PICKED_UP"), "DUPLICATE");
  assert.equal(judgeProviderTransition("PICKED_UP", "ASSIGNED"), "STALE", "late events never regress");
  assert.equal(judgeProviderTransition("DELIVERED", "OUT_FOR_DELIVERY"), "STALE");
  assert.equal(judgeProviderTransition("PICKED_UP", "CANCELLED"), "INVALID", "documented: no cancellation after pickup");
  assert.equal(judgeProviderTransition("ASSIGNED", "CANCELLED"), "APPLY");
  assert.equal(judgeProviderTransition("OUT_FOR_DELIVERY", "RETURN_INITIATED"), "APPLY");
  assert.equal(judgeProviderTransition("RETURN_INITIATED", "RTO_DELIVERED"), "APPLY");
  assert.equal(judgeProviderTransition("RETURN_INITIATED", "DELIVERED"), "INVALID", "RTO is not a customer delivery");
  assert.equal(judgeProviderTransition("ASSIGNED", "RETURN_INITIATED"), "INVALID");
  assert.equal(shipmentStatusForProvider("ASSIGNED"), null);
  assert.equal(shipmentStatusForProvider("OUT_FOR_DELIVERY"), "PICKED_UP");
  assert.equal(shipmentStatusForProvider("RTO_DELIVERED"), "RETURNED_TO_ORIGIN");
});

test("tracking URLs: only HTTPS on the documented Adloggs hosts", () => {
  assert.equal(safeTrackingUrl(DOC.created.data.trackUrl), DOC.created.data.trackUrl);
  for (const bad of ["http://dev.adloggs.com/x", "https://evil.example/x", "https://dev.adloggs.com.evil.example/x", "https://user:pw@app.adloggs.com/x", "javascript:alert(1)", 42]) {
    assert.equal(safeTrackingUrl(bad), undefined, String(bad));
  }
});

// ==========================================================================
// Payload
// ==========================================================================
function payloadInput(overrides: any = {}) {
  const p1 = oid(), p2 = oid();
  return {
    shipment: { shipmentNumber: "ORD1-S1" },
    order: { customerName: "Somu", customerPhone: "+91 9500303976", paymentMethod: "Online", paymentStatus: "Paid",
      deliveryAddress: { address: "The quest international school", city: "Avinashi", state: "Tamilnadu", pincode: "641654", latitude: 11.1735, longitude: 77.26865 } },
    items: [
      { productName: "Atta", quantity: 2, total: 401, product: p1, status: "Pending" },
      { productName: "Rice", quantity: 1, total: 54.5, product: p2, status: "Pending" },
      { productName: "Cancelled thing", quantity: 9, total: 999, product: oid(), status: "Cancelled" },
    ],
    seller: { storeName: "Ramu Stores", mobile: "9500303975", address: "new bus stand, avinashi", city: "Avinashi", pickupState: "Tamilnadu",
      pickupPincode: "641654", adloggsOrderCategory: "Grocery", location: { coordinates: [77.27788, 11.18731] } },
    productWeightsKg: new Map<string, number | undefined>([[String(p1), 1.25], [String(p2), 0.5]]),
    pickupWindowMinutes: 30,
    now: t0,
    ...overrides,
  };
}

test("payload: one seller shipment mapped exactly to the documented fields", () => {
  const result = buildAdloggsCreatePayload(payloadInput());
  assert.ok(result.ok);
  const p = result.payload;
  assert.equal(p.partner_order_id, "ORD1-S1");
  assert.equal(p.pickup_contact_no, 9500303975);
  assert.equal(p.delivery_contact_no, 9500303976, "+91 prefix removed, nothing else guessed");
  assert.deepEqual(p.pickup_address_details, { city_name: "Avinashi", state_name: "Tamilnadu", country_name: "India", pincode: "641654" });
  assert.deepEqual([p.pickup_lat, p.pickup_long, p.delivery_lat, p.delivery_long], [11.18731, 77.27788, 11.1735, 77.26865]);
  assert.deepEqual(p.items, [{ name: "Atta", quantity: "2", price: "401.00" }, { name: "Rice", quantity: "1", price: "54.50" }], "line values, cancelled items excluded");
  assert.equal(p.order_total_price, "455.50");
  assert.equal(p.order_total_weight_in_kg, "3.000");
  assert.equal(p.order_category, "Grocery");
  assert.deepEqual([p.payment_type, p.collectible_amount, p.utc_offset], ["Online", 0, 330]);
  assert.equal(p.pickup_date_time, "2026-11-25 12:30", "now + 30 min, in IST");
  for (const absent of ["pickup_otp", "delivery_otp", "return_otp", "partner_merchant_id", "delivery_contact_email", "pickup_contact_email"]) {
    assert.equal(absent in p, false, `${absent} is not sent`);
  }
});

test("payload: missing data is reported, never invented", () => {
  const input = payloadInput();
  input.productWeightsKg = new Map();
  input.seller = { ...input.seller, pickupPincode: undefined, pickupState: "", adloggsOrderCategory: "Electronics", location: undefined };
  input.order = { ...input.order, deliveryAddress: { ...input.order.deliveryAddress, pincode: "000000" } };
  const result = buildAdloggsCreatePayload({ ...input, pickupWindowMinutes: null });
  assert.equal(result.ok, false);
  const text = (result as any).problems.join(" | ");
  for (const expected of [/shipping weight/, /pickup pincode/, /pickup state/, /order category/, /pickup coordinates/, /delivery pincode/, /pickup deadline policy/]) {
    assert.match(text, expected);
  }
});

test("payload: COD needs a computed collectible amount; unpaid online is blocked", () => {
  const cod = buildAdloggsCreatePayload(payloadInput({ order: { ...payloadInput().order, paymentMethod: "COD", paymentStatus: "Pending" } }));
  assert.match((cod as any).problems.join(), /COD collectible amount was not computed/);
  const ok: any = buildAdloggsCreatePayload({ ...payloadInput({ order: { ...payloadInput().order, paymentMethod: "COD", paymentStatus: "Pending" } }), codCollectibleAmount: 123.456 });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.payload.payment_type, ok.payload.collectible_amount], ["COD", 123.46]);
  const unpaid = buildAdloggsCreatePayload(payloadInput({ order: { ...payloadInput().order, paymentStatus: "Pending" } }));
  assert.match((unpaid as any).problems.join(), /payment is not confirmed/);
});

test("payload: the frozen pickup snapshot and partner id are reused on retries", () => {
  const first = buildAdloggsCreatePayload(payloadInput());
  assert.ok(first.ok);
  const retry = buildAdloggsCreatePayload(payloadInput({
    shipment: { shipmentNumber: "ORD1-S1", adloggs: { partnerOrderId: "ORD1-S1", pickupSnapshot: first.snapshot } },
    seller: { storeName: "Renamed", mobile: "9500303975" }, // seller profile edited after booking prep
  }));
  assert.ok(retry.ok);
  assert.equal(retry.payload.pickup_address, first.payload.pickup_address);
  assert.equal(retry.payload.partner_order_id, "ORD1-S1");
  assert.equal(indianMobile("12345"), null);
  assert.equal(formatProviderDateTime(new Date("2026-01-01T18:45:00Z")), "2026-01-02 00:15");
});

// ==========================================================================
// Serviceability
// ==========================================================================
const route = (sellerId: string, overrides: Partial<RouteInput> = {}): RouteInput => ({ sellerId, pickupLat: 11.18, pickupLng: 77.27, pickupPincode: "641654",
  deliveryLat: 11.17, deliveryLng: 77.26, deliveryPincode: "641654", paymentType: "Online", ...overrides });

test("serviceability: every seller route is checked; one unserviceable route blocks checkout", async () => {
  clearServiceabilityCache();
  let inFlight = 0, peak = 0;
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: async (request: any) => {
    inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 5)); inFlight--;
    return request.body.pickup_lat === 12 ? DOC.unserviceable : DOC.available;
  } });
  const routes = [route("a"), route("b", { pickupLat: 11.2 }), route("c", { pickupLat: 11.3 }), route("d", { pickupLat: 12 }), route("e", { pickupLat: 11.4 })];
  const result = await checkCheckoutServiceability(routes, { client, now: t0 });
  assert.equal(calls.length, 5);
  assert.ok(peak <= 3, "bounded concurrency");
  assert.equal(result.allServiceable, false);
  assert.deepEqual(result.routes.filter(r => !r.serviceable).map(r => [r.sellerId, r.reason]), [["d", "NOT_SERVICEABLE"]]);
  assert.equal(result.routes[0].estimatedPrice, 59, "estimate kept as provider cost info");
});

test("serviceability: missing data never reaches Adloggs; provider errors fail closed", async () => {
  clearServiceabilityCache();
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: new AdloggsError("TIMEOUT", "t", { mayHaveReachedProvider: true }) });
  const result = await checkCheckoutServiceability([route("a", { pickupPincode: null }), route("b", { deliveryLat: null }), route("c")], { client, now: t0 });
  assert.equal(calls.length, 1, "only the complete route was sent");
  assert.deepEqual(result.routes.map(r => r.reason), ["MISSING_DATA", "MISSING_DATA", "PROVIDER_ERROR"]);
  assert.equal(result.allServiceable, false);
});

test("serviceability: short cache keyed by full inputs; verification bound to the exact cart and time", async () => {
  clearServiceabilityCache();
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available });
  const routes = [route("a"), route("b", { pickupLat: 11.5 })];
  const verification = await checkCheckoutServiceability(routes, { client, now: t0 });
  await checkCheckoutServiceability(routes, { client, now: new Date(t0.getTime() + 1000) });
  assert.equal(calls.length, 2, "second check within TTL served from cache");
  await checkCheckoutServiceability(routes, { client, now: new Date(t0.getTime() + SERVICEABILITY_TTL_MS + 1) });
  assert.equal(calls.length, 4, "expired cache re-checks");
  assert.equal(verificationCovers(verification, routes, t0), true);
  assert.equal(verificationCovers(verification, [...routes].reverse(), t0), true, "order-independent");
  assert.equal(verificationCovers(verification, [route("a"), route("b", { pickupLat: 11.5, deliveryPincode: "641655" })], t0), false, "address changed");
  assert.equal(verificationCovers(verification, routes.map(r => ({ ...r, paymentType: "COD" as const })), t0), false, "payment method changed");
  assert.equal(verificationCovers(verification, [route("a")], t0), false, "seller removed");
  assert.equal(verificationCovers(verification, routes, new Date(t0.getTime() + SERVICEABILITY_TTL_MS + 1)), false, "expired");
  assert.notEqual(routesKeyFor([route("a")]), routesKeyFor([route("a", { paymentType: "COD" })]));
});

test("checkout: network check runs outside the transaction; Adloggs COD refused; pricing untouched", () => {
  const controller = src("modules/customer/controllers/customerOrderController.ts");
  const create = controller.slice(controller.indexOf("export const createOrder"), controller.indexOf("export async function cleanupExpiredPendingOrders"));
  assert.ok(create.indexOf("precheckAdloggsCheckout(req.body)") < create.indexOf("withOrderTransaction("), "serviceability before the transaction");
  const checkout = src("services/checkoutService.ts");
  assert.match(checkout, /deliveryProvider === "ADDLOGS" && paymentMethod === "COD"/);
  assert.match(checkout, /verificationCovers\(options\.adloggsVerification, routes\)/);
  assert.doesNotMatch(checkout, /estimatedPrice|estimated_price/, "provider estimate never becomes the customer fee");
  assert.doesNotMatch(src("services/orderPricingService.ts"), /adloggs/i);
});

// ==========================================================================
// In-memory Shipment store with MongoDB-faithful conditional updates
// ==========================================================================
/** Deep clone that keeps ObjectIds and Dates (structuredClone would turn ObjectIds into plain objects). */
const clone = (v: any): any => v instanceof mongoose.Types.ObjectId ? v : v instanceof Date ? new Date(v)
  : Array.isArray(v) ? v.map(clone) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
const getPath = (obj: any, key: string) => key.split(".").reduce((v, p) => (v == null ? undefined : v[p]), obj);
const setPath = (obj: any, key: string, value: any) => {
  const parts = key.split("."); let node = obj;
  for (const part of parts.slice(0, -1)) node = node[part] ??= {};
  node[parts[parts.length - 1]] = value;
};
const unsetPath = (obj: any, key: string) => {
  const parts = key.split("."); const parent = parts.slice(0, -1).reduce((v, p) => v?.[p], obj);
  if (parent) delete parent[parts[parts.length - 1]];
};
function matches(doc: any, filter: any): boolean {
  return Object.entries(filter).every(([key, want]: [string, any]) => {
    if (key === "$or") return want.some((sub: any) => matches(doc, sub));
    const value = key === "_id" ? String(doc._id) : getPath(doc, key);
    if (want instanceof mongoose.Types.ObjectId || key === "_id") return String(value) === String(want);
    if (want && typeof want === "object" && !(want instanceof Date)) {
      return Object.entries(want).every(([op, arg]: [string, any]) => {
        if (op === "$in") return arg.includes(value ?? null);
        if (op === "$nin") return !arg.includes(value ?? null);
        if (op === "$ne") return value !== arg;
        if (op === "$exists") return arg ? value !== undefined : value === undefined;
        if (op === "$lte") return value instanceof Date && value <= arg;
        if (op === "$type") return typeof value === arg;
        return false;
      });
    }
    return value === want || (want === null && value == null);
  });
}
function applyUpdate(doc: any, update: any) {
  for (const [k, v] of Object.entries(update.$set || {})) setPath(doc, k, v === null ? null : clone(v));
  for (const k of Object.keys(update.$unset || {})) unsetPath(doc, k);
  for (const [k, v] of Object.entries(update.$inc || {})) setPath(doc, k, (getPath(doc, k) || 0) + (v as number));
  for (const [k, v] of Object.entries(update.$push || {})) {
    const list = getPath(doc, k) || []; const add = (v as any)?.$each ?? [v]; setPath(doc, k, [...list, ...add]);
  }
}
const lean = (value: () => any) => { const q: any = { lean: () => q, select: () => q, session: () => q, sort: () => q, limit: () => q,
  then: (res: any, rej: any) => Promise.resolve().then(value).then(res, rej) }; return q; };

function store(t: any, docs: any[]) {
  const all = docs;
  t.mock.method(Shipment, "findById", (id: any) => lean(() => clone(all.find(d => String(d._id) === String(id)) ?? null)));
  t.mock.method(Shipment, "findOne", (filter: any) => lean(() => clone(all.find(d => matches(d, filter)) ?? null)));
  t.mock.method(Shipment, "findOneAndUpdate", (filter: any, update: any) => lean(async () => {
    await new Promise(r => setImmediate(r));
    const doc = all.find(d => matches(d, filter)); // check-and-write in one step, like MongoDB
    if (!doc) return null;
    applyUpdate(doc, update);
    return clone(doc);
  }));
  t.mock.method(Shipment, "updateOne", async (filter: any, update: any) => {
    const doc = all.find(d => matches(d, filter));
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    applyUpdate(doc, update);
    return { matchedCount: 1, modifiedCount: 1 };
  });
  t.mock.method(Shipment, "updateMany", async (filter: any, update: any) => {
    const hits = all.filter(d => matches(d, filter)); hits.forEach(d => applyUpdate(d, update));
    return { modifiedCount: hits.length };
  });
  t.mock.method(mongoose, "startSession", async () => ({ endSession: async () => {}, withTransaction: async (work: any) => work() }));
  t.mock.method(mongoose.models.OrderOperationLock, "updateOne", async () => ({ modifiedCount: 1 }));
  return all;
}

function bookingWorld(t: any, overrides: { shipment?: any; order?: any } = {}) {
  const input = payloadInput();
  const orderId = oid(), sellerId = oid();
  const shipment = { _id: oid(), order: orderId, seller: sellerId, deliveryProvider: "ADDLOGS", shipmentNumber: "ORD1-S1", status: "READY_FOR_PICKUP",
    readyForPickupAt: t0, history: [], bookingIntent: { state: "PENDING", createdAt: t0, attempts: 0 }, ...overrides.shipment };
  const docs = store(t, [shipment]);
  t.mock.method(Order, "findById", () => lean(() => ({ _id: orderId, deliveryProvider: "ADDLOGS", ...input.order, ...overrides.order })));
  t.mock.method(OrderItem, "find", () => lean(() => input.items));
  t.mock.method(Seller, "findById", () => lean(() => input.seller));
  t.mock.method(Product, "find", () => lean(() => [...input.productWeightsKg.entries()].map(([id, w]) => ({ _id: id, shippingWeightKg: w }))));
  const recon: any[] = [];
  t.mock.method(ShipmentReconciliation, "updateOne", async (_f: any, update: any) => { recon.push(update); return {}; });
  t.mock.method(AdloggsWebhookEvent, "find", () => lean(() => []));
  return { doc: docs[0], recon };
}

// ==========================================================================
// Booking worker
// ==========================================================================
test("booking: disabled capability → nothing claimed or sent", async t => {
  const { doc } = bookingWorld(t);
  const { client, calls } = devClient({}, { ...DEV_ENV, ADLOGGS_BOOKING_WORKER_ENABLED: "false" });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "DISABLED");
  assert.equal(calls.length, 0);
  assert.equal(doc.bookingIntent.state, "PENDING");
});

test("booking: verified success → BOOKED with the provider order; estimate and fee recorded separately", async t => {
  const { doc, recon } = bookingWorld(t);
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: DOC.created });
  const result = await runAdloggsBookingOnce({ client, now: t0 });
  assert.equal(result.outcome, "BOOKED");
  assert.deepEqual(calls.map(c => c.url.split("/aa/")[1]), ["oporder/v1.2/service/availability", "oporder/v2/create"], "serviceability rechecked, then one create");
  assert.equal(doc.bookingIntent.state, "BOOKED");
  assert.equal(doc.adloggs.orderUuid, DOC.created.data.order_uuid);
  assert.equal(doc.adloggs.partnerOrderId, "ORD1-S1");
  assert.equal(doc.adloggs.trackUrl, DOC.created.data.trackUrl);
  assert.equal(doc.bookingIntent.leaseToken, undefined);
  assert.equal(doc.adloggs.pickupSnapshot.weightKg, 3);
  assert.deepEqual([recon[0].$set.estimatedProviderCost, recon[0].$set.providerBookingFee, recon[0].$set.providerDistanceKm], [59, 85, 9.47]);
  assert.equal("providerCost" in recon[0].$set, false, "final invoiced cost stays unknown");
});

test("booking: incomplete data or unserviceable route → no create request", async t => {
  const { doc } = bookingWorld(t, { order: { deliveryAddress: { ...payloadInput().order.deliveryAddress, pincode: "000000" } } });
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: DOC.created });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "NOT_READY");
  assert.equal(calls.length, 0);
  assert.equal(doc.bookingIntent.state, "RETRYABLE_FAILURE");
});

test("booking: a timeout after sending is OUTCOME_UNKNOWN and is never retried automatically", async t => {
  const { doc } = bookingWorld(t);
  const timeout = new AdloggsError("TIMEOUT", "Adloggs did not answer in time.", { mayHaveReachedProvider: true });
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: timeout });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "OUTCOME_UNKNOWN");
  assert.equal(doc.bookingIntent.state, "OUTCOME_UNKNOWN");
  assert.match(doc.attention.reason, /Do not rebook/);
  for (let i = 1; i <= 3; i++) assert.equal((await runAdloggsBookingOnce({ client, now: new Date(t0.getTime() + i * 3600000) })).outcome, "IDLE");
  assert.equal(calls.filter(c => c.url.endsWith("/v2/create")).length, 1, "exactly one create request ever");
});

test("booking: definitive rejections — riders unavailable retries later, validation needs an admin, refused connection was never sent", async t => {
  for (const [body, state] of [[DOC.riders, "RETRYABLE_FAILURE"], [DOC.validation, "FAILED"]] as const) {
    const { doc } = bookingWorld(t);
    const { client } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: body });
    assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "REJECTED");
    assert.equal(doc.bookingIntent.state, state);
  }
  const { doc } = bookingWorld(t);
  const refused = new AdloggsError("CONNECTION_REFUSED", "no", { mayHaveReachedProvider: false });
  const { client } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: refused });
  await runAdloggsBookingOnce({ client, now: t0 });
  assert.equal(doc.bookingIntent.state, "RETRYABLE_FAILURE");
});

test("booking: crash after possibly sending → sweep makes it OUTCOME_UNKNOWN; crash before sending is safely reclaimable", async t => {
  const { doc } = bookingWorld(t, { shipment: { bookingIntent: { state: "SUBMITTING", createdAt: t0, attempts: 1, leaseToken: "dead", leaseUntil: new Date(t0.getTime() - 1) } } });
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: DOC.created });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "IDLE");
  assert.equal(doc.bookingIntent.state, "OUTCOME_UNKNOWN");
  assert.equal(calls.length, 0);
  const before = bookingWorld(t, { shipment: { bookingIntent: { state: "CLAIMED", createdAt: t0, attempts: 1, leaseToken: "dead", leaseUntil: new Date(t0.getTime() - 1) } } });
  const second = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: DOC.created });
  assert.equal((await runAdloggsBookingOnce({ client: second.client, now: t0 })).outcome, "BOOKED");
  assert.equal(before.doc.bookingIntent.state, "BOOKED");
});

test("booking: concurrent workers send one create request", async t => {
  bookingWorld(t);
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: DOC.created });
  const outcomes = await Promise.all([runAdloggsBookingOnce({ client, now: t0 }), runAdloggsBookingOnce({ client, now: t0 }), runAdloggsBookingOnce({ client, now: t0 })]);
  assert.equal(outcomes.filter(o => o.outcome === "BOOKED").length, 1);
  assert.equal(calls.filter(c => c.url.endsWith("/v2/create")).length, 1);
});

test("booking: cancellation during the request → late success is kept as evidence and a provider cancellation is queued", async t => {
  const { doc } = bookingWorld(t);
  const { client } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: async () => {
    // Seller cancels while the request is in flight (lifecycle sync marks it).
    doc.status = "CANCELLED"; doc.adloggs.cancellationRequired = true; doc.bookingIntent.leaseToken = "moved-on";
    return DOC.created;
  } });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "LATE_EVIDENCE");
  assert.equal(doc.adloggs.orderUuid, DOC.created.data.order_uuid, "evidence of the external order is never discarded");
  assert.equal(doc.adloggs.lateBookingEvidence, true);
  assert.equal(doc.adloggs.cancellation.state, "REQUESTED");
});

test("booking: a success for a different partner_order_id is not trusted", async t => {
  const { doc } = bookingWorld(t);
  const other = structuredClone(DOC.created); other.data.partner_order_id = "SOMEONE-ELSE";
  const { client } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: other });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "OUTCOME_UNKNOWN");
  assert.equal(doc.bookingIntent.state, "OUTCOME_UNKNOWN");
  assert.equal(doc.adloggs.lateBookingEvidence, true);
  assert.equal(doc.adloggs.orderUuid, undefined, "a foreign uuid is never bound as this shipment's order");
  assert.equal(doc.adloggs.foreignOrderEvidence[0].partnerOrderId, "SOMEONE-ELSE");
});

// --- Phase 7 Task 8: unknown-outcome resolution needs evidence, correlation and dual control ---
const STATUS_OK = (uuid: string, extra: any = {}) => ({ status: true, code: 200, message: "Success", data: { order_uuid: uuid, order_status_id: 3, ...extra } });
const unknownShipment = (adloggs: any = {}) => ({ shipment: { bookingIntent: { state: "OUTCOME_UNKNOWN", createdAt: t0, attempts: 1 },
  adloggs: { partnerOrderId: "ORD1-S1", ...adloggs } } });
const ADMIN_A = String(oid()); const ADMIN_B = String(oid());
const REASON = "Checked the Adloggs dashboard after a timeout";

test("unknown outcome: input validation and no phrase-based shortcut", async t => {
  const { doc } = bookingWorld(t, unknownShipment());
  const { client, calls } = devClient({});
  const id = String(doc._id);
  for (const bad of [
    { action: "CONFIRM_NOT_BOOKED", adminId: ADMIN_A, reason: REASON, confirmation: "NO ADLOGGS ORDER EXISTS" },
    { action: "VERIFY_PROVIDER_ORDER", adminId: "", reason: REASON, orderUuid: "uuid-1" },
    { action: "VERIFY_PROVIDER_ORDER", adminId: ADMIN_A, reason: "short", orderUuid: "uuid-1" },
  ]) {
    const result = await resolveUnknownBookingOutcome(id, bad as any, client, t0);
    assert.equal(result.resolved, false);
    assert.equal(result.state, "INVALID");
  }
  assert.equal(doc.bookingIntent.state, "OUTCOME_UNKNOWN");
  assert.equal(calls.length, 0, "nothing reaches Adloggs for invalid requests");
});

test("unknown outcome: an order that exists but cannot be correlated keeps the state unknown (audited)", async t => {
  const { doc } = bookingWorld(t, unknownShipment());
  const { client } = devClient({ [ADLOGGS_PATHS.currentStatus]: STATUS_OK("uuid-1") });
  const result = await resolveUnknownBookingOutcome(String(doc._id), { action: "VERIFY_PROVIDER_ORDER", adminId: ADMIN_A, reason: REASON, evidence: "dashboard row", orderUuid: "uuid-1" }, client, t0);
  assert.deepEqual([result.resolved, result.state], [false, "OUTCOME_UNKNOWN"]);
  assert.equal(doc.bookingIntent.state, "OUTCOME_UNKNOWN");
  assert.equal(doc.adloggs.orderUuid, undefined);
  const entry = doc.adloggs.adminActions.at(-1);
  assert.deepEqual([entry.outcome, String(entry.adminId), entry.note], ["UNCORRELATED", ADMIN_A, REASON]);
  assert.match(entry.evidence, /dashboard row/);
});

test("unknown outcome: correlated create evidence + confirmed status → BOOKED with recorded source and admin", async t => {
  const { doc } = bookingWorld(t, unknownShipment({ createEvidence: { orderUuid: "uuid-1", partnerOrderId: "ORD1-S1", at: t0 } }));
  const { client } = devClient({ [ADLOGGS_PATHS.currentStatus]: STATUS_OK("uuid-1") });
  const result = await resolveUnknownBookingOutcome(String(doc._id), { action: "VERIFY_PROVIDER_ORDER", adminId: ADMIN_A, reason: REASON, orderUuid: "uuid-1" }, client, t0);
  assert.deepEqual([result.resolved, result.state, result.correlation], [true, "BOOKED", "CREATE_RESPONSE"]);
  assert.deepEqual([doc.bookingIntent.state, doc.adloggs.orderUuid, doc.adloggs.correlation.source, String(doc.adloggs.correlation.adminId)],
    ["BOOKED", "uuid-1", "CREATE_RESPONSE", ADMIN_A]);
});

test("unknown outcome: correlation via an authenticated webhook or a status response carrying our partner id", async t => {
  const first = bookingWorld(t, unknownShipment());
  t.mock.method(AdloggsWebhookEvent, "find", (filter: any) => lean(() => (filter?.state === "UNMATCHED" ? [] : [{ partnerOrderId: "ORD1-S1" }])));
  const a = devClient({ [ADLOGGS_PATHS.currentStatus]: STATUS_OK("uuid-w") });
  const viaWebhook = await resolveUnknownBookingOutcome(String(first.doc._id), { action: "VERIFY_PROVIDER_ORDER", adminId: ADMIN_A, reason: REASON, orderUuid: "uuid-w" }, a.client, t0);
  assert.equal(viaWebhook.correlation, "AUTHENTICATED_WEBHOOK");

  const second = bookingWorld(t, unknownShipment());
  const b = devClient({ [ADLOGGS_PATHS.currentStatus]: STATUS_OK("uuid-s", { partner_order_id: "ORD1-S1" }) });
  const viaStatus = await resolveUnknownBookingOutcome(String(second.doc._id), { action: "VERIFY_PROVIDER_ORDER", adminId: ADMIN_A, reason: REASON, orderUuid: "uuid-s" }, b.client, t0);
  assert.equal(viaStatus.correlation, "STATUS_RESPONSE");
});

test("unknown outcome: foreign, conflicting or already-owned orders are refused", async t => {
  const foreignStatus = bookingWorld(t, unknownShipment());
  const a = devClient({ [ADLOGGS_PATHS.currentStatus]: STATUS_OK("uuid-x", { partner_order_id: "OTHER" }) });
  assert.equal((await resolveUnknownBookingOutcome(String(foreignStatus.doc._id), { action: "VERIFY_PROVIDER_ORDER", adminId: ADMIN_A, reason: REASON, orderUuid: "uuid-x" }, a.client, t0)).state, "OUTCOME_UNKNOWN");
  assert.equal(foreignStatus.doc.adloggs.adminActions.at(-1).outcome, "REFUSED_FOREIGN");

  const foreignEvidence = bookingWorld(t, unknownShipment({ foreignOrderEvidence: [{ orderUuid: "uuid-f", partnerOrderId: "OTHER", at: t0 }] }));
  const b = devClient({});
  await resolveUnknownBookingOutcome(String(foreignEvidence.doc._id), { action: "VERIFY_PROVIDER_ORDER", adminId: ADMIN_A, reason: REASON, orderUuid: "uuid-f" }, b.client, t0);
  assert.equal(foreignEvidence.doc.adloggs.adminActions.at(-1).outcome, "REFUSED_FOREIGN");
  assert.equal(b.calls.length, 0);

  const conflict = bookingWorld(t, unknownShipment({ orderUuid: "uuid-mine" }));
  await resolveUnknownBookingOutcome(String(conflict.doc._id), { action: "VERIFY_PROVIDER_ORDER", adminId: ADMIN_A, reason: REASON, orderUuid: "uuid-other" }, b.client, t0);
  assert.equal(conflict.doc.adloggs.orderUuid, "uuid-mine", "a recorded order is never overwritten");
  assert.equal(conflict.doc.adloggs.adminActions.at(-1).outcome, "REFUSED_CONFLICT");
});

test("unknown outcome: rebooking needs provider reference, no evidence, and a second admin; uses a new partner id", async t => {
  const { doc } = bookingWorld(t, unknownShipment());
  doc.shipmentNumber = "ORD1-S1";
  const { client, calls } = devClient({});
  const id = String(doc._id);
  assert.equal((await resolveUnknownBookingOutcome(id, { action: "APPROVE_REBOOK", adminId: ADMIN_B, reason: REASON }, client, t0)).state, "INVALID", "nothing to approve yet");
  assert.equal((await resolveUnknownBookingOutcome(id, { action: "REQUEST_REBOOK", adminId: ADMIN_A, reason: REASON }, client, t0)).state, "INVALID", "provider reference required");
  const requested = await resolveUnknownBookingOutcome(id, { action: "REQUEST_REBOOK", adminId: ADMIN_A, reason: REASON, providerReference: "ADL-TICKET-42" }, client, t0);
  assert.deepEqual([requested.resolved, doc.bookingIntent.state], [false, "OUTCOME_UNKNOWN"]);
  const self = await resolveUnknownBookingOutcome(id, { action: "APPROVE_REBOOK", adminId: ADMIN_A, reason: REASON }, client, t0);
  assert.equal(self.resolved, false, "the requester cannot approve");
  const approved = await resolveUnknownBookingOutcome(id, { action: "APPROVE_REBOOK", adminId: ADMIN_B, reason: REASON }, client, t0);
  assert.deepEqual([approved.resolved, doc.bookingIntent.state, doc.adloggs.partnerOrderId, doc.adloggs.previousPartnerOrderIds], [true, "PENDING", "ORD1-S1-R2", ["ORD1-S1"]]);
  assert.deepEqual(doc.adloggs.adminActions.map((a: any) => a.outcome), ["REBOOK_REQUESTED", "REFUSED_SAME_ADMIN", "REBOOK_APPROVED"]);
  assert.equal(calls.length, 0);
});

test("unknown outcome: any provider evidence blocks rebooking", async t => {
  for (const evidence of [{ createEvidence: { orderUuid: "u", partnerOrderId: "ORD1-S1", at: t0 } }, { lateBookingEvidence: true },
    { foreignOrderEvidence: [{ orderUuid: "f", at: t0 }] }]) {
    const { doc } = bookingWorld(t, unknownShipment(evidence));
    const { client } = devClient({});
    const result = await resolveUnknownBookingOutcome(String(doc._id), { action: "REQUEST_REBOOK", adminId: ADMIN_A, reason: REASON, providerReference: "ADL-1" }, client, t0);
    assert.equal(result.resolved, false);
    assert.equal(doc.adloggs.adminActions.at(-1).outcome, "REFUSED_EVIDENCE");
    assert.equal(doc.adloggs.rebookRequest, undefined);
  }
  const hooked = bookingWorld(t, unknownShipment());
  t.mock.method(AdloggsWebhookEvent, "find", () => lean(() => [{ orderUuid: "late" }]));
  const { client } = devClient({});
  await resolveUnknownBookingOutcome(String(hooked.doc._id), { action: "REQUEST_REBOOK", adminId: ADMIN_A, reason: REASON, providerReference: "ADL-1" }, client, t0);
  assert.equal(hooked.doc.adloggs.adminActions.at(-1).outcome, "REFUSED_EVIDENCE");
});

test("unknown outcome: a save failure after a correlated create keeps create evidence for verification", async t => {
  const { doc } = bookingWorld(t);
  const { client } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: DOC.created });
  const original = (Shipment.updateOne as any);
  let failNext = true;
  t.mock.method(Shipment, "updateOne", async (filter: any, update: any) => {
    if (failNext && update?.$set?.["bookingIntent.state"] === "BOOKED") { failNext = false; throw new Error("write failed"); }
    return original(filter, update);
  });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "OUTCOME_UNKNOWN");
  assert.equal(doc.adloggs.createEvidence.orderUuid, DOC.created.data.order_uuid);
  assert.equal(doc.adloggs.orderUuid, undefined);
});

test("stale worker: a late success for a retired partner id never binds over the rebooked attempt", async t => {
  const { doc } = bookingWorld(t);
  const { client } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: () => {
    // While the request was in flight: the outcome went unknown and a rebooking was approved.
    doc.bookingIntent = { state: "PENDING", createdAt: t0, attempts: 0 };
    doc.adloggs.partnerOrderId = `${doc.adloggs.partnerOrderId}-R2`;
    return DOC.created;
  } });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "LATE_EVIDENCE");
  assert.equal(doc.adloggs.orderUuid, undefined);
  assert.equal(doc.bookingIntent.state, "PENDING");
  assert.equal(doc.adloggs.foreignOrderEvidence[0].orderUuid, DOC.created.data.order_uuid);
  assert.match(doc.attention.reason, /possible duplicate/);
});

// ==========================================================================
// Tracking, RTO, webhooks, polling
// ==========================================================================
function trackedShipment(t: any, extra: any = {}) {
  const docs = store(t, [{ _id: oid(), order: oid(), seller: oid(), deliveryProvider: "ADDLOGS", status: "READY_FOR_PICKUP", history: [],
    bookingIntent: { state: "BOOKED" }, adloggs: { orderUuid: "uuid-1", partnerOrderId: "ORD1-S1" }, ...extra }]);
  return docs[0];
}
const event = (code: number, minutes = 0, extra: any = {}) => ({ orderUuid: "uuid-1", partnerOrderId: "ORD1-S1", code, source: "WEBHOOK" as const,
  receivedAt: new Date(t0.getTime() + minutes * 60000), ...extra });

test("tracking: verified events move only this seller shipment; duplicates and late events are harmless", async t => {
  const doc = trackedShipment(t);
  assert.equal(await applyAdloggsStatus({ ...event(3, 1), riderName: "viknesh" }), "APPLIED");
  assert.equal(doc.adloggs.riderName, "viknesh");
  assert.equal(doc.status, "READY_FOR_PICKUP", "rider assignment is not a pickup");
  assert.equal(await applyAdloggsStatus(event(4, 5)), "APPLIED");
  assert.equal(doc.status, "PICKED_UP");
  assert.deepEqual(doc.history.at(-1), { status: "PICKED_UP", at: new Date(t0.getTime() + 300000), source: "provider" });
  assert.equal(await applyAdloggsStatus(event(4, 6)), "DUPLICATE");
  assert.equal(await applyAdloggsStatus(event(3, 7)), "STALE");
  assert.equal(await applyAdloggsStatus(event(5, 20)), "APPLIED");
  assert.equal(doc.status, "DELIVERED");
  assert.equal(await applyAdloggsStatus(event(6, 25)), "INVALID", "cancelled after delivery is flagged, not applied");
  assert.equal(doc.status, "DELIVERED");
  assert.equal(doc.adloggs.statusEvents.length, 3);
  assert.equal(JSON.stringify(doc).includes("otp"), false);
});

test("tracking: unknown codes, wrong partner id and unknown orders never change anything", async t => {
  const doc = trackedShipment(t);
  assert.equal(await applyAdloggsStatus(event(99)), "UNKNOWN_STATUS");
  assert.equal(await applyAdloggsStatus(event(4, 1, { partnerOrderId: "OTHER" })), "MISMATCH");
  assert.equal(await applyAdloggsStatus(event(5, 2, { orderUuid: "nope" })), "UNMATCHED");
  assert.equal(doc.status, "READY_FOR_PICKUP");
  assert.equal(doc.adloggs.providerStatus, undefined);
  assert.ok(doc.attention);
});

test("RTO: return-to-origin is tracked separately and never counts as delivered", async t => {
  const doc = trackedShipment(t);
  await applyAdloggsStatus(event(4, 1));
  await applyAdloggsStatus(event(13, 30));
  assert.deepEqual([doc.status, doc.adloggs.rto.state], ["PICKED_UP", "INITIATED"]);
  assert.match(doc.attention.reason, /No refund or restock/);
  assert.equal(await applyAdloggsStatus(event(5, 31)), "INVALID", "delivery contradicts an active return");
  await applyAdloggsStatus(event(14, 60));
  assert.deepEqual([doc.status, doc.adloggs.rto.state], ["RETURNED_TO_ORIGIN", "COMPLETED"]);
  const summary = summarizeShipments([{ status: "DELIVERED" }, { status: "RETURNED_TO_ORIGIN" }]);
  assert.deepEqual([summary.state, summary.delivered], ["PARTIALLY_DELIVERED", 1], "mixed delivered + RTO");
  assert.equal(summarizeShipments([{ status: "RETURNED_TO_ORIGIN" }]).state, "RETURNED_TO_ORIGIN");
});

test("webhook route: disabled → 404; enabled but unauthenticated → 401 and nothing written", async t => {
  const writes = t.mock.method(AdloggsWebhookEvent, "create", async () => ({}));
  const call = async (env: NodeJS.ProcessEnv) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      let status = 0;
      const res: any = { status(code: number) { status = code; return res; }, json() { return res; } };
      await handleAdloggsWebhook({ headers: { "content-length": "100" }, body: { order_uuid: "u", order_status_id: 5 } } as any, res);
      return status;
    } finally { process.env = saved; }
  };
  assert.equal(await call({ ADLOGGS_WEBHOOK_ENABLED: "false" }), 404);
  assert.equal(await call({ ...DEV_ENV, ADLOGGS_WEBHOOK_ENABLED: "true" }), 401);
  assert.equal(writes.mock.callCount(), 0);
});

test("webhook auth (Phase 7 Task 9): no guessed mechanism is accepted while the contract is unconfirmed", () => {
  const key = DEV_ENV.ADLOGGS_API_KEY as string;
  for (const headers of [{}, { "x-api-key": key }, { authorization: `Bearer ${key}` }, { authorization: key },
    { "x-adloggs-signature": "sha256=abc" }, { "x-webhook-secret": key }]) {
    const result = authenticateAdloggsWebhook({ headers } as any);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "WEBHOOK_AUTH_CONTRACT_UNCONFIRMED");
  }
  assert.equal(ADLOGGS_WEBHOOK_AUTH_CONTRACT_CONFIRMED, false, "stays false until Adloggs documents the mechanism");
});

test("webhook processing: durable receipt, dedupe, no OTP/phone stored, replay after booking", async t => {
  const doc = trackedShipment(t, { adloggs: { partnerOrderId: "ORD1-S1" } }); // booking not saved yet
  const receipts: any[] = [];
  t.mock.method(AdloggsWebhookEvent, "create", async (record: any) => {
    if (receipts.some(r => r.eventKey === record.eventKey)) throw Object.assign(new Error("dup"), { code: 11000 });
    receipts.push({ ...record, _id: oid() }); return record;
  });
  t.mock.method(AdloggsWebhookEvent, "updateOne", async (filter: any, update: any) => {
    const r = receipts.find(x => (filter.eventKey ? x.eventKey === filter.eventKey : String(x._id) === String(filter._id))); if (r) Object.assign(r, update.$set); return {};
  });
  t.mock.method(AdloggsWebhookEvent, "find", (filter: any) => lean(() => receipts.filter(r => r.orderUuid === filter.orderUuid && r.state === filter.state)));
  const sample = { order_uuid: "uuid-1", order_status_id: 4, partner_order_id: "ORD1-S1",
    deliveryStaffDetails: { name: "vinesh", phone: "9090909090", currentLocation: { lat: "11.1", long: "77.2" } }, otps: { delivery_otp: "9243" } };
  assert.deepEqual(await processAdloggsWebhookPayload(sample, t0), { accepted: true, state: "UNMATCHED" });
  assert.deepEqual(await processAdloggsWebhookPayload(sample, t0), { accepted: true, state: "DUPLICATE" });
  assert.equal(JSON.stringify(receipts).match(/9243|9090909090|77\.2/), null, "OTPs, phones and locations are never stored");
  assert.deepEqual(await processAdloggsWebhookPayload({ order_uuid: "", order_status_id: "4" }, t0), { accepted: false, state: "INVALID_PAYLOAD" });
  doc.adloggs.orderUuid = "uuid-1"; // booking response saved afterwards
  assert.equal(await replayUnmatchedWebhookEvents("uuid-1"), 1);
  assert.equal(doc.status, "PICKED_UP");
});

test("polling: disabled by default; when enabled it polls booked shipments with a lease and backoff", async t => {
  const doc = trackedShipment(t, { adloggs: { orderUuid: "uuid-1", partnerOrderId: "ORD1-S1", nextStatusPollAt: t0 } });
  const off = devClient({}, { ...DEV_ENV, ADLOGGS_STATUS_POLLING_ENABLED: "false" });
  assert.deepEqual(await pollAdloggsStatuses({ client: off.client, now: t0 }), { polled: 0, disabled: true });
  const failing = devClient({ [ADLOGGS_PATHS.currentStatus]: new AdloggsError("TIMEOUT", "t", { mayHaveReachedProvider: true }) });
  await pollAdloggsStatuses({ client: failing.client, now: t0, limit: 3 });
  assert.equal(failing.calls.length, 1, "one shipment, one call per run");
  assert.equal(doc.adloggs.statusPollFailures, 1);
  assert.ok(doc.adloggs.nextStatusPollAt > t0, "backed off");
  const later = new Date(doc.adloggs.nextStatusPollAt.getTime());
  const ok = devClient({ [ADLOGGS_PATHS.currentStatus]: { status: true, code: 200, message: "Success", data: { order_uuid: "uuid-1", order_status_id: 4, deliveryStaffDetails: { name: "Mani" } } } });
  await pollAdloggsStatuses({ client: ok.client, now: later });
  assert.deepEqual([doc.status, doc.adloggs.riderName, doc.adloggs.statusPollFailures], ["PICKED_UP", "Mani", 0]);
});

// ==========================================================================
// Cancellation
// ==========================================================================
function cancellationShipment(t: any, extra: any = {}) {
  return store(t, [{ _id: oid(), order: oid(), deliveryProvider: "ADDLOGS", status: "CANCELLED", bookingIntent: { state: "BOOKED" },
    adloggs: { orderUuid: "uuid-1", providerStatus: "ASSIGNED", cancellation: { state: "REQUESTED", reason: "Seller cancelled", requestedAt: t0, attempts: 0 } }, ...extra }])[0];
}

test("cancellation: confirmed only by a verified answer; documented rejections surface to admins", async t => {
  const doc = cancellationShipment(t);
  const off = devClient({}, { ...DEV_ENV, ADLOGGS_CANCELLATION_WORKER_ENABLED: "false" });
  assert.equal((await runAdloggsCancellationOnce({ client: off.client, now: t0 })).outcome, "DISABLED");
  const { client, calls } = devClient({ [ADLOGGS_PATHS.cancelOrder]: DOC.cancelled });
  assert.equal((await runAdloggsCancellationOnce({ client, now: t0 })).outcome, "CONFIRMED");
  assert.deepEqual(calls[0].body, { order_uuid: "uuid-1", order_cancel_description: "Seller cancelled" });
  assert.equal(doc.adloggs.cancellation.state, "CONFIRMED");
  const rejected = cancellationShipment(t);
  await runAdloggsCancellationOnce({ client: devClient({ [ADLOGGS_PATHS.cancelOrder]: DOC.cancelPicked }).client, now: t0 });
  assert.equal(rejected.adloggs.cancellation.state, "REJECTED");
  assert.match(rejected.attention.reason, /ALREADY_PICKED_UP/);
});

test("cancellation: never called after a known pickup; transport errors retry with backoff, then UNKNOWN", async t => {
  const picked = cancellationShipment(t, { adloggs: { orderUuid: "uuid-1", providerStatus: "PICKED_UP", cancellation: { state: "REQUESTED", requestedAt: t0, attempts: 0 } } });
  const none = devClient({ [ADLOGGS_PATHS.cancelOrder]: DOC.cancelled });
  assert.equal((await runAdloggsCancellationOnce({ client: none.client, now: t0 })).outcome, "REJECTED_AFTER_PICKUP");
  assert.equal(none.calls.length, 0);
  assert.equal(picked.adloggs.cancellation.state, "REJECTED");
  const flaky = cancellationShipment(t);
  const failing = devClient({ [ADLOGGS_PATHS.cancelOrder]: new AdloggsError("TIMEOUT", "t", { mayHaveReachedProvider: true }) });
  let now = t0;
  for (let i = 0; i < 5; i++) {
    await runAdloggsCancellationOnce({ client: failing.client, now });
    now = new Date((flaky.adloggs.cancellation.nextAttemptAt ?? now).getTime() + 1);
  }
  assert.equal(flaky.adloggs.cancellation.state, "UNKNOWN");
  assert.match(flaky.attention.reason, /could not be confirmed/);
});

// ==========================================================================
// Wallet, admin and seller profile
// ==========================================================================
test("wallet: not configured, verified, not enabled and unavailable are distinct; never fabricated", async t => {
  const writes: any[] = [];
  t.mock.method(AppSettings, "updateOne", async (_f: any, update: any) => { writes.push(update); return {}; });
  t.mock.method(AppSettings, "findOne", () => lean(() => ({ adloggsDiagnostics: { wallet: { state: "VERIFIED", balance: "900.00", retrievedAt: t0 } } })));
  assert.equal((await checkAdloggsWallet(devClient({}, {}).client, t0)).state, "NOT_CONFIGURED");
  assert.deepEqual(await checkAdloggsWallet(devClient({ [ADLOGGS_PATHS.walletBalance]: DOC.wallet }).client, t0), { state: "VERIFIED", balance: "1100.00", currency: "INR", retrievedAt: t0 });
  assert.deepEqual(await checkAdloggsWallet(devClient({ [ADLOGGS_PATHS.walletBalance]: DOC.walletOff }).client, t0), { state: "WALLET_NOT_ENABLED", retrievedAt: t0 });
  const down = await checkAdloggsWallet(devClient({ [ADLOGGS_PATHS.walletBalance]: DOC.auth }).client, t0);
  assert.equal(down.state, "UNAVAILABLE");
  assert.deepEqual((down as any).lastVerified, { balance: "900.00", retrievedAt: t0 }, "last verified value shown with its time, not as current");
  assert.equal(JSON.stringify(writes).includes(KEY), false);
});

test("admin status: no secret is returned", async t => {
  const saved = { ...process.env };
  Object.assign(process.env, DEV_ENV);
  try {
    t.mock.method(AppSettings, "findOne", () => lean(() => ({})));
    const status = await getAdloggsAdminStatus();
    assert.equal(status.apiKeyConfigured, true);
    assert.equal(JSON.stringify(status).includes(KEY), false);
    assert.equal(status.capabilities.productionActivationEligible, false);
  } finally { process.env = saved; }
});

test("seller Adloggs profile: strict validation, nothing inferred", async t => {
  const updates: any[] = [];
  t.mock.method(Seller, "updateOne", async (_f: any, update: any) => { updates.push(update); return { matchedCount: 1 }; });
  const id = String(oid());
  assert.equal((await updateSellerAdloggsProfile(id, { pickupPincode: "000000" })).ok, false);
  assert.equal((await updateSellerAdloggsProfile(id, { adloggsOrderCategory: "Electronics" })).ok, false);
  assert.equal((await updateSellerAdloggsProfile(id, { storeName: "x" })).ok, false);
  assert.equal((await updateSellerAdloggsProfile(id, { pickupPincode: "641654", pickupState: " Tamilnadu ", adloggsOrderCategory: "Grocery" })).ok, true);
  assert.deepEqual(updates[0].$set, { pickupPincode: "641654", pickupState: "Tamilnadu", adloggsOrderCategory: "Grocery" });
});

// ==========================================================================
// Safety and regressions (source)
// ==========================================================================
test("routes: Adloggs admin endpoints are admin-only; webhook is the only public entry and fails closed", () => {
  const routes = src("routes/adminRoutes.ts");
  const guard = routes.indexOf('router.use(requireUserType("Admin"))');
  for (const r of ['"/delivery-providers/adloggs"', '"/delivery-providers/adloggs/wallet"', '"/delivery-providers/adloggs/connectivity-test"',
    '"/delivery-providers/adloggs/sellers/:sellerId/profile"', '"/shipments/:id/adloggs/resolve-outcome"']) {
    assert.ok(guard > 0 && guard < routes.indexOf(r), r);
  }
  assert.match(src("routes/index.ts"), /router\.post\("\/webhooks\/adloggs", handleAdloggsWebhook\)/);
  assert.match(src("services/adloggs/adloggsConfig.ts"), /ADLOGGS_WEBHOOK_AUTH_CONTRACT_CONFIRMED = false/);
});

test("safety: HTTP only in the client; no production activation; Adloggs still unselectable", () => {
  const dir = path.join(__dirname, "..", "services", "adloggs");
  for (const file of fs.readdirSync(dir).filter(f => f !== "adloggsClient.ts")) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, file), "utf8"), /axios|fetch\(/, file);
  }
  assert.match(src("services/adloggs/adloggsConfig.ts"), /ADLOGGS_PRODUCTION_ACTIVATION_ALLOWED = false/);
  assert.match(src("services/adloggs/adloggsConfig.ts"), /ADLOGGS_COD_ALLOWED = true/, "COD gate open (business decision); production still gated below");
  assert.match(src("services/deliveryProviderService.ts"), /ADDLOGS_INTEGRATION_AVAILABLE = false/);
  for (const rel of ["services/commissionService.ts", "services/codSettlementService.ts", "services/refundService.ts", "services/paymentService.ts"]) {
    assert.doesNotMatch(src(rel), /adloggs/i, `${rel} untouched by the integration`);
  }
  // Phase 7: the financial worker references Adloggs ONLY to read the (false) external-settlement gate.
  const effects = src("services/orderEffectService.ts");
  assert.deepEqual(effects.match(/adloggs[\w/]*/gi)?.filter(m => !/^adloggs\/adloggsConfig$|^ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED$/i.test(m)) ?? [], [],
    "no other Adloggs coupling in the financial worker");
  assert.match(src("services/adloggs/adloggsConfig.ts"), /ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED = false/);
  assert.match(effects, /Unknown kinds never fall through to a money-moving branch/);
  const tracking = src("services/adloggs/adloggsTrackingService.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // code only
  assert.doesNotMatch(tracking, /deliveryBoy|sellerPickups|deliveryOtp|refundOrder|processRefund|releaseMany|reserveMany|queueOrderEffect|processCODOrderDelivery|distributeCommissions/, "no courier, OTP, refund, restock or settlement calls");
});

test("UI: Adloggs admin card, shipment operations and customer tracking expose no secrets or internals", () => {
  const card = fe("modules/admin/components/AdloggsStatusCard.tsx");
  assert.doesNotMatch(card, /apiKey"|x-api-key|leaseToken/);
  assert.match(card, /Not configured|not configured/);
  const customer = fe("components/OrderShipmentsCard.tsx");
  assert.doesNotMatch(customer, /bookingIntent|attention|providerCost|providerBookingFee|leaseToken|pickupOtp|returnOtp|pickup_otp|return_otp/i);
  assert.match(customer, /deliveryOtp/, "the customer sees only their delivery code");
  assert.match(customer, /trackUrl/);
  const ops = fe("modules/admin/pages/AdminShipments.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(ops, /Retry booking|Book now/i, "no unrestricted rebooking");
});

// --- Phase 7 Task 14: seller/product data for Adloggs ---
test("product shipping weight: validated, rounded, and clearable", async () => {
  const { normalizeShippingWeight } = await import("../modules/seller/controllers/productController");
  assert.equal(normalizeShippingWeight("0.5"), 0.5);
  assert.equal(normalizeShippingWeight(1.23456), 1.235);
  assert.equal(normalizeShippingWeight(""), null);
  assert.equal(normalizeShippingWeight(null), null);
  for (const bad of ["abc", 0, -1, 0.0001, 1001, {}, "1e9"]) assert.equal(normalizeShippingWeight(bad), "INVALID", String(bad));
  const controller = src("modules/seller/controllers/productController.ts");
  assert.match(controller, /"shippingWeightKg",\s*\]/, "accepted on create");
  assert.match(controller, /req\.body\.shippingWeightKg !== undefined/, "accepted on update");
});

test("seller pickup details: seller-only route reusing the admin validation", () => {
  const routes = src("routes/sellerAuthRoutes.ts");
  assert.match(routes, /router\.put\("\/delivery-pickup-profile", authenticate, requireUserType\('Seller'\)/);
  assert.match(routes, /updateSellerAdloggsProfile\(String\(req\.user!\.userId\), req\.body\)/, "a seller can only update their own profile");
});

// ==========================================================================
// Final validation (mocked): RTO resolution item, outcome precedence,
// settlement gate, activation requirements, attempt history.
// ==========================================================================
test("RTO: a verified return to origin opens a durable PENDING_DECISION resolution item", async t => {
  const doc = trackedShipment(t);
  await applyAdloggsStatus(event(4, 1));
  await applyAdloggsStatus(event(13, 30));
  assert.equal(doc.adloggs.rto.resolution, undefined, "nothing to decide before the return is complete");
  await applyAdloggsStatus(event(14, 60));
  assert.equal(doc.adloggs.rto.resolution.state, "PENDING_DECISION");
  assert.match(doc.attention.reason, /Resolve it/);
});

test("RTO escalation: an undecided verified RTO is escalated once after 24 hours", async t => {
  const old = new Date(t0.getTime() - 25 * 3600_000);
  const docs = store(t, [
    { _id: oid(), adloggs: { rto: { state: "COMPLETED", resolution: { state: "PENDING_DECISION", since: old } } } },
    { _id: oid(), adloggs: { rto: { state: "COMPLETED", resolution: { state: "PENDING_DECISION", since: t0 } } } },
    { _id: oid(), adloggs: { rto: { state: "COMPLETED", resolution: { state: "REFUNDED", since: old } } } },
  ]);
  assert.equal(await runRtoEscalationSweep(t0), 1);
  assert.ok(docs[0].adloggs.rto.resolution.escalatedAt);
  assert.match(docs[0].attention.reason, /no decision for over 24 hours/);
  assert.equal(docs[1].attention, undefined);
  assert.equal(await runRtoEscalationSweep(t0), 0, "escalated only once");
});

test("outcome precedence: a delivery that went ahead despite a refused cancellation is delivered; a refunded RTO counts as cancelled", () => {
  assert.equal(shipmentOutcomeClass({ status: "DELIVERED", adloggs: { pendingLocalCancellation: { state: "BLOCKED" } } }), "delivered");
  assert.equal(shipmentOutcomeClass({ status: "RETURNED_TO_ORIGIN", adloggs: { rto: { resolution: { state: "PENDING_DECISION" } } } }), "rto");
  assert.equal(shipmentOutcomeClass({ status: "RETURNED_TO_ORIGIN", adloggs: { rto: { resolution: { state: "REFUNDED" } } } }), "cancelled");
  assert.equal(aggregateExternalOutcome([{ status: "DELIVERED" }, { status: "RETURNED_TO_ORIGIN", adloggs: { rto: { resolution: { state: "REFUNDED" } } } }]).state,
    "DELIVERED_AND_CANCELLED", "the delivered part can complete once the RTO is resolved");
  assert.equal(aggregateExternalOutcome([{ status: "RETURNED_TO_ORIGIN" }]).state, "ALL_RTO", "RTO is never a successful delivery");
});

test("settlement gate: held external settlements are never released while the gate is disabled", async t => {
  const writes = t.mock.method(OrderEffect, "updateMany", async () => ({ modifiedCount: 99 }));
  assert.deepEqual(await releaseHeldExternalSettlements(t0), { released: 0, disabled: true });
  assert.equal(writes.mock.callCount(), 0);
  assert.match(src("services/adloggs/adloggsConfig.ts"), /ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED = false/);
});

test("activation: Online-only activation requires every evidence item; settlement disabled blocks it", () => {
  assert.equal(ADDLOGS_INTEGRATION_AVAILABLE, false);
  const missing = adloggsActivationBlockers();
  for (const key of ["sandboxBooking", "statusTracking", "cancellation", "pickupPolicy", "merchantProductRequirements", "unknownOutcomeRecovery",
    "cancellationRefund", "sellerSettlement", "rtoResolution", "statusUpdates", "databaseVerification"]) {
    assert.ok(key in ADLOGGS_ACTIVATION_REQUIREMENTS, key);
  }
  assert.ok(missing.some(label => /Seller settlement/.test(label)), "settlement gate disabled => activation blocked");
  // Invariant: Adloggs may only become selectable when nothing is missing.
  if (ADDLOGS_INTEGRATION_AVAILABLE) assert.deepEqual(missing, []);
  const caps = adloggsCapabilities(loadAdloggsConfig(DEV_ENV));
  assert.equal(caps.productionActivationEligible, false);
  assert.ok(caps.blockers.some(b => /Live activation requires: Seller settlement/.test(b)));
});

// --- Approved business decisions (final policy update) ---
test("pickup window: deadline semantics confirmed; 30 minutes; the gate mechanism stays wired", async () => {
  assert.equal(ADLOGGS_APPROVED_PICKUP_WINDOW_MINUTES, 30);
  assert.equal(ADLOGGS_PICKUP_SEMANTICS_CONFIRMED, true, "doc: 'time before which the pickup should be collected'; confirmed on call");
  const { ADLOGGS_PICKUP_WINDOW_MINUTES: _window, ...withoutWindow } = DEV_ENV;
  assert.equal(loadAdloggsConfig(withoutWindow as NodeJS.ProcessEnv).pickupWindowMinutes, 30);
  assert.equal(adloggsCapabilities(loadAdloggsConfig(DEV_ENV)).blockers.some(b => /pickup_date_time semantics/.test(b)), false);
  assert.equal(new AdloggsClient({ env: DEV_ENV }).bookingSubmissionAllowed(), true);
  // Flipping the constant back to false still blocks every real create request.
  assert.match(src("services/adloggs/adloggsClient.ts"), /if \(!this\.bookingSubmissionAllowed\(\)\)/);
  assert.match(src("server.ts"), /adloggs\.bookingReady && ADLOGGS_PICKUP_SEMANTICS_CONFIRMED/);
});

// --- OTPs: Adloggs asked us to create and send them ---
test("OTPs: generated once per shipment, sent as 4-digit integers, reused on retries", async t => {
  const { doc } = bookingWorld(t);
  const bodies: any[] = [];
  const { client } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available,
    [ADLOGGS_PATHS.createOrder]: [(request: any) => { bodies.push(request.body); return { status: false, code: 202, message: "Riders not available", data: {} }; },
      (request: any) => { bodies.push(request.body); return DOC.created; }] });
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "REJECTED");
  const otps = { ...doc.adloggs.otps };
  for (const key of ["pickup", "delivery", "return"]) assert.match(otps[key], /^[1-9][0-9]{3}$/, key);
  assert.deepEqual([bodies[0].pickup_otp, bodies[0].delivery_otp, bodies[0].return_otp], [Number(otps.pickup), Number(otps.delivery), Number(otps.return)]);
  doc.bookingIntent.nextAttemptAt = t0; doc.bookingIntent.state = "RETRYABLE_FAILURE";
  await runAdloggsBookingOnce({ client, now: new Date(t0.getTime() + 3600_000) });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].delivery_otp, bodies[0].delivery_otp, "same codes on retry");
  assert.deepEqual(doc.adloggs.otps, otps);
});

test("OTPs: payload sends only well-formed codes", () => {
  const input = payloadInput();
  (input.shipment as any).adloggs = { otps: { pickup: "1234", delivery: "0123", return: "98765" } };
  const built: any = buildAdloggsCreatePayload(input);
  assert.equal(built.payload.pickup_otp, 1234);
  assert.equal("delivery_otp" in built.payload, false, "leading zero would be lost as an integer");
  assert.equal("return_otp" in built.payload, false);
});

test("OTPs: each party sees only its own code, only while relevant; admins and couriers see none", () => {
  const otps = { pickup: "1111", delivery: "2222", return: "3333", createdAt: t0 };
  const ship = (status: string, extra: any = {}) => ({ deliveryProvider: "ADDLOGS", status, bookingIntent: { state: "BOOKED" }, adloggs: { orderUuid: "u", otps, ...extra } });
  const ready = ship("READY_FOR_PICKUP");
  assert.equal(externalView(ready, "customer")!.deliveryOtp, "2222");
  assert.equal(externalView(ready, "customer")!.pickupOtp, undefined);
  assert.equal(externalView(ready, "seller")!.pickupOtp, "1111");
  assert.equal(externalView(ready, "seller")!.deliveryOtp, undefined);
  for (const audience of ["admin", "courier"] as const) {
    assert.equal(JSON.stringify(externalView(ready, audience)).match(/1111|2222|3333/), null, audience);
  }
  assert.equal(externalView(ship("PICKED_UP"), "seller")!.pickupOtp, undefined, "no pickup code after pickup");
  const returning = ship("PICKED_UP", { rto: { state: "INITIATED" } });
  assert.equal(externalView(returning, "seller")!.returnOtp, "3333");
  assert.equal(externalView(returning, "customer")!.deliveryOtp, undefined, "no delivery code once the parcel is being returned");
  assert.equal(externalView(ship("DELIVERED"), "customer")!.deliveryOtp, undefined);
  assert.equal(externalView({ ...ready, bookingIntent: { state: "PENDING" }, adloggs: { otps } }, "customer")!.deliveryOtp, undefined, "not before booking");
});

test("activation: simultaneous Online + COD launch needs every Online AND every COD requirement", () => {
  const byScope = (scope: string) => Object.entries(ADLOGGS_ACTIVATION_REQUIREMENTS).filter(([, r]) => r.scope === scope).map(([key]) => key);
  for (const key of ["codEnabledInCode", "codAllocation", "codSandboxBooking", "codCollection", "codRemittance", "codFailedCollection", "codRto", "codSellerSettlement"]) {
    assert.ok(byScope("COD").includes(key), key);
  }
  assert.ok(byScope("BOTH").includes("sellerSettlement") && byScope("BOTH").includes("merchantProductRequirements"));
  const missing = adloggsActivationBlockers();
  assert.ok(missing.some(label => /COD remittance/.test(label)), "COD requirements still block the simultaneous launch");
  assert.ok(missing.some(label => /Seller settlement/.test(label)) && missing.some(label => /webhooks/i.test(label)), "Online requirements still block it too");
  assert.equal(missing.some(label => /real sandbox booking succeeded/.test(label)), false, "real Online sandbox booking verified");
  assert.equal(ADDLOGS_INTEGRATION_AVAILABLE, false);
  assert.equal(missing.some(label => /ADLOGGS_COD_ALLOWED/.test(label)), false, "COD gate enabled in code");
});

test("eligibility: sellers with missing pickup data, unsupported categories or unweighted products stay ineligible", () => {
  const ok = { _id: "s1", storeName: "Ready", pickupPincode: "641654", pickupState: "Tamil Nadu", adloggsOrderCategory: "Grocery" };
  assert.deepEqual(adloggsIneligibleStores([ok], [{ seller: "s1", shippingWeightKg: 0.5 }]), []);
  assert.deepEqual(adloggsIneligibleStores([{ ...ok, pickupPincode: "" }], [{ seller: "s1", shippingWeightKg: 0.5 }]), ["Ready"]);
  assert.deepEqual(adloggsIneligibleStores([{ ...ok, adloggsOrderCategory: "Electronics" }], [{ seller: "s1", shippingWeightKg: 0.5 }]), ["Ready"]);
  assert.deepEqual(adloggsIneligibleStores([ok], [{ seller: "s1", shippingWeightKg: null }]), ["Ready"]);
  assert.match(src("services/checkoutService.ts"), /adloggsIneligibleStores\(sellers as any\[\], products as any\[\]\)/, "enforced at checkout before serviceability");
});

test("refund rule: previews and cancellations share one function (existing calculation unchanged)", () => {
  assert.equal(sellerCancellationRefundAmount([{ total: 100, discountAmount: 10 }, { total: 50 }], [{}]), 140, "items net of discount when other items stay active");
  assert.equal(sellerCancellationRefundAmount([{ total: 100 }], []), undefined, "last items: the remaining refundable balance");
  assert.match(src("services/orderLifecycleService.ts"), /const amount = sellerCancellationRefundAmount\(selected, remaining\);/);
});

test("provider costs: RTO charge is separate and unknown (null) by default; Hello Local bears the costs", () => {
  const record: any = new ShipmentReconciliation({ shipment: oid(), order: oid(), seller: oid(), deliveryProvider: "ADDLOGS" });
  assert.equal(record.providerRtoCharge, null);
  assert.equal(record.providerCost, null);
  assert.equal(record.costBearer, "PLATFORM");
  for (const rel of ["services/commissionService.ts", "services/orderPricingService.ts"]) {
    assert.doesNotMatch(src(rel), /providerRtoCharge|providerBookingFee|providerCost|estimatedProviderCost/, `${rel}: provider costs never reach seller earnings or customer pricing`);
  }
});

test("traceability: dual-control rebooking records the retired partner id with both admins and the provider reference", async t => {
  const { doc } = bookingWorld(t, unknownShipment());
  doc.shipmentNumber = "ORD1-S1";
  const { client } = devClient({});
  await resolveUnknownBookingOutcome(String(doc._id), { action: "REQUEST_REBOOK", adminId: ADMIN_A, reason: REASON, providerReference: "ADL-TICKET-42" }, client, t0);
  await resolveUnknownBookingOutcome(String(doc._id), { action: "APPROVE_REBOOK", adminId: ADMIN_B, reason: REASON }, client, t0);
  const [entry] = doc.adloggs.attemptHistory;
  assert.deepEqual([entry.partnerOrderId, entry.outcome, String(entry.adminId), String(entry.approvedBy), entry.providerReference],
    ["ORD1-S1", "NO_ORDER_CONFIRMED_REBOOKED", ADMIN_A, ADMIN_B, "ADL-TICKET-42"]);
  assert.equal(doc.adloggs.partnerOrderId, "ORD1-S1-R2");
});

test("cancellation: a timed-out cancel whose verified status is Cancelled (6) is CONFIRMED (observed on the real dev API)", async t => {
  const timeout = new AdloggsError("TIMEOUT", "Adloggs did not answer in time.", { mayHaveReachedProvider: true });
  const doc = cancellationShipment(t);
  const { client, calls } = devClient({ [ADLOGGS_PATHS.cancelOrder]: timeout,
    [ADLOGGS_PATHS.currentStatus]: { status: true, code: 200, message: "Success", data: { order_uuid: "uuid-1", order_status_id: 6, is_return: false } } });
  assert.equal((await runAdloggsCancellationOnce({ client, now: t0 })).outcome, "CONFIRMED");
  assert.equal(doc.adloggs.cancellation.state, "CONFIRMED");
  assert.equal(calls.filter(c => c.url.endsWith(ADLOGGS_PATHS.cancelOrder)).length, 1, "no extra cancel calls");

  const pending = cancellationShipment(t);
  const still = devClient({ [ADLOGGS_PATHS.cancelOrder]: timeout,
    [ADLOGGS_PATHS.currentStatus]: { status: true, code: 200, message: "Success", data: { order_uuid: "uuid-1", order_status_id: 2, is_return: false } } });
  assert.equal((await runAdloggsCancellationOnce({ client: still.client, now: t0 })).outcome, "RETRY_SCHEDULED", "not cancelled yet: normal retry");
  assert.equal(pending.adloggs.cancellation.state, "REQUESTED");
});

// --- Adloggs COD (enabled by business decision; Adloggs collects and settles the cash) ---
test("COD allocation: shipments always add up exactly to what the customer owes", () => {
  const items = [
    { seller: "a", total: 100, discountAmount: 10, status: "Pending" },
    { seller: "b", total: 200, discountAmount: 20, status: "Pending" },
    { seller: "b", total: 50, status: "Cancelled" },
  ];
  // net a = 90, b = 180; order total 305 = 270 + charges 35
  const shares = allocateCodCollectible(305, items);
  assert.deepEqual([shares.get("a"), shares.get("b")], [101.67, 203.33]);
  assert.equal(Math.round((shares.get("a")! + shares.get("b")!) * 100), 30500, "exact to the paisa");
  for (const total of [0.01, 1, 99.99, 1000.03, 4999.97]) {
    const three = allocateCodCollectible(total, [{ seller: "x", total: 33 }, { seller: "y", total: 33 }, { seller: "z", total: 34 }]);
    assert.equal(Math.round([...three.values()].reduce((sum, v) => sum + v, 0) * 100), Math.round(total * 100), String(total));
  }
  assert.deepEqual([...allocateCodCollectible(10, [{ seller: "p", total: 0 }, { seller: "q", total: 0 }]).values()], [5, 5], "free items: equal split");
  assert.equal(allocateCodCollectible(10, [{ seller: "p", total: 5, status: "Cancelled" }]).size, 0, "cancelled items never collect");
});

test("COD booking: worker sends COD with this seller's share and stores it; refused when COD is switched off", async t => {
  const { doc } = bookingWorld(t, { order: { paymentMethod: "COD", paymentStatus: "Pending", total: 305 } });
  const worldItems: any[] = await (OrderItem.find as any)({});
  const allItems = [...worldItems.map((item: any) => ({ ...item, seller: doc.seller })), { seller: oid(), total: 100, status: "Pending" }];
  t.mock.method(OrderItem, "find", (filter: any) => lean(() => allItems.filter(item => !filter?.seller || String(item.seller) === String(filter.seller))));
  const bodies: any[] = [];
  const env = { ...DEV_ENV, ADLOGGS_COD_ENABLED: "true" } as NodeJS.ProcessEnv;
  const { client, calls } = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available,
    [ADLOGGS_PATHS.createOrder]: (request: any) => { bodies.push(request.body); return DOC.created; } }, env);
  assert.equal((await runAdloggsBookingOnce({ client, now: t0 })).outcome, "BOOKED");
  assert.equal(bodies[0].payment_type, "COD");
  assert.ok(bodies[0].collectible_amount > 0 && bodies[0].collectible_amount < 305, "this seller's share only");
  assert.equal(doc.adloggs.codCollectibleAmount, bodies[0].collectible_amount);
  assert.equal(calls.find((c: any) => c.url.endsWith(ADLOGGS_PATHS.serviceAvailability)).body.payment_type, "COD");

  const off = bookingWorld(t, { order: { paymentMethod: "COD", paymentStatus: "Pending", total: 305 } });
  const offClient = devClient({ [ADLOGGS_PATHS.serviceAvailability]: DOC.available, [ADLOGGS_PATHS.createOrder]: DOC.created }, DEV_ENV);
  assert.equal((await runAdloggsBookingOnce({ client: offClient.client, now: t0 })).outcome, "NOT_READY");
  assert.equal(offClient.calls.length, 0, "nothing sent when COD is off");
  assert.equal(off.doc.bookingIntent.state, "RETRYABLE_FAILURE");
});

test("COD refused by Adloggs for the merchant (observed on the real dev API) gives the customer a clear pay-online message", () => {
  const checkout = src("services/checkoutService.ts");
  assert.match(checkout, /paymentMethod === "COD" && verification\.routes\.some\(route => \/cod is not allowed\/i\.test/);
  assert.match(checkout, /Cash on delivery isn't available with our delivery partner right now\. Please pay online\./);
});
