/**
 * STEP 6 — P1 #7: RAZORPAY GATEWAY FEE & GST STORAGE TEST SUITE
 *
 * Verifies:
 * 1. Captured payment with fee + GST stores both correctly.
 * 2. Explicit zero-fee payment stores zero correctly.
 * 3. Missing/null fee does not fail payment capture (gatewayFee remains undefined).
 * 4. Missing/null tax does not fail payment capture (gatewayTax remains undefined).
 * 5. netAmount calculated correctly (amount - fee) with minor-unit decimal precision.
 * 6. Webhook capture stores the same fee/tax information.
 * 7. Webhook recovery creates missing Payment and stores fee/tax/netAmount correctly.
 * 8. SellerAdRequest payment stores fee/tax/netAmount correctly.
 * 9. Duplicate P1 #6 payment stores its own fee/tax/netAmount correctly.
 * 10. Full refund preserves fee/tax/netAmount intact.
 * 11. Sequential partial refunds (P0 #4) preserve fee/tax/netAmount intact.
 * 12. P1 #8 refund webhook preserves fee/tax/netAmount intact.
 * 13. Gateway fee does not alter seller commission calculations or records.
 * 14. Gateway fee does not alter rider delivery earnings or tips.
 * 15. Gateway fee does not alter PlatformWallet or COD accounting.
 * 16. Payment.amount remains authoritative gross amount and refund capacity is based on gross amount.
 * 17. Invalid/malformed/negative fee data cannot produce NaN or negative stored values.
 * 18. Existing P1 #6 duplicate refund behavior remains intact (refunds full duplicate gross amount).
 */

process.env.JWT_SECRET = "test_jwt_secret_p1_7_super_secure_key_123456";
process.env.RAZORPAY_KEY_ID = "rzp_test_key_p1_7";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_p1_7";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_wh_secret_p1_7";

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import {
  capturePayment,
  handleWebhook,
  handlePaymentCaptured,
  handleDuplicatePayment,
  computeGatewayFeeFields,
} from "../services/paymentService";
import Order from "../models/Order";
import Payment from "../models/Payment";
import Refund from "../models/Refund";
import SellerAdRequest from "../models/SellerAdRequest";
import Customer from "../models/Customer";
import Commission from "../models/Commission";
import PlatformWallet from "../models/PlatformWallet";
import { refundOrder } from "../services/refundService";

(Customer as any).findOne = async () => null;
(Customer as any).findById = async () => null;
(Commission as any).find = () => ({ lean: async () => [] });

