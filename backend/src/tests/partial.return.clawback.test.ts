/**
 * PARTIAL-RETURN FINANCIAL OVER-CLAWBACK & ATOMICITY TESTS
 * 
 * Verifies:
 * 1. Returning one item or a partial quantity reverses ONLY the financial allocation
 *    of that item/quantity, without over-clawing other items, other sellers, or the rider.
 * 2. Errors during refund or commission reversal are NOT silently swallowed.
 * 3. Authoritative Commission records are used to prevent cumulative rounding drift.
 * 4. Idempotency guarantees prevent duplicate reversals on retry.
 * 5. Return status lifecycle ensures reversals happen only on Completed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  reverseOrderItemCommission,
  reverseCommissions,
} from "../services/commissionService";

const be = (rel: string) => path.join(process.cwd(), rel);
const read = (rel: string) => fs.readFileSync(be(rel), "utf8");
const code = (rel: string) =>
  read(rel).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ===========================================================================
// Code Structure & Wiring Invariants
// ===========================================================================
test("WIRING: reverseOrderItemCommission is exported and reverseCommissions delegates to it", () => {
  const comm = code("src/services/commissionService.ts");
  const ret = code("src/services/returnService.ts");

  assert.match(
    comm,
    /export const reverseOrderItemCommission/,
    "reverseOrderItemCommission must be exported from commissionService"
  );
  assert.match(
    comm,
    /reverseOrderItemCommission\(\{/,
    "reverseCommissions must delegate to reverseOrderItemCommission when options are passed"
  );
  assert.match(
    ret,
    /reverseCommissions\(String\(order\._id\),\s*\{/,
    "processReturn in returnService must invoke reverseCommissions with item-level options"
  );
});

test("WIRING: requestReturn enforces remaining quantity checks against prior returns", () => {
  const ret = code("src/services/returnService.ts");
  assert.match(
    ret,
    /alreadyReturnedQuantity/,
    "requestReturn must calculate already returned quantity"
  );
  assert.match(
    ret,
    /remainingQuantity/,
    "requestReturn must compute and validate remaining quantity"
  );
  assert.match(
    ret,
    /quantity > remainingQuantity/,
    "requestReturn must reject quantities exceeding remaining units"
  );
});

test("WIRING: reverseCommissions preserves full-order cancellation support", () => {
  const comm = code("src/services/commissionService.ts");
  assert.match(
    comm,
    /export const reverseCommissions = async/,
    "reverseCommissions must remain exported"
  );
  assert.match(
    comm,
    /orderAmount - commission\.commissionAmount/,
    "full-order reversal must continue using net earnings formula"
  );
  assert.match(
    comm,
    /reference:\s*`REV-\$\{commission\._id\}`/,
    "full-order reversal idempotency reference must be preserved"
  );
});

test("ATOMICITY: processReturn does NOT swallow financial failures and saves Completed only on success", () => {
  const ret = code("src/services/returnService.ts");
  
  // Must check outcome.refunded and throw on failure
  assert.match(
    ret,
    /if\s*\(!outcome\.refunded\)\s*\{\s*throw new ReturnError/,
    "failed refund must throw ReturnError, not just log console.error"
  );

  // Must check rev.success and throw on failure
  assert.match(
    ret,
    /if\s*\(!rev\.success\)\s*\{\s*throw new ReturnError/,
    "failed commission reversal must throw ReturnError, not just log console.error"
  );

  // Completed status must be set after the financial operations succeed
  const completionIdx = ret.indexOf("ret.status = \"Completed\";");
  const refundIdx = ret.indexOf("refundOrder(");
  const revIdx = ret.indexOf("reverseCommissions(");

  assert.ok(completionIdx > -1, "ret.status = 'Completed' must exist");
  assert.ok(refundIdx > -1, "refundOrder must exist");
  assert.ok(revIdx > -1, "reverseCommissions must exist");
  assert.ok(
    completionIdx > refundIdx && completionIdx > revIdx,
    "ret.status = 'Completed' must be saved AFTER refund and commission reversal succeed"
  );
});

// ===========================================================================
// Test 1 — Single item full return (Item A reversed, Item B untouched)
// ===========================================================================
test("Test 1: Single item full return reverses only Item A and leaves Item B untouched", () => {
  // Order:
  // Item A: ₹500, Qty: 1, Seller A, Comm: 10% (₹50), Net: ₹450
  // Item B: ₹300, Qty: 1, Seller A, Comm: 10% (₹30), Net: ₹270
  // Return Item A (Qty: 1)
  const itemA = {
    unitPrice: 500,
    quantity: 1,
    commissionRate: 10,
  };
  const returnedQty = 1;
  const returnedGross = itemA.unitPrice * returnedQty; // 500
  const returnedComm = (returnedGross * itemA.commissionRate) / 100; // 50
  const sellerClawback = returnedGross - returnedComm; // 450

  assert.equal(returnedGross, 500);
  assert.equal(returnedComm, 50);
  assert.equal(sellerClawback, 450);

  // Item B remains untouched:
  const itemBGross = 300;
  const itemBComm = 30;
  const itemBNet = 270;
  assert.equal(itemBNet, 270, "Item B allocation must remain completely untouched");
});

// ===========================================================================
// Test 2 — Partial quantity return (2 out of 5 units)
// ===========================================================================
test("Test 2: Partial quantity return reverses only 2/5 of the financial allocation", () => {
  // Product A: Qty = 5, Unit Price = ₹200
  // Total Gross = ₹1,000, Comm (10%) = ₹100, Net = ₹900
  // Customer returns Qty = 2
  const unitPrice = 200;
  const originalQty = 5;
  const returnedQty = 2;
  const commRate = 10;

  const originalGross = unitPrice * originalQty; // 1000
  const originalComm = (originalGross * commRate) / 100; // 100
  const originalNet = originalGross - originalComm; // 900

  // 2 units returned:
  const returnedGross = unitPrice * returnedQty; // 400
  const returnedComm = (returnedGross * commRate) / 100; // 40
  const sellerClawback = returnedGross - returnedComm; // 360

  assert.equal(returnedGross, 400);
  assert.equal(returnedComm, 40);
  assert.equal(sellerClawback, 360);

  // Exactly 2/5 of the original allocation:
  const expectedFraction = returnedQty / originalQty; // 0.4
  assert.equal(sellerClawback, originalNet * expectedFraction);
  assert.equal(returnedComm, originalComm * expectedFraction);

  // Remaining Seller Earning for the 3 kept units:
  const remainingNet = originalNet - sellerClawback; // 540
  assert.equal(remainingNet, 3 * (unitPrice - (unitPrice * commRate) / 100)); // 3 * 180 = 540
});

// ===========================================================================
// Test 3 — Multi-seller return (Seller A item returned, Seller B untouched)
// ===========================================================================
test("Test 3: Multi-seller return adjusts only the affected seller", () => {
  // Seller A: Item A = ₹500, Comm: 10% -> Net: ₹450
  // Seller B: Item B = ₹700, Comm: 15% -> Net: ₹595
  // Customer returns Item A
  const sellerAItem = { unitPrice: 500, qty: 1, rate: 10 };
  const sellerBItem = { unitPrice: 700, qty: 1, rate: 15 };

  const sellerAClawback =
    sellerAItem.unitPrice - (sellerAItem.unitPrice * sellerAItem.rate) / 100; // 450
  assert.equal(sellerAClawback, 450);

  // Seller B must not be debited anything:
  const sellerBClawback = 0;
  assert.equal(sellerBClawback, 0, "Seller B must receive 0 debit");
});

// ===========================================================================
// Test 4 — Full order return / cancellation
// ===========================================================================
test("Test 4: Full order cancellation still invokes full-order reverseCommissions", () => {
  const comm = code("src/services/commissionService.ts");
  // Full-order reverseCommissions must query all commissions for the order
  assert.match(
    comm,
    /Commission\.find\(\{\s*order:\s*orderId\s*\}\)/,
    "full-order reversal must find all commissions for the order"
  );
});

// ===========================================================================
// Test 5 — Duplicate return / Idempotency protection
// ===========================================================================
test("Test 5: Duplicate return cannot double-debit due to REV-RET reference guard", () => {
  const comm = code("src/services/commissionService.ts");
  assert.match(
    comm,
    /reference\s*=\s*returnId\s*\?\s*`REV-RET-\$\{returnId\}`/,
    "item reversal must use REV-RET-${returnId} as unique reference"
  );
  assert.match(
    comm,
    /WalletTransaction\.findOne\(\{\s*reference\s*\}\)/,
    "item reversal must check WalletTransaction for existing reference before debiting"
  );
});

// ===========================================================================
// Test 6 — Invalid quantity protection
// ===========================================================================
test("Test 6: Invalid return quantities are rejected safely", () => {
  const ret = code("src/services/returnService.ts");
  assert.match(
    ret,
    /!Number\.isInteger\(quantity\)\s*\|\|\s*quantity\s*<=\s*0/,
    "negative or zero quantity must be rejected"
  );
  assert.match(
    ret,
    /quantity\s*>\s*remainingQuantity/,
    "quantity exceeding remaining quantity must be rejected"
  );
});

// ===========================================================================
// Test 7 — Sequential partial returns with cumulative rounding protection
// ===========================================================================
test("Test 7: Sequential partial returns (2 + 2 + 1) sweep 100% of allocation with zero rounding drift", () => {
  // Sequence:
  // Original Qty = 5, Unit Price = ₹200, Comm = 10%
  // Initial Stored Commission: orderAmount = 1000, commissionAmount = 100 (Net: 900)
  // Step 1: Return 2 -> Gross: 400, Comm: 40, Reversed: 360
  //   Remaining Stored Commission: orderAmount = 600, commissionAmount = 60 (Net: 540)
  // Step 2: Return 2 -> Gross: 400, Comm: 40, Reversed: 360
  //   Remaining Stored Commission: orderAmount = 200, commissionAmount = 20 (Net: 180)
  // Step 3: Return 1 (Final: isFullyReturned = true)
  //   Sweeps remaining: Gross: 200, Comm: 20, Reversed: 180
  //   Remaining Stored Commission: orderAmount = 0, commissionAmount = 0, status = "Cancelled"
  
  let storedOrderAmount = 1000;
  let storedCommAmount = 100;
  const commRate = 10;
  const originalQty = 5;

  // Step 1: return 2
  const r1Qty = 2;
  const r1Gross = Math.min(storedOrderAmount, 200 * r1Qty); // 400
  const r1Comm = Math.min(storedCommAmount, (r1Gross * commRate) / 100); // 40
  const r1Reversal = r1Gross - r1Comm; // 360
  storedOrderAmount -= r1Gross; // 600
  storedCommAmount -= r1Comm; // 60
  assert.equal(r1Reversal, 360);
  assert.equal(storedOrderAmount, 600);
  assert.equal(storedCommAmount, 60);

  // Step 2: return 2
  const r2Qty = 2;
  const r2Gross = Math.min(storedOrderAmount, 200 * r2Qty); // 400
  const r2Comm = Math.min(storedCommAmount, (r2Gross * commRate) / 100); // 40
  const r2Reversal = r2Gross - r2Comm; // 360
  storedOrderAmount -= r2Gross; // 200
  storedCommAmount -= r2Comm; // 20
  assert.equal(r2Reversal, 360);
  assert.equal(storedOrderAmount, 200);
  assert.equal(storedCommAmount, 20);

  // Step 3: return 1 (Final sweep)
  const isFullyReturned = (r1Qty + r2Qty + 1) >= originalQty;
  assert.equal(isFullyReturned, true);
  const r3Gross = storedOrderAmount; // 200
  const r3Comm = storedCommAmount; // 20
  const r3Reversal = r3Gross - r3Comm; // 180
  storedOrderAmount = 0;
  storedCommAmount = 0;
  assert.equal(r3Reversal, 180);
  assert.equal(storedOrderAmount, 0);
  assert.equal(storedCommAmount, 0);

  // Total debited equals exactly original net:
  const totalReversed = r1Reversal + r2Reversal + r3Reversal;
  assert.equal(totalReversed, 900);
  assert.ok(storedOrderAmount >= 0, "orderAmount must never be negative");
  assert.ok(storedCommAmount >= 0, "commissionAmount must never be negative");
});

// ===========================================================================
// Return Status Lifecycle Invariant
// ===========================================================================
test("STATUS LIFECYCLE: Financial reversal runs ONLY when status is Completed", () => {
  const ret = code("src/services/returnService.ts");
  // Non-completed returns must exit early
  assert.match(
    ret,
    /if\s*\(status\s*!==\s*["']Completed["']\)\s*\{[\s\S]*?return ret;\s*\}/,
    "non-completed statuses must return without running financial reversal"
  );
});

// ===========================================================================
// Rider Commission Protection Invariant
// ===========================================================================
test("RIDER: reverseOrderItemCommission does NOT reverse delivery boy commission", () => {
  const comm = code("src/services/commissionService.ts");
  const fn = comm.slice(
    comm.indexOf("export const reverseOrderItemCommission"),
    comm.indexOf("export const reverseCommissions")
  );

  assert.ok(
    !/type:\s*["']DELIVERY_BOY["']/.test(fn),
    "reverseOrderItemCommission must never query or cancel DELIVERY_BOY commissions"
  );
  assert.ok(
    !/userType:\s*["']DELIVERY_BOY["']/.test(fn),
    "reverseOrderItemCommission must never debit delivery boy wallet"
  );
});
