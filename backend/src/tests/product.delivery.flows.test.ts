import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import Seller from "../models/Seller";
import Customer from "../models/Customer";
import Delivery from "../models/Delivery";
import DeliveryAssignment from "../models/DeliveryAssignment";
import Commission from "../models/Commission";
import Coupon from "../models/Coupon";
import OrderEffect from "../models/OrderEffect";
import AppSettings from "../models/AppSettings";
import Shipment from "../models/Shipment";
import ShipmentReconciliation from "../models/ShipmentReconciliation";
import { createOrderShipments, reconcileOrderShipments, reconcilePendingShipmentSyncs } from "../services/shipmentService";
import { withOrderTransaction } from "../services/orderTransactionService";
import { acceptDeliveryOrder, cancelOrderLifecycle, changeSellerStage, confirmOrderPickup, changeCourierStage, sellerStage, markSellerReadyForPickup } from "../services/orderLifecycleService";
import { verifyDeliveryOtp, generateDeliveryOtp } from "../services/deliveryOtpService";
import { effectiveUnitPrice } from "../utils/productVariation";
import { checkoutIdentity, prepareCheckout } from "../services/checkoutService";
import { computeCouponDiscount } from "../services/orderPricingService";
import { reserveMany } from "../services/stockService";
import { processOrderEffects } from "../services/orderEffectService";
import { completeDeferredCancellation, handleExternalCancellation, runDeferredCancellationSweep, getRtoResolutionPreview } from "../services/adloggs/adloggsCancellationWorkflow";
import Refund from "../models/Refund";
import { aggregateExternalOutcome, syncExternalOrderOutcome } from "../services/adloggs/adloggsOrderOutcomeService";

const oid = () => new mongoose.Types.ObjectId();
// This harness exercises real service functions without connecting to a database
// or calling a gateway. Session rollback and serialization are simulated; actual
// MongoDB transaction behavior still requires a replica-set integration run.
function harness(t: any, overrides: any = {}) {
  const sellerA = oid(), sellerB = oid(), courier = oid(), customer = oid();
  let order: any = { _id: oid(), customer, deliveryBoy: courier, status: "Accepted", paymentMethod: "COD", paymentStatus: "Pending",
    subtotal: 300, tax: 30, discount: 30, shipping: 20, platformFee: 5, tipAmount: 10, total: 305,
    createdAt: new Date(), sellerPickups: [], deliveryOtp: "1234", deliveryOtpExpiresAt: new Date(Date.now() + 60000), ...overrides };
  let items: any[] = [
    { _id: oid(), order: order._id, product: oid(), seller: sellerA, status: "Pending", fulfillmentStatus: "Accepted", total: 100, quantity: 1, taxAmount: 10, discountAmount: 10 },
    { _id: oid(), order: order._id, product: oid(), seller: sellerB, status: "Pending", fulfillmentStatus: "Accepted", total: 200, quantity: 2, taxAmount: 20, discountAmount: 20 },
  ];
  const tasks = new Map<string, any>();
  let restored = 0, couponReleases = 0, assignments = 0;
  const bind = () => {
    order.save = async () => order;
    order.populate = async () => order;
    for (const item of items) item.save = async () => item;
  };
  bind();
  // Like a Mongoose Query: chainable (.session/.select/.lean return the query) and thenable.
  // `.session()` must NOT return a promise: production code calls it for its side
  // effect and awaits the query itself, so a returned promise would be left unhandled.
  const query = (get: () => any): any => {
    const q: any = { session: () => q, select: () => q, lean: () => q, limit: () => q,
      then: (resolve: any, reject: any) => new Promise(settle => settle(get())).then(resolve, reject) };
    return q;
  };
  const patch = (obj: any, key: string, fn: any) => t.mock.method(obj, key, fn);
  let serial: Promise<any> = Promise.resolve();
  patch(mongoose, "startSession", async () => ({ endSession: async () => {}, withTransaction: (work: any) => {
    const run = serial.then(async () => {
      const snapshot = structuredClone({ items: items.map(({ save: _save, ...item }) => item), tasks: Array.from(tasks), restored, couponReleases, assignments });
      // Keep ObjectIds in the snapshot by retaining the untouched originals.
      const previousOrder = { ...order }, previousItems = items.map(item => ({ ...item }));
      try { return await work(); }
      catch (error) {
        order = previousOrder; items = previousItems; tasks.clear();
        for (const [key, value] of snapshot.tasks) tasks.set(key, value);
        restored = snapshot.restored; couponReleases = snapshot.couponReleases; assignments = snapshot.assignments; bind(); throw error;
      }
    });
    serial = run.catch(() => {}); return run;
  } }));
  patch(mongoose.models.OrderOperationLock, "updateOne", async () => ({ modifiedCount: 1 }));
  patch(Order, "findById", () => query(() => order));
  patch(OrderItem, "find", (filter: any) => query(() => items.filter(item => filter.status?.$ne ? item.status !== filter.status.$ne : true)));
  patch(OrderItem, "updateMany", async (filter: any, update: any) => {
    for (const item of items) {
      if (filter._id && !filter._id.$in.some((id: any) => String(id) === String(item._id))) continue;
      if (filter.seller && String(item.seller) !== String(filter.seller)) continue;
      if (filter.status?.$ne && item.status === filter.status.$ne) continue;
      Object.assign(item, update.$set);
    }
    return { modifiedCount: 1 };
  });
  patch(Commission, "updateMany", async () => ({ modifiedCount: 1 }));
  patch(Coupon, "updateOne", async () => { couponReleases++; return { modifiedCount: 1 }; });
  patch(Product, "findById", () => query(() => ({ variations: [] })));
  patch(Product, "updateOne", async (_filter: any, update: any) => { restored += update.$inc.stock; return { modifiedCount: 1 }; });
  // A seller that may take orders: approved AND (since the subscription feature) on an active plan.
  patch(Seller, "findById", () => query(() => ({ location: { coordinates: [75.85, 22.72] }, status: "Approved",
    subscription: { status: "active", endDate: new Date(Date.now() + 86400000) } })));
  patch(Delivery, "findById", () => query(() => ({ status: "Active" })));
  patch(DeliveryAssignment, "updateOne", async () => ({ modifiedCount: 1 }));
  patch(DeliveryAssignment, "findOneAndUpdate", async () => { assignments++; return {}; });
  // In-house delivery switch: "enabled" | "disabled" | "missing" (legacy doc) | "error" (unreadable).
  let inHouse: "enabled" | "disabled" | "missing" | "error" = "enabled";
  let storedProvider: string | undefined; // global deliveryProvider.active as stored (undefined = legacy doc)
  const settingsQuery = () => {
    const q: any = { select: () => q, lean: () => q, session: () => q,
      then: (resolve: any, reject: any) => (inHouse === "error" ? Promise.reject(new Error("db down"))
        : Promise.resolve({ _id: "s", ...(inHouse === "missing" ? {} : { inHouseDelivery: { enabled: inHouse === "enabled" } }),
          ...(storedProvider ? { deliveryProvider: { active: storedProvider } } : {}) })).then(resolve, reject) };
    return q;
  };
  patch(AppSettings, "findOne", () => settingsQuery());
  patch(AppSettings, "getSettings", async () => ({ _id: "s" }));
  // Assignment gate: conditional $inc on the settings singleton (see claimInHouseAssignment).
  let gateWrites = 0;
  patch(AppSettings, "updateOne", async (filter: any, update: any) => {
    if (inHouse === "error") throw new Error("db down");
    const matches = inHouse !== "disabled";
    if (matches && update.$inc?.["inHouseDelivery.assignmentSeq"]) gateWrites++;
    return { matchedCount: matches ? 1 : 0, modifiedCount: matches ? 1 : 0 };
  });
  // In-memory shipments keyed by seller (unique order+seller, like the real index).
  const shipments = new Map<string, any>();
  let shipmentBulkFailure: Error | null = null;
  patch(Shipment, "bulkWrite", async (ops: any[]) => {
    if (shipmentBulkFailure) throw shipmentBulkFailure;
    for (const op of ops) {
      const key = String(op.updateOne.filter.seller);
      if (!shipments.has(key)) shipments.set(key, { _id: oid(), ...structuredClone(op.updateOne.update.$setOnInsert), seller: op.updateOne.filter.seller, order: op.updateOne.filter.order ?? op.updateOne.update.$setOnInsert.order });
    }
    return {};
  });
  patch(Shipment, "find", (filter: any = {}) => query(() => [...shipments.values()]
    .filter(s => !filter.seller || String(s.seller) === String(filter.seller))
    .filter(s => !filter.status?.$in || filter.status.$in.includes(s.status))
    .filter(s => !filter["bookingIntent.state"]?.$in || filter["bookingIntent.state"].$in.includes(s.bookingIntent?.state))
    .map(s => ({ ...s }))));
  // Reconciliation placeholders keyed by shipment (unique, like the real index).
  const reconciliations = new Map<string, any>();
  patch(ShipmentReconciliation, "updateOne", async (filter: any, update: any) => {
    const key = String(filter.shipment);
    if (!reconciliations.has(key)) reconciliations.set(key, { ...update.$setOnInsert });
    return { upsertedCount: reconciliations.size };
  });
  patch(Shipment, "findOne", (filter: any) => query(() => {
    const found = shipments.get(String(filter.seller));
    return found ? { ...found } : null; // the harness holds a single order
  }));
  const setDotted = (target: any, key: string, value: any) => {
    const parts = key.split(".");
    let node = target;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    node[parts[parts.length - 1]] = value;
  };
  patch(Shipment, "updateOne", async (filter: any, update: any) => {
    const shipment = [...shipments.values()].find(s => String(s._id) === String(filter._id));
    if (!shipment) return { modifiedCount: 0 };
    if ("status" in filter && shipment.status !== filter.status) return { modifiedCount: 0 };
    if ("readyForPickupAt" in filter && filter.readyForPickupAt === null && shipment.readyForPickupAt) return { modifiedCount: 0 };
    for (const [key, value] of Object.entries(update.$set || {})) setDotted(shipment, key, value);
    for (const key of Object.keys(update.$unset || {})) { // dotted paths unset nested fields, as in MongoDB
      const parts = key.split(".");
      const parent = parts.slice(0, -1).reduce((node: any, part: string) => node?.[part], shipment);
      if (parent) delete parent[parts[parts.length - 1]];
    }
    for (const [key, value] of Object.entries(update.$push || {})) { // like MongoDB: append to (dotted) arrays
      if (key === "history") { shipment.history.push(value); continue; }
      const parts = key.split(".");
      const parent = parts.slice(0, -1).reduce((node: any, part: string) => (node[part] ??= {}), shipment);
      const list = parent[parts[parts.length - 1]] ??= [];
      list.push(...((value as any)?.$each ?? [value]));
    }
    return { modifiedCount: 1 };
  });
  patch(OrderEffect, "updateOne", async (filter: any, update: any) => {
    if (update.$setOnInsert && !tasks.has(filter._id)) tasks.set(filter._id, { _id: filter._id, ...update.$setOnInsert });
    if (update.$set && tasks.has(filter._id)) Object.assign(tasks.get(filter._id), update.$set);
    return { modifiedCount: 1 };
  });
  return { get order() { return order; }, get items() { return items; }, get restored() { return restored; }, get couponReleases() { return couponReleases; }, get assignments() { return assignments; }, tasks,
    sellerA: String(sellerA), sellerB: String(sellerB), courier: String(courier), customer: String(customer), get id() { return String(order._id); }, query,
    setInHouse(value: "enabled" | "disabled" | "missing" | "error") { inHouse = value; }, get gateWrites() { return gateWrites; },
    setStoredProvider(value: string | undefined) { storedProvider = value; },
    shipments, reconciliations, failShipmentWrites(error: Error | null) { shipmentBulkFailure = error; },
    /** Give this order Phase 3A shipments, as checkout does. */
    async seedShipments() { order.shipmentsCreated = true; await createOrderShipments(order, items); },
    shipmentOf(seller: string) { return shipments.get(String(seller)); } };
}

