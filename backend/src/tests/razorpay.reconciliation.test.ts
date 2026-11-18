/**
 * Razorpay safety net when /verify never reaches the server:
 *  - webhook returns honest HTTP status codes
 *  - reconcileRazorpayIntent credits captured payments found at the gateway
 *  - subscription / courier intents are recovered idempotently
 *  - abandoned-order sweep consults Razorpay before cancelling
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_reconcile";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "reconcile_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "reconcile_wh_secret";

const BE = path.join(process.cwd(), "src");
const code = (rel: string) => fs.readFileSync(path.join(BE, rel), "utf8");

/** Temporarily replace methods; restored after the callback. */
async function withPatches(patches: Array<[any, string, any]>, fn: () => Promise<void>) {
  const originals = patches.map(([obj, key]) => [obj, key, obj[key]] as const);
  try {
    for (const [obj, key, value] of patches) obj[key] = value;
    await fn();
  } finally {
    for (const [obj, key, value] of originals) obj[key] = value;
  }
}

const captured = (orderId: string, rupees: number, id = "pay_reconcile_1") => ({
  id, order_id: orderId, status: "captured", currency: "INR", amount: Math.round(rupees * 100), method: "upi",
});

// ─── Webhook status codes ────────────────────────────────────────────────────
test("Webhook: invalid signature is reported as 400, not a silent 200", async () => {
  const { handleWebhook } = await import("../services/paymentService");
  const res = await handleWebhook(Buffer.from('{"event":"payment.captured"}'), "bad-signature");
  assert.equal(res.success, false);
  assert.equal(res.statusCode, 400);
});

test("Webhook: missing webhook secret is reported as 503 so Razorpay retries", async () => {
  const { handleWebhook } = await import("../services/paymentService");
  const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  try {
    const res = await handleWebhook(Buffer.from("{}"), "any");
    assert.equal(res.success, false);
    assert.equal(res.statusCode, 503);
  } finally {
    process.env.RAZORPAY_WEBHOOK_SECRET = saved;
  }
});

test("Webhook: a correctly signed event is acknowledged with 200", async () => {
  const { handleWebhook } = await import("../services/paymentService");
  const raw = Buffer.from(JSON.stringify({ event: "order.paid.unhandled", payload: {} }));
  const sig = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest("hex");
  const res = await handleWebhook(raw, sig);
  assert.equal(res.success, true);
  assert.equal(res.statusCode, 200);
});

