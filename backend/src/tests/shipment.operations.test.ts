/**
 * Phase 5 — tracking timeline, admin shipment operations, reconciliation
 * preparation and booking-intent reliability. Real service code with mocked
 * Mongoose calls; no database, provider, gateway or socket is used.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Shipment, { BOOKING_INTENT_STATES } from "../models/Shipment";
import ShipmentReconciliation from "../models/ShipmentReconciliation";
import Order from "../models/Order";
import AppSettings from "../models/AppSettings";
import { buildShipmentTimeline } from "../services/shipmentService";
import {
  canTransitionBookingIntent,
  claimBookingIntent,
  recordBookingIntentFailure,
  releaseBookingIntentClaim,
  describeBookingStage,
  TERMINAL_BOOKING_INTENT_STATES,
} from "../services/bookingIntentService";
import {
  parseListQuery,
  listShipments,
  classifyShipment,
  getShipmentExceptions,
  getShipmentReconciliation,
  ShipmentOperationsError,
  MAX_PAGE_SIZE,
} from "../services/shipmentOperationsService";

const oid = () => new mongoose.Types.ObjectId();
const src = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const fe = (rel: string) => fs.readFileSync(path.join(__dirname, "..", "..", "..", "frontend", "src", rel), "utf8");
const chain = (value: any) => { const q: any = { select: () => q, lean: () => q, sort: () => q, skip: () => q, limit: () => q, populate: () => q,
  then: (resolve: any, reject: any) => Promise.resolve(typeof value === "function" ? value() : value).then(resolve, reject) }; return q; };
const t0 = new Date("2026-11-01T10:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60000);

// ==========================================================================
// A — tracking timeline
// ==========================================================================
test("timeline: full in-house flow is chronological and built only from recorded facts", () => {
  const seller = String(oid());
  const timeline = buildShipmentTimeline({
    order: { createdAt: at(0), deliveredAt: at(50), sellerPickups: [{ seller, pickedUpAt: at(30) }] },
    sellerId: seller, status: "DELIVERED", readyForPickupAt: at(20),
    history: [{ status: "CREATED", at: at(0) }, { status: "PREPARING", at: at(5) }, { status: "READY_FOR_PICKUP", at: at(20) },
      { status: "PICKED_UP", at: at(30) }, { status: "DELIVERED", at: at(50) }],
  });
  assert.deepEqual(timeline.map(e => e.type), ["ORDER_PLACED", "SELLER_ACCEPTED", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERED"]);
  const times = timeline.map(e => e.at!.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b), "chronological");
  assert.ok(timeline.every(e => e.timestampAvailable));
});

test("timeline: duplicates suppressed; another seller's pickup and a seller's own 'Shipped' are not pickups", () => {
  const seller = String(oid());
  const timeline = buildShipmentTimeline({
    order: { createdAt: at(0), sellerPickups: [{ seller: String(oid()), pickedUpAt: at(10) }] },
    sellerId: seller, status: "PREPARING",
    history: [{ status: "PREPARING", at: at(1) }, { status: "PREPARING", at: at(2) }],
  });
  assert.deepEqual(timeline.map(e => e.type), ["ORDER_PLACED", "SELLER_ACCEPTED"]);
  assert.equal(timeline[1].at!.getTime(), at(1).getTime(), "first occurrence kept");
});

test("timeline: legacy orders show unavailable times instead of invented ones", () => {
  const seller = String(oid());
  const timeline = buildShipmentTimeline({ order: { createdAt: at(0), sellerPickups: [{ seller, pickedUpAt: at(30) }] }, sellerId: seller, status: "PICKED_UP" });
  assert.deepEqual(timeline.map(e => [e.type, e.timestampAvailable]), [["ORDER_PLACED", true], ["SELLER_ACCEPTED", false], ["PICKED_UP", true]]);
  assert.equal(timeline[1].at, null);
  assert.equal(timeline.some(e => e.type === "READY_FOR_PICKUP"), false, "no readiness is invented for legacy orders");
});

test("timeline: cancellation and return events", () => {
  const seller = String(oid());
  const cancelled = buildShipmentTimeline({ order: { createdAt: at(0), status: "Accepted" }, sellerId: seller, status: "CANCELLED",
    history: [{ status: "CANCELLED", at: at(8) }] });
  assert.deepEqual(cancelled.map(e => e.type), ["ORDER_PLACED", "CANCELLED"], "never-accepted cancellation shows no acceptance");
  const wholeOrder = buildShipmentTimeline({ order: { createdAt: at(0), status: "Cancelled", cancelledAt: at(9) }, sellerId: seller, status: "CANCELLED" });
  assert.equal(wholeOrder.at(-1)!.at!.getTime(), at(9).getTime());
  const sellerOnlyLegacy = buildShipmentTimeline({ order: { createdAt: at(0), status: "Accepted" }, sellerId: seller, status: "CANCELLED" });
  assert.equal(sellerOnlyLegacy.at(-1)!.timestampAvailable, false, "seller-only legacy cancellation has no recorded time");
  const returned = buildShipmentTimeline({ order: { createdAt: at(0), deliveredAt: at(40) }, sellerId: seller, status: "RETURNED",
    history: [{ status: "RETURNED", at: at(90) }] });
  assert.deepEqual(returned.map(e => e.type).slice(-2), ["DELIVERED", "RETURNED"]);
});

// ==========================================================================
// D — booking-intent state machine and concurrency
// ==========================================================================
test("intent states: BOOKED only via a verified answer; terminal states are final", () => {
  assert.deepEqual([...BOOKING_INTENT_STATES], ["PENDING", "CLAIMED", "SUBMITTING", "OUTCOME_UNKNOWN", "BOOKED", "RETRYABLE_FAILURE", "FAILED", "CANCELLED"]);
  assert.equal(canTransitionBookingIntent("CLAIMED", "BOOKED"), false, "a claim alone can never become a booking");
  assert.equal(canTransitionBookingIntent("OUTCOME_UNKNOWN", "CLAIMED"), false, "an unknown outcome is never re-claimed");
  for (const terminal of TERMINAL_BOOKING_INTENT_STATES) {
    for (const to of BOOKING_INTENT_STATES) assert.equal(canTransitionBookingIntent(terminal, to), false);
  }
  assert.equal(canTransitionBookingIntent("PENDING", "CLAIMED"), true);
  assert.equal(canTransitionBookingIntent("PENDING", "FAILED"), false, "cannot fail without an attempt");
  assert.equal(canTransitionBookingIntent("CLAIMED", "PENDING"), true, "a claim can be released");
});

/** One shipment, with update semantics faithful to the conditional filters used. */
function intentStore(t: any, initial: any) {
  const doc: any = { _id: oid(), deliveryProvider: "ADDLOGS", status: "READY_FOR_PICKUP", ...initial };
  const intent = () => doc.bookingIntent;
  const claimable = (now: Date) => doc.deliveryProvider !== "IN_HOUSE" && doc.status === "READY_FOR_PICKUP" && intent() && (
    intent().state === "PENDING" ||
    (intent().state === "RETRYABLE_FAILURE" && intent().nextAttemptAt <= now) ||
    (intent().state === "CLAIMED" && intent().leaseUntil <= now));
  const apply = (update: any) => {
    for (const [key, value] of Object.entries(update.$set || {})) doc.bookingIntent[key.replace("bookingIntent.", "")] = value;
    for (const [key, value] of Object.entries(update.$inc || {})) {
      const field = key.replace("bookingIntent.", "");
      doc.bookingIntent[field] = (doc.bookingIntent[field] || 0) + (value as number);
    }
    for (const key of Object.keys(update.$unset || {})) delete doc.bookingIntent[key.replace("bookingIntent.", "")];
  };
  t.mock.method(Shipment, "findOneAndUpdate", (filter: any, update: any) => chain(async () => {
    await new Promise(resolve => setImmediate(resolve)); // let concurrent claimers interleave
    const now = filter.$or[1]["bookingIntent.nextAttemptAt"].$lte;
    if (!claimable(now)) return null; // single-document atomicity: the check and write happen together
    apply(update);
    return structuredClone({ _id: doc._id, bookingIntent: doc.bookingIntent });
  }));
  t.mock.method(Shipment, "updateOne", async (filter: any, update: any) => {
    const wanted = filter["bookingIntent.state"];
    const stateOk = wanted && typeof wanted === "object" ? wanted.$in.includes(intent()?.state) : intent()?.state === wanted;
    if (!stateOk || intent()?.leaseToken !== filter["bookingIntent.leaseToken"]) return { modifiedCount: 0 };
    apply(update);
    return { modifiedCount: 1 };
  });
  t.mock.method(Shipment, "findOne", () => chain(() => ({ bookingIntent: { ...doc.bookingIntent } })));
  return doc;
}