test("selected variant never inherits another variant's discount", () => {
  assert.equal(effectiveUnitPrice({ price: 100, discPrice: 80 }, { price: 500, discPrice: 0 }), 500);
  assert.equal(effectiveUnitPrice({ price: 100, discPrice: 80 }, { price: 500, discPrice: 450 }), 450);
});

test("product rejects negative variant price, discount and fractional stock", () => {
  const product = new Product({ productName: "Item", seller: oid(), variations: [{ name: "Size", value: "Large", price: -1, discPrice: -2, stock: 1.5 }] });
  const errors = product.validateSync()?.errors;
  assert.ok(errors?.["variations.0.price"]);
  assert.ok(errors?.["variations.0.discPrice"]);
  assert.ok(errors?.["variations.0.stock"]);
});

test("checkout fingerprint binds quantity, variant, address and payment choice", () => {
  const body = { items: [{ product: { id: "a" }, quantity: 1, variant: "small" }], address: { city: "Indore" }, paymentMethod: "COD" };
  assert.equal(checkoutIdentity(body), checkoutIdentity({ ...body, idempotencyKey: "ignored" }));
  assert.notEqual(checkoutIdentity(body), checkoutIdentity({ ...body, paymentMethod: "Online" }));
  assert.notEqual(checkoutIdentity(body), checkoutIdentity({ ...body, items: [{ ...body.items[0], quantity: 2 }] }));
});

test("two sellers prepare independently and the order follows the least advanced active seller", async t => {
  const h = harness(t);
  await changeSellerStage(h.id, h.sellerA, "Processed");
  assert.equal(h.order.status, "Accepted");
  assert.equal(sellerStage(h.items.filter(item => String(item.seller) === h.sellerA), h.order), "Processed");
  await changeSellerStage(h.id, h.sellerB, "Processed");
  assert.equal(h.order.status, "Processed");
});

test("repeated partial COD cancellation restores stock once and reduces cash due", async t => {
  const h = harness(t, { couponCode: "SAVE" });
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA });
  assert.equal(h.restored, 1);
  assert.equal(h.order.total, 215);
  assert.equal(h.order.originalTotal, 305);
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA });
  assert.equal(h.restored, 1);
  assert.equal(h.couponReleases, 0);
  assert.equal(h.items[1].status, "Pending");
});

test("last seller cancellation closes order and queues one refund of remaining prepaid balance", async t => {
  const h = harness(t, { paymentMethod: "Online", paymentStatus: "Paid", couponCode: "SAVE" });
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA });
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerB });
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerB });
  assert.equal(h.order.status, "Cancelled");
  assert.equal(h.restored, 3);
  assert.equal(h.couponReleases, 1);
  const refunds = [...h.tasks.values()].filter(task => task.kind === "Refund");
  assert.equal(refunds.length, 2);
  assert.equal(refunds[0].amount, 90);
  assert.equal(refunds[1].amount, undefined);
});

test("a sole seller cancellation also queues a full prepaid refund", async t => {
  const h = harness(t, { paymentMethod: "Online", paymentStatus: "Paid" });
  h.items[1].seller = h.items[0].seller;
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA });
  assert.equal(h.order.status, "Cancelled");
  assert.equal([...h.tasks.values()].filter(task => task.kind === "Refund").length, 1);
});

test("courier acceptance rejects closed and unpaid orders without assignment", async t => {
  const h = harness(t, { status: "Cancelled", deliveryBoy: undefined });
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier), /no longer available/);
  h.order.status = "Accepted"; h.order.paymentMethod = "Online";
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier), /no longer available/);
  assert.equal(h.assignments, 0);
});

test("competing courier claims produce one assignment and preserve preparation stage", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  const results = await Promise.allSettled([acceptDeliveryOrder(h.id, h.courier), acceptDeliveryOrder(h.id, String(oid()))]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(h.assignments, 1);
  assert.equal(h.order.status, "Accepted");
});

test("pickup requires active seller membership, preparation, courier ownership and proximity", async t => {
  const h = harness(t);
  await assert.rejects(confirmOrderPickup(h.id, h.courier, String(oid()), 22.72, 75.85), /no active items/);
  await assert.rejects(confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85), /prepare/);
  h.items[0].fulfillmentStatus = "Processed";
  await assert.rejects(confirmOrderPickup(h.id, String(oid()), h.sellerA, 22.72, 75.85), /not assigned/);
  await assert.rejects(confirmOrderPickup(h.id, h.courier, h.sellerA, 20, 70), /500 metres/);
  assert.equal(h.order.sellerPickups.length, 0);
});

test("partial pickup retains progress and only the final seller pickup dispatches the order", async t => {
  const h = harness(t, { status: "Processed" });
  for (const item of h.items) item.fulfillmentStatus = "Processed";
  const first = await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  assert.equal(first.allPickedUp, false);
  assert.equal(h.order.sellerPickups.length, 1);
  const second = await confirmOrderPickup(h.id, h.courier, h.sellerB, 22.72, 75.85);
  assert.equal(second.allPickedUp, true);
  assert.equal(h.order.status, "Out for Delivery");
});

test("generic courier stage update cannot bypass seller pickup or delivery OTP", async t => {
  const h = harness(t, { status: "Shipped" });
  await assert.rejects(changeCourierStage(h.id, h.courier, "Out for Delivery"), /every active seller/);
  await assert.rejects(changeCourierStage(h.id, h.courier, "Delivered"), /OTP/);
});

test("correct OTP cannot revive cancelled, unpicked or unpaid orders", async t => {
  const h = harness(t, { status: "Cancelled" });
  await assert.rejects(verifyDeliveryOtp(h.id, "1234", h.courier), /Out for Delivery/);
  h.order.status = "Processed";
  await assert.rejects(verifyDeliveryOtp(h.id, "1234", h.courier), /Out for Delivery/);
  h.order.status = "Out for Delivery"; h.order.paymentMethod = "Online";
  await assert.rejects(verifyDeliveryOtp(h.id, "1234", h.courier), /paid or COD/);
  assert.equal(h.tasks.size, 0);
});

test("incorrect OTP attempts commit, lock at five, and customer refresh unlocks with a new code", async t => {
  const h = harness(t, { status: "Out for Delivery" });
  for (let i = 0; i < 5; i++) await assert.rejects(verifyDeliveryOtp(h.id, "0000", h.courier), /Invalid OTP/);
  assert.equal(h.order.deliveryOtpAttempts, 5);
  await assert.rejects(verifyDeliveryOtp(h.id, "1234", h.courier), /Too many/);
  await assert.rejects(generateDeliveryOtp(h.id, { courierId: h.courier }), /refresh/);
  const crypto = (await import("crypto")).default;
  t.mock.method(crypto, "randomInt", (() => 5678) as any);
  let notificationLookupDone!: () => void;
  const notificationLookup = new Promise<void>(resolve => { notificationLookupDone = resolve; });
  t.mock.method(Customer, "findById", () => ({ exec: async () => { notificationLookupDone(); return { fcmTokens: [], fcmTokenMobile: [] }; } }) as any);
  await generateDeliveryOtp(h.id, { refresh: true });
  await notificationLookup;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.order.deliveryOtp, "5678");
  assert.equal(h.order.deliveryOtpAttempts, 0);
});

test("delivery completion atomically marks COD paid and queues settlement once", async t => {
  const h = harness(t, { status: "Out for Delivery" });
  await verifyDeliveryOtp(h.id, "1234", h.courier);
  await verifyDeliveryOtp(h.id, "1234", h.courier);
  assert.equal(h.order.status, "Delivered");
  assert.equal(h.order.paymentStatus, "Paid");
  assert.equal(h.order.settlementStatus, "Pending");
  assert.equal(h.tasks.size, 1);
  assert.equal([...h.tasks.values()][0].kind, "Settlement");
});

test("transaction failure rolls back cancellation stock, item state and refund tasks", async t => {
  const h = harness(t);
  t.mock.method(OrderItem, "updateMany", async () => { throw new Error("Simulated write failure"); });
  await assert.rejects(cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA }), /write failure/);
  assert.equal(h.restored, 0);
  assert.equal(h.items[0].status, "Pending");
  assert.equal(h.tasks.size, 0);
});

test("restricted coupons discount only eligible merchandise and enforce per-user limits", async t => {
  const h = harness(t);
  const coupon = { code: "ONLY", isActive: true, startDate: new Date(Date.now() - 60000), endDate: new Date(Date.now() + 60000), applicableTo: "Seller", applicableIds: [h.sellerA], discountType: "Percentage", discountValue: 50 };
  t.mock.method(Coupon, "findOne", () => h.query(() => coupon) as any);
  const input = { code: "ONLY", customerId: h.customer, eligibleAmount: 1000, lines: [{ productId: "p1", sellerId: h.sellerA, lineTotal: 100 }, { productId: "p2", sellerId: h.sellerB, lineTotal: 800 }] };
  assert.equal((await computeCouponDiscount(input)).discount, 50);
  (coupon as any).usageLimitPerUser = 1;
  t.mock.method(Order, "countDocuments", () => h.query(() => 1) as any);
  assert.equal((await computeCouponDiscount(input)).discount, 0);
});

test("checkout rejects unavailable variants and unapproved sellers before any writes", async t => {
  const h = harness(t);
  const product = { _id: oid(), seller: oid(), productName: "Item", status: "Active", publish: true, price: 500, variations: [{ value: "large", price: 500, stock: 10, status: "Sold out" }] };
  t.mock.method(Customer, "findById", () => h.query(() => ({ status: "Active" })) as any);
  t.mock.method(Product, "findById", () => h.query(() => product) as any);
  const body = { items: [{ product: { id: String(product._id) }, quantity: 1, variant: "large" }], address: { latitude: 22.72, longitude: 75.85 }, paymentMethod: "COD" };
  await assert.rejects(prepareCheckout(h.customer, body), /sold out/);
  product.variations[0].status = "Available";
  t.mock.method(Seller, "findById", () => h.query(() => ({ status: "Pending" })) as any);
  await assert.rejects(prepareCheckout(h.customer, body), /not currently accepting/);
  assert.equal(h.restored, 0);
});

test("sold-out flag is enforced by stock reservation even with positive stock", async t => {
  const h = harness(t);
  t.mock.method(Product, "findById", () => h.query(() => ({ status: "Active", publish: true, productName: "Item", variations: [{ value: "large", stock: 10, status: "Sold out" }] })) as any);
  await assert.rejects(reserveMany([{ productId: String(oid()), quantity: 1, variation: "large" }]), /sold out/);
});

