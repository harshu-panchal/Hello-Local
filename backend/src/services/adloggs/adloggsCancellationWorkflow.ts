import mongoose from "mongoose";
import Shipment from "../../models/Shipment";
import { cancelOrderLifecycle } from "../orderLifecycleService";
import { providerCancellationVerified } from "./adloggsDeferredCancellation";

/**
 * Phase 7: completion of DEFERRED local cancellations for Adloggs shipments,
 * and the admin workflow for cancellations Adloggs initiated itself.
 *
 * Money rules:
 *  - A refund is queued only through `cancelOrderLifecycle`, scoped to the one
 *    seller whose provider order is verifiably cancelled, with the existing
 *    idempotency keys (`<order>:cancel:seller:<seller>` / `<order>:cancel:remaining`).
 *    `refundOrder` additionally caps every refund at what is still refundable.
 *  - Unknown or rejected provider cancellations never refund; they block and
 *    escalate to an admin.
 */

const POST_PICKUP = ["PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED_AT_DELIVERY", "DELIVERED", "RETURN_INITIATED", "RTO_DELIVERED"];

export type CompletionOutcome = "COMPLETED" | "WAITING" | "BLOCKED" | "NONE";

/** Complete one deferred cancellation if (and only if) the provider side is verified. Idempotent. */
export async function completeDeferredCancellation(shipmentId: string, now = new Date()): Promise<{ outcome: CompletionOutcome; detail?: string }> {
  if (!mongoose.Types.ObjectId.isValid(shipmentId)) return { outcome: "NONE" };
  const shipment: any = await Shipment.findById(shipmentId).select("order seller status bookingIntent adloggs").lean();
  const pending = shipment?.adloggs?.pendingLocalCancellation;
  if (!pending || pending.state !== "AWAITING_PROVIDER") return { outcome: "NONE" };
  const a = shipment.adloggs;

  const blockReason = a.cancellation?.state === "REJECTED" ? `Adloggs refused the cancellation${a.cancellation.lastError ? ` (${a.cancellation.lastError})` : ""}.`
    : POST_PICKUP.includes(a.providerStatus) ? "Adloggs has already picked up this shipment." : null;
  if (blockReason) {
    await Shipment.updateOne({ _id: shipmentId, "adloggs.pendingLocalCancellation.state": "AWAITING_PROVIDER" }, { $set: {
      "adloggs.pendingLocalCancellation.state": "BLOCKED", "adloggs.pendingLocalCancellation.blockedReason": blockReason.slice(0, 300),
      attention: { reason: `Cancellation request blocked: ${blockReason} No refund was made. Contact the customer and Adloggs.`, at: now },
    } });
    return { outcome: "BLOCKED", detail: blockReason };
  }
  if (!providerCancellationVerified(shipment)) return { outcome: "WAITING" };

  await cancelOrderLifecycle(String(shipment.order), "system", {
    sellerId: String(shipment.seller), reason: pending.reason, status: pending.status, externalCancellationConfirmed: true,
  });
  await Shipment.updateOne({ _id: shipmentId, "adloggs.pendingLocalCancellation.state": "AWAITING_PROVIDER" }, {
    $set: { "adloggs.pendingLocalCancellation.state": "COMPLETED", "adloggs.pendingLocalCancellation.completedAt": now },
    $unset: { attention: "" },
  });
  // A cancelled seller may leave the rest of the order fully delivered.
  const { syncExternalOrderOutcome } = await import("./adloggsOrderOutcomeService");
  await syncExternalOrderOutcome(String(shipment.order), now).catch(error => console.error("External order outcome sync failed:", error?.message));
  return { outcome: "COMPLETED" };
}

/** Bounded sweep over pending requests (scheduled with the Adloggs workers, and after provider updates). */
/**
 * Re-evaluates Adloggs orders with a terminal shipment whose parent is not
 * closed yet (repairs a missed post-commit trigger). Database only.
 */
