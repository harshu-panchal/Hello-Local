import mongoose from "mongoose";

/**
 * The single authoritative way to identify a product variation.
 *
 * There were three different implementations:
 *   - cart:        matched on `_id` only
 *   - createOrder: matched on `_id` | value | title | pack
 *   - cancelOrder: matched on value | title | pack (no `_id`)
 *
 * so a variation chosen by id priced correctly at checkout but fell back to the
 * base price in the cart, and on cancellation the restore landed on
 * `variations[0]` — the wrong variation entirely. (#H-35 / #H-36 / #H-02)
 */

export interface VariationLike {
  _id?: unknown;
  name?: string;
  value?: string;
  title?: string;
  pack?: string;
  price?: number;
  discPrice?: number;
  stock?: number;
  sku?: string;
  status?: string;
}

/** A variation selector as it may arrive from any client. */
export type VariationSelector =
  | string
  | number
  | { _id?: unknown; id?: unknown; value?: string; title?: string; pack?: string }
  | null
  | undefined;

/** Reduce any selector shape to a comparable string. */
export function normalizeSelector(selector: VariationSelector): string | null {
  if (selector === null || selector === undefined) return null;
  if (typeof selector === "object") {
    const o = selector as Record<string, unknown>;
    const candidate = o._id ?? o.id ?? o.value ?? o.title ?? o.pack;
    return candidate === undefined || candidate === null ? null : String(candidate).trim();
  }
  const s = String(selector).trim();
  return s.length ? s : null;
}

/**
 * Find the index of the variation a selector refers to.
 * Returns -1 when there is no match.
 */
export function findVariationIndex(
  variations: VariationLike[] | undefined | null,
  selector: VariationSelector,
): number {
  if (!variations || variations.length === 0) return -1;
  const key = normalizeSelector(selector);
  if (key === null) return -1;

  // Identity first — an id is unambiguous.
  if (mongoose.isValidObjectId(key)) {
    const byId = variations.findIndex(
      (v) => v?._id !== undefined && v._id !== null && String(v._id) === key,
    );
    if (byId !== -1) return byId;
  }

  // Then the human-readable labels, case-insensitively.
  const lower = key.toLowerCase();
  return variations.findIndex((v) => {
    if (!v) return false;
    return [v.value, v.title, v.pack, v.name].some(
      (label) => typeof label === "string" && label.trim().toLowerCase() === lower,
    );
  });
}

export function findVariation(
  variations: VariationLike[] | undefined | null,
  selector: VariationSelector,
): VariationLike | null {
  const i = findVariationIndex(variations, selector);
  return i === -1 ? null : variations![i];
}

/**
 * The stable label to persist on an order item, so an invoice keeps showing
 * "500g" even if the selector was an id.
 */
export function variationLabel(v: VariationLike | null | undefined): string {
  if (!v) return "";
  return String(v.value || v.title || v.pack || v.name || "");
}

/**
 * The effective unit price for a product, honouring variation-level and
 * product-level discounts in that order. A `discPrice` of 0 means "no discount"
 * throughout this codebase, so it must be treated as unset rather than free.
 */
export function effectiveUnitPrice(
  product: { price?: number; discPrice?: number },
  variation?: VariationLike | null,
): number {
  const varDisc = Number(variation?.discPrice) || 0;
  if (variation && varDisc > 0) return varDisc;

  const prodDisc = Number(product?.discPrice) || 0;
  if (prodDisc > 0) return prodDisc;

  const varPrice = Number(variation?.price) || 0;
  if (variation && varPrice > 0) return varPrice;

  return Number(product?.price) || 0;
}
