import mongoose from "mongoose";
import Product from "../models/Product";
import {
  findVariationIndex,
  normalizeSelector,
  type VariationSelector,
} from "../utils/productVariation";

/**
 * Stock reservation with a guaranteed compensating release.
 *
 * `createOrder` used to decrement stock inside its item loop and only *then*
 * run the seller-serviceability check. When that check failed it returned 403
 * having already decremented every product and written OrderItem rows — and
 * without a transaction none of it was rolled back. The live database showed
 * 155 orphaned OrderItems out of 533 (29%) from exactly this path. (#H-01)
 *
 * Variation decrements were also wrong: the old query put the value match and
 * the `stock: { $gte }` match as two independent conditions on the same array,
 * so the positional `$` could resolve to a *different* element than the one the
 * customer picked, and `$inc` bypasses the schema's `min: 0`. (#H-02)
 */

export class StockError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "StockError";
  }
}

export interface StockRequest {
  productId: string;
  quantity: number;
  variation?: VariationSelector;
}

export interface StockReservation {
  productId: string;
  quantity: number;
  /** Index of the variation that was decremented, or -1 for a simple product. */
  variationIndex: number;
  variationLabel: string;
}

/**
 * Atomically take `quantity` off one product (or one specific variation).
 *
 * Uses `$elemMatch` so the identity check and the availability check must be
 * satisfied by the SAME array element, which is what makes the positional `$`
 * safe. The `$gte` guard means the update matches nothing when stock is short,
 * so the decrement can never produce a negative value.
 */
export async function reserveOne(
  req: StockRequest,
  session?: mongoose.ClientSession,
): Promise<StockReservation> {
  const qty = Number(req.quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new StockError(`Invalid quantity: ${req.quantity}`);
  }

  const product = await Product.findById(req.productId).session(session || null);
  if (!product) {
    throw new StockError(`Product not found: ${req.productId}`);
  }
  if (product.status !== "Active" || !product.publish) {
    throw new StockError(`"${product.productName}" is no longer available`);
  }

  const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
  const selector = normalizeSelector(req.variation ?? null);

  if (hasVariations) {
    if (!selector) {
      throw new StockError(
        `Please choose an option for "${product.productName}"`,
      );
    }

    const index = findVariationIndex(product.variations as any, selector);
    if (index === -1) {
      throw new StockError(
        `"${selector}" is not a valid option for "${product.productName}"`,
      );
    }

    const chosen: any = (product.variations as any)[index];
    const available = Number(chosen.stock) || 0;
    if (available < qty) {
      throw new StockError(
        `Only ${available} left of "${product.productName}" (${selector})`,
      );
    }

    // Target that exact element by its _id, with the availability guard on the
    // SAME element, so the positional operator cannot drift. (#H-02)
    const updated = await Product.findOneAndUpdate(
      {
        _id: product._id,
        variations: {
          $elemMatch: { _id: chosen._id, stock: { $gte: qty } },
        },
      },
      { $inc: { "variations.$.stock": -qty, stock: -qty } },
      { new: true, ...(session ? { session } : {}) },
    );

    if (!updated) {
      throw new StockError(
        `"${product.productName}" (${selector}) just went out of stock`,
      );
    }

    return {
      productId: String(product._id),
      quantity: qty,
      variationIndex: index,
      variationLabel: String(chosen.value || chosen.title || chosen.pack || selector),
    };
  }

  if (selector) {
    throw new StockError(
      `"${product.productName}" has no options, but "${selector}" was selected`,
    );
  }

  const updated = await Product.findOneAndUpdate(
    { _id: product._id, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
    { new: true, ...(session ? { session } : {}) },
  );

  if (!updated) {
    throw new StockError(
      `Only ${product.stock} left of "${product.productName}"`,
    );
  }

  return {
    productId: String(product._id),
    quantity: qty,
    variationIndex: -1,
    variationLabel: "",
  };
}

/**
 * Put stock back. Used both to compensate a failed reservation batch and to
 * restore a cancelled/returned order.
 *
 * Targets the exact variation by index so it cannot land on `variations[0]`,
 * which is what the old cancellation path did whenever the variation had been
 * selected by id. (#H-36)
 */
export async function releaseOne(
  reservation: StockReservation,
  session?: mongoose.ClientSession,
): Promise<void> {
  const { productId, quantity, variationIndex } = reservation;
  if (quantity <= 0) return;

  if (variationIndex >= 0) {
    await Product.updateOne(
      { _id: productId },
      {
        $inc: {
          [`variations.${variationIndex}.stock`]: quantity,
          stock: quantity,
        },
      },
      session ? { session } : {},
    );
    return;
  }

  await Product.updateOne(
    { _id: productId },
    { $inc: { stock: quantity } },
    session ? { session } : {},
  );
}

/**
 * Reserve a whole basket, releasing everything already taken if any line fails.
 *
 * This is the guarantee that was missing: partial reservations are always
 * compensated, with or without a transaction.
 */
export async function reserveMany(
  requests: StockRequest[],
  session?: mongoose.ClientSession,
): Promise<StockReservation[]> {
  const taken: StockReservation[] = [];
  try {
    for (const r of requests) {
      taken.push(await reserveOne(r, session));
    }
    return taken;
  } catch (error) {
    // Compensate in reverse order. Failures here are logged, never masked.
    for (const r of taken.reverse()) {
      try {
        await releaseOne(r, session);
      } catch (releaseErr) {
        console.error(
          `CRITICAL: failed to release reserved stock for product ${r.productId} ` +
            `(qty ${r.quantity}) after a failed order. Manual correction needed.`,
          releaseErr,
        );
      }
    }
    throw error;
  }
}

/** Release everything reserved for a set of order items. */
export async function releaseMany(
  reservations: StockReservation[],
  session?: mongoose.ClientSession,
): Promise<void> {
  for (const r of reservations) {
    try {
      await releaseOne(r, session);
    } catch (err) {
      console.error(`Failed to restore stock for product ${r.productId}:`, err);
    }
  }
}

/**
 * Rebuild reservations from persisted order items so a cancellation restores
 * exactly what was taken.
 */
export async function reservationsFromOrderItems(
  items: Array<{ product: unknown; quantity: number; variation?: string }>,
): Promise<StockReservation[]> {
  const out: StockReservation[] = [];
  for (const item of items) {
    const product = await Product.findById(item.product).select("variations");
    const index = product
      ? findVariationIndex(product.variations as any, item.variation ?? null)
      : -1;
    out.push({
      productId: String(item.product),
      quantity: Number(item.quantity) || 0,
      variationIndex: index,
      variationLabel: item.variation || "",
    });
  }
  return out;
}
