/**
 * STEP 6 — P2 #1: PREPAID SETTLEMENT VISIBILITY & UTR TRACKING TEST SUITE
 *
 * Verifies:
 * 1. Valid settlement.processed creates Settlement record.
 * 2. Correct settlement ID is stored.
 * 3. Amount paise -> rupees conversion is correct.
 * 4. Fees paise -> rupees conversion is correct.
 * 5. Tax paise -> rupees conversion is correct.
 * 6. UTR is stored correctly.
 * 7. Settlement timestamp is converted correctly.
 * 8. Missing UTR is accepted (utr remains undefined).
 * 9. Missing fee/tax remain undefined rather than becoming false zero values.
 * 10. Repeated same settlement webhook is idempotent.
 * 11. Concurrent duplicate settlement ingestion does not create multiple records.
 * 12. Invalid/missing settlement ID is safely rejected.
 * 13. Malformed monetary values cannot create NaN/negative stored values.
 * 14. Settlement processing does not modify Payment.
 * 15. Settlement processing does not modify Order.
 * 16. Settlement processing does not modify Commission.
 * 17. Settlement processing does not modify PlatformWallet/Wallet.
 * 18. Settlement processing does not affect COD.
 * 19. Existing P1 #6 duplicate-payment behavior remains intact.
 * 20. Existing P1 #7 gateway fee/tax snapshots remain intact.
 */

process.env.JWT_SECRET = "test_jwt_secret_p2_1_super_secure_key_123456";
process.env.RAZORPAY_KEY_ID = "rzp_test_key_p2_1";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_p2_1";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_wh_secret_p2_1";

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import crypto from "node:crypto";
import Settlement, { ISettlement } from "../models/Settlement";
import Payment from "../models/Payment";
import Order from "../models/Order";
import Commission from "../models/Commission";
import PlatformWallet from "../models/PlatformWallet";
import WalletTransaction from "../models/WalletTransaction";
import Customer from "../models/Customer";
import {
  handleWebhook,
  handleSettlementProcessed,
  computeGatewayFeeFields,
} from "../services/paymentService";

(Customer as any).findOne = async () => null;
(Customer as any).findById = async () => null;
(Commission as any).find = () => ({ lean: async () => [] });

