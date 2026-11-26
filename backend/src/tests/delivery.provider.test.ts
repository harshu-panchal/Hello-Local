/**
 * Phase 2 — global delivery provider selection.
 *
 * Real service/controller code with mocked Mongoose calls; no database,
 * gateway, socket server or third-party API is used. Addlogs is exercised only
 * as "listed but not configured" — there is no Addlogs client to call.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import AppSettings from "../models/AppSettings";
import SettingAuditLog from "../models/SettingAuditLog";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Customer from "../models/Customer";
import {
  activeProviderFrom,
  orderDeliveryProvider,
  providerStateFrom,
  resolveProviderForNewOrder,
  setActiveDeliveryProvider,
  ADDLOGS_INTEGRATION_AVAILABLE,
} from "../services/deliveryProviderService";
import { setInHouseDeliveryEnabled } from "../services/inHouseDeliveryService";
import {
  getDeliveryProviderSettings,
  updateDeliveryProviderSettings,
  stripInHouseDeliveryKeys,
} from "../modules/admin/controllers/adminSettingsController";
import { createOrder } from "../modules/customer/controllers/customerOrderController";

const oid = () => new mongoose.Types.ObjectId();
const src = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

function q(value: () => any) {
  const query: any = { select: () => query, lean: () => query, session: () => query, populate: () => query,
    then: (resolve: any, reject: any) => Promise.resolve().then(value).then(resolve, reject) };
  return query;
}
const getPath = (obj: any, key: string) => key.split(".").reduce((v, p) => (v == null ? undefined : v[p]), obj);
const setPath = (obj: any, key: string, value: any) => {
  const parts = key.split(".");
  let target = obj;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  target[parts[parts.length - 1]] = value;
};
function matches(doc: any, filter: any) {
  return Object.entries(filter || {}).every(([key, want]: [string, any]) => {
    const value = key === "_id" ? doc._id : getPath(doc, key);
    if (want && typeof want === "object") {
      if ("$ne" in want) return value !== want.$ne;
      if ("$nin" in want) return !want.$nin.includes(value);
    }
    return value === want;
  });
}

/** In-memory settings singleton. */
function mockSettings(t: any, doc: any) {
  const state = { doc, audits: [] as any[], writes: 0 };
  t.mock.method(AppSettings, "findOne", () => q(() => (state.doc ? structuredClone(state.doc) : null)));
  t.mock.method(AppSettings, "getSettings", async () => state.doc);
  t.mock.method(AppSettings, "updateOne", async (filter: any, update: any) => {
    if (!matches(state.doc, filter)) return { matchedCount: 0, modifiedCount: 0 };
    for (const [key, value] of Object.entries(update.$set || {})) setPath(state.doc, key, value);
    for (const [key, value] of Object.entries(update.$inc || {})) setPath(state.doc, key, (getPath(state.doc, key) || 0) + (value as number));
    state.writes++;
    return { matchedCount: 1, modifiedCount: 1 };
  });
  t.mock.method(SettingAuditLog, "create", async (docs: any[]) => { state.audits.push(...docs); return docs; });
  t.mock.method(mongoose, "startSession", async () => ({ endSession: async () => {}, withTransaction: async (work: any) => work() }));
  return state;
}

function call(handler: any, req: any): Promise<{ status: number; body: any }> {
  return new Promise(resolve => {
    let status = 200;
    const res: any = { status(code: number) { status = code; return res; }, json(body: any) { resolve({ status, body }); return res; } };
    handler({ app: { get: () => undefined }, ...req }, res, (error: any) => resolve({ status: error?.statusCode || 500, body: { error: error?.message } }));
  });
}

// --------------------------------------------------------------------------
// Configuration and readiness
// --------------------------------------------------------------------------
test("defaults: new settings select IN_HOUSE; legacy or unknown values read as IN_HOUSE", () => {
  assert.equal(new AppSettings({ contactEmail: "a@b.co", contactPhone: "1" }).deliveryProvider?.active, "IN_HOUSE");
  assert.equal(activeProviderFrom({}), "IN_HOUSE");
  assert.equal(activeProviderFrom(null), "IN_HOUSE");
  assert.equal(activeProviderFrom({ deliveryProvider: { active: "SOMETHING" } }), "IN_HOUSE");
  assert.equal(orderDeliveryProvider({}), "IN_HOUSE", "orders placed before Phase 2 are in-house");
  assert.equal(orderDeliveryProvider({ deliveryProvider: "ADDLOGS" }), "ADDLOGS");
});