test("Webhook: global JSON parser skips the webhook so the raw body is signed", () => {
  const server = code("server.ts");
  assert.match(server, /isRazorpayWebhook\(req\) \? next\(\) : jsonParser/);
  assert.match(code("routes/paymentRoutes.ts"), /express\.raw\(/);
});

// ─── reconcileRazorpayIntent ─────────────────────────────────────────────────
test("Reconcile: an authorized (in-flight) payment is reported as in progress", async () => {
  const { reconcileRazorpayIntent } = await import("../services/paymentService");
  const res = await reconcileRazorpayIntent("order_inflight", undefined, {
    paymentsLister: async () => ({ items: [{ id: "pay_a", order_id: "order_inflight", status: "authorized" }] }),
  });
  assert.deepEqual(res, { captured: 0, inProgress: true });
});

test("Reconcile: captured payments are credited; failed / foreign ones ignored", async () => {
  const { reconcileRazorpayIntent } = await import("../services/paymentService");
  const Payment = (await import("../models/Payment")).default;
  const seen: string[] = [];
  await withPatches(
    [[Payment, "findOne", async (q: any) => {
      if (q.razorpayPaymentId) { seen.push(q.razorpayPaymentId); return { status: "Completed" }; }
      return null;
    }]],
    async () => {
      const res = await reconcileRazorpayIntent("order_x", undefined, {
        paymentsLister: async () => ({
          items: [
            { id: "pay_ok", order_id: "order_x", status: "captured" },
            { id: "pay_failed", order_id: "order_x", status: "failed" },
            { id: "pay_other", order_id: "order_other", status: "captured" },
          ],
        }),
      });
      assert.deepEqual(res, { captured: 1, inProgress: false });
      assert.deepEqual(seen, ["pay_ok"], "only the matching captured payment is processed");
    },
  );
});

// ─── Subscription / courier recovery ─────────────────────────────────────────
test("Recovery: a renewal paid without /verify activates the seller's subscription once", async () => {
  const { recoverNonOrderIntent } = await import("../services/razorpayIntentRecoveryService");
  const SubscriptionPayment = (await import("../models/SubscriptionPayment")).default;
  const SubscriptionPlan = (await import("../models/SubscriptionPlan")).default;
  const Seller = (await import("../models/Seller")).default;

  const planId = new mongoose.Types.ObjectId();
  const intent = { _id: new mongoose.Types.ObjectId(), razorpayOrderId: "order_sub_1", status: "PENDING", amount: 999, sellerMobile: "9876543210", planId };
  let saved = false;
  const seller: any = { _id: new mongoose.Types.ObjectId(), sellerName: "S", mobile: "9876543210", subscription: undefined, save: async () => { saved = true; } };
  let claimFilter: any = null;

  await withPatches(
    [
      [SubscriptionPayment, "findOne", async () => intent],
      [SubscriptionPayment, "findOneAndUpdate", async (filter: any) => { claimFilter = filter; return { ...intent, status: "SUCCESS" }; }],
      [Seller, "findOne", async () => seller],
      [SubscriptionPlan, "findById", async () => ({ _id: planId, name: "Monthly", price: 999, durationInDays: 30 })],
    ],
    async () => {
      const handled = await recoverNonOrderIntent("order_sub_1", "pay_sub_1", {
        paymentFetcher: async () => captured("order_sub_1", 999, "pay_sub_1"),
      });
      assert.equal(handled, true);
      assert.deepEqual(claimFilter, { razorpayOrderId: "order_sub_1", status: "PENDING" }, "atomic claim");
      assert.equal(saved, true);
      assert.equal(seller.subscription.status, "active");
      assert.equal(seller.subscription.razorpayPaymentId, "pay_sub_1");
    },
  );
});

test("Recovery: a signup payment already applied to the seller is never applied twice", async () => {
  const { recoverNonOrderIntent } = await import("../services/razorpayIntentRecoveryService");
  const SubscriptionPayment = (await import("../models/SubscriptionPayment")).default;
  const SubscriptionPlan = (await import("../models/SubscriptionPlan")).default;
  const Seller = (await import("../models/Seller")).default;

  const intent = { _id: new mongoose.Types.ObjectId(), razorpayOrderId: "order_signup", status: "PENDING", amount: 499, sellerMobile: "9123456780", planId: new mongoose.Types.ObjectId() };
  const seller: any = { _id: new mongoose.Types.ObjectId(), mobile: "9123456780", subscription: { razorpayOrderId: "order_signup", endDate: new Date(Date.now() + 864e5) }, save: async () => { throw new Error("must not save"); } };

  await withPatches(
    [
      [SubscriptionPayment, "findOne", async () => intent],
      [SubscriptionPayment, "findOneAndUpdate", async () => { throw new Error("must not claim"); }],
      [Seller, "findOne", async () => seller],
      [SubscriptionPlan, "findById", async () => ({ _id: intent.planId, name: "P", price: 499, durationInDays: 30 })],
    ],
    async () => {
      const handled = await recoverNonOrderIntent("order_signup", "pay_signup", {
        paymentFetcher: async () => captured("order_signup", 499, "pay_signup"),
      });
      assert.equal(handled, true);
    },
  );
});

test("Recovery: an underpaid subscription is rejected by gateway verification", async () => {
  const { recoverNonOrderIntent } = await import("../services/razorpayIntentRecoveryService");
  const SubscriptionPayment = (await import("../models/SubscriptionPayment")).default;
  const intent = { _id: new mongoose.Types.ObjectId(), razorpayOrderId: "order_sub_low", status: "PENDING", amount: 999, sellerMobile: "9876543210" };
  await withPatches(
    [[SubscriptionPayment, "findOne", async () => intent]],
    async () => {
      await assert.rejects(
        recoverNonOrderIntent("order_sub_low", "pay_low", { paymentFetcher: async () => captured("order_sub_low", 1, "pay_low") }),
        /less than the amount due/,
      );
    },
  );
});

test("Recovery: an already-settled courier deposit only clears the intent", async () => {
  const { recoverNonOrderIntent } = await import("../services/razorpayIntentRecoveryService");
  const SubscriptionPayment = (await import("../models/SubscriptionPayment")).default;
  const Delivery = (await import("../models/Delivery")).default;
  const WalletTransaction = (await import("../models/WalletTransaction")).default;

  const courierId = new mongoose.Types.ObjectId();
  let unsetFilter: any = null;
  await withPatches(
    [
      [SubscriptionPayment, "findOne", async () => null],
      [Delivery, "findOne", async () => ({ _id: courierId, codPayoutIntent: { razorpayOrderId: "order_cod_1", amount: 500 } })],
      [WalletTransaction, "findOne", async () => ({ reference: "PAYOUT-pay_cod_1" })], // already settled
      [Delivery, "updateOne", async (filter: any) => { unsetFilter = filter; return { modifiedCount: 1 }; }],
    ],
    async () => {
      const handled = await recoverNonOrderIntent("order_cod_1", "pay_cod_1", {
        paymentFetcher: async () => captured("order_cod_1", 500, "pay_cod_1"),
      });
      assert.equal(handled, true);
      assert.deepEqual(unsetFilter, { _id: courierId, "codPayoutIntent.razorpayOrderId": "order_cod_1" });
    },
  );
});

// ─── Wiring ──────────────────────────────────────────────────────────────────
test("Sweep: abandoned online orders are checked with Razorpay before cancelling", () => {
  const ctrl = code("modules/customer/controllers/customerOrderController.ts");
  const fn = ctrl.slice(ctrl.indexOf("export async function cleanupExpiredPendingOrders"));
  assert.ok(fn.indexOf("reconcileRazorpayIntent") > 0, "sweep must reconcile");
  assert.ok(fn.indexOf("reconcileRazorpayIntent") < fn.indexOf("cancelOrderLifecycle("), "reconcile before cancel");
});

test("create-order: a gateway-paid intent is reconciled instead of only erroring", () => {
  const routes = code("routes/paymentRoutes.ts");
  assert.match(routes, /result\.isPaid && loaded\.doc\.razorpayOrderId/);
  assert.match(routes, /reconcileRazorpayIntent\(/);
  assert.match(routes, /alreadyPaid: true/);
});

test("Webhook: unmatched intents fall back to subscription / courier recovery", () => {
  assert.match(code("services/paymentService.ts"), /recoverNonOrderIntent\(razorpayOrderId, razorpayPaymentId/);
});