function makeSignedWebhookPayload(event: string, payload: any, secret = "test_wh_secret_p2_1") {
  const body = { event, payload };
  const rawBody = Buffer.from(JSON.stringify(body), "utf8");
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return { rawBody, signature };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Valid settlement.processed creates Settlement record
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 1: Valid settlement.processed creates Settlement record via handleWebhook", async () => {
  const settlementPayload = {
    settlement: {
      entity: {
        id: "setl_test_001",
        amount: 298000,
        status: "processed",
        fees: 2000,
        tax: 360,
        utr: "UTR1234567890",
        created_at: 1621234567,
      },
    },
  };

  let createdDoc: any = null;
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      createdDoc = doc;
      return doc;
    };

    const { rawBody, signature } = makeSignedWebhookPayload("settlement.processed", settlementPayload);
    const result = await handleWebhook(rawBody, signature);

    assert.equal(result.success, true);
    assert.ok(createdDoc, "Settlement record must be created");
    assert.equal(createdDoc.settlementId, "setl_test_001");
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Correct settlement ID is stored
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 2: Correct settlement ID is stored and trimmed", async () => {
  const payload = {
    id: "  setl_unique_id_999  ",
    amount: 50000,
    status: "processed",
  };

  let createdDoc: any = null;
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      createdDoc = doc;
      return doc;
    };

    await handleSettlementProcessed(payload);
    assert.equal(createdDoc.settlementId, "setl_unique_id_999");
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Amount paise -> rupees conversion is correct
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 3: Amount paise to rupees conversion with decimal precision", async () => {
  const payload = {
    id: "setl_amt_test",
    amount: 123456, // 1234.56 INR
    status: "processed",
  };

  let createdDoc: any = null;
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      createdDoc = doc;
      return doc;
    };

    await handleSettlementProcessed(payload);
    assert.equal(createdDoc.amount, 1234.56);
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Fees paise -> rupees conversion is correct
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 4: Fees paise to rupees conversion and explicit zero preserved", async () => {
  const payloadWithFees = {
    id: "setl_fee_1",
    amount: 100000,
    fees: 2360, // 23.60 INR
    status: "processed",
  };

  const payloadZeroFees = {
    id: "setl_fee_2",
    amount: 100000,
    fees: 0,
    status: "processed",
  };

  let savedDocs: any[] = [];
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      savedDocs.push(doc);
      return doc;
    };

    await handleSettlementProcessed(payloadWithFees);
    assert.equal(savedDocs[0].fees, 23.6);

    await handleSettlementProcessed(payloadZeroFees);
    assert.equal(savedDocs[1].fees, 0);
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Tax paise -> rupees conversion is correct
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 5: Tax paise to rupees conversion and explicit zero preserved", async () => {
  const payloadWithTax = {
    id: "setl_tax_1",
    amount: 100000,
    tax: 425, // 4.25 INR
    status: "processed",
  };

  const payloadZeroTax = {
    id: "setl_tax_2",
    amount: 100000,
    tax: 0,
    status: "processed",
  };

  let savedDocs: any[] = [];
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      savedDocs.push(doc);
      return doc;
    };

    await handleSettlementProcessed(payloadWithTax);
    assert.equal(savedDocs[0].tax, 4.25);

    await handleSettlementProcessed(payloadZeroTax);
    assert.equal(savedDocs[1].tax, 0);
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: UTR is stored correctly
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 6: UTR string is stored and whitespace is trimmed", async () => {
  const payload = {
    id: "setl_utr_1",
    amount: 50000,
    utr: "  P123456789012345  ",
    status: "processed",
  };

  let createdDoc: any = null;
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      createdDoc = doc;
      return doc;
    };

    await handleSettlementProcessed(payload);
    assert.equal(createdDoc.utr, "P123456789012345");
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Settlement timestamp is converted correctly
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 7: Settlement timestamp converted from epoch seconds and ISO string", async () => {
  const payloadSeconds = {
    id: "setl_time_1",
    amount: 50000,
    created_at: 1621234567, // epoch seconds
    status: "processed",
  };

  const payloadIso = {
    id: "setl_time_2",
    amount: 50000,
    created_at: "2026-06-15T10:30:00.000Z",
    status: "processed",
  };

  let savedDocs: any[] = [];
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      savedDocs.push(doc);
      return doc;
    };

    await handleSettlementProcessed(payloadSeconds);
    assert.equal(savedDocs[0].settledAt.getTime(), 1621234567000);

    await handleSettlementProcessed(payloadIso);
    assert.equal(savedDocs[1].settledAt.toISOString(), "2026-06-15T10:30:00.000Z");
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Missing UTR is accepted (utr remains undefined)
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 8: Missing/null/empty UTR leaves utr field undefined", async () => {
  const payloadMissingUtr = {
    id: "setl_no_utr_1",
    amount: 50000,
    status: "processed",
  };

  const payloadNullUtr = {
    id: "setl_no_utr_2",
    amount: 50000,
    utr: null,
    status: "processed",
  };

  const payloadEmptyUtr = {
    id: "setl_no_utr_3",
    amount: 50000,
    utr: "   ",
    status: "processed",
  };

  let savedDocs: any[] = [];
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      savedDocs.push(doc);
      return doc;
    };

    await handleSettlementProcessed(payloadMissingUtr);
    assert.equal(savedDocs[0].utr, undefined);

    await handleSettlementProcessed(payloadNullUtr);
    assert.equal(savedDocs[1].utr, undefined);

    await handleSettlementProcessed(payloadEmptyUtr);
    assert.equal(savedDocs[2].utr, undefined);
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Missing fee/tax remain undefined rather than becoming false zero values
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 9: Missing fee/tax remain undefined (not false zero)", async () => {
  const payload = {
    id: "setl_no_fees_tax",
    amount: 50000,
    status: "processed",
  };

  let createdDoc: any = null;
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      const s = new Settlement(doc);
      await s.validate();
      createdDoc = doc;
      return doc;
    };

    await handleSettlementProcessed(payload);
    assert.equal(createdDoc.fees, undefined);
    assert.equal(createdDoc.tax, undefined);
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Repeated same settlement webhook is idempotent
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 10: Repeated delivery of same settlement webhook exits idempotently without duplicate create", async () => {
  const existingRecord: any = {
    settlementId: "setl_existing_123",
    amount: 500,
    status: "processed",
  };

  let createCallCount = 0;
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async (query: any) => {
      if (query.settlementId === "setl_existing_123") return existingRecord;
      return null;
    };
    (Settlement as any).create = async () => {
      createCallCount++;
      return existingRecord;
    };

    const payload = {
      id: "setl_existing_123",
      amount: 50000,
      status: "processed",
    };

    const res = await handleSettlementProcessed(payload);
    assert.equal(res, existingRecord);
    assert.equal(createCallCount, 0, "create must not be called when settlementId already exists");
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: Concurrent duplicate settlement ingestion does not create multiple records
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 11: Concurrent duplicate insertion catches duplicate key error (code 11000) and returns existing record", async () => {
  const existingRecord: any = {
    settlementId: "setl_concurrent_1",
    amount: 1000,
    status: "processed",
  };

  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    // First call to findOne returns null (simulating concurrent race)
    let findCount = 0;
    (Settlement as any).findOne = async () => {
      findCount++;
      if (findCount > 1) return existingRecord;
      return null;
    };

    // create throws E11000 duplicate key error
    (Settlement as any).create = async () => {
      const dupError: any = new Error("E11000 duplicate key error collection");
      dupError.code = 11000;
      throw dupError;
    };

    const payload = {
      id: "setl_concurrent_1",
      amount: 100000,
      status: "processed",
    };

    const res = await handleSettlementProcessed(payload);
    assert.equal(res, existingRecord, "Should recover and return existing record on code 11000");
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 12: Invalid/missing settlement ID is safely rejected
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 12: Missing, empty, or non-string settlementId is safely rejected with warning", async () => {
  let createCalled = false;
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).create = async () => {
      createCalled = true;
    };

    await handleSettlementProcessed(null);
    assert.equal(createCalled, false);

    await handleSettlementProcessed({});
    assert.equal(createCalled, false);

    await handleSettlementProcessed({ id: "" });
    assert.equal(createCalled, false);

    await handleSettlementProcessed({ id: "   " });
    assert.equal(createCalled, false);

    await handleSettlementProcessed({ id: 12345 });
    assert.equal(createCalled, false);
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 13: Malformed monetary values cannot create NaN/negative stored values
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 13: Negative or non-numeric amount rejected; malformed fee/tax ignored", async () => {
  let createdDocs: any[] = [];
  const origCreate = Settlement.create;
  const origFindOne = Settlement.findOne;

  try {
    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => {
      createdDocs.push(doc);
      return doc;
    };

    // Negative amount rejected
    await handleSettlementProcessed({ id: "setl_bad_amt_1", amount: -100 });
    assert.equal(createdDocs.length, 0);

    // Non-numeric amount rejected
    await handleSettlementProcessed({ id: "setl_bad_amt_2", amount: "not_a_number" });
    assert.equal(createdDocs.length, 0);

    // Valid amount, but negative fee and non-numeric tax
    await handleSettlementProcessed({
      id: "setl_valid_amt_bad_meta",
      amount: 50000,
      fees: -200,
      tax: "invalid_tax",
    });

    assert.equal(createdDocs.length, 1);
    assert.equal(createdDocs[0].amount, 500);
    assert.equal(createdDocs[0].fees, undefined, "Negative fee must be ignored");
    assert.equal(createdDocs[0].tax, undefined, "Invalid tax must be ignored");

    // Schema level negative rejection check
    const invalidDoc = new Settlement({
      settlementId: "setl_schema_test",
      amount: -50,
      status: "processed",
    });

    await assert.rejects(async () => {
      await invalidDoc.validate();
    }, /Settlement amount cannot be negative/);
  } finally {
    (Settlement as any).create = origCreate;
    (Settlement as any).findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 14: Settlement processing does not modify Payment
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 14: Settlement ingestion has zero coupling with Payment collection", async () => {
  let paymentTouched = false;
  const origPaymentFind = Payment.find;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentUpdate = Payment.updateOne;
  const origPaymentCreate = Payment.create;

  const origSettlementFindOne = Settlement.findOne;
  const origSettlementCreate = Settlement.create;

  try {
    (Payment as any).find = () => { paymentTouched = true; };
    (Payment as any).findOne = () => { paymentTouched = true; };
    (Payment as any).updateOne = () => { paymentTouched = true; };
    (Payment as any).create = () => { paymentTouched = true; };

    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => doc;

    const payload = {
      id: "setl_isolation_payment",
      amount: 100000,
      status: "processed",
    };

    await handleSettlementProcessed(payload);
    assert.equal(paymentTouched, false, "Payment collection must never be touched by settlement processing");
  } finally {
    (Payment as any).find = origPaymentFind;
    (Payment as any).findOne = origPaymentFindOne;
    (Payment as any).updateOne = origPaymentUpdate;
    (Payment as any).create = origPaymentCreate;

    (Settlement as any).findOne = origSettlementFindOne;
    (Settlement as any).create = origSettlementCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 15: Settlement processing does not modify Order
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 15: Settlement ingestion has zero coupling with Order collection", async () => {
  let orderTouched = false;
  const origOrderFind = Order.find;
  const origOrderFindById = Order.findById;
  const origOrderUpdate = Order.updateOne;
  const origOrderFindOneAndUpdate = Order.findOneAndUpdate;

  const origSettlementFindOne = Settlement.findOne;
  const origSettlementCreate = Settlement.create;

  try {
    (Order as any).find = () => { orderTouched = true; };
    (Order as any).findById = () => { orderTouched = true; };
    (Order as any).updateOne = () => { orderTouched = true; };
    (Order as any).findOneAndUpdate = () => { orderTouched = true; };

    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => doc;

    const payload = {
      id: "setl_isolation_order",
      amount: 100000,
      status: "processed",
    };

    await handleSettlementProcessed(payload);
    assert.equal(orderTouched, false, "Order collection must never be touched by settlement processing");
  } finally {
    (Order as any).find = origOrderFind;
    (Order as any).findById = origOrderFindById;
    (Order as any).updateOne = origOrderUpdate;
    (Order as any).findOneAndUpdate = origOrderFindOneAndUpdate;

    (Settlement as any).findOne = origSettlementFindOne;
    (Settlement as any).create = origSettlementCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 16: Settlement processing does not modify Commission
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 16: Settlement ingestion does not touch Commission records", async () => {
  let commissionTouched = false;
  const origCommCreate = Commission.create;
  const origCommUpdate = Commission.updateOne;

  const origSettlementFindOne = Settlement.findOne;
  const origSettlementCreate = Settlement.create;

  try {
    (Commission as any).create = () => { commissionTouched = true; };
    (Commission as any).updateOne = () => { commissionTouched = true; };

    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => doc;

    const payload = {
      id: "setl_isolation_comm",
      amount: 100000,
      status: "processed",
    };

    await handleSettlementProcessed(payload);
    assert.equal(commissionTouched, false, "Commission collection must never be touched by settlement processing");
  } finally {
    (Commission as any).create = origCommCreate;
    (Commission as any).updateOne = origCommUpdate;

    (Settlement as any).findOne = origSettlementFindOne;
    (Settlement as any).create = origSettlementCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 17: Settlement processing does not modify PlatformWallet/Wallet
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 17: Settlement ingestion does not touch PlatformWallet or Wallet balances", async () => {
  let walletTouched = false;
  const origPWFindOne = PlatformWallet.findOne;
  const origPWUpdate = PlatformWallet.updateOne;
  const origWTFindOne = WalletTransaction.findOne;
  const origWTCreate = WalletTransaction.create;

  const origSettlementFindOne = Settlement.findOne;
  const origSettlementCreate = Settlement.create;

  try {
    (PlatformWallet as any).findOne = () => { walletTouched = true; };
    (PlatformWallet as any).updateOne = () => { walletTouched = true; };
    (WalletTransaction as any).findOne = () => { walletTouched = true; };
    (WalletTransaction as any).create = () => { walletTouched = true; };

    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => doc;

    const payload = {
      id: "setl_isolation_wallet",
      amount: 100000,
      status: "processed",
    };

    await handleSettlementProcessed(payload);
    assert.equal(walletTouched, false, "PlatformWallet and WalletTransaction must never be touched by settlement processing");
  } finally {
    (PlatformWallet as any).findOne = origPWFindOne;
    (PlatformWallet as any).updateOne = origPWUpdate;
    (WalletTransaction as any).findOne = origWTFindOne;
    (WalletTransaction as any).create = origWTCreate;

    (Settlement as any).findOne = origSettlementFindOne;
    (Settlement as any).create = origSettlementCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 18: Settlement processing does not affect COD
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 18: Settlement processing has zero effect on COD orders or riders", async () => {
  const codOrder = {
    _id: new mongoose.Types.ObjectId(),
    paymentMethod: "COD",
    paymentStatus: "Pending",
    total: 500,
  };

  const origOrderFindById = Order.findById;
  const origSettlementFindOne = Settlement.findOne;
  const origSettlementCreate = Settlement.create;

  try {
    let orderQueried = false;
    (Order as any).findById = async () => {
      orderQueried = true;
      return codOrder;
    };

    (Settlement as any).findOne = async () => null;
    (Settlement as any).create = async (doc: any) => doc;

    const payload = {
      id: "setl_cod_isolation",
      amount: 50000,
      status: "processed",
    };

    await handleSettlementProcessed(payload);
    assert.equal(orderQueried, false, "COD order must not be queried or modified");
    assert.equal(codOrder.paymentStatus, "Pending");
  } finally {
    (Order as any).findById = origOrderFindById;
    (Settlement as any).findOne = origSettlementFindOne;
    (Settlement as any).create = origSettlementCreate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 19: Existing P1 #6 duplicate-payment behavior remains intact
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 19: Existing P1 #6 duplicate-payment handling remains fully intact", async () => {
  const { handleDuplicatePayment } = await import("../services/paymentService");

  const orderId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();
  const razorpayOrderId = "order_dup_with_settlement";
  const razorpayPaymentId = "pay_dup_2_settlement";

  let createdDupPayment: any = null;
  let refundAttempted = false;

  const origPaymentFindOne = Payment.findOne;
  const origPaymentCreate = Payment.create;
  const origPaymentFindByIdAndUpdate = Payment.findByIdAndUpdate;

  try {
    (Payment as any).findOne = async () => null;
    (Payment as any).create = async (docs: any[]) => {
      const p = new Payment(docs[0]);
      (p as any).save = async function () { return this; };
      createdDupPayment = p;
      return [p];
    };
    (Payment as any).findByIdAndUpdate = async (id: any, update: any) => {
      Object.assign(createdDupPayment, update);
      return createdDupPayment;
    };

    const refundProcessor = async () => {
      refundAttempted = true;
      return {
        id: "rfnd_test_dup_p2",
        status: "processed",
        amount: 50000,
        currency: "INR",
      };
    };

    const result = await handleDuplicatePayment({
      payableType: "Order",
      orderId,
      customerId,
      razorpayOrderId,
      razorpayPaymentId,
      amount: 500,
      currency: "INR",
      refundProcessor,
    });

    assert.equal(result.success, true);
    assert.equal(result.refunded, true);
    assert.equal(refundAttempted, true);
    assert.equal(result.duplicatePayment.isDuplicate, true);
    assert.equal(createdDupPayment.isDuplicate, true);
    assert.equal(createdDupPayment.status, "Refunded");
  } finally {
    (Payment as any).findOne = origPaymentFindOne;
    (Payment as any).create = origPaymentCreate;
    (Payment as any).findByIdAndUpdate = origPaymentFindByIdAndUpdate;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 20: Existing P1 #7 gateway fee/tax snapshots remain intact
// ─────────────────────────────────────────────────────────────────────────────
test("P2 #1 - Test 20: Existing P1 #7 gateway fee/tax snapshot calculations remain intact", async () => {
  // Gross amount: 1000, fee: 20, tax: 3.6
  const feeFields = computeGatewayFeeFields(1000, 20, 3.6);
  assert.equal(feeFields.gatewayFee, 20);
  assert.equal(feeFields.gatewayTax, 3.6);
  assert.equal(feeFields.netAmount, 980);

  // Undefined fee leaves all undefined
  const undefinedFee = computeGatewayFeeFields(1000, undefined, undefined);
  assert.equal(undefinedFee.gatewayFee, undefined);
  assert.equal(undefinedFee.gatewayTax, undefined);
  assert.equal(undefinedFee.netAmount, undefined);

  // Explicit zero fee
  const zeroFee = computeGatewayFeeFields(1000, 0, 0);
  assert.equal(zeroFee.gatewayFee, 0);
  assert.equal(zeroFee.gatewayTax, 0);
  assert.equal(zeroFee.netAmount, 1000);
});