test("readiness: enabled in-house is available; Addlogs is listed but not configured", () => {
  assert.equal(ADDLOGS_INTEGRATION_AVAILABLE, false);
  const state = providerStateFrom({ inHouseDelivery: { enabled: true } });
  const inHouse = state.providers.find(p => p.id === "IN_HOUSE")!;
  const addlogs = state.providers.find(p => p.id === "ADDLOGS")!;
  assert.deepEqual([inHouse.status, inHouse.operational], ["AVAILABLE", true]);
  assert.deepEqual([addlogs.status, addlogs.configured, addlogs.enabled, addlogs.operational], ["NOT_CONFIGURED", false, false, false]);
  assert.equal(state.deliveryAvailable, true);
});

test("readiness: disabled in-house is reported, and no operational provider is reported", () => {
  const off = providerStateFrom({ inHouseDelivery: { enabled: false } });
  assert.equal(off.providers.find(p => p.id === "IN_HOUSE")!.status, "DISABLED");
  assert.equal(off.activeProvider, "IN_HOUSE", "disabling in-house does not switch the active provider");
  assert.equal(off.deliveryAvailable, false);
  assert.match(off.reason || "", /not available/);
  const addlogsStored = providerStateFrom({ inHouseDelivery: { enabled: true }, deliveryProvider: { active: "ADDLOGS" } });
  assert.equal(addlogsStored.deliveryAvailable, false, "an ADDLOGS value (e.g. edited in the DB) is never operational");
});

test("readiness ignores any placeholder Addlogs configuration", () => {
  const state = providerStateFrom({ inHouseDelivery: { enabled: true }, addlogs: { apiKey: "placeholder", enabled: true } });
  assert.equal(state.providers.find(p => p.id === "ADDLOGS")!.operational, false);
});

// --------------------------------------------------------------------------
// Selection API
// --------------------------------------------------------------------------
test("API: admin reads the active provider and readiness", async t => {
  mockSettings(t, { _id: "s", inHouseDelivery: { enabled: true } });
  const result = await call(getDeliveryProviderSettings, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.data.activeProvider, "IN_HOUSE");
  assert.equal(result.body.data.providers.length, 2);
});

test("API: malformed bodies and unknown providers are rejected without writes", async t => {
  const s = mockSettings(t, { _id: "s", inHouseDelivery: { enabled: true } });
  for (const body of [{}, { provider: 1 }, { provider: "IN_HOUSE", extra: true }, [], null]) {
    assert.equal((await call(updateDeliveryProviderSettings, { body, user: { userId: String(oid()) } })).status, 400, JSON.stringify(body));
  }
  for (const provider of ["in_house", "SHIPROCKET", ""]) {
    const result = await call(updateDeliveryProviderSettings, { body: { provider }, user: { userId: String(oid()) } });
    assert.equal(result.status, 400, provider);
    assert.equal(result.body.reason, "INVALID_PROVIDER");
  }
  assert.equal(s.writes, 0);
  assert.equal(s.audits.length, 0);
});

test("API: Addlogs selection is refused until its integration exists", async t => {
  const s = mockSettings(t, { _id: "s", inHouseDelivery: { enabled: true } });
  const result = await call(updateDeliveryProviderSettings, { body: { provider: "ADDLOGS" }, user: { userId: String(oid()) } });
  assert.equal(result.status, 409);
  assert.equal(result.body.reason, "PROVIDER_NOT_CONFIGURED");
  assert.equal(s.doc.deliveryProvider, undefined, "nothing written");
  assert.equal(s.audits.length, 0);
});

test("API: selecting the current provider is an idempotent no-op", async t => {
  const s = mockSettings(t, { _id: "s", inHouseDelivery: { enabled: true } });
  const result = await call(updateDeliveryProviderSettings, { body: { provider: "IN_HOUSE" }, user: { userId: String(oid()) } });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.changed, false);
  assert.equal(s.writes, 0);
  assert.equal(s.audits.length, 0);
});

