/**
 * POS money helpers. These mirror backend/src/utils/posBilling.ts exactly so
 * the cart preview always matches the bill the server generates.
 */

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export interface PricedLine {
  /** Tax-inclusive line amount (unit price × qty). */
  amount: number;
  taxRate: number;
}

/**
 * Spread a bill-level discount across lines in proportion to their amounts and
 * return the GST embedded in the discounted total (prices are tax-inclusive).
 */
export function allocateDiscountAndTax(lines: PricedLine[], discount: number): {
  lines: Array<{ discount: number; taxableAmount: number; taxAmount: number }>;
  totalTax: number;
} {
  const subtotal = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const disc = Math.min(Math.max(0, round2(discount)), subtotal);

  let lastIndex = -1;
  lines.forEach((l, i) => {
    if ((Number(l.amount) || 0) > 0) lastIndex = i;
  });

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

/** True for a valid 10-digit Indian mobile number. */
export const isValidIndianMobile = (digits: string): boolean => /^[6-9]\d{9}$/.test(digits);

/** Random id for one checkout attempt, used to make retries idempotent. */
export function newClientSaleId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
