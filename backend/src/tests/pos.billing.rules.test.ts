import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  activeTaxRate,
  allocateDiscountAndTax,
  escapeRegex,
  financialYearLabel,
  formatBillNumber,
  formatPosOrderNumber,
  istDateStamp,
  normalizeIndianMobile,
} from "../utils/posBilling";

const BE = path.join(process.cwd(), "src");
const code = (rel: string) => fs.readFileSync(path.join(BE, rel), "utf8");

test("POS rules: regex input is escaped so special characters never break search", () => {
  const escaped = escapeRegex("Amul (500g) [new]* +1?");
  assert.doesNotThrow(() => new RegExp(escaped));
  assert.ok(new RegExp(escaped, "i").test("amul (500g) [new]* +1?"));
  assert.ok(!new RegExp(escapeRegex("a.c")).test("abc"), "dot must be literal");
});

test("POS rules: bill dates and financial year use IST, not UTC", () => {
  // 2026-04-01 00:30 IST == 2026-03-31 19:00 UTC
  const justAfterMidnightIst = new Date("2026-03-31T19:00:00.000Z");
  assert.equal(istDateStamp(justAfterMidnightIst), "20260401");
  assert.equal(financialYearLabel(justAfterMidnightIst), "2627");
  assert.equal(financialYearLabel(new Date("2026-03-31T18:00:00.000Z")), "2526"); // 23:30 IST, 31 Mar
  assert.equal(financialYearLabel(new Date("2027-01-15T06:00:00.000Z")), "2627");
});

test("POS rules: bill and order numbers are sequential and well-formed", () => {
  const d = new Date("2026-11-12T06:00:00.000Z");
  assert.equal(formatBillNumber(d, 1), "BILL-20261112-000001");
  assert.equal(formatBillNumber(d, 42), "BILL-20261112-000042");
  assert.match(formatBillNumber(d, 7), /^BILL-\d{8}-\d{6}$/);
  const sellerId = "665f1c2ab4e5d6f7a8b9c0d1";
  assert.equal(formatPosOrderNumber(d, sellerId, "2627", 3), "POS20261112B9C0D12627000003");
  assert.notEqual(
    formatPosOrderNumber(d, sellerId, "2627", 3),
    formatPosOrderNumber(d, "665f1c2ab4e5d6f7a8b9ffff", "2627", 3),
    "different sellers never share an order number",
  );
});

test("POS rules: Indian mobile normalisation", () => {
  assert.equal(normalizeIndianMobile(""), "");
  assert.equal(normalizeIndianMobile(undefined), "");
  assert.equal(normalizeIndianMobile("98765 43210"), "9876543210");
  assert.equal(normalizeIndianMobile("+91 98765-43210"), "9876543210");
  assert.equal(normalizeIndianMobile("09876543210"), "9876543210");
  assert.equal(normalizeIndianMobile("12345"), null);
  assert.equal(normalizeIndianMobile("1234567890"), null, "must start with 6-9");
  assert.equal(normalizeIndianMobile("abcdefghij"), null);
});

test("POS rules: no discount → GST is the inclusive share of each line", () => {
  const { lines, totalTax } = allocateDiscountAndTax(
    [{ amount: 118, taxRate: 18 }, { amount: 105, taxRate: 5 }, { amount: 50, taxRate: 0 }],
    0,
  );
  assert.deepEqual(lines.map((l) => l.taxAmount), [18, 5, 0]);
  assert.equal(totalTax, 23);
});

test("POS rules: discount lowers taxable value and is fully allocated", () => {
  const { lines, totalTax } = allocateDiscountAndTax(
    [{ amount: 118, taxRate: 18 }, { amount: 118, taxRate: 18 }],
    23.6, // 10% off 236
  );
  assert.deepEqual(lines.map((l) => l.discount), [11.8, 11.8]);
  assert.deepEqual(lines.map((l) => l.taxAmount), [16.2, 16.2]);
  assert.equal(totalTax, 32.4);
  assert.ok(totalTax < 36, "GST after discount must be below GST before discount");

  const odd = allocateDiscountAndTax(
    [{ amount: 10, taxRate: 5 }, { amount: 10, taxRate: 5 }, { amount: 10, taxRate: 5 }],
    10,
  );
  const sum = Math.round(odd.lines.reduce((s, l) => s + l.discount, 0) * 100) / 100;
  assert.equal(sum, 10, "rounding remainders must not lose or invent money");

  const full = allocateDiscountAndTax([{ amount: 50, taxRate: 12 }], 999);
  assert.equal(full.lines[0].discount, 50, "discount is capped at the line value");
  assert.equal(full.totalTax, 0);
});

test("POS rules: inactive taxes count as 0%", () => {
  assert.equal(activeTaxRate({ percentage: 18, status: "Active" }), 18);
  assert.equal(activeTaxRate({ percentage: 18, status: "Inactive" }), 0);
  assert.equal(activeTaxRate({ rate: 5 }), 5);
  assert.equal(activeTaxRate(null), 0);
  assert.equal(activeTaxRate("665f1c2ab4e5d6f7a8b9c0d1"), 0, "unpopulated ref is not a rate");
});

test("POS controller: sale creation is transactional, idempotent and validated", () => {
  const pos = code("modules/seller/controllers/posController.ts");
  assert.match(pos, /session\.withTransaction/, "sale must be written in a transaction");
  assert.match(pos, /reserveMany\([\s\S]*?session,?\s*\)/, "stock reservation must join the transaction");
  assert.match(pos, /BillCounter\.findOneAndUpdate/, "bill numbers come from a per-seller counter");
  assert.match(pos, /posClientRef/, "retries must be idempotent");
  assert.match(pos, /is less than the bill total/, "short cash must be rejected");
  assert.match(pos, /normalizeIndianMobile/, "customer phone must be validated");
  assert.match(pos, /allocateDiscountAndTax/, "GST must be computed after discount");
  assert.match(pos, /walkInRequested/, "walk-in flag must come from the explicit request flag");
  assert.doesNotMatch(pos, /offlinePaymentDetails\.paymentReference \|\| ""/, "bill must use the stored reference");
});