export async function runExternalOutcomeSweep(limit = 20, now = new Date()) {
  const { syncExternalOrderOutcome } = await import("./adloggsOrderOutcomeService");
  const orderIds: any[] = await Shipment.distinct("order", { deliveryProvider: "ADDLOGS", status: { $in: ["DELIVERED", "RETURNED_TO_ORIGIN"] } });
  const open: any[] = orderIds.length ? await (await import("../../models/Order")).default
    .find({ _id: { $in: orderIds.slice(0, 500) }, status: { $nin: ["Delivered", "Cancelled", "Rejected", "Returned"] } }).select("_id").limit(limit).lean() : [];
  for (const order of open) await syncExternalOrderOutcome(String(order._id), now).catch(error => console.error("External outcome sweep:", error?.message));
  return open.length;
}

/** A cancellation still waiting for Adloggs after this long is escalated to admins (once). */
export const PENDING_CANCELLATION_ESCALATE_AFTER_MS = 30 * 60_000;
/** A verified RTO left without a decision for this long is escalated to admins (once). */
export const RTO_DECISION_ESCALATE_AFTER_MS = 24 * 60 * 60_000;

export async function runDeferredCancellationSweep(limit = 20, now = new Date()) {
  const pending: any[] = await Shipment.find({ "adloggs.pendingLocalCancellation.state": "AWAITING_PROVIDER" })
    .select("_id adloggs.pendingLocalCancellation").limit(limit).lean();
  const outcomes: Record<string, number> = {};
  for (const shipment of pending) {
    try {
      const { outcome } = await completeDeferredCancellation(String(shipment._id), now);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      const request = shipment.adloggs?.pendingLocalCancellation;
      if (outcome === "WAITING" && request && !request.escalatedAt
        && now.getTime() - new Date(request.requestedAt).getTime() >= PENDING_CANCELLATION_ESCALATE_AFTER_MS) {
        // Never left pending silently: escalate once; no refund is made.
        await Shipment.updateOne({ _id: shipment._id, "adloggs.pendingLocalCancellation.state": "AWAITING_PROVIDER",
          "adloggs.pendingLocalCancellation.escalatedAt": { $exists: false } }, { $set: {
          "adloggs.pendingLocalCancellation.escalatedAt": now,
          attention: { reason: "A cancellation has waited over 30 minutes for Adloggs to confirm. Check the cancellation with Adloggs (retry or withdraw); no refund was made.", at: now },
        } });
        outcomes.ESCALATED = (outcomes.ESCALATED ?? 0) + 1;
      }
    } catch (error: any) {
      outcomes.ERROR = (outcomes.ERROR ?? 0) + 1;
      console.error("Deferred cancellation completion failed:", error?.message);
    }
  }
  return outcomes;
}

/** Escalates verified returns to origin that still have no decision (database only). */
export async function runRtoEscalationSweep(now = new Date()) {
  const cutoff = new Date(now.getTime() - RTO_DECISION_ESCALATE_AFTER_MS);
  const result = await Shipment.updateMany(
    { "adloggs.rto.resolution.state": "PENDING_DECISION", "adloggs.rto.resolution.since": { $lte: cutoff }, "adloggs.rto.resolution.escalatedAt": { $exists: false } },
    { $set: { "adloggs.rto.resolution.escalatedAt": now,
      attention: { reason: "A verified return to the store has had no decision for over 24 hours. Resolve it (refund, with or without restock). Settlement for the other sellers of this order is waiting on it.", at: now } } },
  );
  return result.modifiedCount ?? 0;
}

export type ProviderCancellationAction = "ACCEPT_PROVIDER_CANCELLATION" | "REBOOK_AFTER_PROVIDER_CANCELLATION" | "RETRY_PROVIDER_CANCELLATION"
  | "WITHDRAW_CANCELLATION_REQUEST" | "RESOLVE_RTO_REFUND_RESTOCK" | "RESOLVE_RTO_REFUND_NO_RESTOCK";
export const PROVIDER_CANCELLATION_ACTIONS: ProviderCancellationAction[] = [
  "ACCEPT_PROVIDER_CANCELLATION", "REBOOK_AFTER_PROVIDER_CANCELLATION", "RETRY_PROVIDER_CANCELLATION", "WITHDRAW_CANCELLATION_REQUEST",
  "RESOLVE_RTO_REFUND_RESTOCK", "RESOLVE_RTO_REFUND_NO_RESTOCK",
];