test("failed settlement remains durable and schedules a retry instead of reporting complete", async t => {
  const h = harness(t, { status: "Delivered", settlementStatus: "Pending" });
  const task = { _id: `${h.id}:settlement`, order: h.order._id, kind: "Settlement", status: "Pending", nextAttemptAt: new Date() };
  h.tasks.set(task._id, task);
  t.mock.method(OrderEffect, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [task] }) }) }) as any);
  t.mock.method(OrderEffect, "findOneAndUpdate", async () => task as any);
  t.mock.method(mongoose.models.OrderFinanceLease, "findOneAndUpdate", async (_filter: any, update: any) => ({ token: update.$set.token }));
  t.mock.method(mongoose.models.OrderFinanceLease, "updateOne", async () => ({}));
  t.mock.method(Order, "updateOne", async (_filter: any, update: any) => { Object.assign(h.order, update.$set); return {} as any; });
  process.env.JWT_SECRET = "order_flow_test_secret_at_least_32_characters";
  t.mock.method(Order, "findById", () => ({ ...h.query(() => h.order), populate: async () => { throw new Error("Order read temporarily unavailable"); } }) as any);
  await processOrderEffects(h.id);
  assert.equal(task.status, "Failed");
  assert.ok(task.nextAttemptAt > new Date());
  assert.equal(h.order.settlementStatus, "Failed");
});

test("checkout retry returns the existing order without reserving stock or writing items", async t => {
  const h = harness(t);
  process.env.JWT_SECRET = "order_flow_test_secret_at_least_32_characters";
  const controller = require("../modules/customer/controllers/customerOrderController");
  const body = { idempotencyKey: "checkout-123", items: [{ product: { id: String(h.items[0].product) }, quantity: 1 }], address: { latitude: 22.72, longitude: 75.85 }, paymentMethod: "COD" };
  h.order.checkoutHash = checkoutIdentity(body);
  t.mock.method(Order, "findOne", () => h.query(() => h.order) as any);
  t.mock.method(Product, "findOneAndUpdate", async () => { throw new Error("Stock must not be reserved on replay"); });
  t.mock.method(OrderItem, "create", (() => { throw new Error("Items must not be duplicated"); }) as any);
  let result: any, status = 0;
  const res: any = { status(code: number) { status = code; return this; }, json(data: any) { result = data; return this; } };
  await controller.createOrder({ body, user: { userId: h.customer } }, res);
  assert.equal(status, 200);
  assert.equal(String(result.data._id), h.id);
  body.items[0].quantity = 2;
  await controller.createOrder({ body, user: { userId: h.customer } }, res);
  assert.equal(status, 409);
});

test("a changed checkout total is rejected before stock reservation", async t => {
  const h = harness(t);
  process.env.JWT_SECRET = "order_flow_test_secret_at_least_32_characters";
  const controller = require("../modules/customer/controllers/customerOrderController");
  const AppSettings = require("../models/AppSettings").default;
  t.mock.method(Order, "findOne", () => h.query(() => null) as any);
  const productId = oid();
  t.mock.method(Customer, "findById", () => h.query(() => ({ status: "Active" })) as any);
  t.mock.method(Product, "findById", () => h.query(() => ({ _id: productId, productName: "Item", seller: oid(), price: 500, variations: [], status: "Active", publish: true })) as any);
  t.mock.method(Seller, "find", () => h.query(() => []) as any);
  t.mock.method(AppSettings, "getSettings", async () => ({ platformFee: 0, deliveryCharges: 0, deliveryConfig: { isDistanceBased: false }, taxSettings: { defaultRate: 0 } }));
  t.mock.method(Product, "findOneAndUpdate", async () => { throw new Error("Stock must not change before quote consent"); });
  let result: any, status = 0;
  const res: any = { status(code: number) { status = code; return this; }, json(data: any) { result = data; return this; } };
  await controller.createOrder({ body: { items: [{ product: { id: String(productId) }, quantity: 1 }], address: { latitude: 22.72, longitude: 75.85 }, expectedTotal: 400 }, user: { userId: h.customer } }, res);
  assert.equal(status, 409);
  assert.match(result.message, /total changed/);
});

test("refund retry recovers a gateway success after the local payment save failed", async t => {
  harness(t);
  process.env.JWT_SECRET = "order_flow_test_secret_at_least_32_characters";
  const Payment = require("../models/Payment").default;
  const { processRefund } = require("../services/paymentService");
  let calls = 0, failSave = true;
  const gatewayRefunds: any[] = [];
  const payment: any = { amount: 100, status: "Completed", razorpayPaymentId: "pay_test", save: async function() {
    if (failSave) { failSave = false; throw new Error("Database unavailable after gateway success"); }
  } };
  t.mock.method(Payment, "findById", async () => payment);
  const gatewayClient = { payments: {
    fetchMultipleRefund: async () => ({ items: gatewayRefunds }),
    refund: async (_id: string, input: any) => {
      calls++;
      const refund = { id: "rfnd_test", amount: input.amount, notes: input.notes, status: "processed" };
      gatewayRefunds.push(refund); return refund;
    },
  } };
  const first = await processRefund("payment", 60, "Cancellation", { idempotencyKey: "order:seller:a", gatewayClient });
  assert.equal(first.success, false);
  // Simulate persisted state reloaded after the failed acknowledgement.
  payment.totalRefunded = 0; payment.refundAmount = 0; payment.status = "Completed";
  const retry = await processRefund("payment", 60, "Cancellation", { idempotencyKey: "order:seller:a", gatewayClient });
  assert.equal(retry.success, true);
  assert.equal(calls, 1);
  assert.equal(payment.totalRefunded, 60);
  assert.equal(payment.status, "PartiallyRefunded");
});

test("an acknowledged partial gateway refund is not counted twice on retry", async t => {
  harness(t);
  process.env.JWT_SECRET = "order_flow_test_secret_at_least_32_characters";
  const Payment = require("../models/Payment").default;
  const { processRefund } = require("../services/paymentService");
  const payment: any = { amount: 100, totalRefunded: 60, status: "PartiallyRefunded", razorpayPaymentId: "pay_test", save: async () => {} };
  t.mock.method(Payment, "findById", async () => payment);
  const gatewayClient = { payments: {
    fetchMultipleRefund: async () => ({ items: [{ id: "rfnd_existing", amount: 6000, notes: { idempotencyKey: "order:seller:a" }, status: "processed" }] }),
    refund: async () => { throw new Error("Duplicate gateway call"); },
  } };
  const result = await processRefund("payment", 60, "Cancellation", { idempotencyKey: "order:seller:a", gatewayClient });
  assert.equal(result.success, true);
  assert.equal(payment.totalRefunded, 60);
});

test("admin preparation updates item stages so a manual status change still permits pickup", async t => {
  const h = harness(t);
  process.env.JWT_SECRET = "order_flow_test_secret_at_least_32_characters";
  const controller = require("../modules/admin/controllers/adminOrderController");
  t.mock.method(OrderEffect, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) as any);
  await new Promise<void>((resolve, reject) => {
    const res: any = { status() { return this; }, json(data: any) { assert.equal(data.success, true); resolve(); return this; } };
    controller.updateOrderStatus({ params: { id: h.id }, body: { status: "Processed" }, user: { userId: String(oid()) }, app: { get: () => undefined } }, res, reject);
  });
  assert.equal(h.order.status, "Processed");
  assert.equal(h.items[0].fulfillmentStatus, "Processed");
  assert.equal(h.items[1].fulfillmentStatus, "Processed");
  const result = await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  assert.equal(result.pickedUpSellers, 1);
});

test("admin can assign a confirmed received order and reassign before pickup", async t => {
  const h = harness(t, { status: "Received", deliveryBoy: undefined });
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier), /no longer available/);
  await acceptDeliveryOrder(h.id, h.courier, { allowReassignment: true, assignedBy: String(oid()) });
  const replacement = String(oid());
  await acceptDeliveryOrder(h.id, replacement, { allowReassignment: true });
  assert.equal(String(h.order.deliveryBoy), replacement);
  assert.equal(h.assignments, 2);
});

test("cancelling the final unpicked seller dispatches the remaining confirmed pickup", async t => {
  const h = harness(t, { status: "Processed" });
  h.items.forEach(item => { item.fulfillmentStatus = "Processed"; });
  await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerB });
  assert.equal(h.order.status, "Out for Delivery");
  assert.equal(h.order.total, 125);
});

test("customer cannot self-cancel once any seller pickup has occurred", async t => {
  const h = harness(t, { status: "Processed" });
  h.items.forEach(item => { item.fulfillmentStatus = "Processed"; });
  await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  await assert.rejects(cancelOrderLifecycle(h.id, "customer", { userId: h.customer }), /already been dispatched/);
  assert.equal(h.restored, 0);
});

// ===========================================================================
// Phase 1 — admin in-house delivery switch (drain mode)
// ===========================================================================
test("in-house ON: couriers accept and admins assign/reassign as before", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  await acceptDeliveryOrder(h.id, h.courier);
  assert.equal(String(h.order.deliveryBoy), h.courier);
  const replacement = String(oid());
  await acceptDeliveryOrder(h.id, replacement, { allowReassignment: true, assignedBy: String(oid()) });
  assert.equal(String(h.order.deliveryBoy), replacement);
  assert.equal(h.assignments, 2);
});

test("legacy settings without the switch behave as enabled", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  h.setInHouse("missing");
  await acceptDeliveryOrder(h.id, h.courier);
  assert.equal(h.assignments, 1);
});

test("in-house OFF: courier acceptance creates no assignment", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  h.setInHouse("disabled");
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier), (error: any) => error.reason === "IN_HOUSE_DELIVERY_DISABLED" && error.statusCode === 409);
  assert.equal(h.order.deliveryBoy, undefined);
  assert.equal(h.assignments, 0);
});

test("in-house OFF: admin manual assignment and reassignment are refused", async t => {
  const h = harness(t, { status: "Received", deliveryBoy: undefined });
  h.setInHouse("disabled");
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier, { allowReassignment: true, assignedBy: String(oid()) }), /New delivery assignments are temporarily disabled/);
  const assigned = harness(t);
  assigned.setInHouse("disabled");
  await assert.rejects(acceptDeliveryOrder(assigned.id, String(oid()), { allowReassignment: true }), /temporarily disabled/);
  assert.equal(String(assigned.order.deliveryBoy), assigned.courier, "existing assignment is left untouched");
  assert.equal(h.assignments + assigned.assignments, 0);
});

test("in-house OFF: re-accepting an order already assigned to the same courier is a harmless no-op", async t => {
  const h = harness(t);
  h.setInHouse("disabled");
  const order = await acceptDeliveryOrder(h.id, h.courier);
  assert.equal(String(order.deliveryBoy), h.courier);
  assert.equal(h.assignments, 0);
});

test("unreadable switch fails closed: no new assignment", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  h.setInHouse("error");
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier), (error: any) => error.reason === "IN_HOUSE_DELIVERY_STATE_UNAVAILABLE" && error.statusCode === 503);
  assert.equal(h.assignments, 0);
});

test("an offer issued while ON but accepted after the switch goes OFF is refused", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  // Offer generated while enabled; admin disables before the courier taps accept.
  h.setInHouse("disabled");
  const results = await Promise.allSettled([acceptDeliveryOrder(h.id, h.courier), acceptDeliveryOrder(h.id, String(oid()))]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 0);
  assert.equal(h.assignments, 0);
});

