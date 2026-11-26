/**
 * Phase 3A — internal multi-vendor shipment architecture.
 * Pure functions plus read scoping with mocked Mongoose calls. Lifecycle
 * integration (creation, sync, cancellation, in-house flow) is covered in
 * product.delivery.flows.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Shipment, { SHIPMENT_STATUSES, BOOKING_INTENT_STATES } from "../models/Shipment";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import {
  canTransitionShipment,
  deriveShipmentStatus,
  summarizeShipments,
  getOrderShipments,
  TERMINAL_SHIPMENT_STATUSES,
} from "../services/shipmentService";

const oid = () => new mongoose.Types.ObjectId();
const src = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const chain = (value: any) => { const q: any = { select: () => q, lean: () => q, sort: () => q, session: () => q,
  then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject) }; return q; };

// --------------------------------------------------------------------------
// Lifecycle rules
// --------------------------------------------------------------------------
test("transitions: forward moves (including admin stage skips) are valid", () => {
  for (const [from, to] of [["CREATED", "PREPARING"], ["PREPARING", "READY_FOR_PICKUP"], ["READY_FOR_PICKUP", "PICKED_UP"],
    ["PICKED_UP", "DELIVERED"], ["CREATED", "READY_FOR_PICKUP"], ["READY_FOR_PICKUP", "DELIVERED"], ["DELIVERED", "RETURNED"]] as const) {
    assert.equal(canTransitionShipment(from, to), true, `${from} -> ${to}`);
  }
});

test("transitions: backwards, delivered→cancelled, returned-before-delivery and repeats are invalid", () => {
  for (const [from, to] of [["PREPARING", "CREATED"], ["PICKED_UP", "READY_FOR_PICKUP"], ["DELIVERED", "PICKED_UP"],
    ["DELIVERED", "CANCELLED"], ["PICKED_UP", "RETURNED"], ["CREATED", "CREATED"]] as const) {
    assert.equal(canTransitionShipment(from, to), false, `${from} -> ${to}`);
  }
});

test("transitions: CANCELLED and RETURNED are terminal", () => {
  assert.deepEqual(TERMINAL_SHIPMENT_STATUSES, ["CANCELLED", "RETURNED", "RETURNED_TO_ORIGIN"]);
  for (const terminal of TERMINAL_SHIPMENT_STATUSES) {
    for (const to of SHIPMENT_STATUSES) assert.equal(canTransitionShipment(terminal, to), false, `${terminal} -> ${to}`);
  }
  for (const active of ["CREATED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP"] as const) {
    assert.equal(canTransitionShipment(active, "CANCELLED"), true);
  }
});

test("derivation follows the existing seller stage, pickup and item data", () => {
  const seller = String(oid());
  const order = { status: "Accepted", sellerPickups: [] as any[] };
  const item = (overrides: any = {}) => ({ seller, status: "Pending", fulfillmentStatus: "Received", ...overrides });
  assert.equal(deriveShipmentStatus([item()], order, seller), "CREATED");
  assert.equal(deriveShipmentStatus([item({ fulfillmentStatus: "Accepted" })], order, seller), "PREPARING");
  // Phase 4: prepared stages are READY_FOR_PICKUP only with the explicit readiness fact.
  assert.equal(deriveShipmentStatus([item({ fulfillmentStatus: "Processed" })], order, seller), "PREPARING");
  assert.equal(deriveShipmentStatus([item({ fulfillmentStatus: "Shipped", status: "Shipped" })], order, seller), "PREPARING");
  assert.equal(deriveShipmentStatus([item({ fulfillmentStatus: "Processed" })], order, seller, true), "READY_FOR_PICKUP");
  assert.equal(deriveShipmentStatus([item({ fulfillmentStatus: "Accepted" })], order, seller, true), "PREPARING", "readiness never outruns preparation");
  assert.equal(deriveShipmentStatus([item({ fulfillmentStatus: "Processed" })], { ...order, sellerPickups: [{ seller, pickedUpAt: new Date() }] }, seller), "PICKED_UP");
  assert.equal(deriveShipmentStatus([item({ status: "Delivered" })], { status: "Delivered" }, seller), "DELIVERED");
  assert.equal(deriveShipmentStatus([item({ status: "Cancelled" })], order, seller), "CANCELLED");
  assert.equal(deriveShipmentStatus([item({ status: "Returned" })], { status: "Delivered" }, seller), "RETURNED");
  assert.equal(deriveShipmentStatus([item({ status: "Cancelled" })], { status: "Returned" }, seller), "RETURNED", "admin-returned order");
  // Pre-Phase-3A items without per-item stages fall back to the order stage, as sellerStage does.
  assert.equal(deriveShipmentStatus([{ seller, status: "Pending" }], { status: "Processed" }, seller), "PREPARING");
});

// --------------------------------------------------------------------------
// Aggregation
// --------------------------------------------------------------------------
const summary = (...statuses: any[]) => summarizeShipments(statuses.map(status => ({ status })));

test("aggregation: an order is DELIVERED only when every non-cancelled shipment is", () => {
  assert.equal(summary("DELIVERED", "PREPARING", "CANCELLED").state, "PARTIALLY_DELIVERED", "no premature completion");
  assert.equal(summary("DELIVERED", "DELIVERED").state, "DELIVERED");
  const partial = summary("DELIVERED", "CANCELLED");
  assert.equal(partial.state, "DELIVERED");
  assert.equal(partial.partiallyCancelled, true);
});

test("aggregation: mixed, pending, cancelled, returned and empty orders", () => {
  assert.equal(summary("PREPARING", "READY_FOR_PICKUP", "CREATED").state, "IN_PROGRESS");
  assert.equal(summary("CREATED", "CREATED").state, "PENDING");
  assert.equal(summary("CANCELLED", "CANCELLED").state, "CANCELLED");
  assert.equal(summary("CANCELLED", "CANCELLED").partiallyCancelled, false);
  assert.equal(summary("RETURNED", "CANCELLED").state, "RETURNED");
  assert.equal(summary("RETURNED", "DELIVERED").state, "DELIVERED", "partial return still counts as delivered");
  assert.equal(summarizeShipments([]).state, "NONE");
  const counts = summary("DELIVERED", "PREPARING", "CANCELLED");
  assert.deepEqual([counts.total, counts.active, counts.delivered, counts.cancelled], [3, 1, 1, 1]);
});

// --------------------------------------------------------------------------
// Read scoping
// --------------------------------------------------------------------------
/** Store names for shipment views (looked up per order). */
function mockSellerNames(t: any, names: Record<string, string> = {}) {
  return t.mock.method(Seller, "find", (filter: any) => chain((filter._id.$in as string[]).map(id => ({ _id: id, storeName: names[id] ?? `Store ${id.slice(-4)}` }))));
}