/**
 * Admin decisions for external cancellations (audited):
 *  - ACCEPT_PROVIDER_CANCELLATION: Adloggs cancelled the delivery itself (verified
 *    status CANCELLED). Cancel this seller's items locally and refund them.
 *  - REBOOK_AFTER_PROVIDER_CANCELLATION: keep the items and book a new Adloggs
 *    delivery under a NEW partner_order_id; the cancelled order is kept as history.
 *  - RETRY_PROVIDER_CANCELLATION: a cancellation that ended UNKNOWN / REJECTED
 *    (before pickup) is queued again.
 *  - WITHDRAW_CANCELLATION_REQUEST: the delivery should go ahead; only possible
 *    while the provider has not cancelled and no request is in flight.
 *  - RESOLVE_RTO_REFUND_RESTOCK / _NO_RESTOCK: a VERIFIED return to origin
 *    (provider RTO_DELIVERED). Cancels that seller's items and queues their
 *    refund through the normal lifecycle (existing eligibility: Online, paid;
 *    existing refund keys and caps); restock is the admin's choice (perishables).
 *    RTO never counts as a delivery.
 */
export async function handleExternalCancellation(shipmentId: string, request: { action: ProviderCancellationAction; adminId: string; reason: string },
  now = new Date()): Promise<{ ok: boolean; state: string; message: string }> {
  if (!mongoose.Types.ObjectId.isValid(shipmentId)) return { ok: false, state: "INVALID", message: "Invalid shipment id." };
  if (!PROVIDER_CANCELLATION_ACTIONS.includes(request.action)) return { ok: false, state: "INVALID", message: `action must be one of ${PROVIDER_CANCELLATION_ACTIONS.join(", ")}.` };
  if (!request.adminId || !mongoose.Types.ObjectId.isValid(request.adminId)) return { ok: false, state: "INVALID", message: "An authenticated admin is required." };
  const reason = String(request.reason ?? "").trim();
  if (reason.length < 10) return { ok: false, state: "INVALID", message: "Give a reason (at least 10 characters)." };

  const shipment: any = await Shipment.findById(shipmentId).select("order seller status shipmentNumber deliveryProvider bookingIntent adloggs readyForPickupAt").lean();
  if (!shipment || shipment.deliveryProvider !== "ADDLOGS") return { ok: false, state: "INVALID", message: "Not an Adloggs shipment." };
  const a = shipment.adloggs ?? {};
  const audit = (outcome: string) => ({ action: request.action, at: now, adminId: new mongoose.Types.ObjectId(request.adminId), note: reason.slice(0, 300), outcome });
  const conflict = (message: string) => ({ ok: false, state: "CONFLICT", message });

  switch (request.action) {
    case "ACCEPT_PROVIDER_CANCELLATION": {
      if (a.providerStatus !== "CANCELLED") return conflict("Adloggs has not reported this delivery as cancelled.");
      if (shipment.status === "CANCELLED") return { ok: true, state: "COMPLETED", message: "Already cancelled locally." };
      await Shipment.updateOne({ _id: shipmentId, "adloggs.pendingLocalCancellation.state": { $ne: "AWAITING_PROVIDER" } }, {
        $set: { "adloggs.pendingLocalCancellation": { state: "AWAITING_PROVIDER", requestedBy: "admin", userId: request.adminId, reason: reason.slice(0, 300), status: "Cancelled", requestedAt: now } },
      });
      await Shipment.updateOne({ _id: shipmentId }, { $push: { "adloggs.adminActions": audit("ACCEPTED") } });
      const result = await completeDeferredCancellation(shipmentId, now);
      return { ok: result.outcome === "COMPLETED", state: result.outcome, message: result.outcome === "COMPLETED"
        ? "Seller items cancelled; the prepaid refund for them is queued." : `Not completed (${result.outcome}).` };
    }
    case "REBOOK_AFTER_PROVIDER_CANCELLATION": {
      if (a.providerStatus !== "CANCELLED") return conflict("Adloggs has not reported this delivery as cancelled.");
      if (shipment.status === "CANCELLED" || a.pendingLocalCancellation?.state === "AWAITING_PROVIDER") return conflict("A cancellation was requested for this shipment; it cannot be rebooked.");
      if (!shipment.readyForPickupAt) return conflict("The seller has not marked the shipment ready for pickup.");
      const previous = (a.previousPartnerOrderIds?.length ?? 0) + 2;
      const nextPartnerId = `${shipment.shipmentNumber || a.partnerOrderId || shipmentId}-R${previous}`.slice(0, 100);
      const result = await Shipment.updateOne(
        { _id: shipmentId, "adloggs.providerStatus": "CANCELLED", "adloggs.orderUuid": a.orderUuid },
        { $set: { "bookingIntent.state": "PENDING", "bookingIntent.attempts": 0, "bookingIntent.updatedAt": now, "adloggs.partnerOrderId": nextPartnerId },
          $unset: { "adloggs.orderUuid": "", "adloggs.providerStatus": "", "adloggs.providerStatusCode": "", "adloggs.providerStatusReceivedAt": "",
            "adloggs.trackUrl": "", "adloggs.bookedAt": "", "adloggs.riderName": "", "adloggs.cancellation": "", "adloggs.correlation": "",
            "adloggs.nextStatusPollAt": "", "adloggs.createEvidence": "", "bookingIntent.lastError": "", attention: "" },
          $push: { "adloggs.adminActions": audit("REBOOKED"),
            "adloggs.supersededOrders": { orderUuid: a.orderUuid, partnerOrderId: a.partnerOrderId, reason: "Cancelled by Adloggs; replaced by rebooking.", at: now },
            ...(a.partnerOrderId ? { "adloggs.attemptHistory": { partnerOrderId: a.partnerOrderId, orderUuid: a.orderUuid,
              outcome: "CANCELLED_BY_PROVIDER_REBOOKED", retiredAt: now, adminId: new mongoose.Types.ObjectId(request.adminId) } } : {}),
            ...(a.partnerOrderId ? { "adloggs.previousPartnerOrderIds": a.partnerOrderId } : {}) } },
      );
      return result.modifiedCount ? { ok: true, state: "PENDING", message: `Rebooking queued with partner_order_id ${nextPartnerId}.` } : conflict("Shipment changed; reload and retry.");
    }
    case "RETRY_PROVIDER_CANCELLATION": {
      if (!a.orderUuid || !["UNKNOWN", "REJECTED"].includes(a.cancellation?.state)) return conflict("There is no failed provider cancellation to retry.");
      if (POST_PICKUP.includes(a.providerStatus)) return conflict("Adloggs has already picked up this shipment; it cannot be cancelled.");
      const result = await Shipment.updateOne({ _id: shipmentId, "adloggs.cancellation.state": a.cancellation.state }, {
        $set: { "adloggs.cancellation": { state: "REQUESTED", reason: a.cancellation.reason || reason.slice(0, 300), requestedAt: now, attempts: 0 },
          ...(a.pendingLocalCancellation?.state === "BLOCKED" ? { "adloggs.pendingLocalCancellation.state": "AWAITING_PROVIDER" } : {}) },
        $unset: { attention: "", "adloggs.pendingLocalCancellation.blockedReason": "" },
        $push: { "adloggs.adminActions": audit("RETRY_QUEUED") } });
      return result.modifiedCount ? { ok: true, state: "REQUESTED", message: "Provider cancellation queued again." } : conflict("Shipment changed; reload and retry.");
    }
    case "RESOLVE_RTO_REFUND_RESTOCK":
    case "RESOLVE_RTO_REFUND_NO_RESTOCK": {
      // Verified evidence only: our status is RETURNED_TO_ORIGIN because Adloggs reported RTO_DELIVERED.
      if (shipment.status !== "RETURNED_TO_ORIGIN" || a.providerStatus !== "RTO_DELIVERED") return conflict("Adloggs has not reported a completed return to the store for this shipment.");
      if (a.rto?.resolution?.state === "REFUNDED") return { ok: true, state: "REFUNDED", message: "Already resolved." };
      const restock = request.action === "RESOLVE_RTO_REFUND_RESTOCK";
      await cancelOrderLifecycle(String(shipment.order), "system", {
        sellerId: String(shipment.seller), reason: `Returned to store by delivery partner: ${reason}`.slice(0, 300),
        externalCancellationConfirmed: true, restock,
      });
      const adminId = new mongoose.Types.ObjectId(request.adminId);
      await Shipment.updateOne({ _id: shipmentId, "adloggs.rto.resolution.state": { $ne: "REFUNDED" } }, {
        $set: { "adloggs.rto.resolution": { state: "REFUNDED", since: a.rto?.resolution?.since ?? a.rto?.completedAt ?? now, decidedAt: now, adminId, restocked: restock } },
        $unset: { attention: "" },
        $push: { "adloggs.adminActions": audit(restock ? "RTO_REFUNDED_RESTOCKED" : "RTO_REFUNDED_NOT_RESTOCKED") } });
      const { syncExternalOrderOutcome } = await import("./adloggsOrderOutcomeService");
      await syncExternalOrderOutcome(String(shipment.order), now).catch(error => console.error("External order outcome sync failed:", error?.message));
      return { ok: true, state: "REFUNDED", message: `Returned items cancelled${restock ? " and restocked" : ""}; any prepaid refund for them is queued.` };
    }
    case "WITHDRAW_CANCELLATION_REQUEST": {
      const pending = a.pendingLocalCancellation;
      if (!pending || !["AWAITING_PROVIDER", "BLOCKED"].includes(pending.state)) return conflict("There is no open cancellation request.");
      if (providerCancellationVerified(shipment)) return conflict("Adloggs has already cancelled; accept the cancellation or rebook instead.");
      if (a.cancellation?.state === "IN_PROGRESS") return conflict("The provider cancellation is being sent right now; try again shortly.");
      const result = await Shipment.updateOne({ _id: shipmentId, "adloggs.pendingLocalCancellation.state": pending.state, "adloggs.cancellation.state": { $ne: "IN_PROGRESS" } }, {
        $set: { "adloggs.pendingLocalCancellation.state": "WITHDRAWN" },
        $unset: { "adloggs.cancellationRequired": "", attention: "", ...(a.cancellation?.state === "REQUESTED" ? { "adloggs.cancellation": "" } : {}) },
        $push: { "adloggs.adminActions": audit("WITHDRAWN") } });
      return result.modifiedCount ? { ok: true, state: "WITHDRAWN", message: "Cancellation request withdrawn; the delivery continues." } : conflict("Shipment changed; reload and retry.");
    }
  }
}

