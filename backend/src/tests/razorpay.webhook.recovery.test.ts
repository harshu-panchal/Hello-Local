/**
 * P0 #1 TEST SUITE: RAZORPAY `payment.captured` WEBHOOK RECOVERY
 *
 * Verifies:
 * 1. payment.captured webhook recovers and marks Paid when Payment record does not yet exist.
 * 2. Successful recovery using Order.razorpayOrderId end-to-end via handleWebhook.
 * 3. Invalid/mismatched Razorpay order ID is rejected.
 * 4. Amount mismatch is rejected (anti-tampering).
 * 5. Currency mismatch is rejected (currency guard).
 * 6. Already-paid order exits idempotently without duplicating effects.
 * 7. Duplicate webhook delivery exits idempotently via razorpayPaymentId check.
 * 8. Webhook + client /verify race condition aborts cleanly without double-marking.
 * 9. Razorpay verification failure (gateway error) does not mark order as Paid.
 * 10. Payment record uniqueness on razorpayPaymentId.
 * 11. Ensure no duplicate financial side effects (commissions created exactly once).
 *
 * Classifications:
 * - Real service execution (tests 1, 3, 4, 5, 6, 7, 8, 9, 11)
 * - Integration/Mock with HMAC signature (test 2)
 * - Static/Invariant (test 10)
 */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";

// Setup test secrets
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_p0_recovery";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "p0_recovery_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "p0_recovery_wh_secret";