test("API: switching back to in-house is audited; a disabled provider cannot be selected", async t => {
  // A stray ADDLOGS value (e.g. a manual DB edit) can be corrected to IN_HOUSE.
  const s = mockSettings(t, { _id: "s", inHouseDelivery: { enabled: false }, deliveryProvider: { active: "ADDLOGS" } });
  const refused = await call(updateDeliveryProviderSettings, { body: { provider: "IN_HOUSE" }, user: { userId: String(oid()) } });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.reason, "PROVIDER_DISABLED");
  s.doc.inHouseDelivery.enabled = true;
  const admin = String(oid());
  const ok = await call(updateDeliveryProviderSettings, { body: { provider: "IN_HOUSE" }, user: { userId: admin } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.changed, true);
  assert.equal(s.doc.deliveryProvider.active, "IN_HOUSE");
  assert.deepEqual(
    { setting: s.audits[0].setting, previousValue: s.audits[0].previousValue, newValue: s.audits[0].newValue, changedBy: String(s.audits[0].changedBy) },
    { setting: "deliveryProvider.active", previousValue: "ADDLOGS", newValue: "IN_HOUSE", changedBy: admin },
  );
});

test("API: a concurrent change is detected (conditional write), not overwritten", async t => {
  const s = mockSettings(t, { _id: "s", inHouseDelivery: { enabled: true }, deliveryProvider: { active: "ADDLOGS" } });
  t.mock.method(AppSettings, "updateOne", async () => ({ matchedCount: 0, modifiedCount: 0 }));
  await assert.rejects(setActiveDeliveryProvider("IN_HOUSE", String(oid())), (e: any) => e.statusCode === 409 && e.reason === "CONCURRENT_UPDATE");
  assert.equal(s.audits.length, 0);
});

test("API: only Admin accounts can reach the provider endpoints", async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_harness";
  const { requireUserType } = await import("../middleware/auth");
  const routes = src("routes/adminRoutes.ts");
  const guard = routes.indexOf('router.use(requireUserType("Admin"))');
  assert.ok(guard > 0 && guard < routes.indexOf("/settings/delivery-provider"));
  for (const userType of ["Delivery", "Seller", "Customer"]) {
    let status = 0, passed = false;
    const res: any = { status(code: number) { status = code; return res; }, json() { return res; } };
    requireUserType("Admin")({ user: { userId: "u", userType } } as any, res, () => { passed = true; });
    assert.equal(passed, false);
    assert.equal(status, 403);
  }
});

test("generic settings update cannot change the provider in any form", () => {
  const update: any = { appName: "X", deliveryProvider: { active: "ADDLOGS" }, "deliveryProvider.active": "ADDLOGS",
    $set: { "deliveryProvider.active": "ADDLOGS", "inHouseDelivery.enabled": false, platformFee: 2 } };
  stripInHouseDeliveryKeys(update);
  assert.deepEqual(update, { appName: "X", $set: { platformFee: 2 } });
});

test("rule B: toggling in-house never changes the active provider", async t => {
  const s = mockSettings(t, { _id: "s", inHouseDelivery: { enabled: true }, deliveryProvider: { active: "IN_HOUSE" } });
  await setInHouseDeliveryEnabled(false, String(oid()));
  assert.equal(s.doc.deliveryProvider.active, "IN_HOUSE");
  await setInHouseDeliveryEnabled(true, String(oid()));
  assert.equal(s.doc.deliveryProvider.active, "IN_HOUSE");
  s.doc.deliveryProvider.active = "ADDLOGS";
  await setInHouseDeliveryEnabled(false, String(oid()));
  await setInHouseDeliveryEnabled(true, String(oid()));
  assert.equal(s.doc.deliveryProvider.active, "ADDLOGS", "enabling in-house does not auto-select it");
});

// --------------------------------------------------------------------------
// Checkout gate
// --------------------------------------------------------------------------
test("gate: resolves IN_HOUSE when operational; refuses otherwise; fails closed on read errors", async t => {
  const s = mockSettings(t, { _id: "s", inHouseDelivery: { enabled: true } });
  assert.equal(await resolveProviderForNewOrder(), "IN_HOUSE");
  s.doc.inHouseDelivery.enabled = false;
  await assert.rejects(resolveProviderForNewOrder(), (e: any) => e.reason === "DELIVERY_UNAVAILABLE" && e.statusCode === 503);
  s.doc.inHouseDelivery.enabled = true;
  s.doc.deliveryProvider = { active: "ADDLOGS" };
  await assert.rejects(resolveProviderForNewOrder(), (e: any) => e.reason === "DELIVERY_UNAVAILABLE");
  t.mock.method(AppSettings, "findOne", () => q(() => { throw new Error("db down"); }));
  await assert.rejects(resolveProviderForNewOrder(), (e: any) => e.statusCode === 503);
  const conflict = Object.assign(new Error("WriteConflict"), { errorLabels: ["TransientTransactionError"] });
  t.mock.method(AppSettings, "findOne", () => q(() => { throw conflict; }));
  await assert.rejects(resolveProviderForNewOrder({} as any), (e: any) => e === conflict, "transaction retries are not swallowed");
});

