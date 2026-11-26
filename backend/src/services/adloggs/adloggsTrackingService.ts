import crypto from "crypto";
import Shipment, { AdloggsProviderStatus } from "../../models/Shipment";
import { withOrderTransaction } from "../orderTransactionService";
import { canTransitionShipment } from "../shipmentService";
import { AdloggsClient } from "./adloggsClient";
import { adloggsCapabilities } from "./adloggsConfig";
import { ADLOGGS_STATUS_BY_CODE, ADLOGGS_STATUS_LABELS, TERMINAL_ADLOGGS_STATUSES, judgeProviderTransition, shipmentStatusForProvider } from "./adloggsStatus";

/**
 * Applies verified Adloggs status information to ONE seller shipment.
 *
 * Authority boundary: seller preparation/readiness stay authoritative for
 * fulfilment; verified Adloggs events are authoritative for transport
 * (pickup, delivery, RTO) of external shipments. Nothing here touches the
 * parent order's status, in-house pickup records, courier assignment, OTPs,
 * refunds, stock or settlement — those effects stay gated (see docs).
 */

export type ApplyOutcome = "APPLIED" | "DUPLICATE" | "STALE" | "UNMATCHED" | "MISMATCH" | "UNKNOWN_STATUS" | "INVALID";

export interface ProviderStatusInput {
  orderUuid: string;
  partnerOrderId?: string;
  code: number;
  riderName?: string | null;
  source: "WEBHOOK" | "POLL";
  /** When Hello Local received it (the provider sends no event timestamp). */
  receivedAt: Date;
}

const MAX_EVENTS = 50;

export async function applyAdloggsStatus(input: ProviderStatusInput): Promise<ApplyOutcome> {
  const located: any = await Shipment.findOne({ "adloggs.orderUuid": input.orderUuid }).select("order").lean();
  if (!located) return "UNMATCHED";
  let pendingCancellation = false;
  const outcome = await applyInTransaction(input, located, () => { pendingCancellation = true; });
  if (outcome === "APPLIED" && pendingCancellation) {
    // A deferred local cancellation may now be completable (verified CANCELLED) or blocked (pickup).
    const { completeDeferredCancellation } = await import("./adloggsCancellationWorkflow");
    await completeDeferredCancellation(String(located._id), input.receivedAt)
      .catch(error => console.error("Deferred cancellation completion failed (will be retried by the sweep):", error?.message));
  }
  const code = ADLOGGS_STATUS_BY_CODE[input.code];
  if (outcome === "APPLIED" && (code === "DELIVERED" || code === "RTO_DELIVERED" || code === "CANCELLED")) {
    // Terminal transport fact: re-evaluate the parent order (no courier, no OTP).
    const { syncExternalOrderOutcome } = await import("./adloggsOrderOutcomeService");
    await syncExternalOrderOutcome(String(located.order), input.receivedAt)
      .catch(error => console.error("External order outcome sync failed (will be retried by the sweep):", error?.message));
  }
  return outcome;
}