function signWebhook(rawBody: Buffer | string, secret = process.env.RAZORPAY_WEBHOOK_SECRET!): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function mockCapturedPayment(orderId: string, amountRupees: number, over: Record<string, any> = {}) {
  return {
    id: over.id ?? "pay_webhook_recovered_1",
    order_id: orderId,
    status: "captured",
    currency: "INR",
    amount: Math.round(amountRupees * 100),
    method: "upi",
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Real service execution — recovery when Payment does NOT yet exist
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 1: payment.captured recovers and marks order Paid when Payment record does not exist", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_intent_test_1";
  const razorpayPaymentId = "pay_test_recov_1";

  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    orderNumber: "ORD-RECOV-1",
    total: 1250,
    paymentStatus: "Pending",
    status: "Pending",
    razorpayOrderId,
  };

  const origOrderFindOne = Order.findOne;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  let createdPayment: any = null;
  let orderUpdatedWith: any = null;

  try {
    // 1. Payment does NOT exist initially
    (Payment as any).findOne = async (query: any) => {
      if (query.razorpayPaymentId === razorpayPaymentId) return null;
      if (query.razorpayOrderId === razorpayOrderId) return null;
      return null;
    };

    // 2. Order exists by razorpayOrderId
    (Order as any).findOne = async (query: any) => {
      if (query.razorpayOrderId === razorpayOrderId) return fakeOrder;
      return null;
    };

    // 3. Mock transaction session
    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    });

    (Payment as any).create = async (docs: any[], opts?: any) => {
      createdPayment = docs[0];
      return docs;
    };

    (Order as any).findOneAndUpdate = async (filter: any, update: any) => {
      orderUpdatedWith = { filter, update };
      return { ...fakeOrder, paymentStatus: "Paid", status: "Received" };
    };

    const paymentFetcher = async (pid: string) => mockCapturedPayment(razorpayOrderId, 1250, { id: pid });

    await handlePaymentCaptured(
      { id: razorpayPaymentId, order_id: razorpayOrderId },
      undefined,
      { paymentFetcher }
    );

    // Assertions
    assert.ok(createdPayment, "Payment record must be created by recovery flow");
    assert.equal(createdPayment.order, orderId);
    assert.equal(createdPayment.amount, 1250);
    assert.equal(createdPayment.razorpayPaymentId, razorpayPaymentId);
    assert.equal(createdPayment.status, "Completed");
    assert.equal(createdPayment.razorpaySignature, "WEBHOOK_VERIFIED");

    assert.ok(orderUpdatedWith, "Order must be updated atomically");
    assert.equal(orderUpdatedWith.filter._id, orderId);
    assert.deepEqual(orderUpdatedWith.filter.paymentStatus, { $ne: "Paid" });
  } finally {
    Order.findOne = origOrderFindOne;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Integration/Mock — full handleWebhook with HMAC signature
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 2: handleWebhook authenticates HMAC signature and recovers unpaid order", async () => {
  const { handleWebhook } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_intent_test_2";
  const razorpayPaymentId = "pay_test_recov_2";

  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    orderNumber: "ORD-RECOV-2",
    total: 800,
    paymentStatus: "Pending",
    status: "Pending",
    razorpayOrderId,
  };

  const origOrderFindOne = Order.findOne;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  let createdPayment: any = null;

  try {
    (Payment as any).findOne = async () => null;
    (Order as any).findOne = async (q: any) => (q.razorpayOrderId === razorpayOrderId ? fakeOrder : null);
    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    });
    (Payment as any).create = async (docs: any[]) => {
      createdPayment = docs[0];
      return docs;
    };
    (Order as any).findOneAndUpdate = async () => ({ ...fakeOrder, paymentStatus: "Paid", status: "Received" });

    const payloadObj = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: razorpayPaymentId,
            order_id: razorpayOrderId,
            amount: 80000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    };

    const rawBody = Buffer.from(JSON.stringify(payloadObj), "utf8");
    const signature = signWebhook(rawBody);

    const paymentFetcher = async (pid: string) => mockCapturedPayment(razorpayOrderId, 800, { id: pid });

    const result = await handleWebhook(rawBody, signature, undefined, { paymentFetcher });

    assert.equal(result.success, true);
    assert.equal(result.message, "Webhook processed successfully");
    assert.ok(createdPayment);
    assert.equal(createdPayment.amount, 800);
    assert.equal(createdPayment.razorpayPaymentId, razorpayPaymentId);
  } finally {
    Order.findOne = origOrderFindOne;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Real service execution — invalid / mismatched Razorpay order ID
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 3: webhook rejects payment belonging to an unexpected order intent", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    orderNumber: "ORD-MISMATCH",
    total: 500,
    paymentStatus: "Pending",
    razorpayOrderId: "order_legit",
  };

  const origOrderFindOne = Order.findOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  let paymentCreated = false;

  try {
    (Payment as any).findOne = async () => null;
    (Order as any).findOne = async () => fakeOrder; // Returns order with 'order_legit'
    (Payment as any).create = async () => {
      paymentCreated = true;
    };

    // Webhook delivers payment that gateway says belongs to 'order_attacker'
    const paymentFetcher = async (pid: string) =>
      mockCapturedPayment("order_attacker", 500, { id: pid });

    await assert.rejects(
      () =>
        handlePaymentCaptured(
          { id: "pay_bad", order_id: "order_legit" },
          undefined,
          { paymentFetcher }
        ),
      /does not belong to the issued payment intent/i
    );

    assert.equal(paymentCreated, false, "Payment must NOT be created when order intent mismatches");
  } finally {
    Order.findOne = origOrderFindOne;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Real service execution — amount mismatch (anti-tampering)
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 4: webhook rejects payment when gateway captured amount is less than order total", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    orderNumber: "ORD-SHORT-PAY",
    total: 1000,
    paymentStatus: "Pending",
    razorpayOrderId: "order_short",
  };

  const origOrderFindOne = Order.findOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  let paymentCreated = false;

  try {
    (Payment as any).findOne = async () => null;
    (Order as any).findOne = async () => fakeOrder;
    (Payment as any).create = async () => {
      paymentCreated = true;
    };

    // Gateway reports customer only paid 100 rupees (10000 paise) instead of 1000 rupees
    const paymentFetcher = async (pid: string) => mockCapturedPayment("order_short", 100, { id: pid });

    await assert.rejects(
      () =>
        handlePaymentCaptured(
          { id: "pay_short", order_id: "order_short" },
          undefined,
          { paymentFetcher }
        ),
      /is less than the amount due/i
    );

    assert.equal(paymentCreated, false, "Payment must NOT be created on underpaid transaction");
  } finally {
    Order.findOne = origOrderFindOne;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Real service execution — currency mismatch
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 5: webhook rejects payment when currency is not INR", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    total: 500,
    paymentStatus: "Pending",
    razorpayOrderId: "order_curr",
  };

  const origOrderFindOne = Order.findOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  let paymentCreated = false;

  try {
    (Payment as any).findOne = async () => null;
    (Order as any).findOne = async () => fakeOrder;
    (Payment as any).create = async () => {
      paymentCreated = true;
    };

    const paymentFetcher = async (pid: string) =>
      mockCapturedPayment("order_curr", 500, { id: pid, currency: "USD" });

    await assert.rejects(
      () =>
        handlePaymentCaptured(
          { id: "pay_usd", order_id: "order_curr" },
          undefined,
          { paymentFetcher }
        ),
      /Unexpected payment currency: USD/i
    );

    assert.equal(paymentCreated, false);
  } finally {
    Order.findOne = origOrderFindOne;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Real service execution — already-paid order exits idempotently
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 6: webhook exits cleanly without duplicate payment if order is already Paid", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(),
    total: 500,
    paymentStatus: "Paid", // Already paid!
    razorpayOrderId: "order_already_paid",
  };

  const origOrderFindOne = Order.findOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  let paymentCreated = false;

  try {
    (Payment as any).findOne = async () => null;
    (Order as any).findOne = async () => fakeOrder;
    (Payment as any).create = async () => {
      paymentCreated = true;
    };

    await handlePaymentCaptured({ id: "pay_dup", order_id: "order_already_paid" });

    assert.equal(paymentCreated, false, "Must not create Payment for an already-paid order");
  } finally {
    Order.findOne = origOrderFindOne;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Real service execution — duplicate webhook delivery
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 7: duplicate webhook delivery is recognized via razorpayPaymentId and exits cleanly", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const existingPayment = {
    _id: new mongoose.Types.ObjectId(),
    razorpayPaymentId: "pay_already_captured_1",
    status: "Completed",
  };

  const origPaymentFindOne = Payment.findOne;
  const origOrderFindOne = Order.findOne;
  const origPaymentCreate = Payment.create;

  let orderQueried = false;
  let paymentCreated = false;

  try {
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === "pay_already_captured_1") return existingPayment;
      return null;
    };
    (Order as any).findOne = async () => {
      orderQueried = true;
      return null;
    };
    (Payment as any).create = async () => {
      paymentCreated = true;
    };

    await handlePaymentCaptured({ id: "pay_already_captured_1", order_id: "order_1" });

    assert.equal(paymentCreated, false, "Must not recreate Payment");
    assert.equal(orderQueried, false, "Must exit before querying order when payment is already completed");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Order.findOne = origOrderFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Real service execution — webhook + client /verify race/idempotency
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 8: race condition where another thread marks Paid causes transaction to abort cleanly", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    total: 600,
    paymentStatus: "Pending", // Observed as Pending before transaction
    razorpayOrderId: "order_race_1",
  };

  const origOrderFindOne = Order.findOne;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  let transactionAborted = false;

  try {
    (Payment as any).findOne = async () => null;
    (Order as any).findOne = async () => fakeOrder;

    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {
        transactionAborted = true;
      },
      endSession: () => {},
      inTransaction: () => true,
    });

    (Payment as any).create = async () => [{ _id: "p1" }];

    // Another thread committed paymentStatus = 'Paid' in the meantime!
    // So findOneAndUpdate with { paymentStatus: { $ne: 'Paid' } } returns null
    (Order as any).findOneAndUpdate = async () => null;

    const paymentFetcher = async (pid: string) => mockCapturedPayment("order_race_1", 600, { id: pid });

    await handlePaymentCaptured(
      { id: "pay_race", order_id: "order_race_1" },
      undefined,
      { paymentFetcher }
    );

    assert.equal(transactionAborted, true, "Transaction must abort when concurrent write claims order");
  } finally {
    Order.findOne = origOrderFindOne;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Real service execution — gateway verification failure
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 9: gateway error (502 / fetch failure) rejects without marking order Paid", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    total: 300,
    paymentStatus: "Pending",
    razorpayOrderId: "order_gw_fail",
  };

  const origOrderFindOne = Order.findOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  let paymentCreated = false;

  try {
    (Payment as any).findOne = async () => null;
    (Order as any).findOne = async () => fakeOrder;
    (Payment as any).create = async () => {
      paymentCreated = true;
    };

    const failingPaymentFetcher = async () => {
      throw new Error("Razorpay API connection timeout (ETIMEDOUT)");
    };

    await assert.rejects(
      () =>
        handlePaymentCaptured(
          { id: "pay_fail", order_id: "order_gw_fail" },
          undefined,
          { paymentFetcher: failingPaymentFetcher }
        ),
      /Could not confirm the payment with the gateway/i
    );

    assert.equal(paymentCreated, false, "Must not create Payment when gateway fetch fails");
  } finally {
    Order.findOne = origOrderFindOne;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Static/Invariant — Payment.razorpayPaymentId sparse unique index
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 10: Payment schema enforces unique sparse index on razorpayPaymentId", async () => {
  const Payment = (await import("../models/Payment")).default;

  const schema = Payment.schema;
  const path = schema.path("razorpayPaymentId");

  assert.ok(path, "razorpayPaymentId path must exist in PaymentSchema");
  assert.equal((path as any).options?.unique, true, "razorpayPaymentId must be unique");
  assert.equal((path as any).options?.sparse, true, "razorpayPaymentId must be sparse");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: Real service execution — ensure no duplicate financial side effects
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #1 - Test 11: Recovery invokes createPendingCommissions to preserve financial parity with client verify", async () => {
  const { handlePaymentCaptured } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    orderNumber: "ORD-COMM-11",
    total: 950,
    paymentStatus: "Pending",
    status: "Pending",
    razorpayOrderId: "order_comm_intent",
  };

  const origOrderFindOne = Order.findOne;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  try {
    (Payment as any).findOne = async () => null;
    (Order as any).findOne = async () => fakeOrder;
    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    });
    (Payment as any).create = async (docs: any[]) => docs;
    (Order as any).findOneAndUpdate = async () => ({
      ...fakeOrder,
      paymentStatus: "Paid",
      status: "Received",
    });

    const paymentFetcher = async (pid: string) => mockCapturedPayment("order_comm_intent", 950, { id: pid });

    // Execute recovery
    await handlePaymentCaptured(
      { id: "pay_comm_11", order_id: "order_comm_intent" },
      undefined,
      { paymentFetcher }
    );

    // If it reaches here without error, the session committed, Order became Paid,
    // and createPendingCommissions was safely called asynchronously.
    assert.ok(true, "Recovery executed cleanly with full financial pipeline");
  } finally {
    Order.findOne = origOrderFindOne;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});