test("drain mode: an accepted multi-seller COD delivery completes after the switch goes OFF", async t => {
  const h = harness(t, { status: "Processed" });
  h.items.forEach(item => { item.fulfillmentStatus = "Processed"; });
  await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  h.setInHouse("disabled");
  const second = await confirmOrderPickup(h.id, h.courier, h.sellerB, 22.72, 75.85);
  assert.equal(second.allPickedUp, true);
  assert.equal(h.order.status, "Out for Delivery");
  await generateDeliveryOtp(h.id, { courierId: h.courier });
  await verifyDeliveryOtp(h.id, h.order.deliveryOtp, h.courier);
  assert.equal(h.order.status, "Delivered");
  assert.equal(h.order.paymentStatus, "Paid");
  assert.ok(h.tasks.has(`${h.id}:settlement`), "COD settlement is queued as usual");
});

test("drain mode: switching OFF never cancels or unassigns an active delivery", async t => {
  const h = harness(t, { status: "Out for Delivery", sellerPickups: [] });
  h.setInHouse("disabled");
  assert.equal(String(h.order.deliveryBoy), h.courier);
  assert.equal(h.order.status, "Out for Delivery");
  // Cancellation of an active order still works through the normal path.
  const k = harness(t, { status: "Accepted" });
  k.setInHouse("disabled");
  await cancelOrderLifecycle(k.id, "admin", { reason: "Support" });
  assert.equal(k.order.status, "Cancelled");
});

// ===========================================================================
// Phase 1.1 — strict OFF
// ===========================================================================
test("strict OFF: courier vanishes before pickup → no reassignment until re-enabled", async t => {
  const h = harness(t, { status: "Processed" });
  h.setInHouse("disabled");
  const replacement = String(oid());
  await assert.rejects(acceptDeliveryOrder(h.id, replacement, { allowReassignment: true, assignedBy: String(oid()) }),
    (error: any) => error.reason === "IN_HOUSE_DELIVERY_DISABLED");
  assert.equal(String(h.order.deliveryBoy), h.courier, "original assignment untouched");
  assert.equal(h.gateWrites, 0);
  h.setInHouse("enabled");
  await acceptDeliveryOrder(h.id, replacement, { allowReassignment: true, assignedBy: String(oid()) });
  assert.equal(String(h.order.deliveryBoy), replacement, "normal reassignment works again once ON");
  assert.equal(h.gateWrites, 1);
});

test("strict OFF: the existing cancellation workflow stays available for a stuck order", async t => {
  const h = harness(t, { status: "Processed" });
  h.setInHouse("disabled");
  await cancelOrderLifecycle(h.id, "admin", { reason: "Courier unavailable" });
  assert.equal(h.order.status, "Cancelled");
});

test("strict OFF: simultaneous courier accept and admin assignment create nothing", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  h.setInHouse("disabled");
  const results = await Promise.allSettled([
    acceptDeliveryOrder(h.id, String(oid())),
    acceptDeliveryOrder(h.id, String(oid()), { allowReassignment: true, assignedBy: String(oid()) }),
  ]);
  assert.ok(results.every(result => result.status === "rejected"));
  assert.equal(h.assignments, 0);
  assert.equal(h.gateWrites, 0);
});

test("ON: competing claims still produce exactly one assignment through the gate", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  const results = await Promise.allSettled([acceptDeliveryOrder(h.id, h.courier), acceptDeliveryOrder(h.id, String(oid()))]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(h.assignments, 1);
  assert.equal(h.gateWrites, 1, "only the winning claim wrote the gate");
});

// ===========================================================================
// Phase 2 — provider-aware checkout and order routing
// ===========================================================================
function checkoutFixtures(t: any, h: any) {
  const sellerId = oid();
  const product = { _id: oid(), seller: sellerId, productName: "Item", status: "Active", publish: true, price: 100, variations: [] };
  const reads = { customer: 0, product: 0 };
  t.mock.method(Customer, "findById", () => { reads.customer++; return h.query(() => ({ _id: h.customer, status: "Active" })); });
  t.mock.method(Product, "findById", () => { reads.product++; return h.query(() => product); });
  t.mock.method(Seller, "findById", () => h.query(() => ({ _id: sellerId, status: "Approved", storeName: "Store", serviceRadiusKm: 10,
    location: { coordinates: [75.85, 22.72] }, subscription: { status: "active", endDate: new Date(Date.now() + 86400000) } })));
  t.mock.method(Seller, "find", () => ({ select: async () => [] }));
  const body = { items: [{ product: { id: String(product._id) }, quantity: 1 }], address: { latitude: 22.72, longitude: 75.85 }, paymentMethod: "COD" };
  return { body, reads };
}

test("checkout with in-house selected and enabled commits the order to IN_HOUSE", async t => {
  const h = harness(t);
  const { body } = checkoutFixtures(t, h);
  const quote = await prepareCheckout(h.customer, body);
  assert.equal(quote.deliveryProvider, "IN_HOUSE");
  assert.ok(quote.pricing.total > 0, "pricing is unchanged by the gate");
});

test("legacy settings without a provider field still check out as IN_HOUSE", async t => {
  const h = harness(t);
  h.setInHouse("missing");
  const { body } = checkoutFixtures(t, h);
  assert.equal((await prepareCheckout(h.customer, body)).deliveryProvider, "IN_HOUSE");
});

test("no operational provider (in-house OFF) blocks checkout before any read or write", async t => {
  const h = harness(t);
  h.setInHouse("disabled");
  const { body, reads } = checkoutFixtures(t, h);
  await assert.rejects(prepareCheckout(h.customer, body), (error: any) => error.reason === "DELIVERY_UNAVAILABLE" && error.statusCode === 503);
  assert.deepEqual(reads, { customer: 0, product: 0 }, "nothing was read, so nothing can be reserved or created");
  assert.equal(h.restored, 0);
});

test("a stored ADDLOGS selection (not integrated) blocks checkout instead of routing to it", async t => {
  const h = harness(t);
  h.setStoredProvider("ADDLOGS");
  const { body } = checkoutFixtures(t, h);
  await assert.rejects(prepareCheckout(h.customer, body), (error: any) => error.reason === "DELIVERY_UNAVAILABLE");
});

test("unreadable provider settings fail closed at checkout", async t => {
  const h = harness(t);
  h.setInHouse("error");
  const { body } = checkoutFixtures(t, h);
  await assert.rejects(prepareCheckout(h.customer, body), (error: any) => error.statusCode === 503);
});

test("legacy orders without a provider are in-house: couriers can still be assigned", async t => {
  const h = harness(t, { deliveryBoy: undefined });
  assert.equal(h.order.deliveryProvider, undefined);
  await acceptDeliveryOrder(h.id, h.courier);
  assert.equal(String(h.order.deliveryBoy), h.courier);
  assert.equal(h.order.deliveryProvider, undefined, "the order's provider field is never rewritten");
});

test("an order committed to another provider never gets an in-house courier", async t => {
  const h = harness(t, { deliveryBoy: undefined, deliveryProvider: "ADDLOGS" });
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier), /another delivery provider/);
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier, { allowReassignment: true, assignedBy: String(oid()) }), /another delivery provider/);
  assert.equal(h.order.deliveryBoy, undefined);
  assert.equal(h.assignments, 0);
  assert.equal(h.gateWrites, 0);
});

test("changing the global provider does not reroute an assigned in-house order", async t => {
  const h = harness(t, { status: "Processed", deliveryProvider: "IN_HOUSE" });
  h.items.forEach(item => { item.fulfillmentStatus = "Processed"; });
  h.setStoredProvider("ADDLOGS"); // e.g. a future switch; this order stays in-house
  await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  await confirmOrderPickup(h.id, h.courier, h.sellerB, 22.72, 75.85);
  await verifyDeliveryOtp(h.id, h.order.deliveryOtp, h.courier);
  assert.equal(h.order.status, "Delivered");
  assert.equal(h.order.deliveryProvider, "IN_HOUSE");
  assert.ok(h.tasks.has(`${h.id}:settlement`), "COD settlement still queued");
});

// ===========================================================================
// Phase 3A — internal seller shipments on the real lifecycle
// ===========================================================================
const statusOf = (h: any, seller: string) => h.shipmentOf(seller)?.status;

test("shipments: one per seller, committed provider copied, creation is idempotent", async t => {
  const h = harness(t, { orderNumber: "ORD1001", deliveryProvider: "IN_HOUSE" });
  await h.seedShipments();
  assert.equal(h.shipments.size, 2);
  assert.deepEqual([statusOf(h, h.sellerA), statusOf(h, h.sellerB)], ["CREATED", "CREATED"]);
  assert.equal(h.shipmentOf(h.sellerA).deliveryProvider, "IN_HOUSE");
  assert.deepEqual([...h.shipments.values()].map((s: any) => s.shipmentNumber).sort(), ["ORD1001-S1", "ORD1001-S2"]);
  await createOrderShipments(h.order, h.items); // duplicate request / retried transaction
  assert.equal(h.shipments.size, 2, "keyed upserts never create a second shipment for a seller");
});

test("shipments: single-seller order gets exactly one shipment", async t => {
  const h = harness(t, { orderNumber: "ORD1002" });
  h.items[1].seller = h.items[0].seller;
  await h.seedShipments();
  assert.equal(h.shipments.size, 1);
});

test("shipments: provider comes from the order, never the global setting", async t => {
  const h = harness(t, { orderNumber: "ORD1003" }); // legacy-style order: no deliveryProvider field
  h.setStoredProvider("ADDLOGS");
  await h.seedShipments();
  assert.equal(h.shipmentOf(h.sellerA).deliveryProvider, "IN_HOUSE");
});

test("shipments: a failed shipment write rolls the order back with it", async t => {
  const h = harness(t, { orderNumber: "ORD1004" });
  h.failShipmentWrites(new Error("shipment write failed"));
  await assert.rejects(withOrderTransaction(h.id, async () => {
    h.order.shipmentsCreated = true;
    await createOrderShipments(h.order, h.items);
  }), /shipment write failed/);
  assert.equal(h.order.shipmentsCreated, undefined, "the order change was rolled back");
  assert.equal(h.shipments.size, 0, "no orphan shipments");
});

test("shipments: legacy orders without records are untouched by lifecycle sync", async t => {
  const h = harness(t);
  const finds = t.mock.method(Shipment, "find", () => h.query(() => []));
  await changeSellerStage(h.id, h.sellerA, "Processed");
  assert.equal(finds.mock.callCount(), 0, "no shipment query for legacy orders");
  assert.equal(h.shipments.size, 0);
});

test("shipments: sellers progress independently and only their own shipment moves", async t => {
  const h = harness(t, { orderNumber: "ORD1005" });
  await h.seedShipments();
  await changeSellerStage(h.id, h.sellerA, "Processed");
  // Phase 4: "Processed" alone is prepared, not confirmed ready.
  assert.equal(statusOf(h, h.sellerA), "PREPARING");
  assert.equal(statusOf(h, h.sellerB), "PREPARING", "seller B (accepted) is still preparing");
  await markSellerReadyForPickup(h.id, h.sellerA);
  assert.equal(statusOf(h, h.sellerA), "READY_FOR_PICKUP");
  assert.equal(statusOf(h, h.sellerB), "PREPARING", "seller B is unaffected");
  const historyLength = h.shipmentOf(h.sellerA).history.length;
  await changeSellerStage(h.id, h.sellerA, "Processed"); // repeated action
  assert.equal(h.shipmentOf(h.sellerA).history.length, historyLength, "repeat is a no-op");
  assert.equal(h.order.status, "Accepted", "order status rule (least advanced seller) is unchanged");
});

