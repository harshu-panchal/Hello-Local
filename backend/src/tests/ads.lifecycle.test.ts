import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import ShopAd from "../models/ShopAd";
import SellerAdRequest from "../models/SellerAdRequest";
import Notification from "../models/Notification";
import { withAdTransaction, adStatus, refreshAdStatuses } from "../services/adLifecycleService";
import { addDays, findNextAvailableWindow, normalizeLegacyActiveAds, shopAdActiveAtQuery, toDayStart } from "../utils/shopAdCapacity";
import { validAdDate, validAdDuration, validAdLink } from "../utils/adValidation";
import { getActiveShopAds, createShopAd, updateShopAd, deleteShopAd } from "../modules/admin/controllers/adminShopAdController";
import { verifyPaymentAndActivate } from "../modules/admin/controllers/adminAdRequestController";
import { createAdRequest, submitPaymentProof } from "../modules/seller/controllers/sellerAdRequestController";
import Payment from "../models/Payment";
import Order from "../models/Order";
import { handlePaymentCaptured } from "../services/paymentService";

function query(value: any): any {
  return { session() { return this; }, select() { return this; }, sort() { return this; }, limit() { return this; }, lean() { return this; },
    then(resolve: any, reject: any) { return Promise.resolve(typeof value === "function" ? value() : value).then(resolve, reject); } };
}
async function mocked(work: (patch: (object: any, key: string, value: any) => void) => Promise<void>) {
  const restore: Array<() => void> = [];
  const patch = (object: any, key: string, value: any) => { const original = object[key]; restore.push(() => { object[key] = original; }); object[key] = value; };
  try { await work(patch); } finally { restore.reverse().forEach(undo => undo()); }
}
function call(handler: any, body = {}, id = new mongoose.Types.ObjectId().toString(), userId = new mongoose.Types.ObjectId().toString()) {
  return new Promise<any>((resolve, reject) => {
    const res: any = { code: 200, headers: {}, setHeader(name: string, value: string) { this.headers[name] = value; },
      status(code: number) { this.code = code; return this; }, json(data: any) { resolve({ code: this.code, data, headers: this.headers }); return this; } };
    handler({ params: { id }, body, user: { userId }, query: {} }, res, reject);
  });
}
function fixture(patch: (object: any, key: string, value: any) => void) {
  const Lock = mongoose.models.AdScheduleLock;
  let tail = Promise.resolve();
  let lockCount = 0;
  let commits = 0;
  let released: (() => void) | undefined;
  patch(Lock, "updateOne", async (_query: any, update: any, options: any) => {
    if (update.$inc) {
      assert.ok(options.session, "schedule lock must be written inside the transaction");
      const previous = tail;
      tail = new Promise<void>(resolve => { options.session.release = resolve; });
      await previous;
      lockCount++;
    }
  });
  patch(mongoose, "startSession", async () => ({
    async withTransaction(work: any) { try { const value = await work(); commits++; return value; } finally { this.release?.(); } },
    release: released, endSession: async () => {},
  }));
  patch(ShopAd, "find", () => query([]));
  patch(ShopAd, "countDocuments", () => query(0));
  patch(SellerAdRequest, "countDocuments", () => query(0));
  patch(Notification, "create", async () => { assert.ok(commits > 0, "notify only after commit"); return {}; });
  return { lockCount: () => lockCount };
}
function requestDoc(overrides: any = {}) {
  return { _id: new mongoose.Types.ObjectId(), sellerId: new mongoose.Types.ObjectId(), sellerName: "Seller", sellerEmail: "seller@example.com",
    shopName: "Audit Shop", tagline: "Local products", imageUrl: "https://example.com/ad.jpg", status: "PaymentVerified", paymentStatus: "Paid",
    durationDays: 7, startDate: addDays(toDayStart(new Date()), -14), adPrice: 3500,
    save: async function (options: any) { assert.ok(options.session); return this; }, ...overrides };
}