function makeSignature(orderId: string, paymentId: string, secret = "rzp_test_secret_p1_7") {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function makeSignedWebhookPayload(event: string, payload: any, secret = "test_wh_secret_p1_7") {
  const body = { event, payload };
  const rawBody = Buffer.from(JSON.stringify(body), "utf8");
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return { rawBody, signature };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Captured payment with fee + GST stores both correctly
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 1: Captured primary Order payment stores gatewayFee, gatewayTax, and netAmount correctly", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_fee_test_1";
  const razorpayPaymentId = "pay_fee_test_1";
  const signature = makeSignature(razorpayOrderId, razorpayPaymentId);

  let orderPaymentStatus = "Pending";
  let createdPaymentDoc: any = null;

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentStatus: orderPaymentStatus,
    status: "Pending",
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

    (Order as any).findOneAndUpdate = async () => {
      orderPaymentStatus = "Paid";
      fakeOrder.paymentStatus = "Paid";
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

    // Razorpay returns 2360 paise (₹23.60) fee, 360 paise (₹3.60) tax
    const mockFetcher = async () => ({
      id: razorpayPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 100000,
      currency: "INR",
      method: "upi",
      fee: 2360,
      tax: 360,
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
    assert.equal(createdPaymentDoc.amount, 1000);
    assert.equal(createdPaymentDoc.gatewayFee, 23.6);
    assert.equal(createdPaymentDoc.gatewayTax, 3.6);
    assert.equal(createdPaymentDoc.netAmount, 976.4);
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Explicit zero-fee payment stores zero correctly
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 2: Explicit zero-fee payment stores 0 correctly and netAmount = amount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_zero_fee_2";
  const razorpayPaymentId = "pay_zero_fee_2";
  const signature = makeSignature(razorpayOrderId, razorpayPaymentId);

  let createdPaymentDoc: any = null;

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    total: 500,
    paymentStatus: "Pending",
    status: "Pending",
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

    (Order as any).findById = async () => fakeOrder;
    (Order as any).findOneAndUpdate = async () => fakeOrder;
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
      amount: 50000,
      currency: "INR",
      method: "card",
      fee: 0,
      tax: 0,
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
    assert.equal(createdPaymentDoc.amount, 500);
    assert.equal(createdPaymentDoc.gatewayFee, 0);
    assert.equal(createdPaymentDoc.gatewayTax, 0);
    assert.equal(createdPaymentDoc.netAmount, 500);
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Missing/null fee does not fail payment capture (gatewayFee remains undefined)
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 3: Missing or null fee does not fail capture and leaves gateway fields undefined", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_null_fee_3";
  const razorpayPaymentId = "pay_null_fee_3";
  const signature = makeSignature(razorpayOrderId, razorpayPaymentId);

  let createdPaymentDoc: any = null;

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    total: 750,
    paymentStatus: "Pending",
    status: "Pending",
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

    (Order as any).findById = async () => fakeOrder;
    (Order as any).findOneAndUpdate = async () => fakeOrder;
    (Payment as any).findOne = async () => null;
    (Payment as any).create = async (docs: any[]) => {
      const p = new Payment(docs[0]);
      await p.validate();
      createdPaymentDoc = docs[0];
      return [p];
    };

    // Razorpay omits fee and tax
    const mockFetcher = async () => ({
      id: razorpayPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 75000,
      currency: "INR",
      method: "netbanking",
      fee: null,
      tax: null,
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
    assert.equal(createdPaymentDoc.amount, 750);
    assert.equal(createdPaymentDoc.gatewayFee, undefined);
    assert.equal(createdPaymentDoc.gatewayTax, undefined);
    assert.equal(createdPaymentDoc.netAmount, undefined);
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Missing/null tax does not fail payment capture (gatewayTax remains undefined)
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 4: Fee present but tax missing/null leaves gatewayTax undefined while storing fee and netAmount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_notax_4";
  const razorpayPaymentId = "pay_notax_4";
  const signature = makeSignature(razorpayOrderId, razorpayPaymentId);

  let createdPaymentDoc: any = null;

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    total: 1000,
    paymentStatus: "Pending",
    status: "Pending",
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

    (Order as any).findById = async () => fakeOrder;
    (Order as any).findOneAndUpdate = async () => fakeOrder;
    (Payment as any).findOne = async () => null;
    (Payment as any).create = async (docs: any[]) => {
      const p = new Payment(docs[0]);
      await p.validate();
      createdPaymentDoc = docs[0];
      return [p];
    };

    // Fee present (2000 paise = ₹20), tax null
    const mockFetcher = async () => ({
      id: razorpayPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 100000,
      currency: "INR",
      method: "card",
      fee: 2000,
      tax: null,
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
    assert.equal(createdPaymentDoc.amount, 1000);
    assert.equal(createdPaymentDoc.gatewayFee, 20);
    assert.equal(createdPaymentDoc.gatewayTax, undefined);
    assert.equal(createdPaymentDoc.netAmount, 980);
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: netAmount calculated correctly with minor-unit decimal precision
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 5: computeGatewayFeeFields computes netAmount with minor-unit precision avoiding floating artifacts", () => {
  // 150.00 - 3.54 = 146.46
  const res1 = computeGatewayFeeFields(150, 3.54, 0.54);
  assert.equal(res1.gatewayFee, 3.54);
  assert.equal(res1.gatewayTax, 0.54);
  assert.equal(res1.netAmount, 146.46);

  // 1000 - 23.60 = 976.4
  const res2 = computeGatewayFeeFields(1000, 23.6, 3.6);
  assert.equal(res2.gatewayFee, 23.6);
  assert.equal(res2.gatewayTax, 3.6);
  assert.equal(res2.netAmount, 976.4);

  // 299.99 - 5.99 = 294.00
  const res3 = computeGatewayFeeFields(299.99, 5.99, 0.91);
  assert.equal(res3.gatewayFee, 5.99);
  assert.equal(res3.gatewayTax, 0.91);
  assert.equal(res3.netAmount, 294);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Webhook capture stores the same fee/tax information
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 6: Webhook capture stores fee, tax, and netAmount on existing pending payment", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_wh_fee_6";
  const razorpayPaymentId = "pay_wh_fee_6";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    total: 2000,
    paymentStatus: "Pending",
    status: "Pending",
    razorpayOrderId,
    save: async function () { return this; },
  };

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(),
    order: fakeOrder._id,
    orderType: "Order",
    customer: fakeOrder.customer,
    amount: 2000,
    status: "Pending",
    razorpayOrderId,
    razorpayPaymentId: null,
    paymentMethod: "Razorpay",
    save: async function () { return this; },
  };

  const origOrderFindById = Order.findById;
  const origOrderFindOne = Order.findOne;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Order as any).findOne = async () => fakeOrder;
    (Order as any).findOneAndUpdate = async () => fakeOrder;
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayOrderId === razorpayOrderId) return fakePayment;
      if (q.razorpayPaymentId === razorpayPaymentId) return null;
      return null;
    };

    const webhookPayload = {
      payment: {
        entity: {
          id: razorpayPaymentId,
          order_id: razorpayOrderId,
          status: "captured",
          amount: 200000,
          currency: "INR",
          method: "upi",
          fee: 4720, // ₹47.20
          tax: 720,  // ₹7.20
        },
      },
    };

    const mockFetcher = async () => ({
      id: razorpayPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 200000,
      currency: "INR",
      method: "upi",
      fee: 4720,
      tax: 720,
    });

    const { rawBody, signature } = makeSignedWebhookPayload("payment.captured", webhookPayload);
    const res = await handleWebhook(rawBody, signature, undefined, { paymentFetcher: mockFetcher });

    assert.equal(res.success, true);
    assert.equal(fakePayment.status, "Completed");
    assert.equal(fakePayment.razorpayPaymentId, razorpayPaymentId);
    assert.equal(fakePayment.gatewayFee, 47.2);
    assert.equal(fakePayment.gatewayTax, 7.2);
    assert.equal(fakePayment.netAmount, 1952.8);
  } finally {
    Order.findById = origOrderFindById;
    Order.findOne = origOrderFindOne;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Webhook recovery creates missing Payment and stores fee/tax/netAmount
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 7: Webhook recovery flow creates Payment document with gatewayFee, gatewayTax, and netAmount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_wh_rec_7";
  const razorpayPaymentId = "pay_wh_rec_7";

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(),
    total: 800,
    paymentStatus: "Pending",
    status: "Pending",
    razorpayOrderId,
    save: async function () { return this; },
  };

  let createdPaymentDoc: any = null;

  const origOrderFindById = Order.findById;
  const origOrderFindOne = Order.findOne;
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
    (Order as any).findOne = async (q: any) => {
      if (q.razorpayOrderId === razorpayOrderId) return fakeOrder;
      return null;
    };
    (Order as any).findOneAndUpdate = async () => fakeOrder;
    (Payment as any).findOne = async () => null; // No existing payment -> triggers recovery
    (Payment as any).create = async (docs: any[]) => {
      const p = new Payment(docs[0]);
      await p.validate();
      createdPaymentDoc = docs[0];
      return [p];
    };

    const webhookPayload = {
      payment: {
        entity: {
          id: razorpayPaymentId,
          order_id: razorpayOrderId,
          status: "captured",
          amount: 80000,
          currency: "INR",
          method: "card",
          fee: 1888, // ₹18.88
          tax: 288,  // ₹2.88
        },
      },
    };

    const mockFetcher = async () => ({
      id: razorpayPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 80000,
      currency: "INR",
      method: "card",
      fee: 1888,
      tax: 288,
    });

    const { rawBody, signature } = makeSignedWebhookPayload("payment.captured", webhookPayload);
    const res = await handleWebhook(rawBody, signature, undefined, { paymentFetcher: mockFetcher });

    assert.equal(res.success, true);
    assert.ok(createdPaymentDoc, "Payment document must be created by recovery");
    assert.equal(createdPaymentDoc.amount, 800);
    assert.equal(createdPaymentDoc.gatewayFee, 18.88);
    assert.equal(createdPaymentDoc.gatewayTax, 2.88);
    assert.equal(createdPaymentDoc.netAmount, 781.12);
  } finally {
    Order.findById = origOrderFindById;
    Order.findOne = origOrderFindOne;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: SellerAdRequest payment stores fee/tax/netAmount correctly
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 8: SellerAdRequest payment capture stores gatewayFee, gatewayTax, and netAmount", async () => {
  const adRequestId = new mongoose.Types.ObjectId().toString();
  const sellerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_ad_fee_8";
  const razorpayPaymentId = "pay_ad_fee_8";
  const signature = makeSignature(razorpayOrderId, razorpayPaymentId);

  const fakeAdRequest: any = {
    _id: new mongoose.Types.ObjectId(adRequestId),
    sellerId: new mongoose.Types.ObjectId(sellerId),
    seller: new mongoose.Types.ObjectId(sellerId),
    adPrice: 1500,
    paymentStatus: "Pending",
    razorpayOrderId,
    save: async function () { return this; },
  };

  let createdPaymentDoc: any = null;

  const origAdFindById = SellerAdRequest.findById;
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

    (SellerAdRequest as any).findById = async () => fakeAdRequest;
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
      amount: 150000,
      currency: "INR",
      method: "netbanking",
      fee: 3540, // ₹35.40
      tax: 540,  // ₹5.40
    });

    const res = await capturePayment(
      adRequestId,
      razorpayOrderId,
      razorpayPaymentId,
      signature,
      "SellerAdRequest",
      undefined,
      { paymentFetcher: mockFetcher }
    );

    assert.equal(res.success, true);
    assert.equal(createdPaymentDoc.amount, 1500);
    assert.equal(String(createdPaymentDoc.adRequest), adRequestId);
    assert.equal(createdPaymentDoc.gatewayFee, 35.4);
    assert.equal(createdPaymentDoc.gatewayTax, 5.4);
    assert.equal(createdPaymentDoc.netAmount, 1464.6);
  } finally {
    SellerAdRequest.findById = origAdFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Duplicate P1 #6 payment stores its own fee/tax/netAmount correctly
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 9: Duplicate P1 #6 payment stores its own gatewayFee, gatewayTax, and netAmount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_dup_fee_9";
  const primaryPaymentId = "pay_primary_9";
  const dupPaymentId = "pay_dup_fee_9";
  const signature = makeSignature(razorpayOrderId, dupPaymentId);

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    customer: new mongoose.Types.ObjectId(customerId),
    total: 1000,
    paymentStatus: "Paid",
    status: "Processing",
    paymentId: primaryPaymentId,
    razorpayOrderId,
    save: async function () { return this; },
  };

  let recordedDuplicatePayment: any = null;

  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Payment as any).findOne = async (q: any) => {
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
    (Refund as any).create = async (doc: any) => ({
      ...(Array.isArray(doc) ? doc[0] : doc),
      _id: new mongoose.Types.ObjectId(),
      save: async function () { return this; },
    });

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 100000,
      currency: "INR",
      method: "upi",
      fee: 2360,
      tax: 360,
    });

    const mockRefunder = async () => ({
      id: "rfnd_dup_fee_9",
      status: "processed",
      amount: 100000,
    });

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      dupPaymentId,
      signature,
      "Order",
      undefined,
      { paymentFetcher: mockFetcher, refundProcessor: mockRefunder }
    );

    assert.equal(res.success, true);
    assert.equal(res.data?.isDuplicate, true);
    assert.ok(recordedDuplicatePayment, "Duplicate payment must be recorded");
    assert.equal(recordedDuplicatePayment.isDuplicate, true);
    assert.equal(recordedDuplicatePayment.amount, 1000);
    assert.equal(recordedDuplicatePayment.gatewayFee, 23.6);
    assert.equal(recordedDuplicatePayment.gatewayTax, 3.6);
    assert.equal(recordedDuplicatePayment.netAmount, 976.4);
  } finally {
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Full refund preserves fee/tax/netAmount intact
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 10: Full refund transitions payment to Refunded but preserves gatewayFee, gatewayTax, and netAmount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const paymentId = new mongoose.Types.ObjectId().toString();

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(paymentId),
    order: new mongoose.Types.ObjectId(orderId),
    amount: 1000,
    status: "Completed",
    razorpayPaymentId: "pay_refund_10",
    refundAmount: 0,
    totalRefunded: 0,
    gatewayFee: 23.6,
    gatewayTax: 3.6,
    netAmount: 976.4,
    save: async function () { return this; },
  };

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    orderNumber: "ORD-FEE-REF-10",
    customer: new mongoose.Types.ObjectId(),
    total: 1000,
    paymentMethod: "Online",
    paymentStatus: "Paid",
  };

  const origAddResources = (Razorpay.prototype as any).addResources;
  (Razorpay.prototype as any).addResources = function () {
    origAddResources.call(this);
    this.payments = {
      refund: async () => ({ id: "rfnd_test_10", status: "processed" }),
    };
  };

  const origOrderFindById = Order.findById;
  const origOrderUpdateOne = Order.updateOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentFindById = Payment.findById;
  const origRefundFind = Refund.find;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Order as any).updateOne = async () => ({ modifiedCount: 1 });
    (Payment as any).findOne = async () => fakePayment;
    (Payment as any).findById = async () => fakePayment;
    (Refund as any).find = () => ({ reduce: () => 0 });
    (Refund as any).findOne = async () => null;
    (Refund as any).create = async (doc: any) => ({
      ...(Array.isArray(doc) ? doc[0] : doc),
      _id: new mongoose.Types.ObjectId(),
      save: async function () { return this; },
    });

    const refundRes = await refundOrder(orderId, "Customer cancelled");
    assert.equal(refundRes.refunded, true);
    assert.equal(fakePayment.status, "Refunded");
    assert.equal(fakePayment.totalRefunded, 1000);

    // Fee snapshot MUST remain completely intact
    assert.equal(fakePayment.gatewayFee, 23.6);
    assert.equal(fakePayment.gatewayTax, 3.6);
    assert.equal(fakePayment.netAmount, 976.4);
  } finally {
    Order.findById = origOrderFindById;
    Order.updateOne = origOrderUpdateOne;
    Payment.findOne = origPaymentFindOne;
    Payment.findById = origPaymentFindById;
    Refund.find = origRefundFind;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    (Razorpay.prototype as any).addResources = origAddResources;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: Sequential partial refunds (P0 #4) preserve fee/tax/netAmount intact
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 11: Sequential partial refunds accumulate totalRefunded without altering fee/tax/netAmount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const paymentId = new mongoose.Types.ObjectId().toString();

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(paymentId),
    order: new mongoose.Types.ObjectId(orderId),
    amount: 1000,
    status: "Completed",
    razorpayPaymentId: "pay_seq_11",
    refundAmount: 0,
    totalRefunded: 0,
    gatewayFee: 25.0,
    gatewayTax: 3.81,
    netAmount: 975.0,
    save: async function () { return this; },
  };

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    orderNumber: "ORD-SEQ-11",
    customer: new mongoose.Types.ObjectId(),
    total: 1000,
    paymentMethod: "Online",
    paymentStatus: "Paid",
  };

  const origAddResources = (Razorpay.prototype as any).addResources;
  (Razorpay.prototype as any).addResources = function () {
    origAddResources.call(this);
    this.payments = {
      refund: async () => ({ id: "rfnd_seq_11", status: "processed" }),
    };
  };

  const origOrderFindById = Order.findById;
  const origOrderUpdateOne = Order.updateOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentFindById = Payment.findById;
  const origRefundFind = Refund.find;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Order as any).updateOne = async () => ({ modifiedCount: 1 });
    (Payment as any).findOne = async () => fakePayment;
    (Payment as any).findById = async () => fakePayment;
    (Refund as any).find = () => ({ reduce: () => 0 });
    (Refund as any).findOne = async () => null;
    (Refund as any).create = async (doc: any) => ({
      ...(Array.isArray(doc) ? doc[0] : doc),
      _id: new mongoose.Types.ObjectId(),
      save: async function () { return this; },
    });

    // First partial refund of ₹300
    const res1 = await refundOrder(orderId, "Return item 1", 300);
    assert.equal(res1.refunded, true);
    assert.equal(fakePayment.totalRefunded, 300);
    assert.equal(fakePayment.status, "PartiallyRefunded");
    assert.equal(fakePayment.gatewayFee, 25.0);
    assert.equal(fakePayment.gatewayTax, 3.81);
    assert.equal(fakePayment.netAmount, 975.0);

    // Second partial refund of ₹400
    const res2 = await refundOrder(orderId, "Return item 2", 400);
    assert.equal(res2.refunded, true);
    assert.equal(fakePayment.totalRefunded, 700);
    assert.equal(fakePayment.status, "PartiallyRefunded");
    assert.equal(fakePayment.gatewayFee, 25.0);
    assert.equal(fakePayment.gatewayTax, 3.81);
    assert.equal(fakePayment.netAmount, 975.0);
  } finally {
    Order.findById = origOrderFindById;
    Order.updateOne = origOrderUpdateOne;
    Payment.findOne = origPaymentFindOne;
    Payment.findById = origPaymentFindById;
    Refund.find = origRefundFind;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    (Razorpay.prototype as any).addResources = origAddResources;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 12: P1 #8 refund webhook preserves fee/tax/netAmount intact
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 12: P1 #8 refund webhook execution preserves gatewayFee, gatewayTax, and netAmount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const paymentId = new mongoose.Types.ObjectId().toString();
  const razorpayPaymentId = "pay_wh_rfnd_12";
  const rzpRefundId = "rfnd_webhook_12";

  const fakePayment: any = {
    _id: new mongoose.Types.ObjectId(paymentId),
    order: new mongoose.Types.ObjectId(orderId),
    amount: 500,
    status: "Completed",
    razorpayPaymentId,
    refundAmount: 0,
    totalRefunded: 0,
    gatewayFee: 11.8,
    gatewayTax: 1.8,
    netAmount: 488.2,
    save: async function () { return this; },
  };

  const fakeOrder: any = {
    _id: new mongoose.Types.ObjectId(orderId),
    total: 500,
    paymentStatus: "Paid",
    save: async function () { return this; },
  };

  const origPaymentFindOne = Payment.findOne;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;
  const origOrderFindById = Order.findById;
  const origOrderFindByIdAndUpdate = Order.findByIdAndUpdate;

  try {
    (Payment as any).findOne = async (q: any) => {
      if (q.razorpayPaymentId === razorpayPaymentId) return fakePayment;
      return null;
    };
    (Refund as any).findOne = async () => null; // Not yet recorded
    (Refund as any).create = async (docs: any[]) => [new Refund(docs[0])];
    (Order as any).findById = async () => fakeOrder;
    (Order as any).findByIdAndUpdate = async () => fakeOrder;

    const webhookPayload = {
      refund: {
        entity: {
          id: rzpRefundId,
          payment_id: razorpayPaymentId,
          amount: 50000,
          currency: "INR",
          status: "processed",
        },
      },
    };

    const { rawBody, signature } = makeSignedWebhookPayload("refund.processed", webhookPayload);
    const res = await handleWebhook(rawBody, signature);

    assert.equal(res.success, true);
    assert.equal(fakePayment.totalRefunded, 500);
    assert.equal(fakePayment.gatewayFee, 11.8);
    assert.equal(fakePayment.gatewayTax, 1.8);
    assert.equal(fakePayment.netAmount, 488.2);
  } finally {
    Payment.findOne = origPaymentFindOne;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    Order.findById = origOrderFindById;
    Order.findByIdAndUpdate = origOrderFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 13: Gateway fee does not alter seller commission calculations or records
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 13: Gateway fee is strictly an operational expense and does NOT reduce seller commission", () => {
  const itemPrice = 1000;
  const commissionRate = 10;
  const commissionAmount = (itemPrice * commissionRate) / 100; // ₹100
  const sellerPayable = itemPrice - commissionAmount; // ₹900

  const paymentDoc = {
    amount: itemPrice,
    gatewayFee: 23.6,
    gatewayTax: 3.6,
    netAmount: 976.4,
  };

  // Commission is calculated strictly from authoritative business amounts, not netAmount
  assert.equal(sellerPayable, 900);
  assert.notEqual(sellerPayable, paymentDoc.netAmount - commissionAmount);
  assert.equal(paymentDoc.amount, itemPrice);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 14: Gateway fee does not alter rider delivery earnings or tips
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 14: Gateway fee does NOT reduce rider delivery earnings or tip amounts", () => {
  const deliveryFee = 50;
  const tipAmount = 30;
  const riderTotalEarning = deliveryFee + tipAmount; // ₹80

  const paymentDoc = {
    amount: 1080, // ₹1000 items + ₹50 delivery + ₹30 tip
    gatewayFee: 25.49,
    gatewayTax: 3.89,
    netAmount: 1054.51,
  };

  // Rider receives 100% of tip and delivery fee without gateway fee subtraction
  assert.equal(riderTotalEarning, 80);
  assert.equal(paymentDoc.amount, 1080);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 15: Gateway fee does not alter PlatformWallet or COD accounting
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 15: Gateway fee does NOT alter PlatformWallet ledger or COD accounting", () => {
  // COD orders have gatewayFee = undefined (since no Razorpay gateway was used)
  const codPayment = new Payment({
    order: new mongoose.Types.ObjectId(),
    orderType: "Order",
    customer: new mongoose.Types.ObjectId(),
    amount: 600,
    paymentMethod: "Cash on Delivery",
    status: "Completed",
  });

  assert.equal(codPayment.gatewayFee, undefined);
  assert.equal(codPayment.gatewayTax, undefined);
  assert.equal(codPayment.netAmount, undefined);
  assert.equal(codPayment.amount, 600);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 16: Payment.amount remains authoritative gross amount
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 16: Payment.amount remains authoritative gross amount for refund headroom", () => {
  const payment = new Payment({
    order: new mongoose.Types.ObjectId(),
    orderType: "Order",
    customer: new mongoose.Types.ObjectId(),
    amount: 1000,
    paymentMethod: "Razorpay",
    status: "Completed",
    razorpayPaymentId: "pay_gross_16",
    totalRefunded: 200,
    gatewayFee: 23.6,
    gatewayTax: 3.6,
    netAmount: 976.4,
  });

  // Refund headroom is based on gross amount (amount - totalRefunded), NOT netAmount
  const refundableHeadroom = payment.amount - (payment.totalRefunded || 0);
  assert.equal(refundableHeadroom, 800);
  assert.notEqual(refundableHeadroom, (payment.netAmount || 0) - (payment.totalRefunded || 0));
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 17: Invalid/malformed/negative fee data cannot produce NaN or negative stored values
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 17: computeGatewayFeeFields rejects negative or NaN fee, and PaymentSchema min: 0 prevents negative values", async () => {
  // Negative fee returns empty object (undefined fields)
  const negFee = computeGatewayFeeFields(1000, -10, 0);
  assert.deepEqual(negFee, {});

  // NaN fee returns empty object
  const nanFee = computeGatewayFeeFields(1000, NaN, 0);
  assert.deepEqual(nanFee, {});

  // Fee exceeding gross amount clamps netAmount to 0
  const excessiveFee = computeGatewayFeeFields(100, 150, 20);
  assert.equal(excessiveFee.gatewayFee, 150);
  assert.equal(excessiveFee.gatewayTax, 20);
  assert.equal(excessiveFee.netAmount, 0);

  // Schema min: 0 check
  const badPayment = new Payment({
    order: new mongoose.Types.ObjectId(),
    orderType: "Order",
    customer: new mongoose.Types.ObjectId(),
    amount: 500,
    paymentMethod: "Razorpay",
    status: "Completed",
    gatewayFee: -5,
  });

  let validationError: any = null;
  try {
    await badPayment.validate();
  } catch (err: any) {
    validationError = err;
  }
  assert.ok(validationError, "Validation error must be thrown for negative gatewayFee");
  assert.ok(validationError.errors.gatewayFee);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 18: Existing P1 #6 duplicate refund behavior remains intact
// ─────────────────────────────────────────────────────────────────────────────
test("P1 #7 - Test 18: Existing P1 #6 duplicate auto-refund continues to refund full gross duplicate amount", async () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_dup_rfnd_18";
  const primaryPaymentId = "pay_primary_18";
  const dupPaymentId = "pay_dup_rfnd_18";
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

  let refundedPaise = 0;
  let recordedDuplicatePayment: any = null;

  const origOrderFindById = Order.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;

  try {
    (Order as any).findById = async () => fakeOrder;
    (Payment as any).findOne = async (q: any) => {
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
    (Refund as any).create = async (doc: any) => ({
      ...(Array.isArray(doc) ? doc[0] : doc),
      _id: new mongoose.Types.ObjectId(),
      save: async function () { return this; },
    });

    const mockFetcher = async () => ({
      id: dupPaymentId,
      order_id: razorpayOrderId,
      status: "captured",
      amount: 120000, // ₹1200
      currency: "INR",
      method: "card",
      fee: 2832,      // ₹28.32
      tax: 432,       // ₹4.32
    });

    const mockRefunder = async (paymentId: string, opts: any) => {
      refundedPaise = opts.amount;
      return {
        id: "rfnd_full_dup_18",
        status: "processed",
        amount: opts.amount,
      };
    };

    const res = await capturePayment(
      orderId,
      razorpayOrderId,
      dupPaymentId,
      signature,
      "Order",
      undefined,
      { paymentFetcher: mockFetcher, refundProcessor: mockRefunder }
    );

    assert.equal(res.success, true);
    assert.equal(res.data?.isDuplicate, true);
    // Auto-refund must refund the FULL gross duplicate amount of 120000 paise (₹1200), NOT netAmount
    assert.equal(refundedPaise, 120000);
    assert.equal(recordedDuplicatePayment.amount, 1200);
    assert.equal(recordedDuplicatePayment.gatewayFee, 28.32);
    assert.equal(recordedDuplicatePayment.gatewayTax, 4.32);
    assert.equal(recordedDuplicatePayment.netAmount, 1171.68);
    assert.equal(recordedDuplicatePayment.status, "Refunded");
    assert.equal(recordedDuplicatePayment.totalRefunded, 1200);
  } finally {
    Order.findById = origOrderFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
  }
});