test("intent claim: concurrent workers — exactly one wins; a claim is not a booking", async t => {
  const doc = intentStore(t, { bookingIntent: { state: "PENDING", createdAt: t0, attempts: 0 } });
  const claims = await Promise.all([claimBookingIntent({ now: t0 }), claimBookingIntent({ now: t0 }), claimBookingIntent({ now: t0 })]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(doc.bookingIntent.state, "CLAIMED");
  assert.equal(doc.bookingIntent.attempts, 1);
  assert.ok(!("booked" in doc.bookingIntent) && !("providerReference" in doc.bookingIntent));
});

test("intent claim: expired lease (crashed worker) can be re-claimed; the stale worker's update is rejected", async t => {
  const doc = intentStore(t, { bookingIntent: { state: "PENDING", createdAt: t0, attempts: 0 } });
  const first = await claimBookingIntent({ now: t0, leaseMs: 1000 });
  assert.equal(await claimBookingIntent({ now: at(0) }), null, "lease still held");
  const second = await claimBookingIntent({ now: at(1) });
  assert.ok(second && second.token !== first!.token);
  assert.deepEqual(await recordBookingIntentFailure(doc._id, first!.token, { reason: "late", retryable: true }), { recorded: false });
  assert.equal(doc.bookingIntent.state, "CLAIMED");
  assert.equal(doc.bookingIntent.attempts, 2);
});

test("intent failures: retryable waits for nextAttemptAt; exhausted attempts become FAILED", async t => {
  const doc = intentStore(t, { bookingIntent: { state: "PENDING", createdAt: t0, attempts: 0 } });
  const claim = await claimBookingIntent({ now: t0 });
  const result = await recordBookingIntentFailure(doc._id, claim!.token, { reason: "internal error", retryable: true, retryAfterMs: 60000, now: t0 });
  assert.deepEqual(result, { recorded: true, state: "RETRYABLE_FAILURE" });
  assert.equal(doc.bookingIntent.leaseToken, undefined);
  assert.equal(await claimBookingIntent({ now: at(0.5) }), null, "not before nextAttemptAt");
  const retry = await claimBookingIntent({ now: at(2) });
  assert.ok(retry);
  const final = await recordBookingIntentFailure(doc._id, retry!.token, { reason: "again", retryable: true, maxAttempts: 2, now: at(2) });
  assert.deepEqual(final, { recorded: true, state: "FAILED" });
  assert.equal(await claimBookingIntent({ now: at(100) }), null, "FAILED is terminal");
});

test("intent: cancellation during a claim wins; release returns a claim to PENDING", async t => {
  const doc = intentStore(t, { bookingIntent: { state: "PENDING", createdAt: t0, attempts: 0 } });
  const claim = await claimBookingIntent({ now: t0 });
  assert.equal(await releaseBookingIntentClaim(doc._id, claim!.token), true);
  assert.equal(doc.bookingIntent.state, "PENDING");
  const again = await claimBookingIntent({ now: at(1) });
  doc.bookingIntent.state = "CANCELLED"; // lifecycle sync cancelled the shipment meanwhile
  delete doc.bookingIntent.leaseToken;
  assert.deepEqual(await recordBookingIntentFailure(doc._id, again!.token, { reason: "x", retryable: true }), { recorded: false });
  assert.equal(doc.bookingIntent.state, "CANCELLED", "a stale worker can never resurrect it");
});

test("intent claim: in-house shipments are never claimable", async t => {
  intentStore(t, { deliveryProvider: "IN_HOUSE", bookingIntent: { state: "PENDING", createdAt: t0 } });
  assert.equal(await claimBookingIntent({ now: t0 }), null);
});

test("booking stage descriptions never claim a booking", () => {
  assert.equal(describeBookingStage({ status: "PREPARING", deliveryProvider: "ADDLOGS" }), "SELLER_NOT_READY");
  assert.equal(describeBookingStage({ status: "READY_FOR_PICKUP", deliveryProvider: "IN_HOUSE" }), "READY_NO_BOOKING_REQUIRED");
  assert.equal(describeBookingStage({ status: "READY_FOR_PICKUP", deliveryProvider: "ADDLOGS", bookingIntent: { state: "PENDING" } }), "AWAITING_BOOKING_INTEGRATION");
  assert.equal(describeBookingStage({ status: "READY_FOR_PICKUP", bookingIntent: { state: "CLAIMED" } }), "BOOKING_ATTEMPT_IN_PROGRESS");
  assert.equal(describeBookingStage({ status: "READY_FOR_PICKUP", bookingIntent: { state: "FAILED" } }), "BOOKING_PREPARATION_FAILED");
  assert.equal(describeBookingStage({ status: "CANCELLED", bookingIntent: { state: "CANCELLED" } }), "BOOKING_CANCELLED");
});

test("no worker, timer or provider client drives booking intents", () => {
  for (const rel of ["server.ts", "services/orderEffectService.ts", "services/inHouseDeliveryRecoveryService.ts", "socket/socketService.ts"]) {
    assert.doesNotMatch(src(rel), /claimBookingIntent|bookingIntentService/, rel);
  }
  for (const rel of ["services/bookingIntentService.ts", "services/shipmentOperationsService.ts", "models/ShipmentReconciliation.ts"]) {
    assert.doesNotMatch(src(rel), /axios|fetch\(|https?:\/\/|setInterval|setTimeout/, rel);
  }
});

// ==========================================================================
// B — admin shipment operations
// ==========================================================================
test("list query validation: whitelisted filters and bounded paging", () => {
  assert.deepEqual(parseListQuery({}), { filter: "all", page: 1, limit: 20 });
  assert.deepEqual(parseListQuery({ filter: "attention", page: "3", limit: "50" }), { filter: "attention", page: 3, limit: 50 });
  for (const bad of [{ filter: "booked" }, { filter: { $ne: 1 } }, { page: "0" }, { page: "1.5" }, { limit: "0" }, { limit: String(MAX_PAGE_SIZE + 1) }, { limit: "abc" }]) {
    assert.throws(() => parseListQuery(bad), ShipmentOperationsError, JSON.stringify(bad));
  }
});

test("listing: server-side paging and filter queries; lease tokens never exposed", async t => {
  const calls: any = {};
  const row = { _id: oid(), shipmentNumber: "ORD1-S1", status: "READY_FOR_PICKUP", deliveryProvider: "ADDLOGS", createdAt: t0,
    order: { _id: oid(), orderNumber: "ORD1", status: "Processed" }, seller: { _id: oid(), storeName: "Store A" },
    bookingIntent: { state: "PENDING", attempts: 0, leaseToken: "secret" }, history: [] };
  t.mock.method(Shipment, "find", (query: any) => {
    calls.query = query;
    const q: any = chain([row]);
    q.skip = (n: number) => { calls.skip = n; return q; };
    q.limit = (n: number) => { calls.limit = n; return q; };
    return q;
  });
  t.mock.method(Shipment, "countDocuments", async () => 45);
  t.mock.method(ShipmentReconciliation, "find", () => chain([]));
  const result = await listShipments({ filter: "awaiting_booking", page: 3, limit: 20 });
  assert.deepEqual(calls.query, { "bookingIntent.state": { $in: ["PENDING", "CLAIMED", "RETRYABLE_FAILURE"] } });
  assert.deepEqual([calls.skip, calls.limit], [40, 20]);
  assert.deepEqual(result.pagination, { page: 3, limit: 20, total: 45, pages: 3 });
  const [item] = result.data;
  assert.equal(item.operationalState, "WAITING_FOR_BOOKING_INTEGRATION", "a pending intent is waiting, not failed");
  assert.equal(JSON.stringify(item).includes("secret"), false);
  assert.equal(item.bookingIntent!.providerContacted, false);
});

test("listing: the attention filter includes sync-pending orders", async t => {
  const pendingOrder = oid();
  t.mock.method(Order, "find", () => chain([{ _id: pendingOrder }]));
  let captured: any;
  t.mock.method(Shipment, "find", (query: any) => { captured = query; return chain([]); });
  t.mock.method(Shipment, "countDocuments", async () => 0);
  await listShipments({ filter: "attention", page: 1, limit: 20 });
  assert.equal(captured.$or.length, 5, "attention also covers unknown booking outcomes and refused cancellations");
  assert.deepEqual(captured.$or[2], { order: { $in: [pendingOrder] } });
});

test("classification separates waiting, sync issues and evidenced failures", () => {
  assert.equal(classifyShipment({ status: "PREPARING" }, false), "WAITING_FOR_SELLER");
  assert.equal(classifyShipment({ status: "READY_FOR_PICKUP", deliveryProvider: "IN_HOUSE" }, false), "WAITING_FOR_PICKUP");
  assert.equal(classifyShipment({ status: "READY_FOR_PICKUP", deliveryProvider: "ADDLOGS", bookingIntent: { state: "PENDING" } }, false), "WAITING_FOR_BOOKING_INTEGRATION");
  assert.equal(classifyShipment({ status: "READY_FOR_PICKUP", bookingIntent: { state: "FAILED" } }, false), "OPERATIONAL_FAILURE");
  assert.equal(classifyShipment({ status: "DELIVERED", attention: { reason: "x" } }, false), "INTERNAL_SYNC_ISSUE");
  assert.equal(classifyShipment({ status: "DELIVERED" }, true), "INTERNAL_SYNC_ISSUE");
  assert.equal(classifyShipment({ status: "PICKED_UP" }, false), "IN_TRANSIT");
});

test("exceptions: counts plus honest context that no provider is integrated", async t => {
  t.mock.method(AppSettings, "findOne", () => chain({ inHouseDelivery: { enabled: true } }));
  t.mock.method(Shipment, "countDocuments", async (query: any) => (query["bookingIntent.state"] === "PENDING" ? 2 : 0));
  t.mock.method(Order, "countDocuments", async () => 1);
  t.mock.method(Order, "aggregate", async () => [{ count: 3 }]);
  const summary = await getShipmentExceptions(t0);
  assert.equal(summary.booking.awaitingIntegration, 2);
  assert.equal(summary.booking.failed, 0, "pending intents are not reported as failures");
  assert.equal(summary.booking.integrationAvailable, false);
  assert.equal(summary.syncPendingOrders, 1);
  assert.deepEqual(summary.missingShipments, { count: 3, windowDays: 30 });
});

// ==========================================================================
// C — reconciliation preparation
// ==========================================================================
test("reconciliation model: unknown amounts are null (never 0), money is 2dp, one record per shipment", () => {
  const record = new ShipmentReconciliation({ shipment: oid(), order: oid(), seller: oid(), deliveryProvider: "ADDLOGS" });
  assert.equal(record.validateSync(), undefined);
  assert.deepEqual([record.providerCost, record.providerAdjustment, record.providerCredit, record.providerSettlementReference], [null, null, null, null]);
  assert.equal(record.currency, "INR");
  assert.equal(record.status, "AWAITING_PROVIDER_DATA");
  for (const bad of [12.345, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.ok(new ShipmentReconciliation({ shipment: oid(), order: oid(), seller: oid(), deliveryProvider: "ADDLOGS", providerCost: bad }).validateSync()?.errors.providerCost);
  }
  assert.ok(ShipmentReconciliation.schema.indexes().some(([fields, options]) => JSON.stringify(fields) === '{"shipment":1}' && options?.unique));
  const paths = Object.keys(ShipmentReconciliation.schema.paths).join(" ");
  assert.doesNotMatch(paths, /cod|payout|commission|margin|profit|customerDeliveryCharge/i, "no COD/settlement/profit fields; customer charge not duplicated");
});

test("reconciliation view: in-house not applicable; customer charge read from the order; no margin", async t => {
  const shipmentId = oid();
  t.mock.method(Shipment, "findById", () => chain({ _id: shipmentId, order: oid(), deliveryProvider: "IN_HOUSE", shipmentNumber: "ORD1-S1", status: "DELIVERED" }));
  t.mock.method(Order, "findById", () => chain({ orderNumber: "ORD1", shipping: 35, paymentMethod: "COD" }));
  t.mock.method(ShipmentReconciliation, "findOne", () => chain(null));
  const view = await getShipmentReconciliation(String(shipmentId));
  assert.equal(view.applicability, "NOT_APPLICABLE_IN_HOUSE");
  assert.deepEqual(view.customerDeliveryCharge, { amount: 35, currency: "INR", scope: "ORDER",
    note: "Charged once per customer order; not allocated to individual seller shipments." });
  assert.equal(view.record, null);
  assert.equal(/margin|profit/i.test(JSON.stringify(view)), false);
  await assert.rejects(getShipmentReconciliation("nope"), ShipmentOperationsError);
});

test("existing financial code is untouched by shipment tracking and reconciliation", () => {
  for (const rel of ["services/commissionService.ts", "services/orderPricingService.ts", "services/codSettlementService.ts",
    "services/paymentService.ts", "services/refundService.ts", "services/orderEffectService.ts"]) {
    assert.doesNotMatch(src(rel), /ShipmentReconciliation|bookingIntent|shipmentOperations/, rel);
  }
});

// ==========================================================================
// G — authorization and E — customer/courier views
// ==========================================================================
test("routes: shipment operations and reconciliation are admin-only", () => {
  const routes = src("routes/adminRoutes.ts");
  const guard = routes.indexOf('router.use(requireUserType("Admin"))');
  for (const route of ['"/shipments"', '"/shipments/exceptions"', '"/shipments/:id/reconciliation"', '"/shipments/orders/:orderId/reconcile"']) {
    assert.ok(guard > 0 && guard < routes.indexOf(route), route);
  }
  assert.doesNotMatch(src("routes/customerOrderRoutes.ts") + src("routes/orderRoutes.ts") + src("routes/deliveryRoutes.ts"), /reconciliation|shipmentOperations/);
  const controller = src("modules/admin/controllers/adminShipmentController.ts");
  assert.doesNotMatch(controller, /status\s*=|acceptDeliveryOrder|claimBookingIntent|refund/i, "no overrides, assignment, booking or money actions");
});

test("views: customers get timelines and store names; couriers get neither; internals stay admin-only", () => {
  const service = src("services/shipmentService.ts");
  assert.match(service, /const withTimeline = options\.audience !== "courier"/);
  assert.match(service, /\.\.\.\(admin \? \{[\s\S]*bookingStage[\s\S]*bookingIntent[\s\S]*attention/);
  const courier = src("modules/delivery/controllers/deliveryOrderController.ts");
  assert.match(courier, /map\(\(\{ seller, status, shipmentNumber \}\) => \(\{ seller, status, shipmentNumber \}\)\)/);
});

test("UI: customer card shows recorded events only; admin page has no overrides or booking buttons", () => {
  const card = fe("components/OrderShipmentsCard.tsx");
  assert.match(card, /time not recorded/);
  assert.doesNotMatch(card, /\beta\b|estimatedArrival|bookingIntent|attention|providerCost|trackingNumber|Addlogs/i);
  assert.match(fe("modules/user/OrderDetail.tsx"), /<OrderShipmentsCard shipments=\{order\.shipments\} \/>/);
  assert.match(fe("modules/user/OrderDetail.tsx"), /<DeliveryPartnerCard/, "in-house live tracking card is kept");
  // Comments removed: they explain what is deliberately absent.
  const admin = fe("modules/admin/pages/AdminShipments.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(admin, /not sent to a provider/);
  assert.doesNotMatch(admin, /Book (now|shipment)|Mark (as )?(delivered|picked)|setStatus|override/i);
});
