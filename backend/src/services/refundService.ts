import mongoose from "mongoose";
import Order from "../models/Order";
import Payment from "../models/Payment";
import Refund from "../models/Refund";
import { processRefund } from "./paymentService";

/**
 * Refunds.
 *
 * There was no refund path at all: `processRefund` existed but had zero call
 * sites and the `Refund` model had zero importers, so cancelling a paid order
 * left `paymentStatus: "Paid"` and the customer's money with the platform.
 * (#H-06)
 */

export class RefundError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RefundError";
    this.statusCode = statusCode;
  }
}

export interface RefundOutcome {
  refunded: boolean;
  amount: number;
  refundId?: string;
  reason?: string;
}

/**
 * Refund a prepaid order in full (or a specified partial amount).
 *
 * Idempotent: a second call for an already-refunded order is a no-op.
 * Never throws into the caller's happy path — a failed gateway refund is
 * recorded as `Failed` so it can be retried or settled manually.
 */
export async function refundOrder(
  orderId: string,
  reason: string,
  amount?: number,
): Promise<RefundOutcome> {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new RefundError("Invalid order id");
  }

  const order = await Order.findById(orderId);
  if (!order) throw new RefundError("Order not found", 404);

  if (order.paymentMethod === "COD") {
    return { refunded: false, amount: 0, reason: "COD orders are not prepaid" };
  }
  if (order.paymentStatus === "Refunded") {
    return { refunded: false, amount: 0, reason: "Order is already refunded" };
  }
  if (order.paymentStatus !== "Paid") {
    return { refunded: false, amount: 0, reason: "Order was never paid" };
  }

  const payment = await Payment.findOne({ order: orderId, status: "Completed" });
  if (!payment) {
    return { refunded: false, amount: 0, reason: "No completed payment found for this order" };
  }

  const requested = amount === undefined ? payment.amount : Number(amount);
  if (!Number.isFinite(requested) || requested <= 0 || requested > payment.amount + 0.01) {
    throw new RefundError(
      `Refund amount must be between 0 and the captured amount (${payment.amount})`,
    );
  }

  // Idempotency guard — one refund record per order+payment.
  const existing = await Refund.findOne({ order: orderId, payment: payment._id });
  if (existing && existing.status === "Completed") {
    return { refunded: false, amount: existing.amount, reason: "Already refunded" };
  }

  const refundDoc =
    existing ||
    (await Refund.create({
      order: orderId,
      customer: order.customer,
      payment: payment._id,
      amount: requested,
      reason,
      status: "Pending",
    }));

  const result = await processRefund(String(payment._id), requested, reason);

  if (!result.success) {
    refundDoc.status = "Failed";
    (refundDoc as any).failureReason = result.message;
    await refundDoc.save();
    console.error(`Refund failed for order ${orderId}: ${result.message}`);
    return { refunded: false, amount: requested, reason: result.message };
  }

  refundDoc.status = "Completed";
  (refundDoc as any).refundTransactionId = result.data?.refundId;
  (refundDoc as any).processedAt = new Date();
  await refundDoc.save();

  await Order.updateOne({ _id: orderId }, { $set: { paymentStatus: "Refunded" } });

  console.log(`Refunded ${requested} for order ${order.orderNumber} (${reason})`);

  return {
    refunded: true,
    amount: requested,
    refundId: result.data?.refundId,
  };
}

/** List refunds for admin reporting. */
export async function listRefunds(filter: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const limit = Math.min(Math.max(Number(filter.limit) || 20, 1), 100);
  const page = Math.max(Number(filter.page) || 1, 1);
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;

  const [refunds, total] = await Promise.all([
    Refund.find(query)
      .populate("order", "orderNumber total")
      .populate("customer", "name phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Refund.countDocuments(query),
  ]);

  return {
    refunds,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}
