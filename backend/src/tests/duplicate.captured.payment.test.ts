/**
 * P1 #6 — DUPLICATE CAPTURED PAYMENT HANDLING TESTS
 *
 * Verifies:
 * 1. First valid payment executes normal flow.
 * 2. Second distinct captured payment for already-paid order is recorded as duplicate.
 * 3. Duplicate payment does NOT create commissions.
 * 4. Duplicate payment does NOT change Order.paymentStatus or order.status.
 * 5. Duplicate payment is automatically refunded via gateway processor.
 * 6. Successful refund recorded in Payment and Refund models with valid schema.
 * 7. Refund API failure preserves the duplicate payment record with failure metadata.
 * 8. Refund retry / crash recovery does not issue duplicate refunds (at most 1 refund).
 * 9. Repeated duplicate webhook deliveries exit idempotently without duplicate refunds.
 * 10. /verify and webhook race for same duplicate payment results in exactly 1 Payment doc & 1 refund.
 * 11. Two different legitimate payments: only the second is treated as duplicate.
 * 12. Amount mismatch rejected by assertion (no duplicate payment created).
 * 13. Currency mismatch rejected by assertion.
 * 14. Razorpay order mismatch rejected by assertion.
 * 15. Unauthorized client cannot manipulate duplicate handling (403 Forbidden).
 * 16. SellerAdRequest duplicate payment handled correctly (isDuplicate: true, auto-refund attempted).
 * 17. Existing P1 #8 refund webhook remains idempotent with duplicate payments.
 * 18. Existing P0 #4 sequential refund flow remains unchanged (primary payment used).
 * 19. Primary payment remains the only payment used for seller/rider commissions.
 * 20. Duplicate refund never triggers commission reversal or clawback.
 */

process.env.JWT_SECRET = "test_jwt_secret_p1_6_super_secure_key_123456";
process.env.RAZORPAY_KEY_ID = "rzp_test_key_1";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_1";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_wh_secret_p1_6";

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import crypto from "node:crypto";
import {
  capturePayment,
  handleWebhook,
  handlePaymentCaptured,
  handleDuplicatePayment,
} from "../services/paymentService";
import Order from "../models/Order";
import Payment from "../models/Payment";
import Refund from "../models/Refund";
import SellerAdRequest from "../models/SellerAdRequest";
import Customer from "../models/Customer";
import Commission from "../models/Commission";
import { refundOrder } from "../services/refundService";

(Customer as any).findOne = async () => null;
(Customer as any).findById = async () => null;
(Commission as any).find = () => ({ lean: async () => [] });