test("ad calendar uses India midnight and preserves whole-day duration", () => {
  assert.equal(toDayStart(new Date("2026-10-15T20:00:00Z")).toISOString(), "2026-10-15T18:30:00.000Z");
  assert.equal(addDays(toDayStart(new Date("2026-10-15T20:00:00Z")), 7).toISOString(), "2026-10-22T18:30:00.000Z");
});
test("ad input rejects invalid dates, unbounded durations and unsafe destinations", () => {
  for (const value of [0, -1, 1.5, 366, Infinity, "1abc"]) assert.throws(() => validAdDuration(value));
  assert.throws(() => validAdDate("not-a-date"));
  for (const link of ["javascript:alert(1)", "//evil.test", "/\\evil.test", "https://user:pass@evil.test", "/foo\nbar"]) assert.throws(() => validAdLink(link));
  assert.equal(validAdLink("", "/store/123"), "/store/123");
  assert.equal(validAdLink("https://example.com/shop"), "https://example.com/shop");
});
test("legacy normalization preserves old expiry and deactivates expired ads", async () => mocked(async patch => {
  const expiry = new Date("2026-10-01T00:00:00Z");
  patch(ShopAd, "find", () => query([{ _id: "old", expiresAt: expiry }]));
  let written: any;
  patch(ShopAd, "updateOne", async (_filter: any, update: any) => { written = update.$set; });
  await normalizeLegacyActiveAds(new Date("2026-10-15T12:00:00Z"));
  assert.equal(written.expiresAt, expiry);
  assert.equal(written.isActive, false);
}));
test("scheduler moves elapsed bookings forward and keeps all purchased days", async () => mocked(async patch => {
  patch(ShopAd, "countDocuments", () => query(0));
  patch(SellerAdRequest, "countDocuments", () => query(0));
  const today = toDayStart(new Date());
  const schedule = await findNextAvailableWindow({ desiredStart: addDays(today, -14), durationDays: 7 });
  assert.equal(schedule.startDate.getTime(), today.getTime());
  assert.equal(schedule.endDate.getTime() - schedule.startDate.getTime(), 7 * 86400000);
}));
test("scheduler queues the complete window when any purchased day is full", async () => mocked(async patch => {
  const today = toDayStart(new Date());
  patch(ShopAd, "countDocuments", (filter: any) => query(filter.$and[1].$or[0].endDate.$gt.getTime() < addDays(today, 2).getTime() ? 10 : 0));
  patch(SellerAdRequest, "countDocuments", () => query(0));
  const schedule = await findNextAvailableWindow({ desiredStart: today, durationDays: 3 });
  assert.equal(schedule.startDate.getTime(), addDays(today, 2).getTime());
  assert.equal(schedule.endDate.getTime(), addDays(today, 5).getTime());
}));
test("active ad query uses exclusive endDate and only falls back when endDate is absent", () => {
  const at = new Date();
  const filter: any = shopAdActiveAtQuery(at);
  assert.equal(filter.$and[1].$or[0].endDate.$gt, at);
  assert.equal(filter.$and[1].$or[1].endDate, null);
});
test("public ad reads select public fields and perform no database writes", async () => mocked(async patch => {
  let fields = "";
  const result: any = query([{ shopName: "Public Ad" }]);
  result.select = function (value: string) { fields = value; return this; };
  patch(ShopAd, "find", () => result);
  patch(ShopAd, "updateOne", () => { throw new Error("Public GET wrote to database"); });
  const response = await call(getActiveShopAds);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.ok(fields.includes("ctaLink"));
  for (const privateField of ["contactInfo", "requestedBy", "sellerEmail"]) assert.ok(!fields.includes(privateField));
}));
test("online-paid request activates once under simultaneous admin calls", async () => mocked(async patch => {
  const locks = fixture(patch);
  const request = requestDoc();
  patch(SellerAdRequest, "findById", () => query(request));
  let created = 0;
  let ad: any;
  patch(ShopAd, "create", async (documents: any[], options: any) => { assert.ok(options.session); created++; ad = { ...documents[0], _id: new mongoose.Types.ObjectId() }; return [ad]; });
  patch(ShopAd, "findById", () => query(ad));
  const responses = await Promise.all([call(verifyPaymentAndActivate), call(verifyPaymentAndActivate)]);
  assert.equal(created, 1);
  assert.equal(locks.lockCount(), 2);
  assert.ok(responses.every(response => response.code === 200));
  assert.equal(request.status, "Live");
  assert.equal(ad.ctaLink, `/store/${request.sellerId}`);
  assert.equal(ad.endDate.getTime() - ad.startDate.getTime(), 7 * 86400000);
}));
test("future paid request is Scheduled rather than Live", async () => mocked(async patch => {
  fixture(patch);
  const request = requestDoc({ startDate: addDays(toDayStart(new Date()), 7) });
  patch(SellerAdRequest, "findById", () => query(request));
  patch(ShopAd, "create", async (documents: any[]) => [{ ...documents[0], _id: new mongoose.Types.ObjectId() }]);
  const response = await call(verifyPaymentAndActivate);
  assert.equal(response.data.data.request.status, "Scheduled");
}));
test("two competing purchases cannot reserve the last slot for the same dates", async () => mocked(async patch => {
  fixture(patch);
  const requests = [requestDoc(), requestDoc()];
  const ads: any[] = [];
  patch(SellerAdRequest, "findById", (id: any) => query(requests.find(request => String(request._id) === String(id))));
  patch(ShopAd, "countDocuments", (filter: any) => query(() => {
    const start = filter.$and[1].$or[0].endDate.$gt;
    const end = filter.$and[0].$or[0].startDate.$lt;
    return 9 + ads.filter(ad => ad.startDate < end && ad.endDate > start).length;
  }));
  patch(ShopAd, "create", async (documents: any[]) => { const ad = { ...documents[0], _id: new mongoose.Types.ObjectId() }; ads.push(ad); return [ad]; });
  await Promise.all(requests.map(request => call(verifyPaymentAndActivate, {}, String(request._id))));
  assert.equal(ads.length, 2);
  assert.ok(ads[1].startDate >= ads[0].endDate);
  assert.equal(requests[1].status, "Scheduled");
}));
test("gateway webhook recovers an ad payment without browser verification and is replay-safe", async () => mocked(async patch => {
  fixture(patch);
  const request = requestDoc({ status: "Approved", paymentStatus: "Unpaid", razorpayOrderId: "order_ad_recovery" });
  const payments: any[] = [];
  patch(Order, "findOne", async () => null);
  patch(SellerAdRequest, "findOne", async () => request);
  patch(SellerAdRequest, "findById", () => query(request));
  patch(Payment, "findOne", async (filter: any) => payments.find(payment =>
    filter.razorpayPaymentId ? payment.razorpayPaymentId === filter.razorpayPaymentId :
      filter.status === "Pending" ? payment.status === "Pending" : payment.razorpayOrderId === filter.razorpayOrderId) || null);
  patch(Payment, "create", async (documents: any[], options: any) => {
    assert.ok(options.session);
    await new Payment(documents[0]).validate();
    payments.push(...documents); return documents;
  });
  const payload = { id: "pay_ad_recovery", order_id: request.razorpayOrderId };
  const paymentFetcher = async () => ({ ...payload, status: "captured", amount: 350000, currency: "INR", method: "upi" });
  await handlePaymentCaptured(payload, undefined, { paymentFetcher });
  await handlePaymentCaptured(payload, undefined, { paymentFetcher });
  assert.equal(payments.length, 1);
  assert.equal(request.paymentStatus, "Paid");
  assert.equal(request.status, "PaymentVerified");
  assert.equal(request.paymentMethod, "Razorpay");
  patch(ShopAd, "create", async (documents: any[]) => [{ ...documents[0], _id: new mongoose.Types.ObjectId() }]);
  await call(verifyPaymentAndActivate, {}, String(request._id));
  assert.equal(request.status, "Live");
}));
test("gateway webhook refuses an underpaid ad before writing financial records", async () => mocked(async patch => {
  fixture(patch);
  const request = requestDoc({ status: "Approved", paymentStatus: "Unpaid", razorpayOrderId: "order_ad_underpaid" });
  patch(Order, "findOne", async () => null);
  patch(SellerAdRequest, "findOne", async () => request);
  patch(SellerAdRequest, "findById", () => query(request));
  patch(Payment, "findOne", async () => null);
  patch(Payment, "create", async () => { throw new Error("Must not record an underpayment"); });
  await assert.rejects(handlePaymentCaptured({ id: "pay_ad_underpaid", order_id: request.razorpayOrderId }, undefined,
    { paymentFetcher: async () => ({ id: "pay_ad_underpaid", order_id: request.razorpayOrderId, status: "captured", amount: 100, currency: "INR" }) }), /amount/i);
  assert.equal(request.paymentStatus, "Unpaid");
}));
test("manual payment cannot activate without payment evidence", async () => mocked(async patch => {
  fixture(patch);
  patch(SellerAdRequest, "findById", () => query(requestDoc({ status: "PaymentPending", paymentStatus: "Unpaid" })));
  await assert.rejects(call(verifyPaymentAndActivate), /Payment evidence/);
}));
test("cosmetic admin edits preserve paid schedule dates", async () => mocked(async patch => {
  fixture(patch);
  const start = addDays(toDayStart(new Date()), -2);
  const end = addDays(start, 7);
  const ad: any = { ...requestDoc(), isActive: true, startDate: start, endDate: end, expiresAt: end, toObject() { return { ...this }; } };
  patch(ShopAd, "findById", () => query(ad));
  patch(SellerAdRequest, "updateMany", async (_filter: any, update: any, options: any) => { assert.ok(options.session); assert.equal(update.$set.status, "Live"); });
  await call(updateShopAd, { tagline: "Updated artwork text" });
  assert.equal(ad.startDate, start);
  assert.equal(ad.endDate, end);
}));
test("admin calendar input respects the selected India expiry date", async () => mocked(async patch => {
  fixture(patch);
  const start = addDays(toDayStart(new Date()), 2);
  const date = (value: Date) => new Date(value.getTime() + 330 * 60000).toISOString().slice(0, 10);
  let created: any;
  patch(ShopAd, "create", async (documents: any[]) => { created = documents[0]; return documents; });
  await call(createShopAd, { shopName: "Shop", tagline: "Offer", imageUrl: "https://example.com/ad.jpg",
    startDate: date(start), expiresAt: date(addDays(start, 7)) });
  assert.equal(created.startDate.getTime(), start.getTime());
  assert.equal(created.endDate.getTime(), addDays(start, 7).getTime());
}));
test("enabling a future ad through the edit form preserves its duration", async () => mocked(async patch => {
  fixture(patch);
  const start = addDays(toDayStart(new Date()), 7);
  const end = addDays(start, 3);
  const ad: any = { ...requestDoc(), isActive: false, startDate: start, endDate: end, expiresAt: end, toObject() { return { ...this }; } };
  patch(ShopAd, "findById", () => query(ad));
  patch(SellerAdRequest, "updateMany", async () => ({}));
  await call(updateShopAd, { isActive: true });
  assert.equal(ad.startDate.getTime(), start.getTime());
  assert.equal(ad.endDate.getTime(), end.getTime());
}));
test("historical seller status is reconciled with disabled and removed ads", async () => mocked(async patch => {
  const updatedAt = new Date();
  patch(SellerAdRequest, "aggregate", async () => [
    { _id: "paused", status: "Live", updatedAt, ad: { isActive: false, expiresAt: addDays(updatedAt, 7) } },
    { _id: "deleted", status: "Live", updatedAt },
  ]);
  let changes: any[] = [];
  patch(SellerAdRequest, "bulkWrite", async (operations: any[]) => { changes = operations; });
  await refreshAdStatuses();
  assert.equal(changes[0].updateOne.update.$set.status, "Paused");
  assert.equal(changes[1].updateOne.update.$set.status, "Removed");
  assert.equal(changes[0].updateOne.filter.updatedAt, updatedAt);
}));
test("deleting an ad updates seller status without altering paid history", async () => mocked(async patch => {
  fixture(patch);
  let removed = false;
  const ad: any = { _id: new mongoose.Types.ObjectId(), deleteOne: async () => { removed = true; } };
  patch(ShopAd, "findById", () => query(ad));
  patch(SellerAdRequest, "updateMany", async (_filter: any, update: any) => { assert.equal(update.$set.status, "Removed"); assert.equal(update.$set.paymentStatus, undefined); });
  await call(deleteShopAd);
  assert.equal(removed, true);
}));
test("seller input is validated before reserving capacity or writing documents", async () => {
  await assert.rejects(call(createAdRequest, { shopName: "Shop", tagline: "Ad", imageUrl: "https://example.com/ad.jpg", durationDays: 999999, startDate: "2026-10-15" }), /Duration/);
  await assert.rejects(call(submitPaymentProof, { paymentMethod: "Razorpay", paymentReference: "fake" }), /Pay Online/);
});
test("ad status correctly distinguishes disabled, future and elapsed ads", () => {
  const now = new Date();
  assert.equal(adStatus({ isActive: false, endDate: addDays(now, 1) }, now), "Paused");
  assert.equal(adStatus({ isActive: true, startDate: addDays(now, 1), endDate: addDays(now, 2) }, now), "Scheduled");
  assert.equal(adStatus({ isActive: true, endDate: now }, now), "Expired");
});
test("transaction errors propagate without successful completion", async () => mocked(async patch => {
  fixture(patch);
  await assert.rejects(withAdTransaction(async () => { throw new Error("booking failed"); }), /booking failed/);
}));
