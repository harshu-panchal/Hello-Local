/**
 * Pure helpers for POS / counter billing. Kept free of database access so the
 * money and numbering rules can be unit-tested directly.
 */

const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+05:30

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Escape user text so it can be embedded in a MongoDB `$regex` literally. */
export function escapeRegex(input: string): string {
  return String(input ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wall-clock date parts in India Standard Time, independent of server TZ. */
function istParts(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
}

/** YYYYMMDD in IST. A bill made at 01:00 IST carries that day's date. */
export function istDateStamp(date: Date = new Date()): string {
  const { y, m, d } = istParts(date);
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** Indian financial year (Apr–Mar) label, e.g. "2526" for FY 2025-26. */
export function financialYearLabel(date: Date = new Date()): string {
  const { y, m } = istParts(date);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Bill number: BILL-<IST date>-<6-digit per-seller sequence>. The sequence is
 * continuous per seller within a financial year (GST invoice serial rule).
 */
export function formatBillNumber(date: Date, sequence: number): string {
  return `BILL-${istDateStamp(date)}-${String(sequence).padStart(6, "0")}`;
}

/** Globally unique order number for a POS sale (Order.orderNumber is unique). */
export function formatPosOrderNumber(date: Date, sellerId: string, fy: string, sequence: number): string {
  return `POS${istDateStamp(date)}${String(sellerId).slice(-6).toUpperCase()}${fy}${String(sequence).padStart(6, "0")}`;
}

/**
 * Normalise an Indian mobile number. Returns "" for empty input, the 10-digit
 * number when valid, or null when something was entered but is not valid.
 */
export function normalizeIndianMobile(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  let digits = text.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export interface PricedLine {
  /** Tax-inclusive line amount (unit price × qty). */
  amount: number;
  taxRate: number;
}

export interface AllocatedLine {
  discount: number;
  taxableAmount: number;
  taxAmount: number;
}

/**
 * Spread a bill-level discount across lines in proportion to their amounts and
 * compute the GST embedded in each line *after* the discount. Prices are
 * tax-inclusive, so the tax is the inclusive share of the discounted amount.
 * Rounding remainders go to the last line with a non-zero amount, so the
 * per-line discounts always sum exactly to `discount`.
 */
export function allocateDiscountAndTax(lines: PricedLine[], discount: number): {
  lines: AllocatedLine[];
  totalTax: number;
} {
  const subtotal = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const disc = Math.min(Math.max(0, round2(discount)), subtotal);

  let lastIndex = -1;
  lines.forEach((l, i) => { if ((Number(l.amount) || 0) > 0) lastIndex = i; });

  let allocated = 0;
  const out = lines.map((l, i) => {
    const amount = Number(l.amount) || 0;
    let lineDiscount = 0;
    if (disc > 0 && subtotal > 0 && amount > 0) {
      lineDiscount = i === lastIndex ? round2(disc - allocated) : round2((disc * amount) / subtotal);
      lineDiscount = Math.min(lineDiscount, amount);
      allocated = round2(allocated + lineDiscount);
    }
    const taxableAmount = round2(amount - lineDiscount);
    const rate = Number(l.taxRate) || 0;
    const taxAmount = rate > 0 ? round2((taxableAmount * rate) / (100 + rate)) : 0;
    return { discount: lineDiscount, taxableAmount, taxAmount };
  });

  return { lines: out, totalTax: round2(out.reduce((s, l) => s + l.taxAmount, 0)) };
}

export const MANUAL_ITEM_DEFAULT_NAME = "Miscellaneous Item";
export const MANUAL_ITEM_MAX_PRICE = 1_000_000;
export const MANUAL_ITEM_MAX_QTY = 10_000;

export interface ManualLine {
  name: string;
  unitPrice: number;
  quantity: number;
  taxRate: number;
}

/** True when a POS cart line is a Quick Bill (manually typed) item. */
export function isManualLineInput(item: any): boolean {
  return !!item && (item.manual === true || item.isManual === true || item.isManualItem === true);
}

/**
 * Validate a Quick Bill line. The seller is the price authority for these
 * (there is no catalog product), so we only enforce sane bounds.
 */
export function parseManualLine(item: any): { line?: ManualLine; error?: string } {
  const name = String(item?.name ?? item?.productName ?? "").trim().replace(/\s+/g, " ").slice(0, 100)
    || MANUAL_ITEM_DEFAULT_NAME;

  const unitPrice = Number(item?.unitPrice ?? item?.price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { error: `Enter a valid price for "${name}"` };
  }
  if (unitPrice > MANUAL_ITEM_MAX_PRICE) {
    return { error: `Price for "${name}" is too high` };
  }

  const quantity = Number(item?.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MANUAL_ITEM_MAX_QTY) {
    return { error: `Quantity for "${name}" must be a whole number between 1 and ${MANUAL_ITEM_MAX_QTY}` };
  }

  const rawTax = item?.taxRate;
  const taxRate = rawTax === undefined || rawTax === null || rawTax === "" ? 0 : Number(rawTax);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { error: `GST rate for "${name}" must be between 0 and 100` };
  }

  return { line: { name, unitPrice: round2(unitPrice), quantity, taxRate: round2(taxRate) } };
}

/** Rate of a populated/looked-up Tax document, honouring its active status. */
export function activeTaxRate(tax: any): number {
  if (!tax || typeof tax !== "object") return 0;
  if (tax.status === "Inactive" || tax.isActive === false) return 0;
  const rate = Number(tax.percentage ?? tax.rate);
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
}
