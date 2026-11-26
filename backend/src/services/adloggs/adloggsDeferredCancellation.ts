import { ClientSession } from "mongoose";
import Shipment from "../../models/Shipment";

/**
 * Phase 7: cancellation of an Adloggs shipment for which a provider order
 * exists (or may exist) is DEFERRED. Inside the caller's order transaction we
 * only record the request and queue the provider cancellation; the items stay
 * active and nothing is refunded. The local cancellation and refund are
 * completed by `completeDeferredCancellation` once Adloggs has verifiably
 * cancelled (see adloggsCancellationWorkflow.ts).
 *
 * Shipments with no possible provider order (intent PENDING / CLAIMED /
 * RETRYABLE_FAILURE / FAILED) are not deferred: they cancel immediately as before.
 */

/** Intent states in which an Adloggs order exists or may exist. */
export const PROVIDER_ORDER_POSSIBLE_STATES = ["SUBMITTING", "OUTCOME_UNKNOWN", "BOOKED"];

export interface DeferredCancellationRequest {
  actor: string;
  userId?: string;
  reason?: string;
  status?: "Cancelled" | "Rejected";
}

/** True when Adloggs has verifiably cancelled (or never had) the provider order. */
export function providerCancellationVerified(shipment: any): boolean {
  const a = shipment?.adloggs ?? {};
  if (a.cancellation?.state === "CONFIRMED" || a.providerStatus === "CANCELLED") return true;
  return shipment?.bookingIntent?.state === "CANCELLED" && !a.orderUuid && !a.createEvidence;
}

/**
 * Records deferred cancellations for the affected Adloggs shipments and returns
 * the seller ids whose items must NOT be cancelled or refunded now. Idempotent:
 * a repeated request leaves an existing pending request (and queue) untouched.
 */
export async function deferExternalCancellations(orderId: string, sellerId: string | undefined,
  request: DeferredCancellationRequest, session: ClientSession, now = new Date()): Promise<string[]> {
  const shipments: any[] = await Shipment.find({
    order: orderId, ...(sellerId ? { seller: sellerId } : {}),
    "bookingIntent.state": { $in: PROVIDER_ORDER_POSSIBLE_STATES },
  }).select("_id seller status bookingIntent adloggs").session(session);

  const deferred: string[] = [];
  for (const shipment of shipments) {
    if (["CANCELLED", "DELIVERED", "RETURNED", "RETURNED_TO_ORIGIN"].includes(shipment.status)) continue;
    if (providerCancellationVerified(shipment)) continue; // nothing left to wait for: cancel locally now
    deferred.push(String(shipment.seller));
    const a = shipment.adloggs ?? {};
    if (a.pendingLocalCancellation?.state === "AWAITING_PROVIDER") continue;

    const set: Record<string, unknown> = {
      "adloggs.pendingLocalCancellation": {
        state: "AWAITING_PROVIDER", requestedBy: request.actor, ...(request.userId ? { userId: String(request.userId).slice(0, 64) } : {}),
        reason: String(request.reason || "Order cancelled").slice(0, 300), status: request.status || "Cancelled", requestedAt: now,
      },
    };
    if (a.orderUuid) {
      // Booked: queue the provider cancellation unless one is already queued or in flight.
      if (!a.cancellation || ["REJECTED", "UNKNOWN"].includes(a.cancellation.state)) {
        set["adloggs.cancellation"] = { state: "REQUESTED", reason: String(request.reason || "Cancelled in Hello Local").slice(0, 300), requestedAt: now, attempts: 0 };
      }
    } else {
      // Submitting or unknown: no uuid to cancel yet; cancel as soon as a booking is confirmed.
      set["adloggs.cancellationRequired"] = true;
      set.attention = { reason: "Cancellation requested while the Adloggs booking outcome is uncertain. Resolve the booking outcome first; no refund was made.", at: now };
    }
    await Shipment.updateOne({ _id: shipment._id }, { $set: set }, { session });
  }
  return [...new Set(deferred)];
}