function mockReads(t: any, sellerA: string, sellerB: string) {
  mockSellerNames(t, { [sellerA]: "Store A", [sellerB]: "Store B" });
  const stored = [
    { _id: oid(), order: "o", seller: sellerA, shipmentNumber: "ORD1-S1", status: "READY_FOR_PICKUP", deliveryProvider: "IN_HOUSE", history: [{ status: "CREATED" }] },
    { _id: oid(), order: "o", seller: sellerB, shipmentNumber: "ORD1-S2", status: "PREPARING", deliveryProvider: "IN_HOUSE", history: [{ status: "CREATED" }] },
  ];
  t.mock.method(OrderItem, "find", () => chain([
    { seller: sellerA, status: "Pending", fulfillmentStatus: "Processed" },
    { seller: sellerB, status: "Pending", fulfillmentStatus: "Accepted" },
    { seller: sellerB, status: "Cancelled", fulfillmentStatus: "Cancelled" },
  ]));
  const finds = t.mock.method(Shipment, "find", (filter: any) => chain(stored.filter(s => !filter.seller || String(s.seller) === String(filter.seller))));
  return { finds };
}

test("reads: a seller sees only their own shipment; no seller id means nothing", async t => {
  const a = String(oid()), b = String(oid());
  const { finds } = mockReads(t, a, b);
  const order = { _id: "o", orderChannel: "ONLINE", shipmentsCreated: true };
  const own = await getOrderShipments(order, { audience: "seller", sellerId: a });
  assert.deepEqual(own.map(s => s.seller), [a]);
  assert.equal(finds.mock.calls[0].arguments[0].seller, a, "filtered in the database query, not after");
  assert.equal(own[0].deliveryProvider, undefined);
  assert.deepEqual(await getOrderShipments(order, { audience: "seller" }), []);
});