test("shipments: one seller cannot move or cancel another seller's shipment", async t => {
  const h = harness(t, { orderNumber: "ORD1006" });
  await h.seedShipments();
  const outsider = String(oid());
  await assert.rejects(changeSellerStage(h.id, outsider, "Processed"), /No active items/);
  await assert.rejects(cancelOrderLifecycle(h.id, "seller", { sellerId: outsider }), /Order not found/);
  assert.deepEqual([statusOf(h, h.sellerA), statusOf(h, h.sellerB)], ["CREATED", "CREATED"]);
});

test("shipments: seller cancellation cancels only that seller's shipment", async t => {
  const h = harness(t, { orderNumber: "ORD1007" });
  await h.seedShipments();
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerB });
  assert.equal(statusOf(h, h.sellerB), "CANCELLED");
  assert.notEqual(statusOf(h, h.sellerA), "CANCELLED");
  assert.notEqual(h.order.status, "Cancelled", "the customer order continues");
  const history = h.shipmentOf(h.sellerB).history.length;
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerB }); // repeated cancel
  assert.equal(h.shipmentOf(h.sellerB).history.length, history, "idempotent");
});

test("shipments: in-house keeps one courier, sequential pickups, one OTP and one settlement", async t => {
  const h = harness(t, { orderNumber: "ORD1008", status: "Processed" });
  h.items.forEach((item: any) => { item.fulfillmentStatus = "Processed"; });
  await h.seedShipments();
  await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  assert.equal(statusOf(h, h.sellerA), "PICKED_UP", "in-house pickup still works at Processed without a readiness confirmation");
  assert.equal(statusOf(h, h.sellerB), "PREPARING", "seller B is prepared but not yet collected");
  assert.equal(h.order.status, "Processed", "order waits for every seller pickup, as before");
  await confirmOrderPickup(h.id, h.courier, h.sellerB, 22.72, 75.85);
  assert.equal(h.order.status, "Out for Delivery");
  const otp = h.order.deliveryOtp;
  await verifyDeliveryOtp(h.id, otp, h.courier);
  assert.deepEqual([statusOf(h, h.sellerA), statusOf(h, h.sellerB)], ["DELIVERED", "DELIVERED"]);
  assert.equal(String(h.order.deliveryBoy), h.courier, "a single courier served every shipment");
  assert.equal(h.order.deliveryOtp, otp, "one customer OTP for the whole order");
  assert.equal([...h.tasks.values()].filter((task: any) => task.kind === "Settlement").length, 1, "one COD settlement");
  await verifyDeliveryOtp(h.id, otp, h.courier); // duplicate completion request
  assert.equal([...h.tasks.values()].filter((task: any) => task.kind === "Settlement").length, 1);
  assert.equal(h.shipmentOf(h.sellerA).history.filter((e: any) => e.status === "DELIVERED").length, 1, "no duplicate delivered event");
});

test("shipments: pickup racing a seller cancellation — picked-up shipment cannot be cancelled", async t => {
  const h = harness(t, { orderNumber: "ORD1009", status: "Processed" });
  h.items.forEach((item: any) => { item.fulfillmentStatus = "Processed"; });
  await h.seedShipments();
  const [pickup, cancel] = await Promise.allSettled([
    confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85),
    cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA }),
  ]);
  assert.equal(pickup.status, "fulfilled");
  assert.equal(cancel.status, "rejected", "serialized by the order lock: cancel sees the pickup");
  assert.equal(statusOf(h, h.sellerA), "PICKED_UP");
});

test("shipments: concurrent stage changes by two sellers stay consistent", async t => {
  const h = harness(t, { orderNumber: "ORD1010" });
  await h.seedShipments();
  await Promise.all([changeSellerStage(h.id, h.sellerA, "Processed"), changeSellerStage(h.id, h.sellerB, "Processed")]);
  assert.deepEqual([statusOf(h, h.sellerA), statusOf(h, h.sellerB)], ["PREPARING", "PREPARING"]);
  assert.equal(h.order.status, "Processed");
});

test("shipments: cancelled shipments stay cancelled when the rest of the order is delivered", async t => {
  const h = harness(t, { orderNumber: "ORD1011", status: "Processed" });
  h.items.forEach((item: any) => { item.fulfillmentStatus = "Processed"; });
  await h.seedShipments();
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerB });
  await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  await verifyDeliveryOtp(h.id, h.order.deliveryOtp, h.courier);
  assert.deepEqual([statusOf(h, h.sellerA), statusOf(h, h.sellerB)], ["DELIVERED", "CANCELLED"]);
});

test("shipments: whole-order cancellation cancels every shipment", async t => {
  const h = harness(t, { orderNumber: "ORD1012" });
  await h.seedShipments();
  await cancelOrderLifecycle(h.id, "admin", { reason: "Support" });
  assert.deepEqual([statusOf(h, h.sellerA), statusOf(h, h.sellerB)], ["CANCELLED", "CANCELLED"]);
});

// ===========================================================================
// Phase 4 — explicit seller readiness, booking intent, reconciliation
// ===========================================================================
async function preparedOrder(t: any, overrides: any = {}) {
  const h = harness(t, { orderNumber: `ORD4${Math.floor(Math.random() * 1e6)}`, status: "Processed", ...overrides });
  h.items.forEach((item: any) => { item.fulfillmentStatus = "Processed"; });
  await h.seedShipments();
  return h;
}

test("readiness: only the owning seller can mark their shipment ready", async t => {
  const h = await preparedOrder(t);
  await assert.rejects(markSellerReadyForPickup(h.id, String(oid())), /Order not found/);
  assert.equal(h.shipmentOf(h.sellerA).readyForPickupAt, undefined);
  await markSellerReadyForPickup(h.id, h.sellerA);
  assert.equal(statusOf(h, h.sellerA), "READY_FOR_PICKUP");
  assert.equal(String(h.shipmentOf(h.sellerA).readyBy), h.sellerA);
  assert.equal(h.shipmentOf(h.sellerB).readyForPickupAt, undefined, "another seller's shipment is untouched");
  assert.equal(statusOf(h, h.sellerB), "PREPARING");
});

test("readiness: requires acceptance, preparation, confirmed payment and a shipment record", async t => {
  const received = harness(t, { orderNumber: "ORD4R", status: "Received" });
  received.items.forEach((item: any) => { item.fulfillmentStatus = "Received"; });
  await received.seedShipments();
  await assert.rejects(markSellerReadyForPickup(received.id, received.sellerA), /Accept the order/);
  const accepted = harness(t, { orderNumber: "ORD4A" });
  await accepted.seedShipments();
  await assert.rejects(markSellerReadyForPickup(accepted.id, accepted.sellerA), /Processed \(prepared\)/);
  const unpaid = await preparedOrder(t, { paymentMethod: "Online", paymentStatus: "Pending" });
  await assert.rejects(markSellerReadyForPickup(unpaid.id, unpaid.sellerA), /payment has not been confirmed/);
  const legacy = harness(t, { status: "Processed" });
  legacy.items.forEach((item: any) => { item.fulfillmentStatus = "Processed"; });
  await assert.rejects(markSellerReadyForPickup(legacy.id, legacy.sellerA), /placed before shipments/);
  for (const order of [received, accepted, unpaid]) assert.equal(order.shipmentOf(order.sellerA).readyForPickupAt, undefined);
});

test("readiness: idempotent and persistent across later lifecycle syncs", async t => {
  const h = await preparedOrder(t);
  const first = await markSellerReadyForPickup(h.id, h.sellerA);
  const readyAt = h.shipmentOf(h.sellerA).readyForPickupAt;
  const second = await markSellerReadyForPickup(h.id, h.sellerA);
  assert.deepEqual([first.unchanged, second.unchanged], [false, true]);
  assert.equal(h.shipmentOf(h.sellerA).readyForPickupAt, readyAt);
  assert.equal(h.shipmentOf(h.sellerA).history.filter((e: any) => e.status === "READY_FOR_PICKUP").length, 1);
  await changeSellerStage(h.id, h.sellerB, "Shipped"); // another lifecycle write re-syncs the order
  assert.equal(statusOf(h, h.sellerA), "READY_FOR_PICKUP", "readiness survives later syncs");
});

test("readiness: two sellers confirming concurrently stay independent", async t => {
  const h = await preparedOrder(t);
  await Promise.all([markSellerReadyForPickup(h.id, h.sellerA), markSellerReadyForPickup(h.id, h.sellerB),
    markSellerReadyForPickup(h.id, h.sellerA)]);
  assert.deepEqual([statusOf(h, h.sellerA), statusOf(h, h.sellerB)], ["READY_FOR_PICKUP", "READY_FOR_PICKUP"]);
  assert.equal(h.shipmentOf(h.sellerA).history.filter((e: any) => e.status === "READY_FOR_PICKUP").length, 1);
});

test("readiness: cancelled shipments cannot become ready; cancel after readiness cancels only that seller", async t => {
  const before = await preparedOrder(t);
  await cancelOrderLifecycle(before.id, "seller", { sellerId: before.sellerB });
  await assert.rejects(markSellerReadyForPickup(before.id, before.sellerB), /cancelled/);
  assert.equal(statusOf(before, before.sellerB), "CANCELLED");
  const after = await preparedOrder(t);
  await markSellerReadyForPickup(after.id, after.sellerB);
  await cancelOrderLifecycle(after.id, "seller", { sellerId: after.sellerB });
  await cancelOrderLifecycle(after.id, "seller", { sellerId: after.sellerB }); // repeated
  assert.equal(statusOf(after, after.sellerB), "CANCELLED");
  assert.equal(statusOf(after, after.sellerA), "PREPARING", "the other seller continues");
  await assert.rejects(markSellerReadyForPickup(after.id, after.sellerB), /cancelled/);
});

test("readiness racing cancellation always ends CANCELLED with no live booking intent", async t => {
  const h = await preparedOrder(t, { deliveryProvider: "ADDLOGS" });
  await Promise.allSettled([markSellerReadyForPickup(h.id, h.sellerA), cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA })]);
  assert.equal(statusOf(h, h.sellerA), "CANCELLED");
  assert.notEqual(h.shipmentOf(h.sellerA).bookingIntent?.state, "PENDING");
});

test("readiness racing pickup: both serialize; a collected shipment cannot be marked ready", async t => {
  const h = await preparedOrder(t);
  await Promise.allSettled([markSellerReadyForPickup(h.id, h.sellerA), confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85)]);
  assert.equal(statusOf(h, h.sellerA), "PICKED_UP");
  const late = await preparedOrder(t);
  await confirmOrderPickup(late.id, late.courier, late.sellerA, 22.72, 75.85);
  await assert.rejects(markSellerReadyForPickup(late.id, late.sellerA), /already been collected/);
});