test("createOrder: no operational provider → 503 and nothing created, reserved or charged", async t => {
  mockSettings(t, { _id: "s", inHouseDelivery: { enabled: false } });
  t.mock.method(mongoose.models.OrderOperationLock, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(Order, "findOne", () => q(() => null));
  const customerReads = t.mock.method(Customer, "findById", () => q(() => ({ status: "Active" })));
  const itemWrites = t.mock.method(OrderItem, "create", async () => []);
  const orderSaves = t.mock.method(Order.prototype, "save", async function (this: any) { return this; });
  let status = 0, body: any;
  const res: any = { status(code: number) { status = code; return res; }, json(payload: any) { body = payload; return res; } };
  await createOrder({ user: { userId: String(oid()) }, body: { items: [{ product: { id: String(oid()) }, quantity: 1 }],
    address: { latitude: 22.7, longitude: 75.8 }, paymentMethod: "Online", idempotencyKey: "k1" }, app: { get: () => undefined } } as any, res);
  assert.equal(status, 503);
  assert.match(body.message, /Delivery is temporarily unavailable/);
  assert.equal(customerReads.mock.callCount(), 0);
  assert.equal(itemWrites.mock.callCount(), 0);
  assert.equal(orderSaves.mock.callCount(), 0);
});

test("checkout records the provider on the order; POS sales are not gated", () => {
  const create = src("modules/customer/controllers/customerOrderController.ts");
  const fn = create.slice(create.indexOf("export const createOrder"), create.indexOf("export async function cleanupExpiredPendingOrders"));
  assert.match(fn, /deliveryProvider\b/, "createOrder stores the resolved provider");
  const checkout = src("services/checkoutService.ts");
  assert.ok(checkout.indexOf("resolveProviderForNewOrder(session)") < checkout.indexOf("Customer.findById"), "gate runs before any read/reserve");
  assert.doesNotMatch(src("modules/seller/controllers/posController.ts"), /resolveProviderForNewOrder|deliveryProviderService/);
  assert.doesNotMatch(src("services/paymentService.ts"), /resolveProviderForNewOrder|deliveryProviderService/, "payment capture/refund unchanged");
});

test("routing: replay, recovery and assignment are restricted to in-house orders", () => {
  assert.match(src("socket/socketService.ts"), /\.\.\.IN_HOUSE_ORDER_FILTER/);
  assert.match(src("services/inHouseDeliveryRecoveryService.ts"), /\.\.\.IN_HOUSE_ORDER_FILTER/);
  assert.match(src("services/orderNotificationService.ts"), /orderDeliveryProvider\(current\) !== 'IN_HOUSE'/);
  assert.match(src("services/orderLifecycleService.ts"), /orderDeliveryProvider\(order\) !== "IN_HOUSE"/);
});

test("provider selection and checkout make no HTTP calls and never touch the provider API key", () => {
  // Phase 6: all Adloggs HTTP lives in services/adloggs/adloggsClient.ts.
  for (const rel of ["services/deliveryProviderService.ts", "modules/admin/controllers/adminSettingsController.ts", "services/checkoutService.ts"]) {
    const code = src(rel);
    assert.doesNotMatch(code, /axios|fetch\(|https?:\/\//, rel);
    assert.doesNotMatch(code, /apiKey|apiSecret|x-api-key|ADLOGGS_API_KEY/i, rel);
  }
});

test("UI: provider card shows readiness and only lets eligible providers be chosen", () => {
  const card = fs.readFileSync(path.join(__dirname, "..", "..", "..", "frontend", "src", "modules", "admin", "components", "DeliveryProviderCard.tsx"), "utf8");
  assert.match(card, /disabled=\{!provider\.operational/);
  assert.match(card, /NOT_CONFIGURED/);
  assert.match(card, /if \(saving\) return;/);
  const setCalls = card.match(/setState\(([^)]*)\)/g) || [];
  assert.ok(setCalls.length > 0 && setCalls.every(callText => /response\.data/.test(callText)), "UI shows only backend-confirmed state");
});
