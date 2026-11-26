import crypto from "crypto";
import Shipment from "../../models/Shipment";
import { AdloggsClient } from "./adloggsClient";
import { adloggsCapabilities } from "./adloggsConfig";
import { AdloggsError } from "./adloggsErrors";

/**
 * External cancellation of booked Adloggs shipments (API doc V2 §4).
 * Requests are queued durably by the lifecycle sync (`adloggs.cancellation`
 * = REQUESTED) and sent here only when the cancellation capability is enabled.
 * Only a verified `status:true` answer marks it CONFIRMED. Documented
 * rejections (already picked up / delivered / invalid uuid) are surfaced to
 * admins. Nothing here issues refunds.
 */

/** Complete (verified) or block (rejected) a deferred local cancellation; the sweep retries on failure. */
async function settleDeferred(shipmentId: string, now: Date) {
  const { completeDeferredCancellation } = await import("./adloggsCancellationWorkflow");
  await completeDeferredCancellation(shipmentId, now).catch(error => console.error("Deferred cancellation completion failed:", error?.message));
}

const POST_PICKUP = ["PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED_AT_DELIVERY", "DELIVERED", "RETURN_INITIATED", "RTO_DELIVERED"];
const MAX_ATTEMPTS = 5;

export async function runAdloggsCancellationOnce(options: { client?: AdloggsClient; now?: Date } = {}): Promise<{ outcome: string; shipmentId?: string }> {
  const client = options.client ?? new AdloggsClient();
  const now = options.now ?? new Date();
  if (!adloggsCapabilities(client.config()).cancellationReady) return { outcome: "DISABLED" };
  const token = crypto.randomUUID();
  const claimed: any = await Shipment.findOneAndUpdate(
    {
      "adloggs.orderUuid": { $type: "string" },
      $or: [
        { "adloggs.cancellation.state": "REQUESTED", $or: [{ "adloggs.cancellation.nextAttemptAt": { $exists: false } }, { "adloggs.cancellation.nextAttemptAt": { $lte: now } }] },
        { "adloggs.cancellation.state": "IN_PROGRESS", "adloggs.cancellation.leaseUntil": { $lte: now } },
      ],
    },
    { $set: { "adloggs.cancellation.state": "IN_PROGRESS", "adloggs.cancellation.leaseToken": token, "adloggs.cancellation.leaseUntil": new Date(now.getTime() + 60_000) },
      $inc: { "adloggs.cancellation.attempts": 1 } },
    { new: true },
  ).select("adloggs").lean();
  if (!claimed) return { outcome: "IDLE" };
  const shipmentId = String(claimed._id);
  const finish = (state: string, extra: Record<string, unknown> = {}) => Shipment.updateOne(
    { _id: shipmentId, "adloggs.cancellation.state": "IN_PROGRESS", "adloggs.cancellation.leaseToken": token },
    { $set: { "adloggs.cancellation.state": state, ...extra }, $unset: { "adloggs.cancellation.leaseToken": "", "adloggs.cancellation.leaseUntil": "" } },
  );

  // Documented: cancellation is not allowed after pickup. Do not pretend otherwise.
  if (POST_PICKUP.includes(claimed.adloggs?.providerStatus)) {
    await finish("REJECTED", { "adloggs.cancellation.resolvedAt": now, "adloggs.cancellation.lastError": "Already picked up by Adloggs.",
      attention: { reason: "Cancellation requested after Adloggs pickup; Adloggs does not allow it. Handle manually.", at: now } });
    await settleDeferred(shipmentId, now);
    return { outcome: "REJECTED_AFTER_PICKUP", shipmentId };
  }

  try {
    const result = await client.cancelOrder(claimed.adloggs.orderUuid, claimed.adloggs.cancellation?.reason || "Cancelled by Hello Local");
    if (result.cancelled) {
      await finish("CONFIRMED", { "adloggs.cancellation.resolvedAt": now });
      await settleDeferred(shipmentId, now);
      return { outcome: "CONFIRMED", shipmentId };
    }
    await finish("REJECTED", { "adloggs.cancellation.resolvedAt": now, "adloggs.cancellation.lastError": result.message,
      attention: { reason: `Adloggs refused the cancellation (${result.reason}). The delivery may still go ahead.`, at: now } });
    await settleDeferred(shipmentId, now);
    return { outcome: `REJECTED_${result.reason}`, shipmentId };
  } catch (error) {
    const attempts = claimed.adloggs?.cancellation?.attempts ?? 1;
    const message = error instanceof AdloggsError ? error.message : "Cancellation request failed.";
    // Observed on the real development API: a cancel request for an order that is
    // already cancelled gets NO answer (timeout). So before retrying, ask for the
    // verified status: Cancelled (6) means the cancellation did take effect.
    try {
      const status = await client.getCurrentStatus(claimed.adloggs.orderUuid);
      if (status.statusCode === 6) {
        await finish("CONFIRMED", { "adloggs.cancellation.resolvedAt": now, "adloggs.cancellation.lastError": `${message} (status shows cancelled)` });
        await settleDeferred(shipmentId, now);
        return { outcome: "CONFIRMED", shipmentId };
      }
    } catch {
      // Status unavailable too: fall through to the normal retry/escalation.
    }
    if (attempts >= MAX_ATTEMPTS) {
      await finish("UNKNOWN", { "adloggs.cancellation.lastError": message,
        attention: { reason: "Adloggs cancellation could not be confirmed. Check with Adloggs before refunding or rebooking.", at: now } });
      return { outcome: "UNKNOWN", shipmentId };
    }
    await finish("REQUESTED", { "adloggs.cancellation.lastError": message,
      "adloggs.cancellation.nextAttemptAt": new Date(now.getTime() + Math.min(60_000 * 2 ** attempts, 30 * 60_000)) });
    return { outcome: "RETRY_SCHEDULED", shipmentId };
  }
}