test("booking intent: none for in-house; exactly one, after readiness, for an external-provider shipment", async t => {
  const inHouse = await preparedOrder(t, { deliveryProvider: "IN_HOUSE" });
  await markSellerReadyForPickup(inHouse.id, inHouse.sellerA);
  assert.equal(inHouse.shipmentOf(inHouse.sellerA).bookingIntent, undefined, "in-house never gets a booking intent");
  const external = await preparedOrder(t, { deliveryProvider: "ADDLOGS" });
  assert.equal(external.shipmentOf(external.sellerA).bookingIntent, undefined, "no intent before readiness (Processed alone)");
  await markSellerReadyForPickup(external.id, external.sellerA);
  const intent = external.shipmentOf(external.sellerA).bookingIntent;
  assert.equal(intent.state, "PENDING");
  await markSellerReadyForPickup(external.id, external.sellerA); // duplicate request
  await changeSellerStage(external.id, external.sellerB, "Shipped"); // unrelated re-sync
  assert.deepEqual(external.shipmentOf(external.sellerA).bookingIntent, intent, "still exactly one intent, unchanged");
  assert.equal(external.shipmentOf(external.sellerB).bookingIntent, undefined, "seller B is not ready, so no intent");
  await cancelOrderLifecycle(external.id, "seller", { sellerId: external.sellerA });
  assert.equal(external.shipmentOf(external.sellerA).bookingIntent.state, "CANCELLED", "internal cancellation only");
});

test("in-house: readiness is informational — no assignment, dispatch rules and OTP/COD unchanged", async t => {
  const h = await preparedOrder(t, { deliveryBoy: undefined });
  const [assigned] = await Promise.all([acceptDeliveryOrder(h.id, h.courier), markSellerReadyForPickup(h.id, h.sellerA)]);
  assert.equal(String(assigned.deliveryBoy), h.courier);
  assert.equal(h.assignments, 1, "readiness created no assignment of its own");
  // Seller A confirmed readiness, seller B did not: pickup works for both, as before.
  await confirmOrderPickup(h.id, h.courier, h.sellerA, 22.72, 75.85);
  await confirmOrderPickup(h.id, h.courier, h.sellerB, 22.72, 75.85);
  await verifyDeliveryOtp(h.id, h.order.deliveryOtp, h.courier);
  assert.deepEqual([statusOf(h, h.sellerA), statusOf(h, h.sellerB)], ["DELIVERED", "DELIVERED"]);
  assert.equal([...h.tasks.values()].filter((task: any) => task.kind === "Settlement").length, 1);
});

test("strict OFF: readiness still records (no assignment involved) and creates no courier work", async t => {
  const h = await preparedOrder(t, { deliveryBoy: undefined });
  h.setInHouse("disabled");
  await markSellerReadyForPickup(h.id, h.sellerA);
  assert.equal(statusOf(h, h.sellerA), "READY_FOR_PICKUP");
  assert.equal(h.assignments, 0);
  assert.equal(h.gateWrites, 0);
  await assert.rejects(acceptDeliveryOrder(h.id, h.courier), /temporarily disabled/, "OFF still blocks assignment");
});

test("inconsistency is flagged for admins instead of silently ignored", async t => {
  const h = await preparedOrder(t);
  h.shipmentOf(h.sellerA).status = "DELIVERED"; // simulated corrupt/old record
  await changeSellerStage(h.id, h.sellerB, "Shipped");
  assert.equal(statusOf(h, h.sellerA), "DELIVERED", "never regressed");
  assert.match(h.shipmentOf(h.sellerA).attention.reason, /implies PREPARING but shipment is DELIVERED/);
});

test("returns: reconciliation is transactional, idempotent and keeps partial returns DELIVERED", async t => {
  const h = harness(t, { orderNumber: "ORD4RET", status: "Delivered", shipmentsCreated: true, shipmentSyncPending: true });
  h.items.push({ _id: oid(), order: h.order._id, product: oid(), seller: h.items[0].seller, status: "Delivered", fulfillmentStatus: "Shipped", total: 50, quantity: 1 });
  h.items.forEach((item: any) => { item.status = "Delivered"; });
  await createOrderShipments(h.order, h.items);
  for (const s of h.shipments.values()) s.status = "DELIVERED";
  const orderWrites: any[] = [];
  t.mock.method(Order, "updateOne", async (_filter: any, update: any) => { orderWrites.push(update); if (update.$unset) delete h.order.shipmentSyncPending; return {}; });
  h.items[0].status = "Returned"; // seller A: one of two items returned
  h.items[1].status = "Returned"; // seller B: its only item returned
  await reconcileOrderShipments(h.id);
  assert.equal(statusOf(h, h.sellerA), "DELIVERED", "partial return keeps the shipment DELIVERED");
  assert.equal(statusOf(h, h.sellerB), "RETURNED");
  assert.equal(h.order.shipmentSyncPending, undefined, "marker cleared in the same transaction");
  const history = h.shipmentOf(h.sellerB).history.length;
  await reconcileOrderShipments(h.id); // retry
  assert.equal(h.shipmentOf(h.sellerB).history.length, history, "idempotent");
});

test("returns: a failed reconciliation stays pending and succeeds on the worker retry", async t => {
  const h = harness(t, { orderNumber: "ORD4RT2", status: "Delivered", shipmentsCreated: true, shipmentSyncPending: true });
  h.items.forEach((item: any) => { item.status = "Delivered"; });
  await createOrderShipments(h.order, h.items);
  for (const s of h.shipments.values()) s.status = "DELIVERED";
  h.items[1].status = "Returned";
  t.mock.method(Order, "find", () => ({ select: () => ({ limit: () => ({ lean: async () => (h.order.shipmentSyncPending ? [{ _id: h.order._id }] : []) }) }) }));
  t.mock.method(Order, "updateOne", async (_filter: any, update: any) => { if (update.$unset) delete h.order.shipmentSyncPending; return {}; });
  const realFind = Shipment.find;
  let failNext = true;
  t.mock.method(Shipment, "find", (...args: any[]) => {
    if (failNext) { failNext = false; return h.query(() => { throw new Error("db blip"); }); }
    return (realFind as any)(...args); // the harness's in-memory shipment store
  });
  const first = await reconcilePendingShipmentSyncs();
  assert.deepEqual(first, { reconciled: 0, failed: 1 });
  assert.equal(h.order.shipmentSyncPending, true, "still marked for retry");
  const second = await reconcilePendingShipmentSyncs();
  assert.deepEqual(second, { reconciled: 1, failed: 0 });
  assert.equal(statusOf(h, h.sellerB), "RETURNED");
  assert.equal(h.order.shipmentSyncPending, undefined);
});

// ===========================================================================
// Phase 5 — reconciliation placeholder and intent cancellation on the lifecycle
// ===========================================================================
test("reconciliation: one inert placeholder per external shipment, only with its booking intent", async t => {
  const inHouse = await preparedOrder(t, { deliveryProvider: "IN_HOUSE" });
  await markSellerReadyForPickup(inHouse.id, inHouse.sellerA);
  assert.equal(inHouse.reconciliations.size, 0, "in-house shipments get no provider reconciliation");
  const external = await preparedOrder(t, { deliveryProvider: "ADDLOGS" });
  assert.equal(external.reconciliations.size, 0, "nothing before readiness");
  await markSellerReadyForPickup(external.id, external.sellerA);
  await markSellerReadyForPickup(external.id, external.sellerA); // repeated readiness
  await changeSellerStage(external.id, external.sellerB, "Shipped"); // unrelated re-sync
  assert.equal(external.reconciliations.size, 1);
  const [record] = [...external.reconciliations.values()];
  assert.deepEqual([record.providerCost, record.providerAdjustment, record.providerCredit, record.providerSettlementReference], [null, null, null, null]);
  assert.equal(record.status, "AWAITING_PROVIDER_DATA");
  assert.equal(record.currency, "INR");
  assert.equal(h_total(external), external.order.total, "the customer total is unchanged");
  assert.equal(external.tasks.size, 0, "no settlement, refund or reversal task was queued");
});
const h_total = (h: any) => h.order.total;

test("cancelling a shipment cancels a claimed booking intent and clears its lease", async t => {
  const h = await preparedOrder(t, { deliveryProvider: "ADDLOGS" });
  await markSellerReadyForPickup(h.id, h.sellerA);
  Object.assign(h.shipmentOf(h.sellerA).bookingIntent, { state: "CLAIMED", leaseToken: "worker-1", leaseUntil: new Date(Date.now() + 60000) });
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA });
  const intent = h.shipmentOf(h.sellerA).bookingIntent;
  assert.equal(intent.state, "CANCELLED");
  assert.equal(intent.leaseToken, undefined);
  assert.equal(statusOf(h, h.sellerA), "CANCELLED");
});

// ==========================================================================
// Phase 7 Task 10: Adloggs cancellations are confirmed at the provider BEFORE
// the local cancellation and refund.
// ==========================================================================
async function bookedAdloggsOrder(t: any, intent: any = { state: "BOOKED" }, adloggs: any = { orderUuid: "uuid-A", partnerOrderId: "PA" }) {
  const h = await preparedOrder(t, { deliveryProvider: "ADDLOGS", paymentMethod: "Online", paymentStatus: "Paid" });
  await markSellerReadyForPickup(h.id, h.sellerA);
  Object.assign(h.shipmentOf(h.sellerA).bookingIntent, intent);
  h.shipmentOf(h.sellerA).adloggs = { ...adloggs };
  const byId = (id: any) => [h.shipmentOf(h.sellerA), h.shipmentOf(h.sellerB)].find(s => s && String(s._id) === String(id)) ?? null;
  t.mock.method(Shipment, "findById", (id: any) => {
    const q: any = { select: () => q, lean: () => q, session: () => q,
      then: (res: any, rej: any) => Promise.resolve(byId(id) ? { ...byId(id), adloggs: { ...byId(id).adloggs } } : null).then(res, rej) };
    return q;
  });
  const shipmentA = () => h.shipmentOf(h.sellerA);
  const itemsOf = (seller: string) => h.items.filter((item: any) => String(item.seller) === seller);
  const refundKeys = () => [...h.tasks.keys()].filter(key => h.tasks.get(key).kind === "Refund").sort();
  return { h, shipmentA, itemsOf, refundKeys };
}

