/**
 * Phase 1 — admin-controlled in-house delivery switch.
 *
 * Exercises the real service, controller, notification and middleware code
 * with mocked Mongoose calls; no database, gateway or socket server is used.
 * Lifecycle/drain-mode cases live in product.delivery.flows.test.ts, which
 * owns the order transaction harness.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import AppSettings from "../models/AppSettings";
import SettingAuditLog from "../models/SettingAuditLog";
import Order from "../models/Order";
import Delivery from "../models/Delivery";
import {
  isInHouseDeliveryEnabled,
  setInHouseDeliveryEnabled,
  assertNewInHouseDeliveryAllowed,
  getCourierServiceStatus,
} from "../services/inHouseDeliveryService";
import {
  notifyDeliveryBoysOfNewOrder,
  handleOrderAcceptance,
  notificationStates,
  withdrawPendingCourierOffers,
} from "../services/orderNotificationService";
import {
  updateInHouseDeliverySettings,
  getInHouseDeliverySettings,
  stripInHouseDeliveryKeys,
  retryInHouseDeliveryRecovery,
} from "../modules/admin/controllers/adminSettingsController";
import { claimInHouseAssignment, isTransactionRetryError } from "../services/inHouseDeliveryService";
import { runInHouseDeliveryRecovery, RECOVERY_MAX_ORDER_AGE_MS } from "../services/inHouseDeliveryRecoveryService";

const oid = () => new mongoose.Types.ObjectId();
const src = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

/** A chainable, awaitable stand-in for a Mongoose query. */
function q(value: () => any) {
  const query: any = { select: () => query, lean: () => query, session: () => query, populate: () => query, sort: () => query, limit: () => query,
    then: (resolve: any, reject: any) => Promise.resolve().then(value).then(resolve, reject) };
  return query;
}

const getPath = (obj: any, key: string) => key.split(".").reduce((value, part) => (value == null ? undefined : value[part]), obj);
const setPath = (obj: any, key: string, value: any) => {
  const parts = key.split(".");
  let target = obj;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  target[parts[parts.length - 1]] = value;
};
/** Evaluates the small filter vocabulary the switch/recovery code uses. */
function matchesFilter(doc: any, filter: any): boolean {
  return Object.entries(filter || {}).every(([key, want]: [string, any]) => {
    const value = key === "_id" ? doc._id : getPath(doc, key);
    if (want && typeof want === "object" && !(want instanceof Date)) {
      if ("$ne" in want) return value !== want.$ne;
      if ("$not" in want) return !(value instanceof Date && value > want.$not.$gt);
    }
    return value === want;
  });
}

/**
 * In-memory settings singleton. `initial`: switch value, `undefined` = legacy
 * document without the field, "nodoc" = no settings document at all.
 */
function mockSettings(t: any, initial: boolean | undefined | "nodoc") {
  let doc: any = initial === "nodoc" ? null : initial === undefined ? { _id: "s" } : { _id: "s", inHouseDelivery: { enabled: initial } };
  const state = {
    audits: [] as any[],
    updates: 0, // switch changes only
    gateWrites: 0,
    get doc() { return doc; },
    get enabled(): any { return doc === null ? "nodoc" : doc.inHouseDelivery?.enabled; },
    set enabled(value: any) {
      if (value === "nodoc") doc = null;
      else { doc ??= { _id: "s" }; setPath(doc, "inHouseDelivery.enabled", value); }
    },
  };
  const apply = (update: any) => {
    for (const [key, value] of Object.entries(update.$set || {})) setPath(doc, key, value);
    for (const [key, value] of Object.entries(update.$inc || {})) setPath(doc, key, (getPath(doc, key) || 0) + (value as number));
    if (update.$set?.["inHouseDelivery.enabled"] !== undefined) state.updates++;
    if (update.$inc?.["inHouseDelivery.assignmentSeq"]) state.gateWrites++;
  };
  t.mock.method(AppSettings, "findOne", () => q(() => (doc ? structuredClone(doc) : null)));
  t.mock.method(AppSettings, "getSettings", async () => { doc ??= { _id: "s" }; return doc; });
  t.mock.method(AppSettings, "updateOne", async (filter: any, update: any) => {
    if (!doc || !matchesFilter(doc, filter)) return { matchedCount: 0, modifiedCount: 0 };
    apply(update);
    return { matchedCount: 1, modifiedCount: 1 };
  });
  t.mock.method(AppSettings, "findOneAndUpdate", (filter: any, update: any) => q(() => {
    if (!doc || !matchesFilter(doc, filter)) return null;
    apply(update);
    return structuredClone(doc);
  }));
  t.mock.method(SettingAuditLog, "create", async (docs: any[]) => { state.audits.push(...docs); return docs; });
  t.mock.method(mongoose, "startSession", async () => ({ endSession: async () => {}, withTransaction: async (work: any) => work() }));
  return state;
}

