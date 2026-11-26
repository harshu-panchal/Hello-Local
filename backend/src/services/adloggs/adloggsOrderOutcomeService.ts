import Order from "../../models/Order";
import OrderItem from "../../models/OrderItem";
import Shipment from "../../models/Shipment";
import { withOrderTransaction } from "../orderTransactionService";
import { queueOrderEffect } from "../orderEffectService";
import OrderEffect from "../../models/OrderEffect";
import { ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED } from "./adloggsConfig";

/**
 * Phase 7: provider-aware aggregation of an Adloggs order across its seller
 * shipments. There is no courier and no customer delivery OTP for external
 * deliveries: the parent order is completed from VERIFIED shipment outcomes
 * only, and nothing here reuses the in-house OTP/courier path.
 *
 * Effects:
 *  - ALL_DELIVERED / DELIVERED_AND_CANCELLED (cancelled part already handled by
 *    the cancellation lifecycle): order -> Delivered, remaining items ->
 *    Delivered, and ONE ExternalSettlement effect is queued, which stays HELD
 *    until external settlement is approved.
 *  - Any RTO, or anything unresolved: recorded with an attention note for an
 *    admin; no refund, restock or settlement is automated.
 */

export type ExternalOutcomeState = "IN_PROGRESS" | "PARTIALLY_DELIVERED" | "ALL_DELIVERED" | "DELIVERED_AND_CANCELLED"
  | "ALL_CANCELLED" | "DELIVERED_AND_RTO" | "ALL_RTO" | "UNRESOLVED";

export interface ExternalOutcome {
  state: ExternalOutcomeState;
  delivered: number; active: number; cancelled: number; returnedToOrigin: number; unresolved: number;
}

/** Classifies one shipment for aggregation. */
export function shipmentOutcomeClass(shipment: any): "delivered" | "cancelled" | "rto" | "unresolved" | "active" {
  const a = shipment?.adloggs ?? {};
  // Verified terminal transport outcomes first: a delivery that went ahead despite a refused
  // cancellation is a delivery, not an open question.
  if (shipment?.status === "DELIVERED" || shipment?.status === "RETURNED") return "delivered"; // a later customer return keeps it delivered
  if (shipment?.status === "CANCELLED") return "cancelled";
  if (shipment?.status === "RETURNED_TO_ORIGIN") return a.rto?.resolution?.state === "REFUNDED" ? "cancelled" : "rto"; // RTO is never a delivery
  if (shipment?.bookingIntent?.state === "OUTCOME_UNKNOWN") return "unresolved";
  if (a.pendingLocalCancellation?.state === "BLOCKED" || a.cancellation?.state === "UNKNOWN") return "unresolved";
  if (a.providerStatus === "CANCELLED") return "unresolved"; // provider-initiated, admin decides
  return "active";
}

/** Pure aggregation (no I/O). */
export function aggregateExternalOutcome(shipments: any[]): ExternalOutcome {
  const counts = { delivered: 0, active: 0, cancelled: 0, returnedToOrigin: 0, unresolved: 0 };
  for (const shipment of shipments) {
    const kind = shipmentOutcomeClass(shipment);
    if (kind === "rto") counts.returnedToOrigin++;
    else counts[kind]++;
  }
  let state: ExternalOutcomeState;
  if (!shipments.length) state = "UNRESOLVED";
  else if (counts.unresolved) state = "UNRESOLVED";
  else if (counts.active) state = counts.delivered ? "PARTIALLY_DELIVERED" : "IN_PROGRESS";
  else if (counts.returnedToOrigin) state = counts.delivered ? "DELIVERED_AND_RTO" : "ALL_RTO";
  else if (counts.delivered) state = counts.cancelled ? "DELIVERED_AND_CANCELLED" : "ALL_DELIVERED";
  else state = "ALL_CANCELLED";
  return { state, ...counts };
}

const ATTENTION: Partial<Record<ExternalOutcomeState, string>> = {
  DELIVERED_AND_RTO: "Some shipments were returned to the store by Adloggs. Resolve each returned shipment (refund, with or without restock) in Shipment Operations; the order completes afterwards.",
  ALL_RTO: "All shipments were returned to the store by Adloggs. Resolve each returned shipment (refund, with or without restock) in Shipment Operations.",
  UNRESOLVED: "A shipment has an unresolved Adloggs outcome (unknown booking, blocked cancellation or provider cancellation).",
};

/** Re-evaluates one Adloggs order. Idempotent; safe to call after any provider or cancellation update. */
export async function syncExternalOrderOutcome(orderId: string, now = new Date()): Promise<ExternalOutcome | null> {
  return withOrderTransaction(orderId, async session => {
    const order: any = await Order.findById(orderId).session(session);
    if (!order || order.deliveryProvider !== "ADDLOGS" || !order.shipmentsCreated) return null;
    const shipments: any[] = await Shipment.find({ order: orderId }).select("status bookingIntent adloggs").session(session);
    const outcome = aggregateExternalOutcome(shipments);

    const completable = ["ALL_DELIVERED", "DELIVERED_AND_CANCELLED"].includes(outcome.state)
      && !["Delivered", "Cancelled", "Rejected", "Returned"].includes(order.status)
      && (order.paymentMethod === "COD" || ["Paid", "PartiallyRefunded"].includes(order.paymentStatus));
    const previous = order.externalDeliveryOutcome;
    order.externalDeliveryOutcome = {
      ...outcome, evaluatedAt: now,
      ...(previous?.completedAt ? { completedAt: previous.completedAt } : {}),
      ...(ATTENTION[outcome.state] ? { attention: ATTENTION[outcome.state] } : {}),
    };
    if (completable) {
      // External completion: no courier, no OTP, no deliveryBoy fields touched.
      order.status = "Delivered";
      order.deliveredAt = order.deliveredAt ?? now;
      order.invoiceEnabled = true;
      order.settlementStatus = "Pending";
      // COD: Adloggs' rider collected the cash at delivery (settled with us on the Adloggs platform).
      if (order.paymentMethod === "COD") order.paymentStatus = "Paid";
      order.externalDeliveryOutcome.completedAt = now;
      await OrderItem.updateMany({ order: orderId, status: { $ne: "Cancelled" } }, { $set: { status: "Delivered" } }, { session });
      await queueOrderEffect(order, "ExternalSettlement", `${orderId}:external-settlement`, session);
    }
    await order.save({ session });
    return outcome;
  });
}

/**
 * Held ExternalSettlement effects become runnable ONLY after the gate is enabled
 * in a reviewed change. While it is disabled this does nothing. Re-releasing is
 * harmless: the worker only pays Pending commissions (Pending -> Paid, per-order lease).
 */
export async function releaseHeldExternalSettlements(now = new Date()): Promise<{ released: number; disabled: boolean }> {
  if (!ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED) return { released: 0, disabled: true };
  const result = await OrderEffect.updateMany({ kind: "ExternalSettlement", status: "Held" }, { $set: { status: "Pending", nextAttemptAt: now, lastError: null } });
  return { released: result.modifiedCount ?? 0, disabled: false };
}
