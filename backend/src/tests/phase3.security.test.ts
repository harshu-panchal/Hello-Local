/**
 * PHASE 3 — financial integrity.
 *
 * Wallet arithmetic and guard logic are exercised directly; the DB-shape
 * assertions are structural (no database connection is available in CI here).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_harness";

const srcPath = (rel: string) => path.join(process.cwd(), "src", rel);
const code = (rel: string) =>
  fs.readFileSync(srcPath(rel), "utf8")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

// ===========================================================================
// H-18 — no read-modify-write on balances
// ===========================================================================
test("H-18: debitWallet uses one atomic conditional update", () => {
  const c = code("services/walletManagementService.ts");

  // The guard and the decrement must be the same operation.
  assert.match(c, /filter\.balance\s*=\s*\{\s*\$gte:\s*value\s*\}/,
    "debit is not guarded by a conditional balance filter");
  assert.match(c, /findOneAndUpdate\(\s*\n?\s*filter,\s*\n?\s*\{\s*\$inc:\s*\{\s*balance:\s*-value/,
    "decrement is not part of the conditional update");

  // The old pattern read the balance first and then blindly decremented.
  const debitBody = c.slice(c.indexOf("export const debitWallet"), c.indexOf("export const getWalletBalance"));
  assert.ok(!/getWalletBalance\(/.test(debitBody),
    "debitWallet still reads the balance before writing (race)");
});

test("H-18: allowNegative is opt-in and only drops the guard", () => {
  const c = code("services/walletManagementService.ts");
  assert.match(c, /if \(!options\?\.allowNegative\) \{/,
    "the balance guard is not conditional on allowNegative");
});

// ===========================================================================
// H-19 — wallet failures are loud
// ===========================================================================
test("H-19: wallet operations throw instead of returning success:false", async () => {
  const mod = await import("../services/walletManagementService");
  const { WalletError, creditWallet, debitWallet } = mod as any;

  assert.ok(WalletError, "WalletError is not exported");

  // Invalid amounts must throw, not resolve to a soft failure.
  for (const bad of [0, -5, NaN, Infinity, "abc"]) {
    await assert.rejects(
      () => creditWallet("507f1f77bcf86cd799439011", "SELLER", bad as number, "x"),
      (e: any) => e instanceof WalletError && /Invalid wallet amount/i.test(e.message),
      `credit amount=${bad}`,
    );
    await assert.rejects(
      () => debitWallet("507f1f77bcf86cd799439011", "SELLER", bad as number, "x"),
      (e: any) => e instanceof WalletError && /Invalid wallet amount/i.test(e.message),
      `debit amount=${bad}`,
    );
  }

  const c = code("services/walletManagementService.ts");
  assert.ok(!/return \{\s*\n?\s*success: false,\s*\n?\s*message: error/.test(c),
    "wallet functions still swallow errors into a soft failure");
});

// ===========================================================================
// H-39 — sellers are paid on delivery, not on payment
// ===========================================================================
test("H-39: createPendingCommissions records Pending and credits nothing", () => {
  const c = code("services/commissionService.ts");
  const fn = c.slice(
    c.indexOf("export const createPendingCommissions"),
    c.indexOf("export const distributeCommissions"),
  );
  assert.ok(fn.length > 0, "createPendingCommissions not found");
  assert.ok(!/creditWallet\(/.test(fn),
    "payment-time commission creation still credits the seller wallet");
  assert.match(fn, /status:\s*["']Pending["']/, "commission is not created as Pending");
  assert.ok(!/status:\s*["']Paid["']/.test(fn),
    "commission is still created as Paid at payment time");
});

// ===========================================================================
// H-40 — one COD ledger row, not two
// ===========================================================================
test("H-40: seller order controller writes no duplicate COD wallet row", () => {
  const c = code("modules/seller/controllers/orderController.ts");
  assert.ok(!/WalletTransaction\.create/.test(c),
    "seller order controller still writes its own wallet transaction");
  assert.ok(!/ORD-COD-PEND/.test(c), "duplicate COD pending reference still present");
});

// ===========================================================================
// H-43 — settling a seller reduces the liability
// ===========================================================================
test("H-43: sellerPendingPayouts is decremented when a seller is paid", () => {
  const c = code("services/commissionService.ts");
  assert.match(c, /sellerPendingPayouts\s*\|\|\s*0\)\s*-\s*netEarning/,
    "seller payout still increases the pending-payout liability");
  assert.ok(!/sellerPendingPayouts \+ netEarning/.test(c),
    "the additive sign error is still present");
});

// ===========================================================================
// H-44 — no division by zero in the commission rate
// ===========================================================================
test("H-44: safeCommissionRate never yields Infinity/NaN and stays in 0..100", async () => {
  const { safeCommissionRate } = await import("../services/commissionService");
  assert.equal(typeof safeCommissionRate, "function", "helper is not exported");

  const cases: Array<[number, number | undefined, number | undefined]> = [
    [50, 0, 0],            // free delivery + no distance -> used to be NaN
    [50, undefined, 0],
    [50, 0, undefined],
    [50, undefined, undefined],
    [0, 0, 0],
    [1e9, 1, 0],           // absurd -> clamped to 100
    [-5, 0, 10],           // negative -> clamped to 0
  ];
  for (const [amt, dist, charge] of cases) {
    const r = safeCommissionRate(amt, dist, charge);
    assert.ok(Number.isFinite(r), `not finite for (${amt},${dist},${charge}) -> ${r}`);
    assert.ok(r >= 0 && r <= 100, `outside 0..100 for (${amt},${dist},${charge}) -> ${r}`);
  }

  // Real rates are preserved, not flattened.
  assert.equal(safeCommissionRate(50, 10, 0), 5);      // Rs 5/km
  assert.equal(safeCommissionRate(25, 0, 100), 25);    // 25% of the delivery charge
});

test("H-07: balances may go negative only via a clawback", () => {
  for (const m of ["models/Seller.ts", "models/Delivery.ts"]) {
    const raw = fs.readFileSync(srcPath(m), "utf8");
    const i = raw.indexOf("balance: {");
    assert.ok(i > 0, `${m}: balance field not found`);
    const field = raw.slice(i, raw.indexOf("},", i));
    assert.ok(!/min:\s*\[0/.test(field),
      `${m}: balance still has min:0, which blocks clawbacks`);
  }
  // The guard must still exist for ordinary debits.
  const w = code("services/walletManagementService.ts");
  assert.match(w, /filter\.balance\s*=\s*\{\s*\$gte:\s*value\s*\}/,
    "ordinary debits are no longer guarded");
});

// ===========================================================================
// H-07 — reversals use the right amount, and actually run
// ===========================================================================
test("H-07: reverseCommissions reverses the amount that was actually paid", () => {
  const c = code("services/commissionService.ts");
  const fn = c.slice(
    c.indexOf("export const reverseCommissions"),
    c.indexOf("function safeCommissionRate"),
  );
  assert.ok(fn.length > 0, "reverseCommissions not found");
  assert.match(fn, /orderAmount - commission\.commissionAmount/,
    "seller reversal does not use net earnings");
  assert.match(fn, /allowNegative:\s*true/, "clawback cannot take a balance negative");
  assert.match(fn, /reference:\s*`REV-\$\{commission\._id\}`/, "reversal is not idempotent");
});

test("H-07: every cancellation path invokes reverseCommissions", () => {
  const paths: Array<[string, string]> = [
    ["customer cancel", "modules/customer/controllers/customerOrderController.ts"],
    ["admin status update", "modules/admin/controllers/adminOrderController.ts"],
    ["seller status update", "modules/seller/controllers/orderController.ts"],
  ];
  for (const [label, file] of paths) {
    assert.match(code(file), /reverseCommissions\(/,
      `${label} does not reverse commissions`);
  }
});

// ===========================================================================
// M-12 — withdrawal funds are reserved at request time
// ===========================================================================
test("M-12: requesting a withdrawal reserves funds; completing does not re-debit", () => {
  const w = code("services/walletManagementService.ts");
  const req = w.slice(w.indexOf("export const createWithdrawalRequest"), w.indexOf("export const releaseWithdrawalHold"));
  assert.match(req, /debitWallet\(/, "withdrawal request does not reserve funds");
  assert.match(req, /WDR-HOLD-/, "reservation is not idempotent");
  assert.match(req, /startSession/, "request + reservation are not atomic");

  const ctrl = code("modules/admin/controllers/adminWithdrawalController.ts");
  const complete = ctrl.slice(ctrl.indexOf("export const completeWithdrawal"));
  assert.ok(!/debitWallet\(/.test(complete),
    "completing a withdrawal debits a second time");

  const reject = ctrl.slice(ctrl.indexOf("export const rejectWithdrawal"), ctrl.indexOf("export const completeWithdrawal"));
  assert.match(reject, /releaseWithdrawalHold/, "rejecting does not return reserved funds");
});

test("M-12: there is a single withdrawal implementation", () => {
  const c = code("modules/delivery/controllers/deliveryEarningController.ts");
  assert.match(c, /createWithdrawalRequest\(/,
    "courier withdrawal does not use the shared service");
  assert.ok(!/debitWallet\(/.test(c),
    "courier withdrawal still debits directly (duplicate implementation)");
  assert.ok(!/WithdrawRequest\.create/.test(c),
    "courier withdrawal still creates the request itself");
});

// ===========================================================================
// M-13 — couriers are notified about withdrawals
// ===========================================================================
test("M-13: withdrawal notifications are not seller-only", () => {
  const c = code("modules/admin/controllers/adminWithdrawalController.ts");
  assert.ok(!/if \(request\.userType !== 'SELLER'\) return;/.test(c),
    "delivery partners are still skipped for withdrawal notifications");
  assert.match(c, /recipientType/, "recipient type is not resolved");
});

// ===========================================================================
// COD settlement is a single authoritative flow
// ===========================================================================
test("COD: both settlement entry points delegate to one service", () => {
  const admin = code("modules/admin/controllers/adminDeliveryController.ts");
  const courier = code("modules/delivery/controllers/deliveryWalletController.ts");
  assert.match(admin, /settleCourierCodDebt\(/, "admin cash collection does not use the shared path");
  assert.match(courier, /settleCourierCodDebt\(/, "courier payout does not use the shared path");

  const svc = code("services/codSettlementService.ts");
  assert.ok(!/balance/.test(svc.slice(svc.indexOf("deliveryBoy.pendingAdminPayout"), svc.indexOf("await deliveryBoy.save"))),
    "settlement still touches the courier's earnings balance");
  assert.match(svc, /startSession/, "settlement is not atomic");
  assert.match(svc, /already been recorded/, "settlement is not idempotent");
});