function fakeIo() {
  const events: { room: string; event: string; payload: any }[] = [];
  const io: any = {
    to: (room: string) => ({ emit: (event: string, payload: any) => events.push({ room, event, payload }) }),
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  };
  return { io, events };
}

/** Run an asyncHandler-wrapped controller and resolve with the response. */
function call(handler: any, req: any): Promise<{ status: number; body: any; error?: any }> {
  return new Promise(resolve => {
    let status = 200;
    const res: any = { status(code: number) { status = code; return res; }, json(body: any) { resolve({ status, body }); return res; } };
    handler({ app: { get: () => req.io }, ...req }, res, (error: any) => resolve({ status: error?.statusCode || 500, body: null, error }));
  });
}

// --------------------------------------------------------------------------
// Persisted setting
// --------------------------------------------------------------------------
test("switch defaults to enabled for legacy settings documents and fresh installs", async t => {
  const s = mockSettings(t, undefined);
  assert.equal(await isInHouseDeliveryEnabled(), true);
  s.enabled = "nodoc";
  assert.equal(await isInHouseDeliveryEnabled(), true);
  s.enabled = false;
  assert.equal(await isInHouseDeliveryEnabled(), false);
});

test("schema default keeps the existing fleet enabled on deploy", () => {
  const settings = new AppSettings({ contactEmail: "a@b.co", contactPhone: "1" });
  assert.equal(settings.inHouseDelivery?.enabled, true);
});

test("guard fails closed when the setting cannot be read", async t => {
  t.mock.method(AppSettings, "findOne", () => q(() => { throw new Error("db down"); }));
  await assert.rejects(assertNewInHouseDeliveryAllowed(), (error: any) => error.reason === "IN_HOUSE_DELIVERY_STATE_UNAVAILABLE");
});

test("toggling writes one audit record; repeating the same value is a no-op", async t => {
  const s = mockSettings(t, undefined);
  const admin = String(oid());
  assert.deepEqual(await setInHouseDeliveryEnabled(false, admin), { enabled: false, changed: true });
  assert.equal(s.enabled, false);
  assert.equal(s.audits.length, 1);
  assert.equal(s.audits[0].setting, "inHouseDelivery.enabled");
  assert.equal(s.audits[0].previousValue, true);
  assert.equal(s.audits[0].newValue, false);
  assert.equal(String(s.audits[0].changedBy), admin);
  assert.deepEqual(await setInHouseDeliveryEnabled(false, admin), { enabled: false, changed: false });
  assert.equal(s.audits.length, 1, "repeated request is not re-audited");
  assert.deepEqual(await setInHouseDeliveryEnabled(true, admin), { enabled: true, changed: true });
  assert.equal(s.audits.length, 2);
});

test("a concurrent change is detected instead of silently overwritten", async t => {
  const s = mockSettings(t, true);
  t.mock.method(AppSettings, "updateOne", async () => ({ modifiedCount: 0 }));
  await assert.rejects(setInHouseDeliveryEnabled(false, String(oid())), (error: any) => error.statusCode === 409);
  assert.equal(s.audits.length, 0);
});

// --------------------------------------------------------------------------
// Admin API
// --------------------------------------------------------------------------
test("admin API rejects malformed payloads without touching the setting", async t => {
  const s = mockSettings(t, true);
  for (const body of [{}, { enabled: "false" }, { enabled: 0 }, { enabled: false, extra: 1 }, [false], null]) {
    const result = await call(updateInHouseDeliverySettings, { body, user: { userId: String(oid()) } });
    assert.equal(result.status, 400, `payload ${JSON.stringify(body)} should be rejected`);
  }
  assert.equal(s.updates, 0);
  assert.equal(s.enabled, true);
});

test("admin API disables, voids pending offers and broadcasts the new state", async t => {
  mockSettings(t, true);
  t.mock.method(Order, "countDocuments", async () => 2);
  const { io, events } = fakeIo();
  notificationStates.set("pending-offer", { orderId: "pending-offer", notifiedDeliveryBoys: new Set(["c1"]), rejectedDeliveryBoys: new Set(), acceptedBy: null });
  const result = await call(updateInHouseDeliverySettings, { body: { enabled: false }, user: { userId: String(oid()) }, io });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.enabled, false);
  assert.equal(result.body.data.changed, true);
  assert.equal(result.body.data.activeAssignments, 2);
  assert.equal(notificationStates.has("pending-offer"), false);
  assert.ok(events.some(e => e.event === "order-offer-withdrawn" && e.payload.orderId === "pending-offer"));
  assert.ok(events.some(e => e.room === "delivery-notifications" && e.event === "in-house-delivery-state" && e.payload.inHouseDeliveryEnabled === false));
  const again = await call(updateInHouseDeliverySettings, { body: { enabled: false }, user: { userId: String(oid()) }, io });
  assert.equal(again.body.data.changed, false);
});

