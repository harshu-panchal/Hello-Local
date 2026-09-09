/**
 * P0 #3 TEST SUITE: AD REQUEST RAZORPAY PAYMENT SCHEMA FIX
 *
 * Verifies:
 * 1. Valid customer order Payment remains valid (Unit/Schema validation).
 * 2. Valid ad-request Payment is now valid (Unit/Schema validation).
 * 3. Customer order Payment without order is rejected (Unit/Schema validation).
 * 4. Customer order Payment without customer is rejected (Unit/Schema validation).
 * 5. Ad-request Payment without adRequest is rejected (Unit/Schema validation).
 * 6. Ad-request Payment without seller is rejected (Unit/Schema validation).
 * 7. Payment with neither context is rejected (Unit/Schema validation).
 * 8. Conflicting context (both order and adRequest) is rejected (Unit/Schema validation).
 * 9. Normal Razorpay customer payment flow remains intact (Real service execution).
 * 10. Ad-request Razorpay capture (captureAdRequestPayment) succeeds with real service execution (Real service execution).
 * 11. Duplicate ad-request payment remains protected via replay guard (Real service execution).
 * 12. Existing payment/refund queries continue to work (Static/Invariant & Query compatibility).
 *
 * Classifications:
 * - Schema / Model Invariant: Tests 1, 2, 3, 4, 5, 6, 7, 8, 12
 * - Real Service Execution: Tests 9, 10, 11
 */

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Setup test secrets
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_p0_3";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "p0_3_secret";

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Valid customer order Payment remains valid
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 1: Valid customer order Payment validates successfully", async () => {
  const Payment = (await import("../models/Payment")).default;

  const orderPayment = new Payment({
    order: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    paymentMethod: "Online",
    paymentGateway: "Razorpay",
    razorpayOrderId: "order_rzp_123",
    razorpayPaymentId: "pay_rzp_123",
    amount: 1499,
    currency: "INR",
    status: "Completed",
  });

  await orderPayment.validate();
  assert.ok(orderPayment.order, "Order reference must exist");
  assert.ok(orderPayment.customer, "Customer reference must exist");
  assert.equal(orderPayment.adRequest, undefined);
  assert.equal(orderPayment.seller, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Valid ad-request Payment is now valid
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 2: Valid ad-request Payment validates successfully", async () => {
  const Payment = (await import("../models/Payment")).default;

  const adPayment = new Payment({
    adRequest: new mongoose.Types.ObjectId(),
    seller: new mongoose.Types.ObjectId(),
    paymentMethod: "Online",
    paymentGateway: "Razorpay",
    razorpayOrderId: "order_ad_rzp_456",
    razorpayPaymentId: "pay_ad_rzp_456",
    amount: 2500,
    currency: "INR",
    status: "Completed",
  });

  await adPayment.validate();
  assert.ok(adPayment.adRequest, "AdRequest reference must exist");
  assert.ok(adPayment.seller, "Seller reference must exist");
  assert.equal(adPayment.order, undefined);
  assert.equal(adPayment.customer, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Customer order Payment without order is rejected
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 3: Customer order Payment without order is rejected", async () => {
  const Payment = (await import("../models/Payment")).default;

  const invalidPayment = new Payment({
    customer: new mongoose.Types.ObjectId(),
    paymentMethod: "Online",
    amount: 500,
  });

  let error: any = null;
  try {
    await invalidPayment.validate();
  } catch (err) {
    error = err;
  }

  assert.ok(error, "Must reject payment without order");
  assert.ok(
    error.errors?.order?.message?.includes("Order is required"),
    `Expected order error message, got: ${error.errors?.order?.message}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Customer order Payment without customer is rejected
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 4: Customer order Payment without customer is rejected", async () => {
  const Payment = (await import("../models/Payment")).default;

  const invalidPayment = new Payment({
    order: new mongoose.Types.ObjectId(),
    paymentMethod: "Online",
    amount: 500,
  });

  let error: any = null;
  try {
    await invalidPayment.validate();
  } catch (err) {
    error = err;
  }

  assert.ok(error, "Must reject payment without customer");
  assert.ok(
    error.errors?.customer?.message?.includes("Customer is required"),
    `Expected customer error message, got: ${error.errors?.customer?.message}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Ad-request Payment without adRequest is rejected
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 5: Ad-request Payment without adRequest is rejected", async () => {
  const Payment = (await import("../models/Payment")).default;

  const invalidPayment = new Payment({
    seller: new mongoose.Types.ObjectId(),
    paymentMethod: "Online",
    amount: 1500,
  });

  let error: any = null;
  try {
    await invalidPayment.validate();
  } catch (err) {
    error = err;
  }

  assert.ok(error, "Must reject payment without adRequest");
  assert.ok(
    error.errors?.adRequest?.message?.includes("AdRequest is required"),
    `Expected adRequest error message, got: ${error.errors?.adRequest?.message}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Ad-request Payment without seller is rejected
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 6: Ad-request Payment without seller is rejected", async () => {
  const Payment = (await import("../models/Payment")).default;

  const invalidPayment = new Payment({
    adRequest: new mongoose.Types.ObjectId(),
    paymentMethod: "Online",
    amount: 1500,
  });

  let error: any = null;
  try {
    await invalidPayment.validate();
  } catch (err) {
    error = err;
  }

  assert.ok(error, "Must reject payment without seller");
  assert.ok(
    error.errors?.seller?.message?.includes("Seller is required"),
    `Expected seller error message, got: ${error.errors?.seller?.message}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Payment with neither context is rejected
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 7: Payment with neither context is rejected", async () => {
  const Payment = (await import("../models/Payment")).default;

  const emptyPayment = new Payment({
    paymentMethod: "Online",
    amount: 100,
  });

  let error: any = null;
  try {
    await emptyPayment.validate();
  } catch (err) {
    error = err;
  }

  assert.ok(error, "Must reject payment with no context");
  assert.ok(
    error.errors?.order || error.errors?.adRequest,
    "Expected error on order or adRequest"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Conflicting context (both order and adRequest) is rejected
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 8: Conflicting context (both order and adRequest) is rejected", async () => {
  const Payment = (await import("../models/Payment")).default;

  const conflictingPayment = new Payment({
    order: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    adRequest: new mongoose.Types.ObjectId(),
    seller: new mongoose.Types.ObjectId(),
    paymentMethod: "Online",
    amount: 500,
  });

  let error: any = null;
  try {
    await conflictingPayment.validate();
  } catch (err) {
    error = err;
  }

  assert.ok(error, "Must reject conflicting context");
  assert.ok(
    error.errors?.order?.message?.includes("cannot have both Order and AdRequest") ||
    error.errors?.adRequest?.message?.includes("cannot have both Order and AdRequest"),
    `Expected conflicting context message, got: ${JSON.stringify(error.errors)}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Normal Razorpay customer payment flow remains intact
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 9: capturePayment for Order creates valid payment with order context", async () => {
  const { capturePayment } = await import("../services/paymentService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;
  const crypto = await import("node:crypto");
  const Razorpay = (await import("razorpay")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_cust_flow_9";
  const razorpayPaymentId = "pay_cust_flow_9";

  const keySecret = process.env.RAZORPAY_KEY_SECRET || "p0_3_secret";
  const razorpaySignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const origOrderFindById = Order.findById;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;
  const origAddResources = (Razorpay.prototype as any).addResources;

  const Customer = (await import("../models/Customer")).default;
  const Commission = (await import("../models/Commission")).default;
  const origCustomerFindOne = Customer.findOne;
  const origCommissionFind = Commission.find;

  let createdPaymentDoc: any = null;
  let orderUpdatedToPaid = false;

  try {
    (Razorpay.prototype as any).addResources = function () {
      origAddResources.call(this);
      this.payments = {
        fetch: async (pid: string) => ({
          id: pid,
          order_id: razorpayOrderId,
          status: "captured",
          amount: 85000,
          currency: "INR",
          method: "upi",
        }),
      };
    };

    (Customer as any).findOne = () => ({ lean: async () => null, select: () => ({ lean: async () => null }) });
    (Commission as any).find = () => ({ lean: async () => [] });

    (Order as any).findById = (id: string) => {
      const doc = {
        _id: new mongoose.Types.ObjectId(orderId),
        customer: new mongoose.Types.ObjectId(customerId),
        total: 850,
        paymentStatus: "Pending",
        status: "Pending",
        razorpayOrderId,
        items: [],
      };
      return {
        ...doc,
        populate: async () => ({ ...doc, items: [] }),
        then: (resolve: any) => resolve(doc),
      };
    };

    (Payment as any).findOne = async () => null;

    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    });

    (Payment as any).create = async (docs: any[]) => {
      // Validate schema on actual Payment document
      const doc = new Payment(docs[0]);
      await doc.validate();
      createdPaymentDoc = docs[0];
      return [doc];
    };

    (Order as any).findOneAndUpdate = async (filter: any, update: any) => {
      orderUpdatedToPaid = true;
      return { _id: orderId, paymentStatus: "Paid", status: "Received" };
    };

    const result = await capturePayment(
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      "Order"
    );

    assert.equal(result.success, true);
    assert.ok(createdPaymentDoc, "Payment document must be created");
    assert.equal(createdPaymentDoc.order, orderId);
    assert.equal(createdPaymentDoc.customer, customerId);
    assert.equal(createdPaymentDoc.adRequest, undefined);
    assert.equal(createdPaymentDoc.seller, undefined);
    assert.equal(orderUpdatedToPaid, true);
  } finally {
    Order.findById = origOrderFindById;
    Order.findOneAndUpdate = origOrderFindOneAndUpdate;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
    (Razorpay.prototype as any).addResources = origAddResources;
    Customer.findOne = origCustomerFindOne;
    Commission.find = origCommissionFind;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Ad-request Razorpay capture (captureAdRequestPayment) succeeds with real service execution
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 10: capturePayment for AdRequest creates valid payment without ValidationError", async () => {
  const { capturePayment } = await import("../services/paymentService");
  const SellerAdRequest = (await import("../models/SellerAdRequest")).default;
  const Payment = (await import("../models/Payment")).default;
  const crypto = await import("node:crypto");
  const Razorpay = (await import("razorpay")).default;

  const adRequestId = new mongoose.Types.ObjectId().toString();
  const sellerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_ad_flow_10";
  const razorpayPaymentId = "pay_ad_flow_10";

  const keySecret = process.env.RAZORPAY_KEY_SECRET || "p0_3_secret";
  const razorpaySignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const origAdFindById = SellerAdRequest.findById;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origStartSession = mongoose.startSession;
  const origAddResources = (Razorpay.prototype as any).addResources;

  let createdPaymentDoc: any = null;
  let savedAdRequest: any = null;

  try {
    (Razorpay.prototype as any).addResources = function () {
      origAddResources.call(this);
      this.payments = {
        fetch: async (pid: string) => ({
          id: pid,
          order_id: razorpayOrderId,
          status: "captured",
          amount: 300000,
          currency: "INR",
          method: "card",
        }),
      };
    };

    (SellerAdRequest as any).findById = async (id: string) => {
      if (String(id) === adRequestId) {
        return {
          _id: new mongoose.Types.ObjectId(adRequestId),
          sellerId: new mongoose.Types.ObjectId(sellerId),
          adPrice: 3000,
          paymentStatus: "Unpaid",
          status: "Approved",
          razorpayOrderId,
          save: async function () {
            savedAdRequest = this;
            return this;
          },
        };
      }
      return null;
    };

    (Payment as any).findOne = async () => null;

    (mongoose as any).startSession = async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    });

    (Payment as any).create = async (docs: any[]) => {
      // Validate schema on actual Payment document instance
      const doc = new Payment(docs[0]);
      await doc.validate();
      createdPaymentDoc = docs[0];
      return [doc];
    };

    const result = await capturePayment(
      adRequestId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      "AdRequest"
    );

    assert.equal(result.success, true, `capturePayment should succeed: ${result.message}`);
    assert.ok(createdPaymentDoc, "Payment document must be created");
    assert.equal(createdPaymentDoc.adRequest, adRequestId);
    assert.equal(createdPaymentDoc.seller, sellerId);
    assert.equal(createdPaymentDoc.order, undefined);
    assert.equal(createdPaymentDoc.customer, undefined);
    assert.equal(createdPaymentDoc.amount, 3000);
    assert.equal(createdPaymentDoc.status, "Completed");

    assert.ok(savedAdRequest, "AdRequest must be saved");
    assert.equal(savedAdRequest.paymentStatus, "Paid");
    assert.equal(savedAdRequest.status, "PaymentVerified");
    assert.equal(savedAdRequest.paymentReference, razorpayPaymentId);
  } finally {
    SellerAdRequest.findById = origAdFindById;
    Payment.findOne = origPaymentFindOne;
    Payment.create = origPaymentCreate;
    mongoose.startSession = origStartSession;
    (Razorpay.prototype as any).addResources = origAddResources;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: Duplicate ad-request payment remains protected via replay guard
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 11: Duplicate ad-request payment is caught by replay guard", async () => {
  const { capturePayment } = await import("../services/paymentService");
  const Payment = (await import("../models/Payment")).default;

  const adRequestId = new mongoose.Types.ObjectId().toString();
  const differentAdRequestId = new mongoose.Types.ObjectId().toString();
  const razorpayPaymentId = "pay_ad_replay_11";

  const origPaymentFindOne = Payment.findOne;

  try {
    // 1. Same ad request repeating capture -> idempotent success
    (Payment as any).findOne = async (query: any) => {
      if (query.razorpayPaymentId === razorpayPaymentId) {
        return {
          adRequest: new mongoose.Types.ObjectId(adRequestId),
          get: (field: string) => (field === "adRequest" ? adRequestId : undefined),
          status: "Completed",
        };
      }
      return null;
    };

    const replaySame = await capturePayment(
      adRequestId,
      "order_same",
      razorpayPaymentId,
      "sig_same",
      "AdRequest"
    );
    assert.equal(replaySame.success, true);
    assert.equal(replaySame.message, "Payment already captured");

    // 2. Different ad request trying to consume same payment -> rejected
    const replayDifferent = await capturePayment(
      differentAdRequestId,
      "order_diff",
      razorpayPaymentId,
      "sig_diff",
      "AdRequest"
    );
    assert.equal(replayDifferent.success, false);
    assert.equal(replayDifferent.message, "This payment has already been used for another order.");
  } finally {
    Payment.findOne = origPaymentFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 12: Existing payment/refund queries continue to work
// ─────────────────────────────────────────────────────────────────────────────
test("P0 #3 - Test 12: Schema paths, indexes, and query compatibility are preserved", async () => {
  const Payment = (await import("../models/Payment")).default;
  const schema = Payment.schema;

  // Verify paths exist
  assert.ok(schema.path("order"), "order path must exist");
  assert.ok(schema.path("customer"), "customer path must exist");
  assert.ok(schema.path("adRequest"), "adRequest path must exist");
  assert.ok(schema.path("seller"), "seller path must exist");
  assert.ok(schema.path("razorpayPaymentId"), "razorpayPaymentId path must exist");

  // Verify razorpayPaymentId sparse unique index is preserved
  const rzpPath = schema.path("razorpayPaymentId");
  assert.equal((rzpPath as any).options?.unique, true, "razorpayPaymentId must be unique");
  assert.equal((rzpPath as any).options?.sparse, true, "razorpayPaymentId must be sparse");

  // Verify schema indexes contain adRequest and seller
  const indexes = schema.indexes();
  const indexedFields = indexes.map((idx: any) => Object.keys(idx[0])[0]);

  assert.ok(indexedFields.includes("order"), "order must be indexed");
  assert.ok(indexedFields.includes("customer"), "customer must be indexed");
  assert.ok(indexedFields.includes("adRequest"), "adRequest must be indexed");
  assert.ok(indexedFields.includes("seller"), "seller must be indexed");
  assert.ok(indexedFields.includes("status"), "status must be indexed");
});