async function applyInTransaction(input: ProviderStatusInput, located: any, notePending: () => void): Promise<ApplyOutcome> {
  return withOrderTransaction(String(located.order), async session => {
    const shipment: any = await Shipment.findOne({ _id: located._id }).session(session).lean();
    if (!shipment || shipment.adloggs?.orderUuid !== input.orderUuid) return "UNMATCHED";
    const now = input.receivedAt;
    const flag = async (reason: string) => {
      await Shipment.updateOne({ _id: shipment._id }, { $set: { attention: { reason, at: now } } }, { session });
    };
    if (input.partnerOrderId !== undefined && shipment.adloggs.partnerOrderId && String(input.partnerOrderId) !== shipment.adloggs.partnerOrderId) {
      await flag(`Adloggs event for order ${input.orderUuid} carried a different partner_order_id; ignored.`);
      return "MISMATCH";
    }
    const status: AdloggsProviderStatus | undefined = ADLOGGS_STATUS_BY_CODE[input.code];
    if (!status) {
      await flag(`Unknown Adloggs status code ${input.code}; ignored.`);
      return "UNKNOWN_STATUS";
    }
    const verdict = judgeProviderTransition(shipment.adloggs.providerStatus, status);
    if (verdict === "DUPLICATE" || verdict === "STALE") {
      if (input.source === "POLL") await Shipment.updateOne({ _id: shipment._id }, { $set: { "adloggs.lastStatusSyncAt": now } }, { session });
      return verdict;
    }
    if (verdict === "INVALID") {
      await flag(`Adloggs reported "${ADLOGGS_STATUS_LABELS[status]}" after "${shipment.adloggs.providerStatus ?? "booking"}"; not applied.`);
      return "INVALID";
    }

    const set: Record<string, unknown> = {
      "adloggs.providerStatus": status,
      "adloggs.providerStatusCode": input.code,
      "adloggs.providerStatusReceivedAt": now,
      "adloggs.lastStatusSyncAt": now,
    };
    if (input.riderName && status !== "PENDING") set["adloggs.riderName"] = String(input.riderName).slice(0, 120);
    if (TERMINAL_ADLOGGS_STATUSES.includes(status)) set["adloggs.nextStatusPollAt"] = null;
    const pending = shipment.adloggs.pendingLocalCancellation?.state === "AWAITING_PROVIDER";
    if (pending) notePending();
    if (status === "CANCELLED" && !pending) {
      set.attention = { reason: "Adloggs cancelled this delivery. No local cancellation or refund was made; accept the cancellation or rebook.", at: now };
    }
    if (status === "RETURN_INITIATED") {
      set["adloggs.rto"] = { state: "INITIATED", initiatedAt: now };
      set.attention = { reason: "Adloggs started a return to the store (customer unreachable). No refund or restock was made.", at: now };
    }
    if (status === "RTO_DELIVERED") {
      set["adloggs.rto"] = { state: "COMPLETED", initiatedAt: shipment.adloggs.rto?.initiatedAt, completedAt: now,
        resolution: shipment.adloggs.rto?.resolution ?? { state: "PENDING_DECISION", since: now } };
      set.attention = { reason: "Adloggs returned this shipment to the store (verified). Resolve it: refund the customer for these items (with or without restock). The order's settlement waits until it is resolved.", at: now };
    }
    const update: any = {
      $set: set,
      $push: { "adloggs.statusEvents": { $each: [{ status, code: input.code, receivedAt: now, source: input.source }], $slice: -MAX_EVENTS } },
    };
    const internal = shipmentStatusForProvider(status);
    if (internal && internal !== shipment.status && canTransitionShipment(shipment.status, internal)) {
      set.status = internal;
      set.statusChangedAt = now;
      update.$push.history = { status: internal, at: now, source: "provider" };
    }
    await Shipment.updateOne({ _id: shipment._id }, update, { session });
    return "APPLIED";
  });
}

/**
 * Bounded, leased polling of POST /aa/oporder/getcurrentstatus for booked,
 * non-terminal shipments. Interval from config, exponential backoff on
 * errors (capped at 30 minutes). Disabled unless explicitly enabled.
 */
export async function pollAdloggsStatuses(options: { client?: AdloggsClient; now?: Date; limit?: number } = {}) {
  const client = options.client ?? new AdloggsClient();
  const config = client.config();
  if (!adloggsCapabilities(config).statusReconciliationReady) return { polled: 0, disabled: true };
  const now = options.now ?? new Date();
  const intervalMs = config.statusPollIntervalSeconds * 1000;
  let polled = 0;
  for (let i = 0; i < (options.limit ?? 10); i++) {
    const token = crypto.randomUUID();
    const claimed: any = await Shipment.findOneAndUpdate(
      {
        "adloggs.orderUuid": { $type: "string" },
        "adloggs.providerStatus": { $nin: TERMINAL_ADLOGGS_STATUSES },
        "adloggs.nextStatusPollAt": { $lte: now },
        $or: [{ "adloggs.pollLeaseUntil": { $exists: false } }, { "adloggs.pollLeaseUntil": null }, { "adloggs.pollLeaseUntil": { $lte: now } }],
      },
      { $set: { "adloggs.pollLeaseToken": token, "adloggs.pollLeaseUntil": new Date(now.getTime() + 60_000) } },
      { new: true, sort: { "adloggs.nextStatusPollAt": 1 } },
    ).select("adloggs").lean();
    if (!claimed) break;
    polled++;
    const failures = claimed.adloggs?.statusPollFailures ?? 0;
    try {
      const status = await client.getCurrentStatus(claimed.adloggs.orderUuid);
      await applyAdloggsStatus({ orderUuid: status.orderUuid, code: status.statusCode, riderName: status.riderName, source: "POLL", receivedAt: now });
      await Shipment.updateOne({ _id: claimed._id, "adloggs.pollLeaseToken": token }, {
        $set: { "adloggs.statusPollFailures": 0, "adloggs.lastStatusSyncAt": now,
          "adloggs.nextStatusPollAt": new Date(now.getTime() + intervalMs) },
        $unset: { "adloggs.pollLeaseToken": "", "adloggs.pollLeaseUntil": "" },
      });
    } catch {
      const backoff = Math.min(intervalMs * 2 ** (failures + 1), 30 * 60_000);
      await Shipment.updateOne({ _id: claimed._id, "adloggs.pollLeaseToken": token }, {
        $set: { "adloggs.statusPollFailures": failures + 1, "adloggs.nextStatusPollAt": new Date(now.getTime() + backoff) },
        $unset: { "adloggs.pollLeaseToken": "", "adloggs.pollLeaseUntil": "" },
      });
    }
  }
  return { polled, disabled: false };
}