test("admin API read returns persisted state and drain counts", async t => {
  mockSettings(t, false);
  t.mock.method(Order, "countDocuments", async (filter: any) => (filter.deliveryBoy?.$ne === null ? 3 : 5));
  const result = await call(getInHouseDeliverySettings, {});
  assert.equal(result.body.data.enabled, false);
  assert.equal(result.body.data.activeAssignments, 3);
  assert.equal(result.body.data.awaitingCourier, 5);
});

test("generic settings update cannot overwrite the switch in any form", () => {
  const update: any = { appName: "X", inHouseDelivery: { enabled: false }, "inHouseDelivery.enabled": false, $set: { "inHouseDelivery.enabled": false, platformFee: 3 } };
  stripInHouseDeliveryKeys(update);
  assert.deepEqual(update, { appName: "X", $set: { platformFee: 3 } });
});

test("only Admin accounts reach the switch endpoints", async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_harness";
  const { requireUserType } = await import("../middleware/auth");
  const routes = src("routes/adminRoutes.ts");
  const guard = routes.indexOf('router.use(requireUserType("Admin"))');
  assert.ok(guard > 0 && guard < routes.indexOf("/settings/in-house-delivery"), "endpoints are mounted behind the Admin guard");
  for (const userType of ["Delivery", "Seller", "Customer"]) {
    let status = 0;
    const res: any = { status(code: number) { status = code; return res; }, json() { return res; } };
    let passed = false;
    requireUserType("Admin")({ user: { userId: "u", userType } } as any, res, () => { passed = true; });
    assert.equal(passed, false);
    assert.equal(status, 403);
  }
});

// --------------------------------------------------------------------------
// Offers, acceptance, sockets
// --------------------------------------------------------------------------
test("OFF: a seller-triggered dispatch broadcasts no offer and flags the order to admins", async t => {
  mockSettings(t, false);
  const order = { _id: oid(), orderNumber: "ORD1", status: "Accepted", paymentMethod: "COD", deliveryBoy: null, items: [] };
  t.mock.method(Order, "findById", () => q(() => order));
  const courierLookup = t.mock.method(Delivery, "find", () => q(() => []));
  const { io, events } = fakeIo();
  await notifyDeliveryBoysOfNewOrder(io, order);
  assert.equal(courierLookup.mock.callCount(), 0, "no courier search when disabled");
  assert.equal(events.filter(e => e.event === "new-order").length, 0);
  assert.ok(events.some(e => e.room === "admin-notifications" && e.event === "delivery-unavailable" && e.payload.reason === "IN_HOUSE_DELIVERY_DISABLED"));
});

test("ON: a seller-triggered dispatch proceeds to the courier search as before", async t => {
  mockSettings(t, true);
  const order = { _id: oid(), orderNumber: "ORD3", status: "Accepted", paymentMethod: "COD", deliveryBoy: null, items: [] };
  t.mock.method(Order, "findById", () => q(() => order));
  const courierLookup = t.mock.method(Delivery, "find", () => q(() => []));
  const { io, events } = fakeIo();
  await notifyDeliveryBoysOfNewOrder(io, order);
  assert.ok(courierLookup.mock.callCount() > 0, "courier search runs when enabled");
  assert.equal(events.filter(e => e.event === "delivery-unavailable").length, 0);
});

test("unreadable switch: dispatch also broadcasts nothing", async t => {
  t.mock.method(AppSettings, "findOne", () => q(() => { throw new Error("db down"); }));
  const order = { _id: oid(), orderNumber: "ORD2", status: "Accepted", paymentMethod: "COD", deliveryBoy: null };
  t.mock.method(Order, "findById", () => q(() => order));
  const { io, events } = fakeIo();
  await notifyDeliveryBoysOfNewOrder(io, order);
  assert.equal(events.filter(e => e.event === "new-order").length, 0);
});

test("OFF: socket accept of a stale offer returns the disabled message and voids the offer", async t => {
  mockSettings(t, false);
  const id = String(oid());
  const order: any = { _id: id, status: "Accepted", paymentMethod: "COD", deliveryBoy: undefined, save: async () => order };
  t.mock.method(Order, "findById", () => q(() => order));
  t.mock.method(Delivery, "findById", () => q(() => ({ status: "Active" })));
  t.mock.method(mongoose.models.OrderOperationLock, "updateOne", async () => ({ modifiedCount: 1 }));
  notificationStates.set(id, { orderId: id, notifiedDeliveryBoys: new Set(["c1"]), rejectedDeliveryBoys: new Set(), acceptedBy: null });
  const { io } = fakeIo();
  const result = await handleOrderAcceptance(io, id, String(oid()));
  assert.equal(result.success, false);
  assert.match(result.message, /temporarily disabled/);
  assert.equal(order.deliveryBoy, undefined);
  assert.equal(notificationStates.has(id), false);
});

