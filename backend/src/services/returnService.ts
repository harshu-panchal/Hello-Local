import mongoose from "mongoose";
import Return from "../models/Return";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import { releaseOne, reservationsFromOrderItems } from "./stockService";
import { refundOrder } from "./refundService";

/**
 * Returns.
 *
 * Nothing in the codebase could create a `Return`, so the collection was always
 * empty and three admin/seller/courier screens were permanently blank. Approving
 * a return also did nothing beyond setting a status field: no refund, no
 * restock, no commission reversal, no change to the order. (#H-20)
 */

export class ReturnError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ReturnError";
    this.statusCode = statusCode;
  }
}

/** Statuses a return may move between. */
const RETURN_TRANSITIONS: Record<string, string[]> = {
  Pending: ["Approved", "Rejected"],
  Approved: ["Processing", "Rejected"],
  Processing: ["Completed", "Rejected"],
  Completed: [],
  Rejected: [],
};

export function validateReturnTransition(from: string, to: string) {
  const allowed = RETURN_TRANSITIONS[from];
  if (!allowed) return { valid: false, message: `Unknown return status "${from}"` };
  if (!allowed.includes(to)) {
    return {
      valid: false,
      message: `Cannot move a return from ${from} to ${to}. Allowed: ${allowed.join(", ") || "nothing"}`,
    };
  }
  return { valid: true as const };
}

/**
 * Customer raises a return against a delivered order item.
 */
export async function requestReturn(params: {
  customerId: string;
  orderId: string;
  orderItemId: string;
  quantity: number;
  reason: string;
  description?: string;
  images?: string[];
}) {
  const { customerId, orderId, orderItemId, reason } = params;

  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(orderItemId)) {
    throw new ReturnError("Invalid order or item id");
  }
  if (!reason || !String(reason).trim()) {
    throw new ReturnError("A reason is required");
  }

  const order = await Order.findOne({ _id: orderId, customer: customerId });
  if (!order) throw new ReturnError("Order not found", 404);

  if (order.status !== "Delivered") {
    throw new ReturnError("Only delivered orders can be returned");
  }

  const orderItem = await OrderItem.findOne({ _id: orderItemId, order: orderId });
  if (!orderItem) throw new ReturnError("That item is not part of this order", 404);

  const quantity = Number(params.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > orderItem.quantity) {
    throw new ReturnError(
      `Quantity must be between 1 and ${orderItem.quantity}`,
    );
  }

  // Return window, taken from the product's own policy.
  const product = await Product.findById(orderItem.product).select(
    "isReturnable maxReturnDays productName",
  );
  if (product && product.isReturnable === false) {
    throw new ReturnError(`"${product.productName}" is not returnable`);
  }
  const windowDays = product?.maxReturnDays ?? 7;
  const deliveredAt = order.deliveredAt || order.updatedAt;
  const ageDays = (Date.now() - new Date(deliveredAt).getTime()) / 86_400_000;
  if (ageDays > windowDays) {
    throw new ReturnError(
      `The ${windowDays}-day return window for this item has closed`,
    );
  }

  // One open return per order item.
  const existing = await Return.findOne({
    orderItem: orderItemId,
    status: { $in: ["Pending", "Approved", "Processing"] },
  });
  if (existing) {
    throw new ReturnError("A return is already in progress for this item", 409);
  }

  const refundAmount =
    Math.round(((orderItem.unitPrice || 0) * quantity + Number.EPSILON) * 100) / 100;

  const created = await Return.create({
    order: orderId,
    orderItem: orderItemId,
    customer: customerId,
    reason: String(reason).trim(),
    description: params.description,
    images: Array.isArray(params.images) ? params.images.slice(0, 5) : [],
    quantity,
    refundAmount,
    status: "Pending",
    pickupAddress: {
      address: order.deliveryAddress?.address,
      city: order.deliveryAddress?.city,
      pincode: order.deliveryAddress?.pincode,
    },
  });

  return created;
}

/**
 * Admin/seller decision on a return.
 *
 * Completing a return is what actually moves money and stock: the item goes
 * back on the shelf, the customer is refunded, and the commission credited for
 * that order is reversed.
 */
export async function processReturn(params: {
  returnId: string;
  status: "Approved" | "Rejected" | "Processing" | "Completed";
  processedBy: string;
  rejectionReason?: string;
  refundAmount?: number;
}) {
  const { returnId, status, processedBy } = params;

  if (!mongoose.Types.ObjectId.isValid(returnId)) {
    throw new ReturnError("Invalid return id");
  }

  const ret = await Return.findById(returnId);
  if (!ret) throw new ReturnError("Return request not found", 404);

  const check = validateReturnTransition(ret.status, status);
  if (!check.valid) throw new ReturnError(check.message!);

  const orderItem = await OrderItem.findById(ret.orderItem);
  if (!orderItem) throw new ReturnError("The returned item no longer exists", 404);

  // A refund can never exceed what was charged for the returned quantity.
  const maxRefund =
    Math.round(((orderItem.unitPrice || 0) * ret.quantity + Number.EPSILON) * 100) / 100;
  if (params.refundAmount !== undefined) {
    const requested = Number(params.refundAmount);
    if (!Number.isFinite(requested) || requested < 0 || requested > maxRefund + 0.01) {
      throw new ReturnError(`Refund must be between 0 and ${maxRefund}`);
    }
    ret.refundAmount = requested;
  }

  ret.status = status;
  ret.processedBy = new mongoose.Types.ObjectId(processedBy);
  ret.processedAt = new Date();
  if (status === "Rejected" && params.rejectionReason) {
    ret.rejectionReason = params.rejectionReason;
  }
  await ret.save();

  if (status !== "Completed") return ret;

  // ── Completion: restock, refund, reverse commission, close the order ──────
  try {
    const reservations = await reservationsFromOrderItems([
      { product: orderItem.product, quantity: ret.quantity, variation: orderItem.variation },
    ]);
    for (const r of reservations) await releaseOne(r);
  } catch (err) {
    console.error(`Return ${returnId}: failed to restock`, err);
  }

  await OrderItem.updateOne({ _id: ret.orderItem }, { $set: { status: "Returned" } });

  const order = await Order.findById(ret.order);
  if (order) {
    // If every line is returned, the order itself is Returned.
    const items = await OrderItem.find({ order: order._id }).select("status");
    const allReturned = items.length > 0 && items.every((i) => i.status === "Returned");
    if (allReturned) {
      await Order.updateOne({ _id: order._id }, { $set: { status: "Returned" } });
    }

    if (order.paymentStatus === "Paid" && order.paymentMethod !== "COD") {
      try {
        const outcome = await refundOrder(
          String(order._id),
          `Return completed: ${ret.reason}`,
          ret.refundAmount,
        );
        if (!outcome.refunded) {
          console.error(`Return ${returnId}: refund not issued — ${outcome.reason}`);
        }
      } catch (err) {
        console.error(`Return ${returnId}: refund failed`, err);
      }
    }

    try {
      const { reverseCommissions } = await import("./commissionService");
      await reverseCommissions(String(order._id));
    } catch (err) {
      console.error(`Return ${returnId}: commission reversal failed`, err);
    }
  }

  return ret;
}

/** Returns visible to a given customer. */
export async function listCustomerReturns(customerId: string, page = 1, limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);

  const [returns, total] = await Promise.all([
    Return.find({ customer: customerId })
      .populate("order", "orderNumber")
      .populate("orderItem", "productName productImage unitPrice quantity")
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Return.countDocuments({ customer: customerId }),
  ]);

  return {
    returns,
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  };
}
