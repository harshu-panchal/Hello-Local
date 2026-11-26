import crypto from "crypto";
import mongoose, { ClientSession, Schema } from "mongoose";
import OrderEffect from "../models/OrderEffect";
import Order from "../models/Order";

const Lease = mongoose.models.OrderFinanceLease || mongoose.model("OrderFinanceLease",
  new Schema({ _id: String, token: String, until: Date }));

export type OrderEffectKind = "Refund" | "Settlement" | "Reversal" | "ExternalSettlement";

export async function queueOrderEffect(order: any, kind: OrderEffectKind, key: string,
  session: ClientSession | undefined, amount?: number, reason?: string) {
  await OrderEffect.updateOne({ _id: key }, { $setOnInsert: {
    order: order._id, kind, amount, reason, status: "Pending", nextAttemptAt: new Date(),
  } }, { upsert: true, session });
}

export async function processOrderEffects(orderId?: string) {
  const tasks = await OrderEffect.find({ ...(orderId ? { order: orderId } : {}),
    status: { $in: ["Pending", "Failed", "Processing"] }, nextAttemptAt: { $lte: new Date() },
  }).sort({ createdAt: 1 }).limit(30).lean();
  for (const task of tasks) {
    const key = String(task.order);
    const token = crypto.randomUUID();
    let acquired = false;
    try {
      const lease = await Lease.findOneAndUpdate({ _id: key, $or: [{ until: { $lte: new Date() } }, { until: null }] },
        { $set: { token, until: new Date(Date.now() + 300000) } }, { upsert: true, new: true });
      acquired = lease?.token === token;
    } catch (error: any) { if (error.code !== 11000) throw error; }
    if (!acquired) continue;
    const heartbeat = setInterval(() => {
      void Lease.updateOne({ _id: key, token }, { $set: { until: new Date(Date.now() + 300000) } })
        .catch(error => console.error("Financial task lease renewal failed", error));
    }, 30000);
    heartbeat.unref?.();
    try {
      const claimed = await OrderEffect.findOneAndUpdate({ _id: task._id, status: { $ne: "Complete" } },
        { $set: { status: "Processing" }, $inc: { attempts: 1 } }, { new: true });
      if (!claimed) continue;
      if (task.kind === "Refund") {
        const { refundOrder } = await import("./refundService");
        const result = await refundOrder(key, task.reason || "Order cancelled", task.amount,
          { idempotencyKey: String(task._id) });
        const order = await Order.findById(key).select("paymentStatus");
        if (!result.refunded && order?.paymentStatus !== "Refunded") throw new Error(result.reason || "Refund is pending");
      } else if (task.kind === "Reversal") {
        const { reverseCommissions } = await import("./commissionService");
        const result = await reverseCommissions(key);
        if (!result.success) throw new Error(result.message || "Commission reversal failed");
      } else if (task.kind === "Settlement" || task.kind === "ExternalSettlement") {
        const { processOrderStatusTransition } = await import("./orderService");
        const order = await Order.findById(key).select("status deliveryProvider paymentMethod");
        if (order?.status !== "Delivered") {
          await OrderEffect.updateOne({ _id: task._id }, { $set: { status: "Complete", lastError: "Order no longer delivered" } });
          continue;
        }
        const external = order.deliveryProvider === "ADDLOGS";
        if (task.kind === "Settlement" && external) {
          // External deliveries never settle through the in-house branch.
          await OrderEffect.updateOne({ _id: task._id }, { $set: { status: "Held", lastError: "External delivery orders settle only through ExternalSettlement." } });
          continue;
        }
        if (task.kind === "ExternalSettlement") {
          const { ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED } = await import("./adloggs/adloggsConfig");
          if (!external || !ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED || order.paymentMethod === "COD") {
            // COD: the existing COD payout assumes our own courier collected the cash; external
            // COD settlement must be reconciled with the provider's COD Settlement report first.
            await OrderEffect.updateOne({ _id: task._id }, { $set: { status: "Held",
              lastError: !external ? "Not an external delivery order."
                : order.paymentMethod === "COD" ? "External COD seller settlement waits for reconciliation with the provider's COD Settlement report."
                : "External seller settlement is not approved yet." } });
            continue;
          }
        }
        // Same calculations and timing as in-house Online settlement (commissions on delivery).
        await processOrderStatusTransition(key, "Delivered");
        await Order.updateOne({ _id: key }, { $set: { settlementStatus: "Complete", settlementError: null } });
      } else {
        // Unknown kinds never fall through to a money-moving branch.
        await OrderEffect.updateOne({ _id: task._id }, { $set: { status: "Held", lastError: `Unknown effect kind "${String(task.kind)}"; not executed.` } });
        continue;
      }
      await OrderEffect.updateOne({ _id: task._id }, { $set: { status: "Complete", lastError: null } });
    } catch (error: any) {
      await OrderEffect.updateOne({ _id: task._id }, { $set: {
        status: "Failed", lastError: error.message, nextAttemptAt: new Date(Date.now() + 60000),
      } });
      if (task.kind === "Settlement") await Order.updateOne({ _id: key },
        { $set: { settlementStatus: "Failed", settlementError: error.message } });
      console.error(`Order ${key} ${task.kind} queued for retry:`, error.message);
    } finally {
      clearInterval(heartbeat);
      await Lease.updateOne({ _id: key, token }, { $set: { until: new Date(0) } });
    }
  }
}

export function runOrderEffects(orderId: string) {
  return processOrderEffects(orderId).catch(error => console.error("Order financial tasks will retry:", error));
}

// Repair interrupted capture/queue operations after a restart as well as legacy deliveries.
export async function recoverOrderEffects() {
  const orders = await Order.find({ $or: [
    { status: { $in: ["Cancelled", "Rejected", "Returned"] }, paymentMethod: { $ne: "COD" }, paymentStatus: { $in: ["Paid", "PartiallyRefunded"] } },
    // External-provider orders are settled only through their own held ExternalSettlement effect.
    { status: "Delivered", settlementStatus: { $in: ["Pending", "Failed"] }, deliveryProvider: { $ne: "ADDLOGS" } },
  ] }).limit(100).select("status paymentStatus");
  for (const order of orders) {
    const settlement = order.status === "Delivered";
    await OrderEffect.updateOne({ _id: `${order._id}:${settlement ? "settlement" : "cancel:remaining"}` }, { $setOnInsert: {
      order: order._id, kind: settlement ? "Settlement" : "Refund", status: "Pending", nextAttemptAt: new Date(), reason: "Order closed before payment capture completed",
    } }, { upsert: true });
  }
}
