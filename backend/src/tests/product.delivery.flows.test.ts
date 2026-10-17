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
import { acceptDeliveryOrder, cancelOrderLifecycle, changeSellerStage, confirmOrderPickup, changeCourierStage, sellerStage } from "../services/orderLifecycleService";
import { verifyDeliveryOtp, generateDeliveryOtp } from "../services/deliveryOtpService";
import { effectiveUnitPrice } from "../utils/productVariation";
import { checkoutIdentity, prepareCheckout } from "../services/checkoutService";
import { computeCouponDiscount } from "../services/orderPricingService";
import { reserveMany } from "../services/stockService";
import { processOrderEffects } from "../services/orderEffectService";

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
  const query = (get: () => any) => ({ session: async () => get(), select: () => query(get), then: (resolve: any, reject: any) => Promise.resolve(get()).then(resolve, reject) });
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
  patch(Seller, "findById", () => query(() => ({ location: { coordinates: [75.85, 22.72] }, status: "Approved" })));
  patch(Delivery, "findById", () => query(() => ({ status: "Active" })));
  patch(DeliveryAssignment, "updateOne", async () => ({ modifiedCount: 1 }));
  patch(DeliveryAssignment, "findOneAndUpdate", async () => { assignments++; return {}; });
  patch(OrderEffect, "updateOne", async (filter: any, update: any) => {
    if (update.$setOnInsert && !tasks.has(filter._id)) tasks.set(filter._id, { _id: filter._id, ...update.$setOnInsert });
    if (update.$set && tasks.has(filter._id)) Object.assign(tasks.get(filter._id), update.$set);
    return { modifiedCount: 1 };
  });
  return { get order() { return order; }, get items() { return items; }, get restored() { return restored; }, get couponReleases() { return couponReleases; }, get assignments() { return assignments; }, tasks,
    sellerA: String(sellerA), sellerB: String(sellerB), courier: String(courier), customer: String(customer), get id() { return String(order._id); }, query };
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