test("reads: customers and couriers get status only; admins also get provider and history", async t => {
  const a = String(oid()), b = String(oid());
  mockReads(t, a, b);
  const order = { _id: "o", orderChannel: "ONLINE", shipmentsCreated: true };
  const customer = await getOrderShipments(order, { audience: "customer" });
  assert.equal(customer.length, 2);
  assert.ok(customer.every(s => s.deliveryProvider === undefined && s.history === undefined));
  assert.equal(customer.find(s => s.seller === b)!.itemCount, 1, "cancelled items are not counted");
  const admin = await getOrderShipments(order, { audience: "admin" });
  assert.ok(admin.every(s => s.deliveryProvider === "IN_HOUSE" && Array.isArray(s.history)));
});

test("reads: legacy orders get computed, non-persisted shipments; POS sales have none", async t => {
  const a = String(oid()), b = String(oid());
  const { finds } = mockReads(t, a, b);
  const legacy = await getOrderShipments({ _id: "o", orderChannel: "ONLINE", status: "Accepted" }, { audience: "admin" });
  assert.equal(finds.mock.callCount(), 0, "no stored records are read for legacy orders");
  assert.ok(legacy.every(s => s.persisted === false && s.deliveryProvider === "IN_HOUSE"));
  assert.deepEqual(legacy.map(s => s.status), ["PREPARING", "PREPARING"], "legacy orders cannot carry a readiness confirmation");
  assert.deepEqual(await getOrderShipments({ _id: "o", orderChannel: "OFFLINE" }, { audience: "admin" }), []);
});

// --------------------------------------------------------------------------
// Structure, ownership and safety
// --------------------------------------------------------------------------
test("model: unique (order, seller) and supporting indexes; no provider payload fields", () => {
  const indexes = Shipment.schema.indexes().map(([fields, options]) => ({ fields, unique: !!options?.unique }));
  assert.ok(indexes.some(i => JSON.stringify(i.fields) === JSON.stringify({ order: 1, seller: 1 }) && i.unique));
  assert.ok(indexes.some(i => JSON.stringify(i.fields) === JSON.stringify({ shipmentNumber: 1 }) && i.unique));
  assert.ok(indexes.some(i => "seller" in i.fields && "status" in i.fields));
  assert.ok(indexes.some(i => "deliveryProvider" in i.fields));
  const paths = Object.keys(Shipment.schema.paths);
  for (const forbidden of ["externalId", "awb", "trackingUrl", "providerStatus", "price", "fee", "codAmount"]) {
    assert.equal(paths.some(p => p.toLowerCase().includes(forbidden.toLowerCase())), false, forbidden);
  }
  assert.ok(new Shipment({}).validateSync()?.errors.order, "a shipment requires its parent order");
});

test("creation runs inside the checkout transaction, after the order and before the coupon", () => {
  const c = src("modules/customer/controllers/customerOrderController.ts");
  const fn = c.slice(c.indexOf("export const createOrder"), c.indexOf("export async function cleanupExpiredPendingOrders"));
  const tx = fn.indexOf("withOrderTransaction(`checkout:");
  const save = fn.indexOf("await order.save({ session })");
  const create = fn.indexOf("createOrderShipments(order");
  assert.ok(tx > 0 && tx < save && save < create && create < fn.indexOf("consumeCoupon("));
  assert.match(fn, /order\.shipmentsCreated = true/);
});

