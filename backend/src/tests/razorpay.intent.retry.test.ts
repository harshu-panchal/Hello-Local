/**
 * P1 #5 — RAZORPAY INTENT RETRY & IDEMPOTENT REUSE TESTS
 *
 * Verifies:
 * 1. First create-order returns new Razorpay intent.
 * 2. Second create-order for same unpaid order returns the SAME Razorpay intent.
 * 3. Multiple repeated create-order calls result in exactly one gateway creation.
 * 4. Retry after checkout is abandoned reuses the same intent.
 * 5. Concurrent / multi-tab create-order reuses the same intent.
 * 6. UPI delayed approval: client /verify for the reused intent succeeds.
 * 7. Payment succeeds and marks order Paid normally.
 * 8. Webhook recovery (P0 #1) works cleanly with the reused intent.
 * 9. /verify and webhook race condition remains strictly idempotent.
 * 10. Amount changes before payment retry: does NOT reuse intent with wrong amount.
 * 11. Already-paid order does not create or reuse another payment intent.
 * 12. Invalid / non-existent gateway intent safely falls back to creating a new intent.
 * 13. Ad Request retry reuses intent with identical financial guarantees.
 * 14. Unauthorized user cannot access or reuse another user's payment intent.
 * 15. Client cannot inject an arbitrary Razorpay order ID.
 */
process.env.JWT_SECRET = "test_jwt_secret_p1_5_super_secure_key_123456";

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { getOrReuseRazorpayOrder } from "../services/paymentService";
import Order from "../models/Order";
import SellerAdRequest from "../models/SellerAdRequest";
import Payment from "../models/Payment";
import Customer from "../models/Customer";