/**
 * Read-only information an admin sees before confirming an RTO resolution:
 * the verified provider evidence (return events as received), the return
 * reason if Adloggs reported one (the documented status API does not), and the
 * refund the EXISTING rules would produce. Changes nothing.
 */
export async function getRtoResolutionPreview(shipmentId: string) {
  if (!mongoose.Types.ObjectId.isValid(shipmentId)) return null;
  const shipment: any = await Shipment.findById(shipmentId).select("order seller status adloggs").lean();
  if (!shipment) return null;
  const a = shipment.adloggs ?? {};
  const verified = shipment.status === "RETURNED_TO_ORIGIN" && a.providerStatus === "RTO_DELIVERED";
  const { previewSellerCancellationRefund } = await import("../orderLifecycleService");
  return {
    verified,
    resolution: a.rto?.resolution?.state ?? null,
    evidence: (a.statusEvents ?? []).filter((event: any) => ["RETURN_INITIATED", "RTO_DELIVERED"].includes(event.status))
      .map((event: any) => ({ status: event.status, receivedAt: event.receivedAt, source: event.source })),
    reason: "Not reported: the documented Adloggs status API carries no return reason. Confirm the reason with Adloggs or the customer before deciding.",
    refund: verified ? await previewSellerCancellationRefund(String(shipment.order), String(shipment.seller)) : null,
  };
}