test("POS controller: searches escape user input and stats exclude cancelled bills", () => {
  const pos = code("modules/seller/controllers/posController.ts");
  const rawRegexUses = pos.match(/\$regex:\s*(\w+)/g) || [];
  assert.ok(rawRegexUses.length > 0);
  for (const use of rawRegexUses) assert.match(use, /\$regex:\s*q$/, `unexpected regex source: ${use}`);
  assert.equal((pos.match(/const q = escapeRegex\(/g) || []).length, 2, "both searches must escape");
  assert.match(pos, /NON_REVENUE_STATUSES = \["Cancelled", "Rejected", "Returned"\]/);
  assert.match(pos, /\$match: statsMatch/);
});

test("POS controller: cancellation flips status atomically before restoring stock", () => {
  const pos = code("modules/seller/controllers/posController.ts");
  const cancel = pos.slice(pos.indexOf("export const cancelOfflineSale"));
  assert.match(cancel, /findOneAndUpdate\([\s\S]*?status: \{ \$ne: "Cancelled" \}/);
  assert.ok(cancel.indexOf("findOneAndUpdate") < cancel.indexOf("releaseMany"), "flip before restore");
  assert.match(cancel, /releaseMany\(reservations, session\)/);
});

test("Seller order status endpoint refuses POS (offline) sales", () => {
  const ctrl = code("modules/seller/controllers/orderController.ts");
  assert.match(ctrl, /orderChannel === "OFFLINE"/);
});

// ───────────────────────── Quick Bill (manual items) ─────────────────────────
import mongoose from "mongoose";
import OrderItem from "../models/OrderItem";
import { isManualLineInput, parseManualLine, MANUAL_ITEM_DEFAULT_NAME } from "../utils/posBilling";

test("Quick Bill: manual line detection only triggers on an explicit flag", () => {
  assert.equal(isManualLineInput({ manual: true, name: "Tea", unitPrice: 10, quantity: 1 }), true);
  assert.equal(isManualLineInput({ productId: "665f1c2ab4e5d6f7a8b9c0d1", quantity: 1 }), false);
  assert.equal(isManualLineInput({ manual: "true" }), false, "string flags are not accepted");
  assert.equal(isManualLineInput(null), false);
});

test("Quick Bill: manual line validation", () => {
  assert.deepEqual(parseManualLine({ name: "  Sugar   1kg ", unitPrice: 45.555, quantity: 2, taxRate: 5 }).line, {
    name: "Sugar 1kg", unitPrice: 45.56, quantity: 2, taxRate: 5,
  });
  assert.equal(parseManualLine({ name: "", unitPrice: 10, quantity: 1 }).line?.name, MANUAL_ITEM_DEFAULT_NAME);
  assert.equal(parseManualLine({ name: "x", unitPrice: 10, quantity: 1 }).line?.taxRate, 0, "GST defaults to 0");
  assert.ok(parseManualLine({ name: "x", unitPrice: 0, quantity: 1 }).error, "zero price rejected");
  assert.ok(parseManualLine({ name: "x", unitPrice: -5, quantity: 1 }).error, "negative price rejected");
  assert.ok(parseManualLine({ name: "x", unitPrice: "abc", quantity: 1 }).error);
  assert.ok(parseManualLine({ name: "x", unitPrice: 2_000_000, quantity: 1 }).error, "absurd price rejected");
  assert.ok(parseManualLine({ name: "x", unitPrice: 10, quantity: 1.5 }).error, "fractional qty rejected");
  assert.ok(parseManualLine({ name: "x", unitPrice: 10, quantity: 0 }).error);
  assert.ok(parseManualLine({ name: "x", unitPrice: 10, quantity: 1, taxRate: 150 }).error);
  assert.equal(parseManualLine({ name: "a".repeat(300), unitPrice: 10, quantity: 1 }).line?.name.length, 100);
});

test("Quick Bill: OrderItem allows a missing product ONLY for manual lines", () => {
  const base = {
    order: new mongoose.Types.ObjectId(),
    seller: new mongoose.Types.ObjectId(),
    productName: "Loose Rice",
    unitPrice: 50,
    quantity: 2,
    total: 100,
  };
  const manual = new OrderItem({ ...base, isManualItem: true });
  assert.equal(manual.validateSync(), undefined, "manual line without product must validate");

  const normal = new OrderItem({ ...base });
  const err = normal.validateSync();
  assert.ok(err?.errors?.product, "a normal (online/catalog) line still requires a product");

  const withProduct = new OrderItem({ ...base, product: new mongoose.Types.ObjectId() });
  assert.equal(withProduct.validateSync(), undefined);
  assert.equal(withProduct.isManualItem, false, "existing lines default to non-manual");
});

test("Quick Bill: controller never reserves or restores stock for manual lines", () => {
  const pos = code("modules/seller/controllers/posController.ts");
  assert.match(pos, /isManualLineInput\(item\)/);
  assert.match(pos, /\.filter\(\(r\) => r\.product\)/, "only catalog lines are reserved");
  assert.match(pos, /isManualItem: true/, "manual lines are flagged when saved");
  const cancel = pos.slice(pos.indexOf("export const cancelOfflineSale"));
  assert.match(cancel, /isManualItem: \{ \$ne: true \}/, "cancel skips manual lines");
});