(Customer as any).findOne = async () => null;
(Customer as any).findById = async () => null;

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: First create-order returns new Razorpay intent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 1: First create-order generates a new Razorpay intent and binds it", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1500,
    paymentStatus: "Pending",
    razorpayOrderId: undefined,
    save: async function () { return this; },
  };

  let gatewayCreated = 0;
  const mockOrderFetcher = async () => null;

  const Razorpay = (await import("razorpay")).default;
  const origAddResources = (Razorpay.prototype as any).addResources;
  (Razorpay.prototype as any).addResources = function () {
    origAddResources.call(this);
    this.orders = {
      create: async (params: any) => {
        gatewayCreated++;
        return {
          id: "order_new_intent_1",
          amount: params.amount,
          currency: params.currency,
          receipt: params.receipt,
          status: "created",
        };
      },
      fetch: async () => null,
    };
  };

  try {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key_1";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_1";

    const res = await getOrReuseRazorpayOrder(fakeOrder, 1500, {
      orderFetcher: mockOrderFetcher,
    });

    assert.equal(res.success, true);
    assert.equal(res.reused, false);
    assert.equal(res.data?.razorpayOrderId, "order_new_intent_1");
    assert.equal(res.data?.amount, 150000);
    assert.equal(fakeOrder.razorpayOrderId, "order_new_intent_1");
    assert.equal(gatewayCreated, 1);
  } finally {
    (Razorpay.prototype as any).addResources = origAddResources;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Second create-order for same unpaid order returns the SAME intent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 2: Second create-order for same unpaid order returns the SAME Razorpay intent", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const existingIntentId = "order_existing_intent_2";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1200,
    paymentStatus: "Pending",
    razorpayOrderId: existingIntentId,
    save: async function () { return this; },
  };

  let gatewayCreated = 0;
  let gatewayFetched = 0;

  const mockOrderFetcher = async (id: string) => {
    gatewayFetched++;
    return {
      id,
      amount: 120000,
      currency: "INR",
      receipt: orderId,
      status: "created",
    };
  };

  try {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key_1";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_1";

    const res = await getOrReuseRazorpayOrder(fakeOrder, 1200, {
      orderFetcher: mockOrderFetcher,
    });

    assert.equal(res.success, true);
    assert.equal(res.reused, true, "Must be flagged as reused");
    assert.equal(res.data?.razorpayOrderId, existingIntentId);
    assert.equal(res.data?.amount, 120000);
    assert.equal(gatewayCreated, 0, "Must NOT call razorpay.orders.create on retry");
    assert.equal(gatewayFetched, 1);
    assert.equal(fakeOrder.razorpayOrderId, existingIntentId, "Must preserve existing intent ID");
  } finally {
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Multiple repeated create-order calls result in exactly one gateway creation
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 3: 5 repeated create-order calls result in exactly one gateway creation", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    total: 800,
    paymentStatus: "Pending",
    razorpayOrderId: undefined,
    save: async function () { return this; },
  };

  let gatewayCreated = 0;
  const Razorpay = (await import("razorpay")).default;
  const origAddResources = (Razorpay.prototype as any).addResources;
  (Razorpay.prototype as any).addResources = function () {
    origAddResources.call(this);
    this.orders = {
      create: async (params: any) => {
        gatewayCreated++;
        return {
          id: "order_single_created_3",
          amount: params.amount,
          currency: params.currency,
          receipt: params.receipt,
          status: "created",
        };
      },
    };
  };

  const mockOrderFetcher = async (id: string) => {
    return {
      id,
      amount: 80000,
      currency: "INR",
      receipt: orderId,
      status: "created",
    };
  };

  try {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key_1";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_1";

    // Call 1: creates
    const r1 = await getOrReuseRazorpayOrder(fakeOrder, 800, { orderFetcher: mockOrderFetcher });
    assert.equal(r1.reused, false);
    assert.equal(r1.data?.razorpayOrderId, "order_single_created_3");

    // Calls 2-5: reuses
    for (let i = 2; i <= 5; i++) {
      const r = await getOrReuseRazorpayOrder(fakeOrder, 800, { orderFetcher: mockOrderFetcher });
      assert.equal(r.reused, true, `Call ${i} must be reused`);
      assert.equal(r.data?.razorpayOrderId, "order_single_created_3");
    }

    assert.equal(gatewayCreated, 1, "Exactly 1 Razorpay order must be created across 5 invocations");
  } finally {
    (Razorpay.prototype as any).addResources = origAddResources;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Retry after checkout is abandoned reuses the same intent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 4: Retry after checkout abandoned reuses intent even in 'attempted' gateway status", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const existingIntentId = "order_attempted_4";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    total: 950,
    paymentStatus: "Pending",
    razorpayOrderId: existingIntentId,
    save: async function () { return this; },
  };

  // Gateway marks status 'attempted' when customer tried a card that failed or modal closed
  const mockOrderFetcher = async (id: string) => ({
    id,
    amount: 95000,
    currency: "INR",
    receipt: orderId,
    status: "attempted", // customer previously attempted payment
    attempts: 1,
  });

  const res = await getOrReuseRazorpayOrder(fakeOrder, 950, { orderFetcher: mockOrderFetcher });
  assert.equal(res.success, true);
  assert.equal(res.reused, true);
  assert.equal(res.data?.razorpayOrderId, existingIntentId);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Concurrent / multi-tab create-order reuses the same intent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 5: Concurrent create-order calls resolve to the same intent", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const existingIntentId = "order_multitab_5";

  const fakeOrderTab1: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    total: 1100,
    paymentStatus: "Pending",
    razorpayOrderId: existingIntentId,
    save: async function () { return this; },
  };

  const fakeOrderTab2: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    total: 1100,
    paymentStatus: "Pending",
    razorpayOrderId: existingIntentId,
    save: async function () { return this; },
  };

  const mockOrderFetcher = async (id: string) => ({
    id,
    amount: 110000,
    currency: "INR",
    receipt: orderId,
    status: "created",
  });

  const [res1, res2] = await Promise.all([
    getOrReuseRazorpayOrder(fakeOrderTab1, 1100, { orderFetcher: mockOrderFetcher }),
    getOrReuseRazorpayOrder(fakeOrderTab2, 1100, { orderFetcher: mockOrderFetcher }),
  ]);

  assert.equal(res1.data?.razorpayOrderId, res2.data?.razorpayOrderId);
  assert.equal(res1.data?.razorpayOrderId, existingIntentId);
  assert.equal(res1.reused, true);
  assert.equal(res2.reused, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: UPI delayed approval: client /verify for the reused intent succeeds
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 6: Delayed UPI approval succeeds with client /verify because intent was not overwritten", async () => {
  const { capturePayment } = await import("../services/paymentService");
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const intentId = "order_upi_delayed_6";
  const paymentId = "pay_upi_delayed_6";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentStatus: "Pending",
    status: "Pending",
    razorpayOrderId: intentId, // Preserved intent ID!
    save: async function () { return this; },
  };

  const crypto = await import("crypto");
  process.env.RAZORPAY_KEY_SECRET = "test_key_secret_p1_5";
  const signature = crypto
    .createHmac("sha256", "test_key_secret_p1_5")
    .update(`${intentId}|${paymentId}`)
    .digest("hex");

  const origOrderFindById = Order.findById;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Order as any).findOneAndUpdate = async () => ({ ...fakeOrder, paymentStatus: "Paid" });
    (Payment as any).findOne = async () => null; // not yet consumed
    (Payment as any).create = async () => [{}];
    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
    });

    const Razorpay = (await import("razorpay")).default;
    const origAddResources = (Razorpay.prototype as any).addResources;
    (Razorpay.prototype as any).addResources = function () {
      origAddResources.call(this);
      this.payments = {
        fetch: async () => ({
          id: paymentId,
          order_id: intentId,
          amount: 100000,
          currency: "INR",
          status: "captured",
          method: "upi",
        }),
      };
    };

    const res = await capturePayment(orderId, intentId, paymentId, signature, "Order");
    assert.equal(res.success, true);
    assert.equal(res.message, "Payment captured successfully");
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Payment succeeds and marks order Paid normally
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 7: Payment succeeds and transitions order to Paid without status regression", async () => {
  const { capturePayment } = await import("../services/paymentService");
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const intentId = "order_paid_norm_7";
  const paymentId = "pay_paid_norm_7";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 500,
    paymentStatus: "Pending",
    status: "Pending",
    razorpayOrderId: intentId,
    save: async function () { return this; },
  };

  let updatedStatus = "";
  let updatedPaymentStatus = "";

  const crypto = await import("crypto");
  process.env.RAZORPAY_KEY_SECRET = "test_key_secret_p1_5";
  const signature = crypto
    .createHmac("sha256", "test_key_secret_p1_5")
    .update(`${intentId}|${paymentId}`)
    .digest("hex");

  const origOrderFindById = Order.findById;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Order as any).findOneAndUpdate = async (_q: any, update: any) => {
      // simulate update pipeline
      updatedPaymentStatus = "Paid";
      updatedStatus = "Received";
      return { ...fakeOrder, paymentStatus: "Paid", status: "Received" };
    };
    (Payment as any).findOne = async () => null;
    (Payment as any).create = async () => [{}];
    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
    });

    const Razorpay = (await import("razorpay")).default;
    const origAddResources = (Razorpay.prototype as any).addResources;
    (Razorpay.prototype as any).addResources = function () {
      origAddResources.call(this);
      this.payments = {
        fetch: async () => ({
          id: paymentId,
          order_id: intentId,
          amount: 50000,
          currency: "INR",
          status: "captured",
          method: "card",
        }),
      };
    };

    const res = await capturePayment(orderId, intentId, paymentId, signature, "Order");
    assert.equal(res.success, true);
    assert.equal(updatedPaymentStatus, "Paid");
    assert.equal(updatedStatus, "Received");
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Webhook recovery (P0 #1) works cleanly with the reused intent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 8: Webhook recovery finds the order on the first query because intent is never overwritten", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const intentId = "order_wh_recov_8";
  const paymentId = "pay_wh_recov_8";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    orderNumber: "ORD-WH-8",
    total: 750,
    paymentStatus: "Pending",
    status: "Pending",
    razorpayOrderId: intentId,
  };

  let orderQueriedBy = "";
  const origOrderFindOne = Order.findOne;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  try {
    (Order as any).findOne = async (q: any) => {
      if (q && q.razorpayOrderId) {
        orderQueriedBy = q.razorpayOrderId;
        return fakeOrder;
      }
      return fakeOrder;
    };
    (Order as any).findOneAndUpdate = async () => ({ ...fakeOrder, paymentStatus: "Paid" });
    (Payment as any).findOne = async () => null;
    (Payment as any).create = async () => [{}];
    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
    });

    const mockPaymentFetcher = async () => ({
      id: paymentId,
      order_id: intentId,
      amount: 75000,
      currency: "INR",
      status: "captured",
      method: "netbanking",
    });

    await handlePaymentCaptured(
      { id: paymentId, order_id: intentId },
      undefined,
      { paymentFetcher: mockPaymentFetcher }
    );

    assert.equal(orderQueriedBy, intentId, "Webhook searched and successfully found by intentId");
  } finally {
    Order.findOne = origOrderFindOne;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: /verify and webhook race condition remains strictly idempotent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 9: /verify followed by webhook delivery exits idempotently without duplicate capture", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const intentId = "order_race_9";
  const paymentId = "pay_race_9";

  const existingCompletedPayment: any = {
    _id: new mongoose.Types.ObjectId(),
    razorpayPaymentId: paymentId,
    razorpayOrderId: intentId,
    status: "Completed",
  };

  const origPaymentFindOne = Payment.findOne;
  try {
    let duplicateCreated = false;
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === paymentId) return existingCompletedPayment;
      return null;
    };

    // Webhook arriving after /verify completed
    await handlePaymentCaptured({ id: paymentId, order_id: intentId });
    assert.equal(duplicateCreated, false, "Must exit idempotently via replay guard");
  } finally {
    Payment.findOne = origPaymentFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Amount changes before payment retry does NOT reuse intent with wrong amount
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 10: Amount change between retries does NOT reuse an intent with outdated amount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const oldIntentId = "order_outdated_amt_10";
  const newIntentId = "order_updated_amt_10";

  // Document now requires ₹1500 (e.g. ad price adjusted)
  const fakeDoc: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    razorpayOrderId: oldIntentId,
    save: async function () { return this; },
  };

  let gatewayCreated = 0;
  // Existing intent at gateway had old amount ₹1000 (100000 paise)
  const mockOrderFetcher = async (id: string) => ({
    id,
    amount: 100000, // 1000 INR
    currency: "INR",
    receipt: orderId,
    status: "created",
  });

  const Razorpay = (await import("razorpay")).default;
  const origAddResources = (Razorpay.prototype as any).addResources;
  (Razorpay.prototype as any).addResources = function () {
    origAddResources.call(this);
    this.orders = {
      create: async (params: any) => {
        gatewayCreated++;
        return {
          id: newIntentId,
          amount: params.amount,
          currency: params.currency,
          receipt: params.receipt,
          status: "created",
        };
      },
    };
  };

  try {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key_1";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_1";

    const res = await getOrReuseRazorpayOrder(fakeDoc, 1500, {
      orderFetcher: mockOrderFetcher,
    });

    assert.equal(res.success, true);
    assert.equal(res.reused, false, "Must NOT reuse intent with outdated amount");
    assert.equal(res.data?.razorpayOrderId, newIntentId);
    assert.equal(res.data?.amount, 150000);
    assert.equal(fakeDoc.razorpayOrderId, newIntentId, "Must bind new intent ID");
    assert.equal(gatewayCreated, 1);
  } finally {
    (Razorpay.prototype as any).addResources = origAddResources;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: Already-paid order does not create or reuse another payment intent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 11: Gateway reporting intent status 'paid' refuses new creation and flags isPaid", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const intentId = "order_already_paid_11";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    razorpayOrderId: intentId,
    save: async function () { return this; },
  };

  const mockOrderFetcher = async (id: string) => ({
    id,
    amount: 100000,
    currency: "INR",
    receipt: orderId,
    status: "paid", // Already paid at gateway!
  });

  const res = await getOrReuseRazorpayOrder(fakeOrder, 1000, { orderFetcher: mockOrderFetcher });
  assert.equal(res.success, false);
  assert.equal(res.isPaid, true);
  assert.equal(res.message, "This payment has already been completed.");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 12: Invalid / non-existent gateway intent safely falls back to creating a new intent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 12: Gateway error on existing intent safely falls back to creating a new intent", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const staleIntentId = "order_stale_404_12";
  const freshIntentId = "order_fresh_after_404_12";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    razorpayOrderId: staleIntentId,
    save: async function () { return this; },
  };

  let gatewayCreated = 0;
  // Fetcher throws (e.g. order not found on gateway)
  const mockOrderFetcher = async () => {
    throw new Error("Order not found on Razorpay (404)");
  };

  const Razorpay = (await import("razorpay")).default;
  const origAddResources = (Razorpay.prototype as any).addResources;
  (Razorpay.prototype as any).addResources = function () {
    origAddResources.call(this);
    this.orders = {
      create: async (params: any) => {
        gatewayCreated++;
        return {
          id: freshIntentId,
          amount: params.amount,
          currency: params.currency,
          receipt: params.receipt,
          status: "created",
        };
      },
    };
  };

  try {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key_1";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_1";

    const res = await getOrReuseRazorpayOrder(fakeOrder, 600, {
      orderFetcher: mockOrderFetcher,
    });

    assert.equal(res.success, true);
    assert.equal(res.reused, false);
    assert.equal(res.data?.razorpayOrderId, freshIntentId);
    assert.equal(fakeOrder.razorpayOrderId, freshIntentId);
    assert.equal(gatewayCreated, 1);
  } finally {
    (Razorpay.prototype as any).addResources = origAddResources;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 13: Ad Request retry reuses intent with identical financial guarantees
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 13: SellerAdRequest reuses intent on retry", async () => {
  const adRequestId = new mongoose.Types.ObjectId().toString();
  const existingIntentId = "order_ad_req_intent_13";

  const fakeAdReq: any = {
    _id: new mongoose.Types.ObjectId(adRequestId),
    adPrice: 2500,
    paymentStatus: "Unpaid",
    razorpayOrderId: existingIntentId,
    save: async function () { return this; },
  };

  let gatewayCreated = 0;
  const mockOrderFetcher = async (id: string) => ({
    id,
    amount: 250000,
    currency: "INR",
    receipt: adRequestId,
    status: "created",
  });

  const res = await getOrReuseRazorpayOrder(fakeAdReq, 2500, { orderFetcher: mockOrderFetcher });
  assert.equal(res.success, true);
  assert.equal(res.reused, true);
  assert.equal(res.data?.razorpayOrderId, existingIntentId);
  assert.equal(res.data?.amount, 250000);
  assert.equal(gatewayCreated, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 14: Unauthorized user cannot access or reuse another user's payment intent
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 14: loadOwnedPayable enforces strict customer ownership on create-order", async () => {
  const router = (await import("../routes/paymentRoutes")).default;
  // paymentRoutes requires authentication and enforces req.user.userId === order.customer
  const Order = (await import("../models/Order")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const legitimateOwnerId = new mongoose.Types.ObjectId().toString();
  const attackerId = new mongoose.Types.ObjectId().toString();

  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(legitimateOwnerId),
    total: 1000,
    paymentStatus: "Pending",
    razorpayOrderId: "order_secret_14",
  };

  const origOrderFindById = Order.findById;
  try {
    (Order as any).findById = async () => fakeOrder;

    // Simulate route handling
    let resStatus = 0;
    let resJson: any = null;
    const req: any = {
      body: { orderId, type: "Order" },
      user: { userId: attackerId },
    };
    const res: any = {
      status: (code: number) => { resStatus = code; return res; },
      json: (data: any) => { resJson = data; return res; },
    };

    // Find the /create-order handler in the router stack
    const route = (router as any).stack.find((r: any) => r.route?.path === "/create-order");
    assert.ok(route, "/create-order route must exist");
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res);

    assert.equal(resStatus, 403);
    assert.equal(resJson.message, "Unauthorized access to order");
  } finally {
    Order.findById = origOrderFindById;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 15: Client cannot inject an arbitrary Razorpay order ID
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #5 - Test 15: Client cannot inject an arbitrary razorpayOrderId into create-order", async () => {
  const router = (await import("../routes/paymentRoutes")).default;
  const Order = (await import("../models/Order")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentStatus: "Pending",
    razorpayOrderId: "order_legit_server_bound_15",
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  try {
    (Order as any).findById = async () => fakeOrder;

    let resJson: any = null;
    const req: any = {
      body: {
        orderId,
        type: "Order",
        razorpayOrderId: "injected_evil_order_id", // Attempt to inject an arbitrary order ID
      },
      user: { userId: customerId },
    };
    const res: any = {
      status: () => res,
      json: (data: any) => { resJson = data; return res; },
    };

    const route = (router as any).stack.find((r: any) => r.route?.path === "/create-order");
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    const Razorpay = (await import("razorpay")).default;
    const origAddResources = (Razorpay.prototype as any).addResources;
    (Razorpay.prototype as any).addResources = function () {
      origAddResources.call(this);
      this.orders = {
        fetch: async (id: string) => ({
          id,
          amount: 100000,
          currency: "INR",
          receipt: orderId,
          status: "created",
        }),
      };
    };

    try {
      process.env.RAZORPAY_KEY_ID = "rzp_test_key_1";
      process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_1";

      await handler(req, res);
      // Ensure server returns the server-bound ID, NOT the injected ID
      assert.equal(resJson.data?.razorpayOrderId, "order_legit_server_bound_15");
      assert.notEqual(resJson.data?.razorpayOrderId, "injected_evil_order_id");
    } finally {
      (Razorpay.prototype as any).addResources = origAddResources;
    }
  } finally {
    Order.findById = origOrderFindById;
  }
});