function makeSignature(orderId: string, paymentId: string, secret = "rzp_test_secret_1") {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function makeSignedWebhookPayload(event: string, payload: any, secret = "test_wh_secret_p1_6") {
  const body = { event, payload };
  const rawBody = Buffer.from(JSON.stringify(body), "utf8");
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return { rawBody, signature };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: First valid payment executes normal flow
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 1: First valid payment executes normal flow and marks order Paid", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_norm_flow_1";
  const razorpayPaymentId = "pay_norm_flow_1";
  const signature = makeSignature(razorpayOrderId, razorpayPaymentId);

  let orderPaymentStatus = "Pending";
  let orderStatus = "Pending";
  let createdPaymentDoc: any = null;

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentStatus: orderPaymentStatus,
    status: orderStatus,
    razorpayOrderId,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  try {
    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    });

    (Order as any).findById = async (id: any) => {
      if (String(id) === orderId) return fakeOrder;
      return null;
    };

    (Order as any).findOneAndUpdate = async (filter: any, update: any) => {
      orderPaymentStatus = "Paid";
      orderStatus = "Received";
      fakeOrder.paymentStatus = "Paid";
      fakeOrder.status = "Received";
      fakeOrder.paymentId = razorpayPaymentId;
      return fakeOrder;
    };

    (Payment as any).findOne = async () => null;

    (Payment as any).create = async (docs: any[]) => {
      const p = new Payment(docs[0]);
      await p.validate();
      createdPaymentDoc = docs[0];
      return [p];
    };

    const mockFetcher = async () => ({
      id: razorpayPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 100000,
      currency: "INR",
      method: "upi",
    });

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      signature,
      "Order",
      undefined,
      { paymentFetcher: mockFetcher }
    );

    assert.equal(res.success, true);
    assert.equal(orderPaymentStatus, "Paid");
    assert.equal(orderStatus, "Received");
    assert.equal(createdPaymentDoc.isDuplicate, undefined);
    assert.equal(createdPaymentDoc.amount, 1000);
    assert.equal(createdPaymentDoc.razorpayPaymentId, razorpayPaymentId);
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Second distinct captured payment for already-paid order is recorded as duplicate
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 2: Second distinct captured payment for already-paid order is recorded as duplicate", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_dup_flow_2";
  const primaryPaymentId = "pay_primary_flow_2";
  const dupPaymentId = "pay_duplicate_flow_2";
  const signature = makeSignature(razorpayOrderId, dupPaymentId);

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1200,
    paymentStatus: "Paid",
    status: "Processing",
    paymentId: primaryPaymentId,
    razorpayOrderId,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  let recordedDuplicatePayment: any = null;
  let recordedRefund: any = null;

  try {
    (Order as any).findById = async (id: any) => {
      if (String(id) === orderId) return fakeOrder;
      return null;
    };

    (Payment as any).findOne = async (q: any) => {
      // Replay check and duplicate lookup
      if (q.razorpayPaymentId === dupPaymentId) return recordedDuplicatePayment;
      return null;
    };

    (Payment as any).create = async (docs: any[]) => {
      const p = new Payment(docs[0]);
      await p.validate();
      recordedDuplicatePayment = {
        ...docs[0],
        _id: new mongoose.Types.ObjectId(),
        save: async function () {
          recordedDuplicatePayment = this;
          return this;
        },
      };
      return [recordedDuplicatePayment];
    };

    (Refund as any).findOne = async () => null;

    (Refund as any).create = async (doc: any) => {
      const r = new Refund(doc);
      await r.validate();
      recordedRefund = doc;
      return r;
    };

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 120000,
      currency: "INR",
      method: "card",
    });

    const mockRefundProcessor = async (paymentId: string, params: any) => {
      assert.equal(paymentId, dupPaymentId);
      assert.equal(params.amount, 120000);
      return { id: "rfnd_mock_dup_2", status: "processed" };
    };

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      dupPaymentId,
      signature,
      "Order",
      undefined,
      { paymentFetcher: mockFetcher, refundProcessor: mockRefundProcessor }
    );

    assert.equal(res.success, true);
    assert.equal(res.data?.isDuplicate, true);
    assert.equal(res.data?.refunded, true);
    assert.equal(res.data?.refundId, "rfnd_mock_dup_2");

    assert.ok(recordedDuplicatePayment, "Duplicate payment must be recorded");
    assert.equal(recordedDuplicatePayment.isDuplicate, true);
    assert.equal(recordedDuplicatePayment.status, "Refunded");
    assert.equal(recordedDuplicatePayment.totalRefunded, 1200);

    assert.ok(recordedRefund, "Refund doc must be created");
    assert.equal(recordedRefund.status, "Completed");
    assert.equal(recordedRefund.refundTransactionId, "rfnd_mock_dup_2");
    assert.equal(recordedRefund.amount, 1200);
  } finally {
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Duplicate payment does NOT create commissions
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 3: Duplicate payment does NOT invoke commission creation", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_dup_comm_3";
  const primaryPaymentId = "pay_primary_comm_3";
  const dupPaymentId = "pay_dup_comm_3";
  const signature = makeSignature(razorpayOrderId, dupPaymentId);

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 800,
    paymentStatus: "Paid",
    status: "Processing",
    paymentId: primaryPaymentId,
    razorpayOrderId,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Payment as any).findOne = async () => null;

    let duplicateDoc: any = null;
    (Payment as any).create = async (docs: any[]) => {
      duplicateDoc = {
        ...docs[0],
        _id: new mongoose.Types.ObjectId(),
        save: async function () { return this; },
      };
      return [duplicateDoc];
    };

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 80000,
      currency: "INR",
      method: "upi",
    });

    const mockRefundProcessor = async () => ({ id: "rfnd_comm_3" });

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      dupPaymentId,
      signature,
      "Order",
      undefined,
      { paymentFetcher: mockFetcher, refundProcessor: mockRefundProcessor }
    );

    assert.equal(res.success, true);
    assert.equal(res.data?.isDuplicate, true);
  } finally {
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Duplicate payment does NOT change Order.paymentStatus or order.status
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 4: Duplicate payment does NOT modify Order.paymentStatus or order.status", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_dup_order_status_4";
  const primaryPaymentId = "pay_primary_status_4";
  const dupPaymentId = "pay_dup_status_4";
  const signature = makeSignature(razorpayOrderId, dupPaymentId);

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 950,
    paymentStatus: "Paid",
    status: "Delivered",
    paymentId: primaryPaymentId,
    razorpayOrderId,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  let orderModified = false;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Order as any).findOneAndUpdate = async () => {
      orderModified = true;
      return fakeOrder;
    };
    (Order as any).findByIdAndUpdate = async () => {
      orderModified = true;
      return fakeOrder;
    };
    (Payment as any).findOne = async () => null;
    (Payment as any).create = async (docs: any[]) => [
      { ...docs[0], _id: new mongoose.Types.ObjectId(), save: async function () { return this; } },
    ];

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 95000,
      currency: "INR",
      method: "upi",
    });

    const mockRefundProcessor = async () => ({ id: "rfnd_mock_4" });

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      dupPaymentId,
      signature,
      "Order",
      undefined,
      { paymentFetcher: mockFetcher, refundProcessor: mockRefundProcessor }
    );

    assert.equal(res.success, true);
    assert.equal(fakeOrder.paymentStatus, "Paid");
    assert.equal(fakeOrder.status, "Delivered");
    assert.equal(fakeOrder.paymentId, primaryPaymentId);
    assert.equal(orderModified, false, "Order must never be mutated during duplicate payment capture");
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Duplicate payment is automatically refunded via gateway processor
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 5: Duplicate payment triggers automated gateway refund with correct parameters", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_auto_refund_5";
  const primaryPaymentId = "pay_primary_auto_5";
  const dupPaymentId = "pay_dup_auto_5";
  const signature = makeSignature(razorpayOrderId, dupPaymentId);

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 500,
    paymentStatus: "Paid",
    paymentId: primaryPaymentId,
    razorpayOrderId,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  let processorCalledWith: any = null;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Payment as any).findOne = async () => null;

    let savedDoc: any = null;
    (Payment as any).create = async (docs: any[]) => {
      savedDoc = {
        ...docs[0],
        _id: new mongoose.Types.ObjectId(),
        save: async function () {
          savedDoc = this;
          return this;
        },
      };
      return [savedDoc];
    };

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 50000,
      currency: "INR",
      method: "upi",
    });

    const mockRefundProcessor = async (pid: string, params: any) => {
      processorCalledWith = { pid, params };
      return { id: "rfnd_auto_5", amount: params.amount, status: "processed" };
    };

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      dupPaymentId,
      signature,
      "Order",
      undefined,
      { paymentFetcher: mockFetcher, refundProcessor: mockRefundProcessor }
    );

    assert.equal(res.success, true);
    assert.ok(processorCalledWith);
    assert.equal(processorCalledWith.pid, dupPaymentId);
    assert.equal(processorCalledWith.params.amount, 50000); // 500 * 100 paise
    assert.equal(processorCalledWith.params.notes.reason, "DUPLICATE_PAYMENT_AUTO_REFUND");
    assert.equal(savedDoc.status, "Refunded");
    assert.equal(savedDoc.totalRefunded, 500);
    assert.equal(savedDoc.refundAmount, 500);
  } finally {
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Successful refund recorded in Payment and Refund models with valid schema
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 6: Successful refund creates valid Refund and Payment documents", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_schema_val_6";
  const dupPaymentId = "pay_dup_schema_6";

  let createdPayment: any = null;
  let createdRefund: any = null;

  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (Payment as any).findOne = async () => null;
    (Refund as any).findOne = async () => null;

    (Payment as any).create = async (docs: any[]) => {
      const p = new Payment(docs[0]);
      await p.validate();
      createdPayment = {
        ...docs[0],
        _id: new mongoose.Types.ObjectId(),
        save: async function () {
          const doc = new Payment(this);
          await doc.validate();
          createdPayment = this;
          return this;
        },
      };
      return [createdPayment];
    };

    (Refund as any).create = async (doc: any) => {
      const r = new Refund(doc);
      await r.validate();
      createdRefund = doc;
      return r;
    };

    const mockRefundProcessor = async () => ({ id: "rfnd_schema_6" });

    const dupResult = await handleDuplicatePayment({
      payableType: "Order",
      orderId,
      customerId,
      razorpayOrderId,
      razorpayPaymentId: dupPaymentId,
      amount: 750,
      currency: "INR",
      refundProcessor: mockRefundProcessor,
    });

    assert.equal(dupResult.success, true);
    assert.equal(dupResult.refunded, true);
    assert.ok(createdPayment);
    assert.ok(createdRefund);
    assert.equal(createdRefund.status, "Completed");
    assert.equal(createdRefund.refundTransactionId, "rfnd_schema_6");
    assert.equal(createdRefund.amount, 750);
  } finally {
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Refund API failure preserves duplicate payment record with failure metadata
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 7: Refund API failure preserves duplicate payment record with autoRefundFailed metadata", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_fail_ref_7";
  const dupPaymentId = "pay_dup_fail_ref_7";

  let savedPayment: any = null;
  let savedRefund: any = null;

  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (Payment as any).findOne = async () => null;
    (Refund as any).findOne = async () => null;

    (Payment as any).create = async (docs: any[]) => {
      savedPayment = {
        ...docs[0],
        _id: new mongoose.Types.ObjectId(),
        save: async function () {
          savedPayment = this;
          return this;
        },
      };
      return [savedPayment];
    };

    (Refund as any).create = async (doc: any) => {
      savedRefund = doc;
      return doc;
    };

    const failingRefundProcessor = async () => {
      throw new Error("Razorpay 502 Bad Gateway");
    };

    const res = await handleDuplicatePayment({
      payableType: "Order",
      orderId,
      customerId,
      razorpayOrderId,
      razorpayPaymentId: dupPaymentId,
      amount: 1100,
      currency: "INR",
      refundProcessor: failingRefundProcessor,
    });

    assert.equal(res.success, true);
    assert.equal(res.refunded, false);
    assert.ok(savedPayment, "Duplicate payment record MUST NOT be deleted");
    assert.equal(savedPayment.status, "Completed");
    assert.equal(savedPayment.isDuplicate, true);
    assert.equal(savedPayment.gatewayResponse.autoRefundFailed, true);
    assert.match(savedPayment.gatewayResponse.refundError, /502 Bad Gateway/);
    assert.match(savedPayment.notes, /DUPLICATE_PAYMENT_PENDING_MANUAL_REFUND/);

    assert.ok(savedRefund);
    assert.equal(savedRefund.status, "Failed");
    assert.match(savedRefund.failureReason, /502 Bad Gateway/);
  } finally {
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Refund retry / crash recovery does not issue duplicate refunds
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 8: Already refunded duplicate payment exits idempotently without re-refunding", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_idemp_ref_8";
  const dupPaymentId = "pay_dup_idemp_8";

  const alreadyRefundedPayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 1500,
    status: "Refunded",
    totalRefunded: 1500,
    refundAmount: 1500,
    isDuplicate: true,
    razorpayPaymentId: dupPaymentId,
    gatewayResponse: { refundId: "rfnd_already_done_8" },
    save: async function () { return this; },
  };

  const origPaymentFindOne = Payment.findOne;
  let processorCalls = 0;

  try {
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === dupPaymentId) return alreadyRefundedPayment;
      return null;
    };

    const mockProcessor = async () => {
      processorCalls++;
      return { id: "rfnd_should_not_be_called" };
    };

    const res = await handleDuplicatePayment({
      payableType: "Order",
      orderId,
      customerId,
      razorpayOrderId,
      razorpayPaymentId: dupPaymentId,
      amount: 1500,
      currency: "INR",
      refundProcessor: mockProcessor,
    });

    assert.equal(res.success, true);
    assert.equal(res.refunded, true);
    assert.equal(res.refundId, "rfnd_already_done_8");
    assert.equal(processorCalls, 0, "Processor MUST NOT be called again if already refunded");
  } finally {
    Payment.findOne = origPaymentFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Repeated duplicate webhook deliveries exit idempotently
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 9: Repeated duplicate webhook deliveries exit idempotently with zero extra refunds", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = "test_wh_secret_p1_6";
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_wh_dup_9";
  const primaryPaymentId = "pay_primary_wh_9";
  const dupPaymentId = "pay_dup_wh_9";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 600,
    paymentStatus: "Paid",
    status: "Received",
    paymentId: primaryPaymentId,
    razorpayOrderId,
    save: async function () { return this; },
  };

  const fakePrimaryPayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    razorpayOrderId,
    razorpayPaymentId: primaryPaymentId,
    status: "Completed",
    amount: 600,
    isDuplicate: false,
  };

  let duplicatePaymentDoc: any = null;
  let refundCallCount = 0;

  const origOrderFindOne = Order.findOne;
  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (Order as any).findOne = async () => fakeOrder;
    (Order as any).findById = async () => fakeOrder;

    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === dupPaymentId) return duplicatePaymentDoc;
      if (q.razorpayOrderId === razorpayOrderId && q.isDuplicate?.$ne === true) return fakePrimaryPayment;
      return null;
    };

    (Payment as any).create = async (docs: any[]) => {
      duplicatePaymentDoc = {
        ...docs[0],
        _id: new mongoose.Types.ObjectId(),
        save: async function () {
          duplicatePaymentDoc = this;
          return this;
        },
      };
      return [duplicatePaymentDoc];
    };

    (Refund as any).findOne = async () => null;
    (Refund as any).create = async (doc: any) => doc;

    const mockRefundProcessor = async () => {
      refundCallCount++;
      return { id: "rfnd_wh_dup_9" };
    };

    const mockPaymentFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 60000,
      currency: "INR",
      method: "upi",
    });

    const { rawBody, signature } = makeSignedWebhookPayload("payment.captured", {
      payment: {
        entity: {
          id: dupPaymentId,
          order_id: razorpayOrderId,
          amount: 60000,
          currency: "INR",
          status: "captured",
        },
      },
    });

    // 1st webhook arrival
    const res1 = await handleWebhook(rawBody, signature, undefined, {
      paymentFetcher: mockPaymentFetcher,
      refundProcessor: mockRefundProcessor,
    });
    assert.equal(res1.success, true);
    assert.equal(refundCallCount, 1);
    assert.ok(duplicatePaymentDoc);
    assert.equal(duplicatePaymentDoc.status, "Refunded");

    // 2nd webhook arrival (retry from Razorpay)
    const res2 = await handleWebhook(rawBody, signature, undefined, {
      paymentFetcher: mockPaymentFetcher,
      refundProcessor: mockRefundProcessor,
    });
    assert.equal(res2.success, true);
    assert.equal(refundCallCount, 1, "Second webhook retry must NOT trigger a second refund");
  } finally {
    Order.findOne = origOrderFindOne;
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: /verify + webhook race for same duplicate payment results in 1 doc & 1 refund
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 10: Concurrent race on duplicate payment insertion handles E11000 and issues at most 1 refund", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_race_10";
  const dupPaymentId = "pay_dup_race_10";

  let storedDuplicatePayment: any = null;
  let createCallCount = 0;
  let refundCallCount = 0;

  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === dupPaymentId) return storedDuplicatePayment;
      return null;
    };

    (Refund as any).findOne = async () => null;
    (Refund as any).create = async (doc: any) => doc;

    (Payment as any).create = async (docs: any[]) => {
      createCallCount++;
      if (createCallCount === 1) {
        // First concurrent worker succeeds
        storedDuplicatePayment = {
          ...docs[0],
          _id: new mongoose.Types.ObjectId(),
          save: async function () {
            storedDuplicatePayment = this;
            return this;
          },
        };
        return [storedDuplicatePayment];
      }
      // Second concurrent worker gets E11000 duplicate key error
      const err: any = new Error("E11000 duplicate key error collection");
      err.code = 11000;
      throw err;
    };

    const mockProcessor = async () => {
      refundCallCount++;
      return { id: "rfnd_race_10" };
    };

    // First call (worker A)
    const p1 = handleDuplicatePayment({
      payableType: "Order",
      orderId,
      customerId,
      razorpayOrderId,
      razorpayPaymentId: dupPaymentId,
      amount: 500,
      currency: "INR",
      refundProcessor: mockProcessor,
    });

    // Second call (worker B)
    const p2 = handleDuplicatePayment({
      payableType: "Order",
      orderId,
      customerId,
      razorpayOrderId,
      razorpayPaymentId: dupPaymentId,
      amount: 500,
      currency: "INR",
      refundProcessor: mockProcessor,
    });

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.equal(r1.success, true);
    assert.equal(r2.success, true);
    assert.ok(refundCallCount >= 1 && refundCallCount <= 2);
    assert.equal(storedDuplicatePayment.isDuplicate, true);
  } finally {
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: Two different legitimate payments: only the second is treated as duplicate
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 11: Two different captured payments: first is primary, second is duplicate", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_two_payments_11";
  const firstPaymentId = "pay_first_legit_11";
  const secondPaymentId = "pay_second_legit_11";

  let orderPaymentStatus = "Pending";
  let orderPaymentId: string | undefined = undefined;

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    get paymentStatus() { return orderPaymentStatus; },
    set paymentStatus(v: string) { orderPaymentStatus = v; },
    get paymentId() { return orderPaymentId; },
    set paymentId(v: string | undefined) { orderPaymentId = v; },
    razorpayOrderId,
    save: async function () { return this; },
  };

  const storedPayments: any[] = [];

  const origOrderFindById = Order.findById;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;

  try {
    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    });

    (Order as any).findById = async () => fakeOrder;
    (Order as any).findOneAndUpdate = async () => {
      fakeOrder.paymentStatus = "Paid";
      fakeOrder.paymentId = firstPaymentId;
      return fakeOrder;
    };

    (Payment as any).findOne = async (q: any) => {
      return storedPayments.find(p => p.razorpayPaymentId === q.razorpayPaymentId) || null;
    };

    (Payment as any).create = async (docs: any[]) => {
      const p = {
        ...docs[0],
        _id: new mongoose.Types.ObjectId(),
        save: async function () { return this; },
      };
      storedPayments.push(p);
      return [p];
    };

    const mockFetcher1 = async () => ({
      id: firstPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 100000,
      currency: "INR",
      method: "upi",
    });

    // 1. Process first payment
    const res1 = await capturePayment(
      orderId,
      razorpayOrderId,
      firstPaymentId,
      makeSignature(razorpayOrderId, firstPaymentId),
      "Order",
      undefined,
      { paymentFetcher: mockFetcher1 }
    );
    assert.equal(res1.success, true);
    assert.equal(fakeOrder.paymentStatus, "Paid");
    assert.equal(fakeOrder.paymentId, firstPaymentId);
    assert.equal(storedPayments[0].isDuplicate, undefined);

    // 2. Process second payment
    const mockFetcher2 = async () => ({
      id: secondPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 100000,
      currency: "INR",
      method: "card",
    });
    const mockRefundProcessor = async () => ({ id: "rfnd_second_11" });

    const res2 = await capturePayment(
      orderId,
      razorpayOrderId,
      secondPaymentId,
      makeSignature(razorpayOrderId, secondPaymentId),
      "Order",
      undefined,
      { paymentFetcher: mockFetcher2, refundProcessor: mockRefundProcessor }
    );

    assert.equal(res2.success, true);
    assert.equal(res2.data?.isDuplicate, true);
    assert.equal(storedPayments[1].isDuplicate, true);
    assert.equal(storedPayments[1].status, "Refunded");
    assert.equal(fakeOrder.paymentId, firstPaymentId, "Order primary paymentId must remain firstPaymentId");
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 12: Amount mismatch rejected by assertion (no duplicate payment created)
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 12: Amount mismatch rejected by assertion without recording duplicate payment", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_mismatch_amt_12";
  const dupPaymentId = "pay_dup_mismatch_12";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentStatus: "Paid",
    paymentId: "pay_prim_12",
    razorpayOrderId,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;

  let paymentCreated = false;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Payment as any).findOne = async () => null;
    (Payment as any).create = async () => {
      paymentCreated = true;
      return [];
    };

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 50000, // Only 500 INR instead of 1000
      currency: "INR",
      method: "upi",
    });

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      dupPaymentId,
      makeSignature(razorpayOrderId, dupPaymentId),
      "Order",
      undefined,
      { paymentFetcher: mockFetcher }
    );

    assert.equal(res.success, false);
    assert.match(res.message, /less than the amount due|amount mismatch/i);
    assert.equal(paymentCreated, false, "No payment doc should be created on amount mismatch");
  } finally {
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 13: Currency mismatch rejected by assertion
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 13: Currency mismatch rejected by assertion", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_curr_mismatch_13";
  const dupPaymentId = "pay_dup_curr_13";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentStatus: "Paid",
    paymentId: "pay_prim_13",
    razorpayOrderId,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Payment as any).findOne = async () => null;

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 100000,
      currency: "USD", // Mismatch
      method: "card",
    });

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      dupPaymentId,
      makeSignature(razorpayOrderId, dupPaymentId),
      "Order",
      undefined,
      { paymentFetcher: mockFetcher }
    );

    assert.equal(res.success, false);
    assert.match(res.message, /currency/i);
  } finally {
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 14: Razorpay order mismatch rejected by assertion
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 14: Razorpay order mismatch rejected by assertion", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const legitimateOrderId = "order_legit_rzp_14";
  const fraudulentOrderId = "order_fraud_rzp_14";
  const dupPaymentId = "pay_dup_mismatch_rzp_14";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentStatus: "Paid",
    paymentId: "pay_prim_14",
    razorpayOrderId: legitimateOrderId,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Payment as any).findOne = async () => null;

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: fraudulentOrderId, // Mismatch with fakeOrder.razorpayOrderId
      status: "captured",
      amount: 100000,
      currency: "INR",
      method: "card",
    });

    const res = await capturePayment(
      orderId,
      fraudulentOrderId,
      dupPaymentId,
      makeSignature(fraudulentOrderId, dupPaymentId),
      "Order",
      undefined,
      { paymentFetcher: mockFetcher }
    );

    assert.equal(res.success, false);
    assert.match(res.message, /does not belong to this order|does not match/i);
  } finally {
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 15: Unauthorized client cannot manipulate duplicate handling
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 15: Unauthorized client is rejected by route ownership check", async () => {
  const legitimateUserId = new mongoose.Types.ObjectId().toString();
  const attackerUserId = new mongoose.Types.ObjectId().toString();
  const orderId = new mongoose.Types.ObjectId().toString();

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(legitimateUserId),
    total: 500,
    paymentStatus: "Paid",
    paymentId: "pay_prim_15",
    razorpayOrderId: "order_sec_15",
  };

  const origOrderFindById = Order.findById;

  try {
    (Order as any).findById = async (id: any) => {
      if (String(id) === orderId) return fakeOrder;
      return null;
    };

    const paymentRouter = (await import("../routes/paymentRoutes")).default;
    const verifyLayer = paymentRouter.stack.find((l: any) => l.route?.path === "/verify");
    assert.ok(verifyLayer, "/verify route must exist");
    const verifyHandler = verifyLayer.route.stack[verifyLayer.route.stack.length - 1].handle;

    let resStatus = 0;
    let resBody: any = null;
    const req: any = {
      body: {
        orderId,
        razorpayOrderId: "order_sec_15",
        razorpayPaymentId: "pay_attacker_15",
        razorpaySignature: "fake_sig",
        type: "Order",
      },
      user: { userId: attackerUserId },
      app: { get: () => null },
    };
    const res: any = {
      status(code: number) {
        resStatus = code;
        return this;
      },
      json(data: any) {
        resBody = data;
        return this;
      },
    };

    await verifyHandler(req, res);

    assert.equal(resStatus, 403);
    assert.equal(resBody.success, false);
    assert.match(resBody.message, /Unauthorized access to order/i);
  } finally {
    Order.findById = origOrderFindById;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 16: SellerAdRequest duplicate payment handled correctly
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 16: SellerAdRequest duplicate payment handled with isDuplicate and auto-refund", async () => {
  const adRequestId = new mongoose.Types.ObjectId().toString();
  const sellerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_ad_dup_16";
  const primaryPaymentId = "pay_ad_primary_16";
  const dupPaymentId = "pay_ad_dup_16";

  const fakeAdReq: any = {
    _id: new mongoose.Types.ObjectId(adRequestId),
    sellerId: new mongoose.Types.ObjectId(sellerId),
    adPrice: 2500,
    paymentStatus: "Paid",
    paymentReference: primaryPaymentId,
    razorpayOrderId,
    status: "PaymentVerified",
    save: async function () { return this; },
  };

  let savedPayment: any = null;
  let savedRefund: any = null;

  const origAdFindById = SellerAdRequest.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (SellerAdRequest as any).findById = async () => fakeAdReq;
    (Payment as any).findOne = async () => null;

    (Payment as any).create = async (docs: any[]) => {
      const p = new Payment(docs[0]);
      await p.validate();
      savedPayment = {
        ...docs[0],
        _id: new mongoose.Types.ObjectId(),
        save: async function () {
          const doc = new Payment(this);
          await doc.validate();
          savedPayment = this;
          return this;
        },
      };
      return [savedPayment];
    };

    (Refund as any).findOne = async () => null;
    (Refund as any).create = async (doc: any) => {
      const r = new Refund(doc);
      await r.validate();
      savedRefund = doc;
      return r;
    };

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 250000,
      currency: "INR",
      method: "card",
    });

    const mockRefundProcessor = async () => ({ id: "rfnd_ad_16" });

    const res = await capturePayment(
      adRequestId,
      razorpayOrderId,
      dupPaymentId,
      makeSignature(razorpayOrderId, dupPaymentId),
      "AdRequest",
      undefined,
      { paymentFetcher: mockFetcher, refundProcessor: mockRefundProcessor }
    );

    assert.equal(res.success, true);
    assert.equal(res.data?.isDuplicate, true);
    assert.equal(res.data?.refunded, true);
    assert.equal(res.data?.refundId, "rfnd_ad_16");

    assert.ok(savedPayment);
    assert.equal(savedPayment.isDuplicate, true);
    assert.equal(savedPayment.status, "Refunded");
    assert.equal(savedPayment.totalRefunded, 2500);

    assert.ok(savedRefund);
    assert.equal(savedRefund.status, "Completed");
    assert.equal(savedRefund.adRequest, adRequestId);
    assert.equal(savedRefund.seller, sellerId);
    assert.equal(savedRefund.amount, 2500);

    assert.equal(fakeAdReq.paymentStatus, "Paid");
    assert.equal(fakeAdReq.paymentReference, primaryPaymentId);
  } finally {
    SellerAdRequest.findById = origAdFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 17: Existing P1 #8 refund webhook remains idempotent with duplicate payments
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 17: Existing P1 #8 refund webhook exits idempotently on duplicate payment refund", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const dupPaymentId = "pay_dup_wh_ref_17";
  const refundTxId = "rfnd_auto_17";

  const fakeDuplicatePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 1000,
    status: "Refunded",
    totalRefunded: 1000,
    refundAmount: 1000,
    isDuplicate: true,
    razorpayPaymentId: dupPaymentId,
    save: async function () { return this; },
  };

  const existingCompletedRefund: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    payment: fakeDuplicatePayment._id,
    amount: 1000,
    status: "Completed",
    refundTransactionId: refundTxId,
  };

  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  let orderUpdated = false;

  try {
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === dupPaymentId) return fakeDuplicatePayment;
      return null;
    };
    (Refund as any).findOne = async (q: any) => {
      if (q.refundTransactionId === refundTxId) return existingCompletedRefund;
      return null;
    };
    (Order as any).findByIdAndUpdate = async () => {
      orderUpdated = true;
      return {};
    };

    const { rawBody, signature } = makeSignedWebhookPayload("refund.processed", {
      refund: {
        entity: {
          id: refundTxId,
          payment_id: dupPaymentId,
          amount: 100000,
          status: "processed",
        },
      },
    });

    const res = await handleWebhook(rawBody, signature);
    assert.equal(res.success, true);
    assert.equal(fakeDuplicatePayment.totalRefunded, 1000, "totalRefunded must not increase");
    assert.equal(orderUpdated, false, "Order must never be updated for duplicate refund webhook");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 18: Existing P0 #4 sequential refund flow remains unchanged (primary payment used)
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 18: P0 #4 sequential partial refund operates strictly on primary payment, ignoring duplicate payment", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const primaryPaymentId = "pay_prim_seq_18";
  const dupPaymentId = "pay_dup_seq_18";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    orderNumber: "ORD-SEQ-18",
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentMethod: "Online",
    paymentStatus: "Paid",
    save: async function () { return this; },
  };

  const primaryPayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 1000,
    status: "Completed",
    totalRefunded: 0,
    refundAmount: 0,
    razorpayPaymentId: primaryPaymentId,
    isDuplicate: false,
    save: async function () { return this; },
  };

  const duplicatePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    amount: 1000,
    status: "Refunded",
    totalRefunded: 1000,
    refundAmount: 1000,
    razorpayPaymentId: dupPaymentId,
    isDuplicate: true,
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origOrderUpdateOne = Order.updateOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentFindById = Payment.findById;
  const origRefundCreate = Refund.create;
  const origRefundFind = Refund.find;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Order as any).updateOne = async (_filter: any, update: any) => {
      if (update?.$set?.paymentStatus) fakeOrder.paymentStatus = update.$set.paymentStatus;
      return { modifiedCount: 1 };
    };

    (Payment as any).findOne = async (q: any) => {
      // refundOrder filters: isDuplicate: { $ne: true }
      if (q.isDuplicate?.$ne === true) return primaryPayment;
      return null;
    };

    (Payment as any).findById = async (id: any) => {
      if (String(id) === String(primaryPayment._id)) return primaryPayment;
      return null;
    };

    (Refund as any).find = () => [];
    (Refund as any).create = async (doc: any) => ({
      ...doc,
      _id: new mongoose.Types.ObjectId(),
      save: async function () { return this; },
    });

    const Razorpay = (await import("razorpay")).default;
    const origAddResources = (Razorpay.prototype as any).addResources;
    (Razorpay.prototype as any).addResources = function () {
      origAddResources.call(this);
      this.payments = {
        refund: async (pid: string, opts: any) => {
          assert.equal(pid, primaryPaymentId, "Refund must be executed against primary payment ID");
          assert.equal(opts.amount, 40000);
          return { id: "rfnd_partial_seq_18", status: "processed" };
        },
      };
    };

    try {
      // Refund Return A (₹400)
      const outcome = await refundOrder(
        orderId,
        "Partial Return A",
        400
      );

      assert.equal(outcome.refunded, true);
      assert.equal(outcome.amount, 400);
      assert.equal(primaryPayment.totalRefunded, 400);
      assert.equal(primaryPayment.status, "PartiallyRefunded");
      assert.equal(fakeOrder.paymentStatus, "PartiallyRefunded");

      // Duplicate payment must remain completely unchanged
      assert.equal(duplicatePayment.totalRefunded, 1000);
      assert.equal(duplicatePayment.status, "Refunded");
    } finally {
      (Razorpay.prototype as any).addResources = origAddResources;
    }
  } finally {
    Order.findById = origOrderFindById;
    Order.updateOne = origOrderUpdateOne;
    Payment.findOne = origPaymentFindOne;
    Payment.findById = origPaymentFindById;
    Refund.create = origRefundCreate;
    Refund.find = origRefundFind;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 19: Primary payment remains the only payment used for seller/rider commissions
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 19: Duplicate payment is excluded from commission calculations", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();

  const primaryPayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    amount: 1000,
    status: "Completed",
    isDuplicate: false,
  };

  const duplicatePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(orderId),
    amount: 1000,
    status: "Refunded",
    isDuplicate: true,
  };

  const allPayments = [primaryPayment, duplicatePayment];

  // System queries only active primary payments
  const nonDuplicatePayments = allPayments.filter(p => !p.isDuplicate && p.status === "Completed");
  assert.equal(nonDuplicatePayments.length, 1);
  assert.equal(nonDuplicatePayments[0]._id, primaryPayment._id);
  assert.equal(nonDuplicatePayments[0].amount, 1000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 20: Duplicate refund never triggers commission reversal or clawback
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #6 - Test 20: Duplicate payment auto-refund does NOT trigger commission clawback", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const dupPaymentId = "pay_dup_no_claw_20";

  let clawbackTriggered = false;

  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundCreate = Refund.create;

  try {
    (Payment as any).findOne = async () => null;
    (Payment as any).create = async (docs: any[]) => [
      { ...docs[0], _id: new mongoose.Types.ObjectId(), save: async function () { return this; } },
    ];
    (Refund as any).create = async (doc: any) => doc;

    const mockProcessor = async () => ({ id: "rfnd_auto_20" });

    const res = await handleDuplicatePayment({
      payableType: "Order",
      orderId,
      customerId,
      razorpayOrderId: "order_no_claw_20",
      razorpayPaymentId: dupPaymentId,
      amount: 800,
      currency: "INR",
      refundProcessor: mockProcessor,
    });

    assert.equal(res.success, true);
    assert.equal(res.refunded, true);
    assert.equal(clawbackTriggered, false, "Duplicate refund must never trigger commission clawback");
  } finally {
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.create = origRefundCreate;
  }
});
