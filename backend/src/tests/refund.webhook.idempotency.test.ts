/**
 * P1 #8 — REFUND WEBHOOK DOUBLE-COUNT GUARD & IDEMPOTENCY TESTS
 * 
 * Verifies:
 * 1. Locally initiated refund + refund.created webhook produces zero additional financial effect.
 * 2. Locally initiated refund + refund.processed webhook produces zero additional financial effect.
 * 3. Both refund.created and refund.processed received sequentially do not double-count.
 * 4. Duplicate refund.created webhooks (retries) exit idempotently.
 * 5. Duplicate refund.processed webhooks exit idempotently.
 * 6. Webhook arriving after local refund was already recorded exits idempotently.
 * 7. Two different legitimate partial refunds (Return A rfnd_1, Return B rfnd_2) accumulate correctly.
 * 8. Cumulative totalRefunded remains mathematically exact across multiple webhook arrivals.
 * 9. Final partial refund correctly transitions state to "Refunded".
 * 10. Webhook cannot cause totalRefunded to exceed original payment amount (over-refund guard).
 * 11. Existing Step 1 commission clawback is unaffected and remains exactly once.
 * 12. Existing P0 #4 crash/retry recovery remains intact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { handleWebhook } from "../services/paymentService";
import Payment from "../models/Payment";
import Order from "../models/Order";
import Refund from "../models/Refund";

const WEBHOOK_SECRET = "test_refund_wh_secret_p1_8";

function makeSignedPayload(event: string, payload: any): { rawBody: Buffer; signature: string } {
  const body = {
    event,
    payload,
  };
  const rawBody = Buffer.from(JSON.stringify(body), "utf8");
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  return { rawBody, signature };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Locally initiated refund + refund.created webhook
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 1: Locally initiated refund + refund.created webhook does not increment totalRefunded twice", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayPaymentId = "pay_loc_created_1";
  const razorpayRefundId = "rfnd_loc_created_1";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 1000,
    status: "PartiallyRefunded",
    razorpayPaymentId,
    totalRefunded: 400, // Locally recorded
    refundAmount: 400,
    save: async function () { return this; },
  };

  const existingCompletedRefund: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    payment: fakePayment._id,
    amount: 400,
    status: "Completed",
    refundTransactionId: razorpayRefundId,
  };

  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  try {
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === razorpayPaymentId) return fakePayment;
      return null;
    };
    (Refund as any).findOne = async (q: any) => {
      if (q.refundTransactionId === razorpayRefundId) return existingCompletedRefund;
      return null;
    };
    let orderUpdated = false;
    (Order as any).findByIdAndUpdate = async () => {
      orderUpdated = true;
      return {};
    };

    const { rawBody, signature } = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: razorpayRefundId, payment_id: razorpayPaymentId, amount: 40000 } },
    });

    const res = await handleWebhook(rawBody, signature);
    assert.equal(res.success, true);
    assert.equal(fakePayment.totalRefunded, 400, "totalRefunded must NOT increase; already accounted for locally");
    assert.equal(fakePayment.status, "PartiallyRefunded");
    assert.equal(orderUpdated, false, "Order must not be re-updated if already recorded");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Locally initiated refund + refund.processed webhook
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 2: Locally initiated refund + refund.processed webhook does not increment totalRefunded twice", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const orderId = new mongoose.Types.ObjectId().toString();
  const razorpayPaymentId = "pay_loc_proc_2";
  const razorpayRefundId = "rfnd_loc_proc_2";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    amount: 1000,
    status: "PartiallyRefunded",
    razorpayPaymentId,
    totalRefunded: 400,
    refundAmount: 400,
    save: async function () { return this; },
  };

  const existingCompletedRefund: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    payment: fakePayment._id,
    amount: 400,
    status: "Completed",
    refundTransactionId: razorpayRefundId,
  };

  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;

  try {
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === razorpayPaymentId) return fakePayment;
      return null;
    };
    (Refund as any).findOne = async (q: any) => {
      if (q.refundTransactionId === razorpayRefundId) return existingCompletedRefund;
      return null;
    };

    const { rawBody, signature } = makeSignedPayload("refund.processed", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: razorpayRefundId, payment_id: razorpayPaymentId, amount: 40000 } },
    });

    const res = await handleWebhook(rawBody, signature);
    assert.equal(res.success, true);
    assert.equal(fakePayment.totalRefunded, 400, "refund.processed must not increment totalRefunded");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Both refund.created and refund.processed arriving sequentially
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 3: External refund receiving refund.created then refund.processed increments totalRefunded EXACTLY once", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayPaymentId = "pay_ext_seq_3";
  const razorpayRefundId = "rfnd_ext_seq_3";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 1000,
    status: "Completed",
    razorpayPaymentId,
    totalRefunded: 0,
    refundAmount: 0,
    save: async function () { return this; },
  };

  const savedRefunds: any[] = [];
  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  try {
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === razorpayPaymentId) return fakePayment;
      return null;
    };
    (Refund as any).findOne = async (q: any) => {
      return savedRefunds.find(r => r.refundTransactionId === q.refundTransactionId) || null;
    };
    (Refund as any).create = async (doc: any) => {
      const created = { ...doc, _id: new mongoose.Types.ObjectId(), save: async () => {} };
      savedRefunds.push(created);
      return created;
    };
    (Order as any).findByIdAndUpdate = async () => ({});

    // 1. First webhook: refund.created for ₹350
    const firstEvent = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: razorpayRefundId, payment_id: razorpayPaymentId, amount: 35000 } },
    });
    await handleWebhook(firstEvent.rawBody, firstEvent.signature);

    assert.equal(fakePayment.totalRefunded, 350, "First webhook must record ₹350 refund");
    assert.equal(fakePayment.status, "PartiallyRefunded");
    assert.equal(savedRefunds.length, 1, "Must create 1 Refund tracking document");

    // 2. Second webhook: refund.processed for same refund ID
    const secondEvent = makeSignedPayload("refund.processed", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: razorpayRefundId, payment_id: razorpayPaymentId, amount: 35000 } },
    });
    await handleWebhook(secondEvent.rawBody, secondEvent.signature);

    assert.equal(fakePayment.totalRefunded, 350, "Second webhook must NOT increase totalRefunded");
    assert.equal(savedRefunds.length, 1, "Must not create duplicate Refund document");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Duplicate refund.created (retry)
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 4: Multiple retry deliveries of refund.created are idempotent", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const razorpayPaymentId = "pay_retry_4";
  const razorpayRefundId = "rfnd_retry_4";

  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 800,
    status: "Completed",
    razorpayPaymentId,
    totalRefunded: 0,
    save: async function () { return this; },
  };

  const savedRefunds: any[] = [];
  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  try {
    (Payment as any).findOne = async () => fakePayment;
    (Refund as any).findOne = async (q: any) =>
      savedRefunds.find(r => r.refundTransactionId === q.refundTransactionId) || null;
    (Refund as any).create = async (doc: any) => {
      const created = { ...doc, _id: new mongoose.Types.ObjectId(), save: async () => {} };
      savedRefunds.push(created);
      return created;
    };
    (Order as any).findByIdAndUpdate = async () => ({});

    const event = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: razorpayRefundId, payment_id: razorpayPaymentId, amount: 30000 } },
    });

    // Send 3 times
    await handleWebhook(event.rawBody, event.signature);
    await handleWebhook(event.rawBody, event.signature);
    await handleWebhook(event.rawBody, event.signature);

    assert.equal(fakePayment.totalRefunded, 300, "totalRefunded must remain 300 after 3 retries");
    assert.equal(savedRefunds.length, 1, "Only 1 refund record created");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Duplicate refund.processed (retry)
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 5: Multiple retry deliveries of refund.processed are idempotent", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const razorpayPaymentId = "pay_retry_proc_5";
  const razorpayRefundId = "rfnd_retry_proc_5";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    amount: 1000,
    status: "PartiallyRefunded",
    razorpayPaymentId,
    totalRefunded: 500,
    save: async function () { return this; },
  };

  const existingRefund: any = {
    _id: new mongoose.Types.ObjectId(),
    amount: 500,
    status: "Completed",
    refundTransactionId: razorpayRefundId,
  };

  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;

  try {
    (Payment as any).findOne = async () => fakePayment;
    (Refund as any).findOne = async () => existingRefund;

    const event = makeSignedPayload("refund.processed", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: razorpayRefundId, payment_id: razorpayPaymentId, amount: 50000 } },
    });

    await handleWebhook(event.rawBody, event.signature);
    await handleWebhook(event.rawBody, event.signature);

    assert.equal(fakePayment.totalRefunded, 500, "totalRefunded must not change");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Webhook after local refund was already recorded
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 6: Webhook arriving after local refund was already recorded produces zero financial change", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const razorpayPaymentId = "pay_post_local_6";
  const razorpayRefundId = "rfnd_post_local_6";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    amount: 1200,
    status: "PartiallyRefunded",
    razorpayPaymentId,
    totalRefunded: 600,
    refundAmount: 600,
    save: async function () { return this; },
  };

  const existingRefund: any = {
    _id: new mongoose.Types.ObjectId(),
    status: "Completed",
    refundTransactionId: razorpayRefundId,
    amount: 600,
  };

  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;

  try {
    (Payment as any).findOne = async () => fakePayment;
    (Refund as any).findOne = async (q: any) => {
      if (q.refundTransactionId === razorpayRefundId) return existingRefund;
      return null;
    };

    const event = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: razorpayRefundId, payment_id: razorpayPaymentId, amount: 60000 } },
    });

    await handleWebhook(event.rawBody, event.signature);

    assert.equal(fakePayment.totalRefunded, 600, "totalRefunded must remain 600");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Two different legitimate partial refunds
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 7: Two different legitimate partial refunds accumulate correctly across webhooks", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const razorpayPaymentId = "pay_two_refunds_7";
  const refundIdA = "rfnd_legit_A";
  const refundIdB = "rfnd_legit_B";

  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 1000,
    status: "Completed",
    razorpayPaymentId,
    totalRefunded: 0,
    refundAmount: 0,
    save: async function () { return this; },
  };

  const savedRefunds: any[] = [];
  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  try {
    (Payment as any).findOne = async () => fakePayment;
    (Refund as any).findOne = async (q: any) =>
      savedRefunds.find(r => r.refundTransactionId === q.refundTransactionId) || null;
    (Refund as any).create = async (doc: any) => {
      const created = { ...doc, _id: new mongoose.Types.ObjectId(), save: async () => {} };
      savedRefunds.push(created);
      return created;
    };
    (Order as any).findByIdAndUpdate = async () => ({});

    // Refund A: ₹400
    const eventA = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: refundIdA, payment_id: razorpayPaymentId, amount: 40000 } },
    });
    await handleWebhook(eventA.rawBody, eventA.signature);
    // Duplicate of Refund A should be ignored
    await handleWebhook(eventA.rawBody, eventA.signature);

    assert.equal(fakePayment.totalRefunded, 400);
    assert.equal(fakePayment.status, "PartiallyRefunded");

    // Refund B: ₹350
    const eventB = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: refundIdB, payment_id: razorpayPaymentId, amount: 35000 } },
    });
    await handleWebhook(eventB.rawBody, eventB.signature);
    // refund.processed for Refund B should be ignored
    const eventBProcessed = makeSignedPayload("refund.processed", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: refundIdB, payment_id: razorpayPaymentId, amount: 35000 } },
    });
    await handleWebhook(eventBProcessed.rawBody, eventBProcessed.signature);

    assert.equal(fakePayment.totalRefunded, 750, "400 + 350 = 750");
    assert.equal(fakePayment.status, "PartiallyRefunded");
    assert.equal(savedRefunds.length, 2, "Exactly 2 distinct Refund records created");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Final partial refund correctly reaches Refunded
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 8: Final partial refund webhook correctly transitions status to Refunded", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const razorpayPaymentId = "pay_final_wh_8";
  const refundIdFinal = "rfnd_final_8";

  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 1000,
    status: "PartiallyRefunded",
    razorpayPaymentId,
    totalRefunded: 700,
    refundAmount: 700,
    save: async function () { return this; },
  };

  let updatedOrderStatus = "";
  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  try {
    (Payment as any).findOne = async () => fakePayment;
    (Refund as any).findOne = async () => null; // new refund
    (Refund as any).create = async (doc: any) => ({ ...doc, save: async () => {} });
    (Order as any).findByIdAndUpdate = async (_id: any, update: any) => {
      updatedOrderStatus = update.paymentStatus;
      return {};
    };

    // Remaining ₹300 refund arrives
    const event = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: refundIdFinal, payment_id: razorpayPaymentId, amount: 30000 } },
    });
    await handleWebhook(event.rawBody, event.signature);

    assert.equal(fakePayment.totalRefunded, 1000);
    assert.equal(fakePayment.status, "Refunded");
    assert.equal(updatedOrderStatus, "Refunded");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Webhook cannot cause totalRefunded to exceed original payment amount
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 9: Over-refund webhook is capped at payment.amount and does not produce unbounded total", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const razorpayPaymentId = "pay_over_wh_9";
  const refundIdOver = "rfnd_over_9";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    amount: 500,
    status: "PartiallyRefunded",
    razorpayPaymentId,
    totalRefunded: 400,
    refundAmount: 400,
    save: async function () { return this; },
  };

  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  try {
    (Payment as any).findOne = async () => fakePayment;
    (Refund as any).findOne = async () => null;
    (Refund as any).create = async (doc: any) => ({ ...doc, save: async () => {} });
    (Order as any).findByIdAndUpdate = async () => ({});

    // Over-refund payload: ₹200 (when only ₹100 remains)
    const event = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: refundIdOver, payment_id: razorpayPaymentId, amount: 20000 } },
    });
    await handleWebhook(event.rawBody, event.signature);

    assert.equal(fakePayment.totalRefunded, 500, "Must cap at original payment amount ₹500");
    assert.equal(fakePayment.status, "Refunded");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Step 1 commission clawback remains intact and is never called by refund webhook
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 10: Refund webhook never triggers commission reversal (reversal remains tied strictly to Completed return flow)", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const razorpayPaymentId = "pay_no_comm_10";
  const refundId = "rfnd_no_comm_10";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    amount: 500,
    status: "Completed",
    razorpayPaymentId,
    totalRefunded: 0,
    save: async function () { return this; },
  };

  const commissionService = await import("../services/commissionService");
  let commissionReversalCalled = false;
  const origReverseCommissions = commissionService.reverseCommissions;
  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  try {
    (commissionService as any).reverseCommissions = async () => {
      commissionReversalCalled = true;
      return { success: true };
    };
    (Payment as any).findOne = async () => fakePayment;
    (Refund as any).findOne = async () => null;
    (Refund as any).create = async (doc: any) => ({ ...doc, save: async () => {} });
    (Order as any).findByIdAndUpdate = async () => ({});

    const event = makeSignedPayload("refund.created", {
      payment: { entity: { id: razorpayPaymentId } },
      refund: { entity: { id: refundId, payment_id: razorpayPaymentId, amount: 25000 } },
    });
    await handleWebhook(event.rawBody, event.signature);

    assert.equal(commissionReversalCalled, false, "Refund webhook must NEVER trigger commission clawback");
  } finally {
    (commissionService as any).reverseCommissions = origReverseCommissions;
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: P0 #4 crash/retry recovery remains intact
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #8 - Test 11: P0 #4 crash recovery resumes from existing refundTransactionId without duplicate gateway calls", async () => {
  const { refundOrder } = await import("../services/refundService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;
  const Refund = (await import("../models/Refund")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const paymentId = new mongoose.Types.ObjectId().toString();
  const priorRefundId = "rfnd_gateway_crashed_prior";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(paymentId),
    order: new mongoose.Types.ObjectId(orderId),
    amount: 1000,
    status: "Completed",
    razorpayPaymentId: "pay_crash_rec_11",
    totalRefunded: 0,
    save: async function () { return this; },
  };

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    orderNumber: "ORD-CRASH-11",
    total: 1000,
    paymentMethod: "Online",
    paymentStatus: "Paid",
  };

  // Pending refund record with refundTransactionId already captured from gateway
  const existingPendingDoc: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    payment: new mongoose.Types.ObjectId(paymentId),
    amount: 400,
    status: "Pending",
    refundTransactionId: priorRefundId,
    save: async function () { return this; },
  };

  let gatewayRefundCalled = false;
  const Razorpay = (await import("razorpay")).default;
  const origAddResources = (Razorpay.prototype as any).addResources;
  (Razorpay.prototype as any).addResources = function () {
    origAddResources.call(this);
    this.payments = {
      refund: async () => {
        gatewayRefundCalled = true;
        return { id: "rfnd_should_not_call", status: "processed" };
      },
    };
  };

  const origOrderFindById = Order.findById;
  const origOrderUpdateOne = Order.updateOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentFindById = Payment.findById;
  const origRefundFind = Refund.find;
  const origRefundFindOne = Refund.findOne;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Order as any).updateOne = async () => ({ modifiedCount: 1 });
    (Payment as any).findOne = async () => fakePayment;
    (Payment as any).findById = async () => fakePayment;
    (Refund as any).find = () => [];
    (Refund as any).findOne = async () => existingPendingDoc;

    const res = await refundOrder(orderId, "Retry recovery", 400, { idempotencyKey: "retry_key_11" });

    assert.equal(res.refunded, true);
    assert.equal(gatewayRefundCalled, false, "Must NOT call Razorpay again on retry after prior gateway success");
    assert.equal(existingPendingDoc.status, "Completed");
    assert.equal(fakePayment.totalRefunded, 400);
    assert.equal(fakePayment.status, "PartiallyRefunded");
  } finally {
    (Razorpay.prototype as any).addResources = origAddResources;
    Order.findById = origOrderFindById;
    Order.updateOne = origOrderUpdateOne;
    Payment.findOne = origPaymentFindOne;
    Payment.findById = origPaymentFindById;
    Refund.find = origRefundFind;
    Refund.findOne = origRefundFindOne;
  }
});
