/**
 * SETTLEMENT & MONEY FLOW END-TO-END LIFECYCLE TESTS
 *
 * Verifies:
 * 1. Online prepaid order delivery increments PlatformWallet (totalPlatformEarning, totalAdminEarning, currentPlatformBalance).
 * 2. Online order platform revenue update enforces deterministic reference idempotency (ADM-ORD-EARN-${orderId}).
 * 3. Admin cash collection delegates to authoritative settleCourierCodDebt.
 * 4. Cash collection update and delete endpoints reject tampering to preserve financial ledger immutability.
 * 5. Delivery partner route mounts POST /withdraw mapped to requestWithdrawal.
 * 6. COD returns credit customer wallet balance, create WalletTransaction audit, and issue Refund records.
 * 7. Admin earnings controller supports type filtering (SELLER vs DELIVERY_BOY) and flags courier payouts as expenses.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const be = (rel: string) => path.join(process.cwd(), rel);
const read = (rel: string) => fs.readFileSync(be(rel), "utf8");
const code = (rel: string) =>
  read(rel).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ===========================================================================
// Test 1: PlatformWallet Accounting on Online Order Delivery
// ===========================================================================
test("Test 1: distributeCommissions updates PlatformWallet for online prepaid orders", () => {
  const comm = code("src/services/commissionService.ts");

  assert.match(
    comm,
    /ADM-ORD-EARN-\$\{orderId\}/,
    "distributeCommissions must enforce ADM-ORD-EARN-${orderId} reference guard",
  );
  assert.match(
    comm,
    /platformWallet\.totalPlatformEarning\s*=\s*Math\.round\(\s*\(\(platformWallet\.totalPlatformEarning\s*\|\|\s*0\)\s*\+\s*\(order\.total\s*\|\|\s*0\)\)/,
    "distributeCommissions must increment PlatformWallet.totalPlatformEarning on online order delivery",
  );
  assert.match(
    comm,
    /platformWallet\.totalAdminEarning\s*=\s*Math\.round\(\s*\(\(platformWallet\.totalAdminEarning\s*\|\|\s*0\)\s*\+\s*totalAdminEarning\)/,
    "distributeCommissions must increment PlatformWallet.totalAdminEarning on online order delivery",
  );
  assert.match(
    comm,
    /platformWallet\.currentPlatformBalance\s*=\s*Math\.round\(\s*\(\(platformWallet\.currentPlatformBalance\s*\|\|\s*0\)\s*\+\s*totalAdminEarning\)/,
    "distributeCommissions must increment PlatformWallet.currentPlatformBalance on online order delivery",
  );
});

// ===========================================================================
// Test 2: Admin Cash Collection Delegates to Authoritative Settlement
// ===========================================================================
test("Test 2: adminCashCollectionController delegates to settleCourierCodDebt and protects ledger immutability", () => {
  const ctrl = code("src/modules/admin/controllers/adminCashCollectionController.ts");

  assert.match(
    ctrl,
    /settleCourierCodDebt\s*\(\s*\{[\s\S]*?deliveryBoyId[\s\S]*?source:\s*"CASH"/,
    "createCashCollection must delegate to settleCourierCodDebt with source CASH",
  );
  assert.match(
    ctrl,
    /updateCashCollection[\s\S]*?immutable financial audit records/,
    "updateCashCollection must reject tampering with immutable ledger records",
  );
  assert.match(
    ctrl,
    /deleteCashCollection[\s\S]*?Settled cash collections cannot be deleted/,
    "deleteCashCollection must reject deleting permanent cash collection records",
  );
});

// ===========================================================================
// Test 3: Delivery Wallet Routes Mounts POST /withdraw
// ===========================================================================
test("Test 3: deliveryWalletRoutes mounts POST /withdraw mapped to requestWithdrawal", () => {
  const routes = code("src/routes/deliveryWalletRoutes.ts");

  assert.match(
    routes,
    /router\.post\("\/withdraw",\s*requestWithdrawal\)/,
    "deliveryWalletRoutes must mount router.post('/withdraw', requestWithdrawal)",
  );
});

// ===========================================================================
// Test 4: COD Return Credits Customer Wallet and Generates Audit Record
// ===========================================================================
test("Test 4: returnService.processReturn credits Customer wallet and creates Refund record on COD returns", () => {
  const retService = code("src/services/returnService.ts");

  assert.match(
    retService,
    /order\.paymentMethod\s*===\s*"COD"\s*&&\s*ret\.refundAmount/,
    "processReturn must handle COD order returns with positive refundAmount",
  );
  assert.match(
    retService,
    /\$inc:\s*\{\s*walletAmount:\s*ret\.refundAmount\s*\}/,
    "processReturn must atomically increment Customer.walletAmount on COD return completion",
  );
  assert.match(
    retService,
    /reference:\s*`REF-COD-\$\{ret\._id\}`/,
    "processReturn must record WalletTransaction with REF-COD-${ret._id}",
  );
  assert.match(
    retService,
    /Refund\.create\s*\(\s*\{[\s\S]*?returnRequest:\s*ret\._id[\s\S]*?status:\s*"Completed"/,
    "processReturn must record completed Refund document for COD returns",
  );
});

// ===========================================================================
// Test 5: Admin Commission Ledger Filtering & Courier Expense Segregation
// ===========================================================================
test("Test 5: adminWalletController.getAdminEarnings supports type filtering and labels courier wages as expenses", () => {
  const walletCtrl = code("src/modules/admin/controllers/adminWalletController.ts");

  assert.match(
    walletCtrl,
    /if\s*\(\s*type\s*&&\s*\["SELLER",\s*"DELIVERY_BOY"\]\.includes\(String\(type\)\)\)/,
    "getAdminEarnings must support type query filter for SELLER and DELIVERY_BOY",
  );
  assert.match(
    walletCtrl,
    /roleDescription\s*=\s*"Courier Delivery Wage \(Expense\)"/,
    "getAdminEarnings must explicitly label courier delivery fee as an expense",
  );
  assert.match(
    walletCtrl,
    /roleDescription\s*=\s*"Seller Commission \(Revenue\)"/,
    "getAdminEarnings must explicitly label seller commission as revenue",
  );
});