test("external cancellation: booked seller is deferred; the other seller is cancelled and refunded now (only for its items)", async t => {
  const { h, shipmentA, itemsOf, refundKeys } = await bookedAdloggsOrder(t);
  const result = await cancelOrderLifecycle(h.id, "customer", { userId: String(h.order.customer), reason: "Changed my mind" });
  assert.deepEqual(result.deferredSellers, [h.sellerA]);
  assert.ok(itemsOf(h.sellerB).every((item: any) => item.status === "Cancelled"));
  assert.ok(itemsOf(h.sellerA).every((item: any) => item.status !== "Cancelled"), "booked seller's items stay active");
  assert.deepEqual(refundKeys(), [`${h.id}:cancel:sellers:${h.sellerB}`]);
  assert.equal(h.tasks.get(`${h.id}:cancel:sellers:${h.sellerB}`).amount, 180, "refund covers seller B's items only");
  assert.notEqual(h.order.status, "Cancelled");
  assert.equal(shipmentA().adloggs.pendingLocalCancellation.state, "AWAITING_PROVIDER");
  assert.equal(shipmentA().adloggs.cancellation.state, "REQUESTED", "provider cancellation queued");

  // Repeat request: idempotent, nothing new queued.
  await cancelOrderLifecycle(h.id, "customer", { userId: String(h.order.customer), reason: "Again" });
  assert.deepEqual(refundKeys(), [`${h.id}:cancel:sellers:${h.sellerB}`]);

  // Not yet confirmed by Adloggs: nothing completes.
  assert.equal((await completeDeferredCancellation(String(shipmentA()._id))).outcome, "WAITING");
  assert.ok(itemsOf(h.sellerA).every((item: any) => item.status !== "Cancelled"));

  // Verified provider cancellation: local cancellation + refund of the remainder, exactly once.
  shipmentA().adloggs.cancellation.state = "CONFIRMED";
  assert.equal((await completeDeferredCancellation(String(shipmentA()._id))).outcome, "COMPLETED");
  assert.ok(itemsOf(h.sellerA).every((item: any) => item.status === "Cancelled"));
  assert.equal(h.order.status, "Cancelled");
  assert.deepEqual(refundKeys(), [`${h.id}:cancel:remaining`, `${h.id}:cancel:sellers:${h.sellerB}`].sort());
  assert.equal(shipmentA().adloggs.pendingLocalCancellation.state, "COMPLETED");
  assert.equal((await completeDeferredCancellation(String(shipmentA()._id))).outcome, "NONE", "second completion is a no-op");
  assert.equal(refundKeys().length, 2, "never a double refund");
});

test("external cancellation: an unknown booking outcome keeps the request, with no refund", async t => {
  const { h, shipmentA, itemsOf, refundKeys } = await bookedAdloggsOrder(t, { state: "OUTCOME_UNKNOWN" }, { partnerOrderId: "PA" });
  const result = await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA, reason: "Out of stock" });
  assert.deepEqual([result.unchanged, result.deferredSellers], [true, [h.sellerA]]);
  assert.deepEqual(refundKeys(), []);
  assert.equal(shipmentA().adloggs.cancellationRequired, true);
  assert.match(shipmentA().attention.reason, /outcome is uncertain/);
  assert.equal((await completeDeferredCancellation(String(shipmentA()._id))).outcome, "WAITING");
  assert.ok(itemsOf(h.sellerA).every((item: any) => item.status !== "Cancelled"));
});

test("external cancellation: a provider refusal blocks (no refund) and escalates", async t => {
  const { h, shipmentA, refundKeys } = await bookedAdloggsOrder(t);
  await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA, reason: "Out of stock" });
  shipmentA().adloggs.cancellation = { ...shipmentA().adloggs.cancellation, state: "REJECTED", lastError: "already picked up" };
  assert.equal((await completeDeferredCancellation(String(shipmentA()._id))).outcome, "BLOCKED");
  assert.equal(shipmentA().adloggs.pendingLocalCancellation.state, "BLOCKED");
  assert.match(shipmentA().attention.reason, /No refund was made/);
  assert.deepEqual(refundKeys(), []);
});

test("external cancellation: shipments with no possible provider order still cancel immediately", async t => {
  const { h, itemsOf, refundKeys } = await bookedAdloggsOrder(t, { state: "PENDING" }, { partnerOrderId: "PA" });
  const result = await cancelOrderLifecycle(h.id, "seller", { sellerId: h.sellerA, reason: "Out of stock" });
  assert.deepEqual(result.deferredSellers, []);
  assert.ok(itemsOf(h.sellerA).every((item: any) => item.status === "Cancelled"));
  assert.deepEqual(refundKeys(), [`${h.id}:cancel:seller:${h.sellerA}`]);
});

test("provider-initiated cancellation: admin acceptance refunds only that seller; repeat is idempotent", async t => {
  const { h, shipmentA, itemsOf, refundKeys } = await bookedAdloggsOrder(t, { state: "BOOKED" }, { orderUuid: "uuid-A", partnerOrderId: "PA", providerStatus: "CANCELLED" });
  const admin = String(oid());
  const bad = await handleExternalCancellation(String(shipmentA()._id), { action: "ACCEPT_PROVIDER_CANCELLATION", adminId: admin, reason: "short" });
  assert.equal(bad.state, "INVALID");
  const ok = await handleExternalCancellation(String(shipmentA()._id), { action: "ACCEPT_PROVIDER_CANCELLATION", adminId: admin, reason: "Adloggs cancelled; customer agreed to refund" });
  assert.equal(ok.state, "COMPLETED");
  assert.ok(itemsOf(h.sellerA).every((item: any) => item.status === "Cancelled"));
  assert.ok(itemsOf(h.sellerB).every((item: any) => item.status !== "Cancelled"), "unrelated seller untouched");
  assert.deepEqual(refundKeys(), [`${h.id}:cancel:seller:${h.sellerA}`]);
  await handleExternalCancellation(String(shipmentA()._id), { action: "ACCEPT_PROVIDER_CANCELLATION", adminId: admin, reason: "Adloggs cancelled; customer agreed to refund" });
  assert.equal(refundKeys().length, 1);
});

test("provider-initiated cancellation: rebooking keeps items and retires the old order and partner id", async t => {
  const { h, shipmentA, itemsOf, refundKeys } = await bookedAdloggsOrder(t, { state: "BOOKED" }, { orderUuid: "uuid-A", partnerOrderId: "PA", providerStatus: "CANCELLED" });
  shipmentA().shipmentNumber = "PA";
  const result = await handleExternalCancellation(String(shipmentA()._id), { action: "REBOOK_AFTER_PROVIDER_CANCELLATION", adminId: String(oid()), reason: "Rider unavailable; rebook today" });
  assert.equal(result.state, "PENDING");
  assert.equal(shipmentA().bookingIntent.state, "PENDING");
  assert.equal(shipmentA().adloggs.orderUuid, undefined);
  assert.equal(shipmentA().adloggs.partnerOrderId, "PA-R2");
  assert.ok(itemsOf(h.sellerA).every((item: any) => item.status !== "Cancelled"));
  assert.deepEqual(refundKeys(), []);
});

// ==========================================================================
// Phase 7 Tasks 11-12: provider-aware parent order outcome and held external settlement.
// ==========================================================================
test("external outcome aggregation covers every documented combination", () => {
  const s = (status: string, extra: any = {}) => ({ status, ...extra });
  const cases: Array<[any[], string]> = [
    [[s("DELIVERED"), s("DELIVERED")], "ALL_DELIVERED"],
    [[s("DELIVERED"), s("READY_FOR_PICKUP")], "PARTIALLY_DELIVERED"],
    [[s("DELIVERED"), s("CANCELLED")], "DELIVERED_AND_CANCELLED"],
    [[s("CANCELLED"), s("CANCELLED")], "ALL_CANCELLED"],
    [[s("DELIVERED"), s("RETURNED_TO_ORIGIN")], "DELIVERED_AND_RTO"],
    [[s("RETURNED_TO_ORIGIN"), s("RETURNED_TO_ORIGIN")], "ALL_RTO"],
    [[s("DELIVERED"), s("PREPARING", { bookingIntent: { state: "OUTCOME_UNKNOWN" } })], "UNRESOLVED"],
    [[s("DELIVERED"), s("READY_FOR_PICKUP", { adloggs: { providerStatus: "CANCELLED" } })], "UNRESOLVED"],
    [[s("DELIVERED"), s("READY_FOR_PICKUP", { adloggs: { pendingLocalCancellation: { state: "BLOCKED" } } })], "UNRESOLVED"],
    [[s("PICKED_UP"), s("PREPARING")], "IN_PROGRESS"],
    [[s("RETURNED"), s("DELIVERED")], "ALL_DELIVERED"],
    [[], "UNRESOLVED"],
  ];
  for (const [shipments, expected] of cases) assert.equal(aggregateExternalOutcome(shipments).state, expected, JSON.stringify(shipments));
});

async function deliveredAdloggsOrder(t: any, statuses: [string, string]) {
  const h = await preparedOrder(t, { deliveryProvider: "ADDLOGS", paymentMethod: "Online", paymentStatus: "Paid", deliveryBoy: undefined });
  h.shipmentOf(h.sellerA).status = statuses[0];
  h.shipmentOf(h.sellerB).status = statuses[1];
  return h;
}

test("external outcome: all delivered completes the order without courier or OTP and queues ONE held external settlement", async t => {
  const h = await deliveredAdloggsOrder(t, ["DELIVERED", "DELIVERED"]);
  const outcome = await syncExternalOrderOutcome(h.id);
  assert.equal(outcome?.state, "ALL_DELIVERED");
  assert.equal(h.order.status, "Delivered");
  assert.equal(h.order.deliveryBoy, undefined, "no fake courier");
  assert.notEqual(h.order.deliveryOtpVerified, true, "the OTP path is not used");
  assert.ok(h.items.every((item: any) => item.status === "Delivered"));
  assert.equal(h.tasks.get(`${h.id}:external-settlement`)?.kind, "ExternalSettlement");
  assert.equal(h.tasks.has(`${h.id}:settlement`), false, "never the in-house settlement");
  await syncExternalOrderOutcome(h.id);
  assert.equal([...h.tasks.values()].filter((task: any) => task.kind === "ExternalSettlement").length, 1, "idempotent");
});

test("external outcome: any RTO is recorded for an admin; no completion, refund or settlement", async t => {
  const h = await deliveredAdloggsOrder(t, ["DELIVERED", "RETURNED_TO_ORIGIN"]);
  const outcome = await syncExternalOrderOutcome(h.id);
  assert.equal(outcome?.state, "DELIVERED_AND_RTO");
  assert.notEqual(h.order.status, "Delivered");
  assert.match(h.order.externalDeliveryOutcome.attention, /returned to the store/);
  assert.equal(h.tasks.size, 0);
});

test("external outcome: in-house orders are never touched", async t => {
  const h = await preparedOrder(t, { deliveryProvider: "IN_HOUSE", paymentMethod: "Online", paymentStatus: "Paid" });
  h.shipmentOf(h.sellerA).status = "DELIVERED"; h.shipmentOf(h.sellerB).status = "DELIVERED";
  assert.equal(await syncExternalOrderOutcome(h.id), null);
  assert.notEqual(h.order.status, "Delivered");
});

test("effect worker: external settlement is HELD; in-house Settlement never runs for Adloggs orders; unknown kinds never move money", async t => {
  const h = harness(t, { status: "Delivered", settlementStatus: "Pending", deliveryProvider: "ADDLOGS", paymentMethod: "Online", paymentStatus: "Paid" });
  const tasks = [
    { _id: `${h.id}:external-settlement`, order: h.order._id, kind: "ExternalSettlement", status: "Pending", nextAttemptAt: new Date() },
    { _id: `${h.id}:settlement`, order: h.order._id, kind: "Settlement", status: "Pending", nextAttemptAt: new Date() },
    { _id: `${h.id}:mystery`, order: h.order._id, kind: "Payout", status: "Pending", nextAttemptAt: new Date() },
  ];
  for (const task of tasks) h.tasks.set(task._id, task);
  t.mock.method(OrderEffect, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => tasks }) }) }) as any);
  t.mock.method(OrderEffect, "findOneAndUpdate", async (filter: any) => tasks.find(task => task._id === filter._id) as any);
  t.mock.method(mongoose.models.OrderFinanceLease, "findOneAndUpdate", async (_filter: any, update: any) => ({ token: update.$set.token }));
  t.mock.method(mongoose.models.OrderFinanceLease, "updateOne", async () => ({}));
  const orderWrites: any[] = [];
  t.mock.method(Order, "updateOne", async (_filter: any, update: any) => { orderWrites.push(update); return {} as any; });
  t.mock.method(Order, "findById", () => h.query(() => h.order) as any);
  await processOrderEffects(h.id);
  assert.deepEqual(tasks.map(task => task.status), ["Held", "Held", "Held"]);
  assert.equal(orderWrites.length, 0, "no settlement status change, so nothing was executed");
  assert.equal(h.order.settlementStatus, "Pending");
});

