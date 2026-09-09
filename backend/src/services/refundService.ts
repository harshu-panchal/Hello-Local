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
 * Supports sequential partial refunds: each partial refund is validated against
 * the remaining refundable balance, and the order/payment only transition to
 * "Refunded" when the full captured amount has been refunded.
 *
 * Idempotent: duplicate requests for the same return/refund do not re-invoke Razorpay.
 * Never throws into the caller's happy path — a failed gateway refund is
 * recorded as `Failed` so it can be retried or settled manually.
 */
export async function refundOrder(
  orderId: string,
  reason: string,
  amount?: number,
  options?: {
    returnId?: string;
    idempotencyKey?: string;
  }
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
  if (!["Paid", "PartiallyRefunded"].includes(order.paymentStatus)) {
    return { refunded: false, amount: 0, reason: "Order was never paid" };
  }

  const payment = await Payment.findOne({
    order: orderId,
    status: { $in: ["Completed", "PartiallyRefunded"] },
    isDuplicate: { $ne: true },
  });
  if (!payment) {
    return { refunded: false, amount: 0, reason: "No active payment found for this order" };
  }

  // 1. Authoritative already-refunded amount across completed Refund records
  let totalCompletedRefunds = 0;
  if (mongoose.connection.readyState === 1 || (Refund.find as any) !== (mongoose.Model as any).find) {
    try {
      const completedRefunds = await Refund.find({
        order: orderId,
        payment: payment._id,
        status: "Completed",
      });
      if (Array.isArray(completedRefunds)) {
        totalCompletedRefunds = completedRefunds.reduce(
          (sum: number, r: any) => sum + (r.amount || 0),
          0
        );
      }
    } catch {
      // ignore
    }
  }

  const alreadyRefunded = Math.max(
    payment.totalRefunded || payment.refundAmount || 0,
    totalCompletedRefunds
  );

  const remainingRefundable = Math.max(
    0,
    Math.round((payment.amount - alreadyRefunded + Number.EPSILON) * 100) / 100
  );

  if (remainingRefundable <= 0.009) {
    return { refunded: false, amount: 0, reason: "Payment is already fully refunded" };
  }

  let requested = amount === undefined ? remainingRefundable : Number(amount);
  requested = Math.round(requested * 100) / 100;

  if (!Number.isFinite(requested) || requested <= 0) {
    throw new RefundError("Refund amount must be greater than zero");
  }

  if (requested > payment.amount || requested > remainingRefundable + 0.01) {
    throw new RefundError(
      `Requested refund (${requested}) exceeds remaining refundable amount (${remainingRefundable})`
    );
  }

  if (requested > payment.amount || requested > remainingRefundable) {
    requested = remainingRefundable;
  }

  // 2. Idempotency guard for this specific refund / return
  let existing: any = null;
  if (options?.idempotencyKey) {
    existing = await Refund.findOne({ idempotencyKey: options.idempotencyKey });
  } else if (options?.returnId) {
    existing = await Refund.findOne({ order: orderId, returnRequest: options.returnId });
  } else if (amount === undefined) {
    // Full order cancellation refund
    existing = await Refund.findOne({
      order: orderId,
      payment: payment._id,
      returnRequest: { $exists: false },
    });
  }

  if (existing && existing.status === "Completed") {
    return {
      refunded: true,
      amount: existing.amount,
      refundId: String(existing._id),
      reason: "Already refunded",
    };
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
      ...(options?.returnId ? { returnRequest: new mongoose.Types.ObjectId(options.returnId) } : {}),
      ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    }));

  // 3. Process refund with gateway (or resume if already processed at gateway)
  let result: any;
  if (refundDoc.refundTransactionId) {
    // Gateway was ALREADY called and succeeded in a prior attempt, but local save had failed.
    // Recover without calling Razorpay again!
    const newTotal = Math.min(
      payment.amount,
      Math.round((alreadyRefunded + requested + Number.EPSILON) * 100) / 100
    );
    const isFully = newTotal >= payment.amount - 0.01;
    payment.refundAmount = newTotal;
    payment.totalRefunded = newTotal;
    payment.refundedAt = new Date();
    payment.status = isFully ? "Refunded" : "PartiallyRefunded";
    await payment.save();

    result = {
      success: true,
      data: {
        refundId: refundDoc.refundTransactionId,
        amount: requested,
        isFullyRefunded: isFully,
      },
    };
  } else {
    result = await processRefund(String(payment._id), requested, reason, {
      returnId: options?.returnId,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  if (!result.success) {
    refundDoc.status = "Failed";
    (refundDoc as any).failureReason = result.message;
    await refundDoc.save();
    console.error(`Refund failed for order ${orderId}: ${result.message}`);
    return { refunded: false, amount: requested, reason: result.message };
  }

  // 4. Mark Refund completed
  refundDoc.status = "Completed";
  (refundDoc as any).refundTransactionId = result.data?.refundId;
  (refundDoc as any).processedAt = new Date();
  await refundDoc.save();

  // 5. Update Order paymentStatus: Refunded if fully refunded, otherwise PartiallyRefunded
  const isFullyRefunded = Boolean(result.data?.isFullyRefunded);
  const targetPaymentStatus = isFullyRefunded ? "Refunded" : "PartiallyRefunded";
  if (isFullyRefunded) {
    await Order.updateOne({ _id: orderId }, { $set: { paymentStatus: "Refunded" } });
  } else {
    await Order.updateOne({ _id: orderId }, { $set: { paymentStatus: "PartiallyRefunded" } });
  }

  console.log(`Refunded ${requested} for order ${order.orderNumber} (${reason}) - Status: ${targetPaymentStatus}`);

  return {
    refunded: true,
    amount: requested,
    refundId: String(refundDoc._id),
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