test("every lifecycle write syncs shipments in its own transaction", () => {
  const lifecycle = src("services/orderLifecycleService.ts");
  for (const fn of ["cancelOrderLifecycle", "changeSellerStage", "confirmOrderPickup"]) {
    const start = lifecycle.indexOf(`export async function ${fn}`);
    const body = lifecycle.slice(start, lifecycle.indexOf("export async function", start + 10) > 0 ? lifecycle.indexOf("export async function", start + 10) : undefined);
    assert.match(body, /syncOrderShipments\(order, session/, fn);
  }
  assert.match(src("services/deliveryOtpService.ts"), /syncOrderShipments\(order!, session, "delivery"\)/);
  assert.match(src("modules/admin/controllers/adminOrderController.ts"), /syncOrderShipments\(current, session, "admin"\)/);
});

test("shipments never dispatch couriers, price deliveries or touch money", () => {
  const service = src("services/shipmentService.ts");
  assert.doesNotMatch(service, /notifyDeliveryBoys|acceptDeliveryOrder|DeliveryAssignment|sendNotificationToUser|io\.to/);
  assert.doesNotMatch(service, /computeDeliveryFee|priceOrder|shipping|Commission|WalletTransaction|queueOrderEffect|refund/i);
  assert.doesNotMatch(service, /axios|fetch\(|https?:\/\//);
  for (const rel of ["services/commissionService.ts", "services/orderPricingService.ts", "services/codSettlementService.ts"]) {
    assert.doesNotMatch(src(rel), /shipmentService|models\/Shipment/, rel);
  }
});

test("APIs: shipment data is added to existing, already-scoped order-detail endpoints", () => {
  const customer = src("modules/customer/controllers/customerOrderController.ts");
  const customerFn = customer.slice(customer.indexOf("export const getOrderById"), customer.indexOf("export const refreshDeliveryOtp"));
  assert.match(customerFn, /Order\.findOne\(\{ _id: id, customer: userId \}\)/, "customer: own orders only");
  assert.match(customerFn, /shipmentFields\(order, \{ audience: "customer" \}\)/);
  const seller = src("modules/seller/controllers/orderController.ts");
  assert.match(seller, /getOrderShipments\(order, \{ audience: "seller", sellerId \}\)/, "seller: own shipment only");
  const courier = src("modules/delivery/controllers/deliveryOrderController.ts");
  const courierFn = courier.slice(courier.indexOf("export const getOrderDetails"), courier.indexOf("export const updateOrderStatus"));
  assert.match(courierFn, /deliveryBoy: deliveryId/, "courier: assigned orders only");
  assert.match(courierFn, /audience: "courier"/);
  assert.match(src("modules/admin/controllers/adminOrderController.ts"), /audience: "admin"/);
});

// --------------------------------------------------------------------------
// Phase 4 — readiness visibility and safety
// --------------------------------------------------------------------------
test("views: readiness and partial returns for everyone; booking intent and attention for admins only", async t => {
  const a = String(oid());
  mockSellerNames(t);
  const readyAt = new Date();
  t.mock.method(OrderItem, "find", () => chain([
    { seller: a, status: "Delivered" }, { seller: a, status: "Returned" },
  ]));
  t.mock.method(Shipment, "find", () => chain([{ _id: oid(), seller: a, shipmentNumber: "ORD9-S1", status: "READY_FOR_PICKUP",
    deliveryProvider: "ADDLOGS", readyForPickupAt: readyAt, history: [], bookingIntent: { state: "PENDING", createdAt: readyAt },
    attention: { reason: "x", at: readyAt } }]));
  const order = { _id: "o", orderChannel: "ONLINE", shipmentsCreated: true };
  const [customer] = await getOrderShipments(order, { audience: "customer" });
  assert.equal(customer.statusLabel, "Ready for pickup");
  assert.equal(customer.waitingForPickup, true);
  assert.equal(customer.readyForPickupAt, readyAt);
  assert.equal(customer.returnedItemCount, 1);
  assert.equal(customer.bookingIntent, undefined);
  assert.equal(customer.attention, undefined);
  const [admin] = await getOrderShipments(order, { audience: "admin" });
  assert.deepEqual(admin.bookingIntent, { state: "PENDING", createdAt: readyAt, providerContacted: false }, "never shown as booked");
  assert.equal(admin.attention!.reason, "x");
});

test("readiness endpoint is seller-only and never assigns, dispatches or contacts a provider", () => {
  const routes = src("routes/orderRoutes.ts");
  assert.ok(routes.indexOf('router.use(requireUserType("Seller"))') < routes.indexOf('"/:id/ready-for-pickup"'));
  const lifecycle = src("services/orderLifecycleService.ts");
  const ready = lifecycle.slice(lifecycle.indexOf("export async function markSellerReadyForPickup"), lifecycle.indexOf("export async function acceptDeliveryOrder"));
  assert.doesNotMatch(ready, /deliveryBoy\s*=|DeliveryAssignment|claimInHouseAssignment|notifyDeliveryBoys|fulfillmentStatus\s*=|axios|fetch\(/);
  assert.match(ready, /withOrderTransaction\(id/, "serialized with cancel/pickup by the order lock");
  assert.match(ready, /readyForPickupAt: null/, "conditional write makes it idempotent");
});

test("booking intents are processed only by the gated Adloggs worker; BOOKED needs a verified response", () => {
  // Phase 6: the dedicated booking worker exists but is registered only when enabled.
  const service = src("services/shipmentService.ts");
  assert.match(service, /shipment\.deliveryProvider !== "IN_HOUSE"/, "in-house shipments never get an intent");
  for (const rel of ["services/orderEffectService.ts", "services/inHouseDeliveryRecoveryService.ts"]) {
    assert.doesNotMatch(src(rel), /bookingIntent/, `${rel} must not act on booking intents`);
  }
  assert.match(src("server.ts"), /scheduleAdloggs\("booking", adloggs\.bookingReady/, "booking worker only when the capability is ready");
  assert.equal(BOOKING_INTENT_STATES.filter(state => /BOOKED|CONFIRMED|ACCEPTED/.test(state)).join(), "BOOKED", "BOOKED is the only confirmed state");
  assert.match(src("services/adloggs/adloggsBookingService.ts"), /"bookingIntent\.state": "BOOKED", "bookingIntent\.updatedAt": now,\s*"adloggs\.orderUuid": result\.orderUuid/,
    "BOOKED is written together with the verified provider order_uuid");
});

test("returns write the durable marker before the item and reconcile transactionally", () => {
  const ret = src("services/returnService.ts");
  assert.ok(ret.indexOf("shipmentSyncPending: true") < ret.indexOf('{ $set: { status: "Returned" } }'), "marker first");
  assert.match(ret, /reconcileOrderShipments\(String\(order\._id\)\)/);
  assert.doesNotMatch(ret.slice(ret.indexOf("shipmentSyncPending")), /refundAmount\s*=/, "refund calculation untouched");
  assert.match(src("server.ts"), /reconcilePendingShipmentSyncs\(\)/);
});

test("seller UI offers readiness only when the server allows it and refreshes from the server", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "..", "..", "frontend", "src", "modules", "seller", "pages", "SellerOrderDetail.tsx"), "utf8");
  assert.match(page, /orderDetail\.shipment\.canMarkReady \?/);
  assert.match(page, /if \(!orderDetail \|\| markingReady\) return;/, "no duplicate submissions");
  assert.match(page, /void refreshShipment\(\)/);
  assert.doesNotMatch(page, /Addlogs|ADDLOGS|booking/i, "no provider booking controls for sellers");
});