// ==========================================================================
// Final validation: RTO resolution, escalation, traceability, rollback.
// ==========================================================================
async function externalWorld(t: any, setup: (h: any) => void) {
  const h = await preparedOrder(t, { deliveryProvider: "ADDLOGS", paymentMethod: "Online", paymentStatus: "Paid", deliveryBoy: undefined });
  setup(h);
  const byId = (id: any) => [h.shipmentOf(h.sellerA), h.shipmentOf(h.sellerB)].find(s => s && String(s._id) === String(id)) ?? null;
  t.mock.method(Shipment, "findById", (id: any) => {
    const q: any = { select: () => q, lean: () => q, session: () => q,
      then: (res: any, rej: any) => Promise.resolve(byId(id) ? { ...byId(id), adloggs: { ...byId(id).adloggs } } : null).then(res, rej) };
    return q;
  });
  const refundKeys = () => [...h.tasks.keys()].filter(key => h.tasks.get(key).kind === "Refund").sort();
  const itemsOf = (seller: string) => h.items.filter((item: any) => String(item.seller) === seller);
  return { h, refundKeys, itemsOf };
}
const verifiedRto = (shipment: any) => {
  shipment.status = "RETURNED_TO_ORIGIN";
  shipment.adloggs = { orderUuid: "uuid-B", partnerOrderId: "PB", providerStatus: "RTO_DELIVERED",
    rto: { state: "COMPLETED", completedAt: new Date(), resolution: { state: "PENDING_DECISION", since: new Date() } } };
};

test("RTO resolution: refunding a verified RTO (with restock) lets the delivered rest of the order complete and settle (held)", async t => {
  const { h, refundKeys, itemsOf } = await externalWorld(t, w => { w.shipmentOf(w.sellerA).status = "DELIVERED"; verifiedRto(w.shipmentOf(w.sellerB)); });
  assert.equal((await syncExternalOrderOutcome(h.id))?.state, "DELIVERED_AND_RTO", "RTO is never a delivery");
  assert.notEqual(h.order.status, "Delivered");
  const before = h.restored;
  const result = await handleExternalCancellation(String(h.shipmentOf(h.sellerB)._id), { action: "RESOLVE_RTO_REFUND_RESTOCK", adminId: String(oid()), reason: "Customer unreachable twice" });
  assert.equal(result.state, "REFUNDED");
  assert.ok(itemsOf(h.sellerB).every((item: any) => item.status === "Cancelled"));
  assert.ok(h.restored > before, "returned goods restocked");
  assert.deepEqual(refundKeys(), [`${h.id}:cancel:seller:${h.sellerB}`], "refund for the returned seller's items only");
  assert.equal(h.order.status, "Delivered", "delivered part completes once the RTO is resolved");
  assert.equal(h.tasks.get(`${h.id}:external-settlement`)?.kind, "ExternalSettlement");
  // Repeat is a no-op.
  assert.equal((await handleExternalCancellation(String(h.shipmentOf(h.sellerB)._id), { action: "RESOLVE_RTO_REFUND_RESTOCK", adminId: String(oid()), reason: "Customer unreachable twice" })).state, "REFUNDED");
  assert.equal(refundKeys().length, 1);
});

test("RTO resolution: no-restock option; unverified RTO is refused", async t => {
  const { h, refundKeys } = await externalWorld(t, w => { verifiedRto(w.shipmentOf(w.sellerB)); });
  const before = h.restored;
  await handleExternalCancellation(String(h.shipmentOf(h.sellerB)._id), { action: "RESOLVE_RTO_REFUND_NO_RESTOCK", adminId: String(oid()), reason: "Perishable goods spoiled" });
  assert.equal(h.restored, before, "not restocked");
  assert.equal(h.shipmentOf(h.sellerB).adloggs.rto.resolution.restocked, false);
  assert.equal(refundKeys().length, 1);

  const other = await externalWorld(t, w => { verifiedRto(w.shipmentOf(w.sellerB)); w.shipmentOf(w.sellerB).adloggs.providerStatus = "RETURN_INITIATED"; });
  const refused = await handleExternalCancellation(String(other.h.shipmentOf(other.h.sellerB)._id), { action: "RESOLVE_RTO_REFUND_RESTOCK", adminId: String(oid()), reason: "Customer unreachable twice" });
  assert.equal(refused.state, "CONFLICT");
  assert.deepEqual(other.refundKeys(), []);
});

test("escalation: a cancellation waiting over 30 minutes for Adloggs is escalated once, without any refund", async t => {
  const { h, refundKeys } = await externalWorld(t, w => {
    const s = w.shipmentOf(w.sellerA);
    s.status = "READY_FOR_PICKUP"; s.bookingIntent = { state: "BOOKED" };
    s.adloggs = { orderUuid: "uuid-A", partnerOrderId: "PA", cancellation: { state: "REQUESTED", requestedAt: new Date(), attempts: 0 },
      pendingLocalCancellation: { state: "AWAITING_PROVIDER", requestedBy: "customer", reason: "x", status: "Cancelled", requestedAt: new Date(Date.now() - 31 * 60_000) } };
  });
  const first = await runDeferredCancellationSweep(20);
  assert.equal(first.ESCALATED, 1);
  assert.match(h.shipmentOf(h.sellerA).attention.reason, /waited over 30 minutes/);
  const second = await runDeferredCancellationSweep(20);
  assert.equal(second.ESCALATED, undefined, "escalated only once");
  assert.deepEqual(refundKeys(), []);
});

test("traceability: rebooking after a provider cancellation records the retired attempt permanently", async t => {
  const { h } = await externalWorld(t, w => {
    const s = w.shipmentOf(w.sellerA);
    s.status = "READY_FOR_PICKUP"; s.readyForPickupAt = new Date(); s.shipmentNumber = "PA"; s.bookingIntent = { state: "BOOKED" };
    s.adloggs = { orderUuid: "uuid-A", partnerOrderId: "PA", providerStatus: "CANCELLED" };
  });
  const admin = String(oid());
  await handleExternalCancellation(String(h.shipmentOf(h.sellerA)._id), { action: "REBOOK_AFTER_PROVIDER_CANCELLATION", adminId: admin, reason: "Rider unavailable; rebook today" });
  const history = h.shipmentOf(h.sellerA).adloggs.attemptHistory;
  assert.equal(history.length, 1);
  assert.deepEqual([history[0].partnerOrderId, history[0].orderUuid, history[0].outcome, String(history[0].adminId)],
    ["PA", "uuid-A", "CANCELLED_BY_PROVIDER_REBOOKED", admin]);
  assert.equal(h.shipmentOf(h.sellerA).adloggs.partnerOrderId, "PA-R2", "a new identifier for the new attempt");
});

test("rollback: switching the active provider to IN_HOUSE never hands an existing Adloggs order to in-house couriers", async t => {
  const h = await preparedOrder(t, { deliveryProvider: "ADDLOGS", deliveryBoy: undefined, status: "Processed" });
  h.setStoredProvider("IN_HOUSE");
  await assert.rejects(acceptDeliveryOrder(h.id, String(oid()), { allowReassignment: true }), /another delivery provider/);
  assert.equal(h.order.deliveryBoy, undefined);
  assert.equal(h.order.deliveryProvider, "ADDLOGS", "the committed provider is kept");
});

test("RTO preview: admin sees evidence, the unreported reason and the refund breakdown under existing rules; nothing changes", async t => {
  const { h, refundKeys } = await externalWorld(t, w => { w.shipmentOf(w.sellerA).status = "DELIVERED"; verifiedRto(w.shipmentOf(w.sellerB)); });
  h.shipmentOf(h.sellerB).adloggs.statusEvents = [{ status: "RETURN_INITIATED", code: 13, receivedAt: new Date(), source: "POLL" },
    { status: "RTO_DELIVERED", code: 14, receivedAt: new Date(), source: "POLL" }];
  const preview: any = await getRtoResolutionPreview(String(h.shipmentOf(h.sellerB)._id));
  assert.equal(preview.verified, true);
  assert.deepEqual(preview.evidence.map((e: any) => e.status), ["RETURN_INITIATED", "RTO_DELIVERED"]);
  assert.match(preview.reason, /Not reported/);
  assert.deepEqual([preview.refund.basis, preview.refund.amount], ["ITEMS", 180], "other seller's items stay active: item totals net of discount");
  assert.deepEqual(refundKeys(), [], "preview is read-only");
  assert.ok(h.items.every((item: any) => item.status !== "Cancelled"));

  // Last active items: the whole remaining refundable balance, with its components shown.
  const last = await externalWorld(t, w => { w.items[0].status = "Cancelled"; verifiedRto(w.shipmentOf(w.sellerB)); });
  t.mock.method(Refund, "find", () => ({ select: () => ({ lean: async () => [{ amount: 50 }] }) }));
  const full: any = await getRtoResolutionPreview(String(last.h.shipmentOf(last.h.sellerB)._id));
  assert.equal(full.refund.basis, "REMAINING_BALANCE");
  assert.equal(full.refund.amount, Math.round((last.h.order.total - 50) * 100) / 100);
  assert.deepEqual([full.refund.components.shipping, full.refund.components.platformFee, full.refund.components.tip], [20, 5, 10]);
});

test("Adloggs COD: delivery completes the order as paid (cash collected by Adloggs); seller payout stays held", async t => {
  const h = await preparedOrder(t, { deliveryProvider: "ADDLOGS", paymentMethod: "COD", paymentStatus: "Pending", deliveryBoy: undefined });
  h.shipmentOf(h.sellerA).status = "DELIVERED"; h.shipmentOf(h.sellerB).status = "DELIVERED";
  assert.equal((await syncExternalOrderOutcome(h.id))?.state, "ALL_DELIVERED");
  assert.deepEqual([h.order.status, h.order.paymentStatus], ["Delivered", "Paid"]);
  assert.equal(h.order.deliveryBoy, undefined, "no in-house courier involved");
  const task = h.tasks.get(`${h.id}:external-settlement`);
  assert.equal(task?.kind, "ExternalSettlement");
  t.mock.method(OrderEffect, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [task] }) }) }) as any);
  t.mock.method(OrderEffect, "findOneAndUpdate", async () => task as any);
  t.mock.method(mongoose.models.OrderFinanceLease, "findOneAndUpdate", async (_f: any, update: any) => ({ token: update.$set.token }));
  t.mock.method(mongoose.models.OrderFinanceLease, "updateOne", async () => ({}));
  t.mock.method(Order, "findById", () => h.query(() => h.order) as any);
  await processOrderEffects(h.id);
  assert.equal(task.status, "Held", "never the in-house COD courier cash flow");
  assert.match(task.lastError, /COD Settlement report/);
});