test("withdrawing offers keeps already-accepted offers", () => {
  notificationStates.set("taken", { orderId: "taken", notifiedDeliveryBoys: new Set(), rejectedDeliveryBoys: new Set(), acceptedBy: "c9" });
  const withdrawn = withdrawPendingCourierOffers(undefined);
  assert.equal(withdrawn.includes("taken"), false);
  assert.equal(notificationStates.has("taken"), true);
  notificationStates.delete("taken");
});

test("socket reconnect replays pending offers only after the switch check", () => {
  const socket = src("socket/socketService.ts");
  const handler = socket.slice(socket.indexOf("socket.on('join-delivery-notifications'"), socket.indexOf("socket.on('accept-order'"));
  const check = handler.indexOf("canStartNewInHouseDelivery()");
  assert.ok(check > 0, "replay checks the switch");
  assert.ok(check < handler.indexOf("Order.find("), "check happens before pending orders are loaded");
  assert.match(handler, /if \(!availability\.allowed\)[\s\S]{0,200}return;/);
});

test("drain paths and money routes carry no switch guard", () => {
  // These must keep working for already-assigned work and outstanding cash.
  for (const rel of [
    "modules/delivery/controllers/deliveryWalletController.ts",
    "modules/delivery/controllers/deliveryEarningController.ts",
    "modules/admin/controllers/adminDeliveryController.ts",
    "services/deliveryOtpService.ts",
    "services/commissionService.ts",
    "services/orderEffectService.ts",
    "modules/customer/controllers/trackingController.ts",
  ]) assert.doesNotMatch(src(rel), /inHouseDeliveryService|assertNewInHouseDeliveryAllowed|claimInHouseAssignment/, rel);
  const lifecycle = src("services/orderLifecycleService.ts");
  const guardCalls = lifecycle.match(/claimInHouseAssignment\(|assertNewInHouseDeliveryAllowed\(/g) || [];
  assert.equal(guardCalls.length, 1, "only the assignment write is guarded");
  const accept = lifecycle.slice(lifecycle.indexOf("export async function acceptDeliveryOrder"), lifecycle.indexOf("export async function changeCourierStage"));
  assert.match(accept, /claimInHouseAssignment\(session\)/);
  // The socket location handler is untouched by the switch.
  const socket = src("socket/socketService.ts");
  const location = socket.slice(socket.indexOf("socket.on('update-location'"), socket.indexOf("// Handle disconnection"));
  assert.doesNotMatch(location, /canStartNewInHouseDelivery/);
});

test("courier service status reports the switch and this courier's remaining work", async t => {
  mockSettings(t, false);
  t.mock.method(Order, "countDocuments", async () => 1);
  const status = await getCourierServiceStatus(String(oid()));
  assert.equal(status.inHouseDeliveryEnabled, false);
  assert.equal(status.activeDeliveries, 1);
  assert.match(status.message || "", /temporarily disabled/);
});

// --------------------------------------------------------------------------
// Frontend (source assertions, matching the repository's *.frontend tests)
// --------------------------------------------------------------------------
const fe = (rel: string) => fs.readFileSync(path.join(__dirname, "..", "..", "..", "frontend", "src", rel), "utf8");

test("UI: courier app hides offers while disabled and keeps finance screens", () => {
  const layout = fe("modules/delivery/components/DeliveryLayout.tsx");
  assert.match(layout, /inHouseDeliveryEnabled && currentNotification &&/, "offer card is gated on the switch");
  assert.match(layout, /New delivery assignments are temporarily disabled/);
  assert.match(layout, /wallet, earnings, history and COD settlements remain available/);
  const hook = fe("hooks/useDeliveryOrderNotifications.ts");
  assert.match(hook, /if \(!offersEnabledRef\.current\)[\s\S]{0,120}return;/, "incoming offers ignored when disabled");
  assert.match(hook, /'in-house-delivery-state'/);
  assert.match(hook, /'order-offer-withdrawn'/);
  const menu = fe("modules/delivery/pages/DeliveryMenu.tsx");
  for (const route of ["/delivery/wallet", "/delivery/earnings", "/delivery/orders/all"]) assert.ok(menu.includes(route), `${route} still reachable`);
  assert.match(menu, /inHouseDeliveryEnabled\s*\?\s*\[\{ id: "menu-service-areas"/, "availability screen hidden when disabled");
  assert.match(fe("modules/delivery/pages/DeliverySellersInRange.tsx"), /if \(!inHouseDeliveryEnabled\)/);
  assert.match(fe("modules/delivery/context/DeliveryStatusContext.tsx"), /getServiceStatus\(\)/, "state comes from the backend");
});

test("UI: admin toggle shows only the persisted value and confirms before disabling", () => {
  const card = fe("modules/admin/components/InHouseDeliveryToggleCard.tsx");
  assert.match(card, /New in-house delivery assignments will stop\. Already assigned deliveries can continue until completion\./);
  assert.match(card, /if \(saving\) return;/, "duplicate submissions are blocked");
  // State is only set from server responses, never optimistically from the click.
  const setCalls = card.match(/setSettings\(([^)]*)\)/g) || [];
  assert.ok(setCalls.length > 0 && setCalls.every(callText => /response\.data/.test(callText)));
  assert.match(fe("modules/admin/pages/AdminManageDeliveryBoy.tsx"), /<InHouseDeliveryToggleCard[\s/]/);
  const detail = fe("modules/admin/pages/AdminOrderDetail.tsx");
  assert.equal((detail.match(/\{inHouseEnabled && \(/g) || []).length, 2, "both assign buttons are hidden when disabled");
});

// ==========================================================================
// Phase 1.1 — concurrency gate
// ==========================================================================

/** Driver-style WriteConflict: carries the TransientTransactionError label. */
const writeConflict = () => Object.assign(new Error("WriteConflict"), { errorLabels: ["TransientTransactionError"] });

/**
 * Mirrors the driver's `withTransaction` contract: the callback is re-run while
 * it fails with TransientTransactionError. This SIMULATES MongoDB write-conflict
 * handling; it is not a replica-set test.
 */
async function withRetryingTransaction<T>(work: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await work(); }
    catch (error) { if (attempt >= maxAttempts || !isTransactionRetryError(error)) throw error; }
  }
}

/** Gate whose first attempt collides with an admin disable that then commits. */
function collideWithDisable(t: any, s: any) {
  let attempts = 0;
  t.mock.method(AppSettings, "updateOne", async () => {
    attempts++;
    if (attempts === 1) { s.enabled = false; throw writeConflict(); }
    const matched = s.enabled === false ? 0 : 1;
    return { matchedCount: matched, modifiedCount: matched };
  });
  return { get attempts() { return attempts; } };
}

test("gate: an assignment is a conditional WRITE on the settings document", async t => {
  const s = mockSettings(t, true);
  await claimInHouseAssignment({} as any);
  assert.equal(s.gateWrites, 1, "enabled → the gate writes (so it conflicts with a toggle)");
  s.enabled = false;
  await assert.rejects(claimInHouseAssignment({} as any), (e: any) => e.reason === "IN_HOUSE_DELIVERY_DISABLED" && e.statusCode === 409);
  assert.equal(s.gateWrites, 1, "disabled → nothing written");
});

test("gate: write conflicts propagate unwrapped so the transaction retries", async t => {
  mockSettings(t, true);
  t.mock.method(AppSettings, "updateOne", async () => { throw writeConflict(); });
  await assert.rejects(claimInHouseAssignment({} as any), (e: any) => isTransactionRetryError(e) && !e.reason);
  t.mock.method(AppSettings, "findOne", () => q(() => { throw writeConflict(); }));
  await assert.rejects(assertNewInHouseDeliveryAllowed({} as any), (e: any) => isTransactionRetryError(e));
});

test("gate: a non-retryable DB failure fails closed (503), never assumes enabled", async t => {
  mockSettings(t, true);
  t.mock.method(AppSettings, "updateOne", async () => { throw new Error("socket closed"); });
  await assert.rejects(claimInHouseAssignment({} as any), (e: any) => e.reason === "IN_HOUSE_DELIVERY_STATE_UNAVAILABLE" && e.statusCode === 503);
});

test("race: courier accept vs admin disable — the retried accept is refused", async t => {
  const s = mockSettings(t, true);
  const gate = collideWithDisable(t, s);
  let assigned = false;
  await assert.rejects(withRetryingTransaction(async () => { await claimInHouseAssignment({} as any); assigned = true; }),
    (e: any) => e.reason === "IN_HOUSE_DELIVERY_DISABLED");
  assert.equal(gate.attempts, 2, "the accept was re-run after the conflict");
  assert.equal(assigned, false, "no assignment commits after the disable");
});

test("race: manual assignment vs admin disable — same gate, same outcome", async t => {
  const s = mockSettings(t, true);
  const gate = collideWithDisable(t, s);
  await assert.rejects(withRetryingTransaction(() => claimInHouseAssignment({} as any)), (e: any) => e.reason === "IN_HOUSE_DELIVERY_DISABLED");
  assert.equal(gate.attempts, 2);
});

test("race: an accept that commits BEFORE the disable is kept; later assignments are refused", async t => {
  const s = mockSettings(t, true);
  await withRetryingTransaction(() => claimInHouseAssignment({} as any));
  s.enabled = false; // admin disables afterwards
  assert.equal(s.gateWrites, 1);
  await assert.rejects(claimInHouseAssignment({} as any), /temporarily disabled/);
});

test("toggle ON records a recovery request; OFF cancels it", async t => {
  const s = mockSettings(t, false);
  await setInHouseDeliveryEnabled(true, String(oid()));
  assert.equal(s.doc.inHouseDelivery.recovery.pending, true);
  assert.equal(s.doc.inHouseDelivery.recovery.requestSeq, 1);
  await setInHouseDeliveryEnabled(false, String(oid()));
  assert.equal(s.doc.inHouseDelivery.recovery.pending, false);
});

// ==========================================================================
// Phase 1.1 — waiting-order recovery
// ==========================================================================
const HOUR = 60 * 60 * 1000;
let orderSeq = 0;
function makeOrder(overrides: any = {}) {
  return { _id: oid(), orderNumber: `ORD-T${++orderSeq}`, status: "Accepted", paymentMethod: "COD", paymentStatus: "Pending",
    deliveryBoy: null, orderChannel: "ONLINE", createdAt: new Date(Date.now() - HOUR), ...overrides };
}
/** Evaluates the recovery query against an in-memory order list. */
function orderMatches(order: any, filter: any): boolean {
  return Object.entries(filter).every(([key, want]: [string, any]) => {
    if (key === "$or") return want.some((sub: any) => orderMatches(order, sub));
    const value = order[key];
    if (want === null) return value == null;
    if (typeof want === "object" && !(want instanceof Date)) {
      // As in MongoDB, `$in: [null]` also matches a missing field.
      if ("$in" in want) return want.$in.includes(value === undefined ? null : value);
      if ("$ne" in want) return value !== want.$ne;
      if ("$lt" in want) return value < want.$lt;
      if ("$gte" in want) return value >= want.$gte;
      if ("$gt" in want) return String(value) > String(want.$gt);
    }
    return value === want;
  });
}
function mockOrders(t: any, orders: any[]) {
  t.mock.method(Order, "countDocuments", async (filter: any) => orders.filter(o => orderMatches(o, filter)).length);
  t.mock.method(Order, "find", (filter: any) => {
    let limit = Infinity;
    const query: any = { sort: () => query, select: () => query, lean: () => query, limit: (n: number) => { limit = n; return query; },
      then: (resolve: any, reject: any) => Promise.resolve(orders.filter(o => orderMatches(o, filter))
        .sort((a, b) => String(a._id).localeCompare(String(b._id))).slice(0, limit)).then(resolve, reject) };
    return query;
  });
  t.mock.method(Order, "findById", (id: any) => q(() => orders.find(o => String(o._id) === String(id)) || null));
}
function recordingDispatch(outcome: (order: any) => any = () => "offered") {
  const calls: string[] = [];
  const dispatch = async (_io: any, order: any, options: any) => {
    assert.equal(options.skipIfOfferOpen, true, "recovery always asks for duplicate-offer suppression");
    calls.push(String(order._id));
    return outcome(order);
  };
  return { calls, dispatch };
}

test("recovery: re-enabling offers only eligible waiting orders, then clears the request", async t => {
  const s = mockSettings(t, false);
  const waiting = makeOrder();
  const prepaid = makeOrder({ paymentMethod: "Online", paymentStatus: "Paid", status: "Processed" });
  const ineligible = [
    makeOrder({ deliveryBoy: oid() }),                                 // already assigned
    makeOrder({ status: "Cancelled" }),                                // cancelled
    makeOrder({ status: "Delivered" }),                                // completed
    makeOrder({ status: "Received" }),                                 // multi-seller: not every seller accepted yet
    makeOrder({ paymentMethod: "Online", paymentStatus: "Pending" }),  // unpaid
    makeOrder({ orderChannel: "OFFLINE" }),                            // POS sale
  ];
  mockOrders(t, [waiting, prepaid, ...ineligible]);
  const { calls, dispatch } = recordingDispatch();
  const { io, events } = fakeIo();
  await setInHouseDeliveryEnabled(true, String(oid()));
  const result = await runInHouseDeliveryRecovery(io, { trigger: "test", dispatch });
  assert.equal(result.status, "completed");
  assert.deepEqual(calls.sort(), [String(waiting._id), String(prepaid._id)].sort());
  assert.equal(result.offered, 2);
  assert.equal(s.doc.inHouseDelivery.recovery.pending, false);
  assert.equal(s.doc.inHouseDelivery.recovery.lastRun.offered, 2);
  assert.ok(events.some(e => e.room === "admin-notifications" && e.event === "in-house-delivery-recovery"));
  assert.ok(ineligible.every(o => !calls.includes(String(o._id))));
});

test("recovery: a second run with nothing pending does nothing (no duplicate offers)", async t => {
  mockSettings(t, false);
  mockOrders(t, [makeOrder()]);
  const { calls, dispatch } = recordingDispatch();
  const { io } = fakeIo();
  await setInHouseDeliveryEnabled(true, String(oid()));
  await runInHouseDeliveryRecovery(io, { dispatch });
  const second = await runInHouseDeliveryRecovery(io, { dispatch });
  assert.equal(second.status, "skipped");
  assert.equal(calls.length, 1);
});

test("recovery: repeated and simultaneous ON requests trigger exactly one run", async t => {
  mockSettings(t, false);
  mockOrders(t, [makeOrder()]);
  t.mock.method(Delivery, "find", () => q(() => [])); // real dispatcher: no couriers online
  const { io, events } = fakeIo();
  const admin = String(oid());
  const results = await Promise.all([
    call(updateInHouseDeliverySettings, { body: { enabled: true }, user: { userId: admin }, io }),
    call(updateInHouseDeliverySettings, { body: { enabled: true }, user: { userId: admin }, io }),
  ]);
  // The loser either sees "already enabled" (driver retried the write conflict)
  // or a 409 from the conditional update. Both are safe: neither runs recovery.
  const winners = results.filter(r => r.status === 200 && r.body.data.changed);
  assert.equal(winners.length, 1, "only one request actually turned it ON");
  for (const loser of results.filter(r => !winners.includes(r))) {
    assert.ok(loser.status === 409 || (loser.status === 200 && loser.body.data.changed === false));
  }
  assert.equal(results.filter(r => r.body?.data?.recovery).length, 1, "only that request ran recovery");
  const again = await call(updateInHouseDeliverySettings, { body: { enabled: true }, user: { userId: admin }, io });
  assert.equal(again.body.data.changed, false);
  assert.equal(again.body.data.recovery, undefined);
  assert.equal(events.filter(e => e.event === "in-house-delivery-recovery").length, 1);
});

test("recovery: a concurrent run is excluded by the lease", async t => {
  mockSettings(t, false);
  mockOrders(t, [makeOrder(), makeOrder()]);
  const { io } = fakeIo();
  await setInHouseDeliveryEnabled(true, String(oid()));
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const slow = async (_io: any, order: any) => { calls.push(String(order._id)); await hold; return "offered" as const; };
  const first = runInHouseDeliveryRecovery(io, { dispatch: slow });
  await new Promise(resolve => setTimeout(resolve, 10));
  const second = await runInHouseDeliveryRecovery(io, { dispatch: slow });
  assert.equal(second.status, "skipped", "a second runner cannot start while the lease is held");
  release();
  assert.equal((await first).offered, 2);
  assert.equal(calls.length, 2, "each order dispatched exactly once");
});

test("recovery: switching OFF mid-run stops further offers", async t => {
  const s = mockSettings(t, false);
  mockOrders(t, [makeOrder(), makeOrder(), makeOrder()]);
  const { io } = fakeIo();
  await setInHouseDeliveryEnabled(true, String(oid()));
  const calls: string[] = [];
  const dispatch = async (_io: any, order: any) => {
    calls.push(String(order._id));
    await setInHouseDeliveryEnabled(false, String(oid())); // admin turns it OFF during the run
    return "offered" as const;
  };
  const result = await runInHouseDeliveryRecovery(io, { dispatch });
  assert.equal(result.status, "aborted");
  assert.equal(calls.length, 1, "no offers after the switch went OFF");
  assert.equal(s.doc.inHouseDelivery.recovery.pending, false);
});

test("recovery: a newer ON request during a run keeps the request pending", async t => {
  const s = mockSettings(t, false);
  mockOrders(t, [makeOrder()]);
  const { io } = fakeIo();
  await setInHouseDeliveryEnabled(true, String(oid()));
  const dispatch = async () => {
    await setInHouseDeliveryEnabled(false, String(oid()));
    await setInHouseDeliveryEnabled(true, String(oid())); // OFF→ON again: requestSeq advances
    return "offered" as const;
  };
  await runInHouseDeliveryRecovery(io, { dispatch });
  assert.equal(s.doc.inHouseDelivery.recovery.pending, true, "the newer request is not swallowed");
});

test("recovery: a fatal error is visible and left pending for the worker", async t => {
  const s = mockSettings(t, false);
  const { io, events } = fakeIo();
  await setInHouseDeliveryEnabled(true, String(oid()));
  t.mock.method(Order, "countDocuments", async () => { throw new Error("db timeout"); });
  const failed = await runInHouseDeliveryRecovery(io, { dispatch: recordingDispatch().dispatch });
  assert.equal(failed.status, "failed");
  assert.equal(s.doc.inHouseDelivery.recovery.pending, true);
  assert.match(s.doc.inHouseDelivery.recovery.lastRun.errors.join(" "), /db timeout/);
  assert.ok(events.some(e => e.event === "in-house-delivery-recovery" && e.payload.status === "failed"));
  mockOrders(t, [makeOrder()]); // database back: the worker retries
  const retried = await runInHouseDeliveryRecovery(io, { trigger: "worker", dispatch: recordingDispatch().dispatch });
  assert.equal(retried.status, "completed");
  assert.equal(s.doc.inHouseDelivery.recovery.pending, false);
});

test("recovery: per-order failures and stale orders are reported, not hidden", async t => {
  const s = mockSettings(t, false);
  const stale = makeOrder({ createdAt: new Date(Date.now() - RECOVERY_MAX_ORDER_AGE_MS - HOUR) });
  const broken = makeOrder();
  const fine = makeOrder();
  mockOrders(t, [stale, broken, fine]);
  const { io } = fakeIo();
  await setInHouseDeliveryEnabled(true, String(oid()));
  const { calls, dispatch } = recordingDispatch(order => (String(order._id) === String(broken._id) ? "error" : "noCouriers"));
  const result = await runInHouseDeliveryRecovery(io, { dispatch });
  assert.equal(calls.includes(String(stale._id)), false, "the 4h replay window is preserved");
  assert.equal(result.stale, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.noCouriers, 1);
  const errors = s.doc.inHouseDelivery.recovery.lastRun.errors.join(" ");
  assert.ok(errors.includes(broken.orderNumber));
  assert.ok(errors.includes(stale.orderNumber));
});

test("recovery: never offers while OFF, and the retry action is refused while OFF", async t => {
  const s = mockSettings(t, false);
  s.doc.inHouseDelivery.recovery = { pending: true, requestSeq: 3 }; // leftover flag
  mockOrders(t, [makeOrder()]);
  const { calls, dispatch } = recordingDispatch();
  const { io } = fakeIo();
  const result = await runInHouseDeliveryRecovery(io, { dispatch });
  assert.equal(result.status, "skipped");
  assert.equal(calls.length, 0);
  const retry = await call(retryInHouseDeliveryRecovery, { io });
  assert.equal(retry.status, 409);
});

test("recovery: admin retry re-runs it while ON", async t => {
  mockSettings(t, true);
  mockOrders(t, [makeOrder()]);
  t.mock.method(Delivery, "find", () => q(() => []));
  const { io } = fakeIo();
  const retry = await call(retryInHouseDeliveryRecovery, { io });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.recovery.status, "completed");
  assert.equal(retry.body.data.recovery.noCouriers, 1);
});

test("recovery never assigns: it only uses the normal offer path", () => {
  const recovery = src("services/inHouseDeliveryRecoveryService.ts");
  assert.doesNotMatch(recovery, /acceptDeliveryOrder|deliveryBoy\s*=|DeliveryAssignment/);
  assert.match(recovery, /notifyDeliveryBoysOfNewOrder/);
});

test("dispatcher suppresses a duplicate offer while one is still open", async t => {
  mockSettings(t, true);
  const order = makeOrder();
  t.mock.method(Order, "findById", () => q(() => order));
  const courierLookup = t.mock.method(Delivery, "find", () => q(() => []));
  notificationStates.set(String(order._id), { orderId: String(order._id), notifiedDeliveryBoys: new Set(), rejectedDeliveryBoys: new Set(), acceptedBy: null });
  const { io } = fakeIo();
  assert.equal(await notifyDeliveryBoysOfNewOrder(io, order, { skipIfOfferOpen: true }), "alreadyOffered");
  assert.equal(courierLookup.mock.callCount(), 0);
  notificationStates.delete(String(order._id));
});

test("dispatcher re-checks eligibility: an order assigned meanwhile is not offered", async t => {
  mockSettings(t, true);
  const order = makeOrder({ deliveryBoy: oid() });
  t.mock.method(Order, "findById", () => q(() => order));
  const { io, events } = fakeIo();
  assert.equal(await notifyDeliveryBoysOfNewOrder(io, order, { skipIfOfferOpen: true }), "ineligible");
  assert.equal(events.length, 0);
});

test("dispatcher re-checks the switch before publishing anything", async t => {
  const s = mockSettings(t, true);
  const order = makeOrder();
  t.mock.method(Order, "findById", () => q(() => order));
  // A courier is found, but the admin switches OFF during the courier search.
  t.mock.method(Delivery, "find", () => q(() => { s.enabled = false; return [{ _id: oid() }]; }));
  t.mock.method(Order, "find", () => ({ distinct: async () => [] }));
  const { io, events } = fakeIo();
  assert.equal(await notifyDeliveryBoysOfNewOrder(io, order), "disabled");
  assert.equal(events.filter(e => e.event === "new-order").length, 0);
});

test("worker resumes pending recovery through the existing interval pattern", () => {
  const server = src("server.ts");
  assert.match(server, /runInHouseDeliveryRecovery\(io, \{ trigger: "worker" \}\)/);
  assert.match(server, /deliveryRecoveryInterval\.unref\(\)/);
});
