import mongoose from "mongoose";
import Shipment from "../../models/Shipment";
import Order from "../../models/Order";
import OrderItem from "../../models/OrderItem";
import Seller from "../../models/Seller";
import Product from "../../models/Product";
import ShipmentReconciliation from "../../models/ShipmentReconciliation";
import AdloggsWebhookEvent from "../../models/AdloggsWebhookEvent";
import { AdloggsClient } from "./adloggsClient";
import { adloggsCapabilities } from "./adloggsConfig";
import { AdloggsError } from "./adloggsErrors";
import { allocateCodCollectible, buildAdloggsCreatePayload, generateShipmentOtps, INDIA_UTC_OFFSET_MINUTES } from "./adloggsPayload";
import { safeTrackingUrl } from "./adloggsStatus";
import {
  claimBookingIntent, markBookingSubmitting, markBookingOutcomeUnknown, recordBookingIntentFailure, sweepStaleSubmissions,
} from "../bookingIntentService";

/**
 * Adloggs booking worker (API doc V2 §1). Disabled unless the booking
 * capability is explicitly enabled (development host only in Phase 6).
 *
 * Duplicate-delivery protection: the document does not say partner_order_id
 * is an idempotency key and offers no lookup by it, so a create request whose
 * outcome we cannot confirm is NEVER retried automatically. The intent is
 * persisted as SUBMITTING before sending; anything ambiguous becomes
 * OUTCOME_UNKNOWN and waits for an admin resolution.
 */

export type BookingRunOutcome =
  | "DISABLED" | "IDLE" | "STALE" | "NOT_READY" | "UNSERVICEABLE" | "REJECTED" | "BOOKED" | "OUTCOME_UNKNOWN" | "LATE_EVIDENCE";

const MINUTE = 60_000;
const money = (value: number | null) => (value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100);

/** $set fragment that queues a provider cancellation (never sent here). */
export function cancellationRequestSet(now: Date, reason: string) {
  return { "adloggs.cancellation": { state: "REQUESTED", reason: reason.slice(0, 300), requestedAt: now, attempts: 0 } };
}

export async function runAdloggsBookingOnce(options: { client?: AdloggsClient; now?: Date } = {}): Promise<{ outcome: BookingRunOutcome; shipmentId?: string; detail?: string }> {
  const client = options.client ?? new AdloggsClient();
  const now = options.now ?? new Date();
  if (!adloggsCapabilities(client.config()).bookingReady) return { outcome: "DISABLED" };
  // Provider-contract gate: checked before any claim, so no intent is touched.
  if (!client.bookingSubmissionAllowed()) return { outcome: "DISABLED", detail: "pickup_date_time semantics not confirmed by Adloggs" };
  await sweepStaleSubmissions(now);

  const claim = await claimBookingIntent({ now });
  if (!claim) return { outcome: "IDLE" };
  const { shipmentId, token } = claim;

  const shipment: any = await Shipment.findById(shipmentId).lean();
  if (!shipment || shipment.bookingIntent?.leaseToken !== token) return { outcome: "STALE", shipmentId };

  const fail = async (detail: string, retryable: boolean, retryAfterMs: number, outcome: BookingRunOutcome) => {
    await recordBookingIntentFailure(shipmentId, token, { reason: detail, retryable, retryAfterMs, now });
    return { outcome, shipmentId, detail };
  };

  if (shipment.deliveryProvider !== "ADDLOGS" || !shipment.readyForPickupAt || shipment.adloggs?.orderUuid) {
    return fail("Shipment is not an eligible Adloggs booking (provider, readiness or existing provider order).", false, 0, "NOT_READY");
  }
  const [order, items, seller]: any[] = await Promise.all([
    Order.findById(shipment.order).lean(),
    OrderItem.find({ order: shipment.order, seller: shipment.seller }).lean(),
    Seller.findById(shipment.seller).lean(),
  ]);
  if (!order || order.deliveryProvider !== "ADDLOGS" || !seller) return fail("Parent order or seller is missing, or the order is not committed to Adloggs.", false, 0, "NOT_READY");

  // Our own OTPs: created once per shipment (kept on retries) and sent with the booking.
  if (!shipment.adloggs?.otps) {
    const otps = generateShipmentOtps(now);
    await Shipment.updateOne({ _id: shipmentId, "adloggs.otps": { $exists: false } }, { $set: { "adloggs.otps": otps } });
    const fresh: any = await Shipment.findById(shipmentId).select("adloggs.otps").lean();
    shipment.adloggs = { ...(shipment.adloggs ?? {}), otps: fresh?.adloggs?.otps ?? otps };
  }

  // COD: this shipment's share of what the customer owes (all sellers' active items are needed).
  const cod = order.paymentMethod === "COD";
  let codCollectibleAmount: number | undefined;
  if (cod) {
    if (!adloggsCapabilities(client.config()).codReady) return fail("Adloggs COD is switched off; this COD shipment cannot be booked.", true, 30 * MINUTE, "NOT_READY");
    const allItems: any[] = await OrderItem.find({ order: shipment.order }).select("seller total discountAmount status").lean();
    codCollectibleAmount = allocateCodCollectible(order.total, allItems).get(String(shipment.seller));
  }

  const productIds = items.filter((item: any) => item.status !== "Cancelled" && item.product).map((item: any) => item.product);
  const products: any[] = productIds.length ? await Product.find({ _id: { $in: productIds } }).select("shippingWeightKg").lean() : [];
  const built = buildAdloggsCreatePayload({
    shipment, order, items, seller,
    productWeightsKg: new Map(products.map(product => [String(product._id), product.shippingWeightKg])),
    pickupWindowMinutes: client.config().pickupWindowMinutes,
    now,
    codCollectibleAmount,
  });
  if (!built.ok) return fail(`Booking data incomplete: ${built.problems.join(" ")}`, true, 15 * MINUTE, "NOT_READY");
  const { payload, snapshot } = built;

  // Re-check serviceability right before booking (nothing has been sent yet).
  let estimatedPrice: number | null = null;
  try {
    const availability = await client.checkServiceAvailability({
      partner_order_id: payload.partner_order_id,
      pickup_lat: payload.pickup_lat, pickup_long: payload.pickup_long, pickup_pincode: payload.pickup_address_details.pincode,
      delivery_lat: payload.delivery_lat, delivery_long: payload.delivery_long, delivery_pincode: payload.delivery_address_details.pincode,
      utc_offset: INDIA_UTC_OFFSET_MINUTES, payment_type: cod ? "COD" : "Online",
    });
    if (!availability.available) return fail(`Route not serviceable: ${availability.message}`, true, 30 * MINUTE, "UNSERVICEABLE");
    estimatedPrice = availability.estimatedPrice;
  } catch (error) {
    const reason = error instanceof AdloggsError ? error.message : "Serviceability check failed.";
    return fail(reason, true, 10 * MINUTE, "UNSERVICEABLE");
  }

  // Point of no return: persist "may be sent" BEFORE sending.
  if (!(await markBookingSubmitting(shipmentId, token, { partnerOrderId: payload.partner_order_id, pickupSnapshot: snapshot, now }))) {
    return { outcome: "STALE", shipmentId, detail: "Claim lost or shipment changed before sending; nothing was sent." };
  }

  let result;
  try {
    result = await client.createOrder(payload);
  } catch (error) {
    if (error instanceof AdloggsError && error.definitive) {
      const retryable = error.kind === "RIDER_UNAVAILABLE" || error.kind === "AUTH";
      return fail(`Adloggs rejected the booking (${error.kind}): ${error.providerMessage || error.message}`, retryable,
        error.kind === "RIDER_UNAVAILABLE" ? 5 * MINUTE : 30 * MINUTE, "REJECTED");
    }
    if (error instanceof AdloggsError && !error.mayHaveReachedProvider) return fail(error.message, true, 10 * MINUTE, "REJECTED");
    await markBookingOutcomeUnknown(shipmentId, token, error instanceof AdloggsError ? error.message : "Unexpected error after sending.", now);
    return { outcome: "OUTCOME_UNKNOWN", shipmentId };
  }

  const trackUrl = safeTrackingUrl(result.trackUrl);
  if (result.partnerOrderId !== payload.partner_order_id) {
    // An order exists at Adloggs but does not correlate: keep the evidence (separately), never rebook,
    // and never treat that uuid as this shipment's order.
    await Shipment.updateOne({ _id: shipmentId }, { $set: { "adloggs.lateBookingEvidence": true },
      $push: { "adloggs.foreignOrderEvidence": { orderUuid: result.orderUuid, partnerOrderId: result.partnerOrderId,
        reason: "Create response carried a different partner_order_id.", at: now } } }).catch(() => undefined);
    await markBookingOutcomeUnknown(shipmentId, token, `Adloggs returned order ${result.orderUuid} for a different partner_order_id.`, now);
    return { outcome: "OUTCOME_UNKNOWN", shipmentId };
  }

  try {
    const persisted = await Shipment.updateOne(
      { _id: shipmentId, "bookingIntent.state": "SUBMITTING", "bookingIntent.leaseToken": token },
      { $set: {
        "bookingIntent.state": "BOOKED", "bookingIntent.updatedAt": now,
        "adloggs.orderUuid": result.orderUuid, "adloggs.bookedAt": now, "adloggs.nextStatusPollAt": now,
        "adloggs.correlation": { source: "CREATE_RESPONSE", verifiedAt: now },
        ...(cod ? { "adloggs.codCollectibleAmount": payload.collectible_amount } : {}),
        ...(trackUrl ? { "adloggs.trackUrl": trackUrl } : {}),
      }, $unset: { "bookingIntent.leaseToken": "", "bookingIntent.leaseUntil": "", "bookingIntent.lastError": "" } },
    );
    if (!persisted.modifiedCount) {
      // Our claim moved on (cancelled or swept) but a booking now exists: keep it and act on it.
      const current: any = await Shipment.findById(shipmentId).select("status bookingIntent adloggs").lean();
      if (current?.adloggs?.partnerOrderId && current.adloggs.partnerOrderId !== payload.partner_order_id) {
        // A rebooking was approved meanwhile: this order belongs to the retired partner id. Keep it as
        // evidence and escalate; never bind it over the new attempt.
        await Shipment.updateOne({ _id: shipmentId }, { $set: { "adloggs.lateBookingEvidence": true,
          attention: { reason: `Late Adloggs order ${result.orderUuid} for retired partner_order_id ${payload.partner_order_id}; possible duplicate - cancel it at Adloggs.`, at: now } },
          $push: { "adloggs.foreignOrderEvidence": { orderUuid: result.orderUuid, partnerOrderId: payload.partner_order_id, reason: "Late success for a retired partner_order_id.", at: now } } });
        return { outcome: "LATE_EVIDENCE", shipmentId };
      }
      const cancelled = current?.status === "CANCELLED" || current?.adloggs?.cancellationRequired;
      await Shipment.updateOne({ _id: shipmentId, "adloggs.orderUuid": { $exists: false } }, { $set: {
        "adloggs.orderUuid": result.orderUuid, "adloggs.bookedAt": now, "adloggs.lateBookingEvidence": true,
        "adloggs.correlation": { source: "CREATE_RESPONSE", verifiedAt: now },
        ...(trackUrl ? { "adloggs.trackUrl": trackUrl } : {}),
        ...(cancelled ? cancellationRequestSet(now, "Shipment was cancelled while the booking was in flight.") : {}),
        attention: { reason: `Late Adloggs booking confirmation (order ${result.orderUuid}) after the local state changed.${cancelled ? " Cancellation requested." : ""}`, at: now },
      } });
      return { outcome: "LATE_EVIDENCE", shipmentId };
    }
  } catch {
    await Shipment.updateOne({ _id: shipmentId, "adloggs.createEvidence": { $exists: false } }, { $set: {
      "adloggs.createEvidence": { orderUuid: result.orderUuid, partnerOrderId: result.partnerOrderId, at: now } } }).catch(() => undefined);
    await markBookingOutcomeUnknown(shipmentId, token, `Booked at Adloggs as order ${result.orderUuid} but saving it failed.`, now).catch(() => undefined);
    return { outcome: "OUTCOME_UNKNOWN", shipmentId };
  }

  // Provider cost facts (estimate and booking fee are kept distinct; final cost stays unknown).
  await ShipmentReconciliation.updateOne(
    { shipment: shipment._id },
    {
      $setOnInsert: { shipment: shipment._id, order: shipment.order, seller: shipment.seller, deliveryProvider: "ADDLOGS", currency: "INR",
        providerCost: null, providerRtoCharge: null, providerAdjustment: null, providerCredit: null, providerSettlementReference: null, status: "AWAITING_PROVIDER_DATA" },
      $set: { estimatedProviderCost: money(estimatedPrice), providerBookingFee: money(result.fee), providerDistanceKm: result.distanceKm },
      $push: { events: { action: "BOOKING_CONFIRMED", at: now, source: "provider" } },
    },
    { upsert: true },
  ).catch(error => console.error("Adloggs reconciliation update failed (booking itself is saved):", error?.message));

  // Status events that arrived before the booking was saved.
  const { replayUnmatchedWebhookEvents } = await import("./adloggsWebhookService");
  await replayUnmatchedWebhookEvents(result.orderUuid).catch(() => undefined);
  return { outcome: "BOOKED", shipmentId };
}

/** Run up to `limit` bookings sequentially (bounded batch). */
export async function runAdloggsBookingBatch(limit = 5, client = new AdloggsClient()) {
  const outcomes: BookingRunOutcome[] = [];
  for (let i = 0; i < limit; i++) {
    const { outcome } = await runAdloggsBookingOnce({ client });
    outcomes.push(outcome);
    if (outcome === "IDLE" || outcome === "DISABLED") break;
  }
  return outcomes;
}

/** Minimum length of the written reason / evidence an admin must give. */
const MIN_TEXT = 10;

export type UnknownOutcomeAction = "RECORD_INVESTIGATION" | "VERIFY_PROVIDER_ORDER" | "REQUEST_REBOOK" | "APPROVE_REBOOK";
export const UNKNOWN_OUTCOME_ACTIONS: UnknownOutcomeAction[] = ["RECORD_INVESTIGATION", "VERIFY_PROVIDER_ORDER", "REQUEST_REBOOK", "APPROVE_REBOOK"];

export interface UnknownOutcomeRequest {
  action: UnknownOutcomeAction;
  adminId: string;
  /** Why the admin is taking this action. */
  reason: string;
  /** What was observed (dashboard reference, support ticket, ...). No credentials or personal data. */
  evidence?: string;
  orderUuid?: string;
  /** REQUEST_REBOOK: reference of Adloggs' WRITTEN confirmation that no order exists (ticket / email id). */
  providerReference?: string;
}

export interface UnknownOutcomeResult { resolved: boolean; state: string; message: string; correlation?: string }

type CorrelationSource = "CREATE_RESPONSE" | "STATUS_RESPONSE" | "AUTHENTICATED_WEBHOOK";

/** Everything that suggests an Adloggs order may exist for this shipment. */
async function providerEvidence(shipment: any): Promise<string[]> {
  const found: string[] = [];
  const a = shipment.adloggs ?? {};
  if (a.orderUuid) found.push(`order ${a.orderUuid} is recorded`);
  if (a.createEvidence?.orderUuid) found.push(`a create response returned order ${a.createEvidence.orderUuid}`);
  if (a.foreignOrderEvidence?.length) found.push(`${a.foreignOrderEvidence.length} uncorrelated provider order(s) were seen`);
  if (a.lateBookingEvidence) found.push("late booking evidence is recorded");
  if (a.partnerOrderId) {
    const events: any[] = await AdloggsWebhookEvent.find({ partnerOrderId: a.partnerOrderId }).select("orderUuid").limit(5).lean();
    if (events.length) found.push(`${events.length} authenticated status event(s) reference this partner_order_id`);
  }
  return found;
}

/**
 * Admin handling of an OUTCOME_UNKNOWN booking (Phase 7 hardening).
 *
 * No typed phrase authorises anything. The only ways out of OUTCOME_UNKNOWN:
 *  - VERIFY_PROVIDER_ORDER: the order_uuid must be PROVEN to belong to this
 *    shipment's partner_order_id by provider evidence (a correlated create
 *    response, an authenticated webhook carrying our partner_order_id, or a
 *    status response carrying it) AND the documented status endpoint must
 *    confirm the order. Without correlation the state stays unknown.
 *  - REQUEST_REBOOK then APPROVE_REBOOK: dual control. One admin records the
 *    reference of Adloggs' written confirmation that no order exists; a
 *    DIFFERENT admin approves. Refused while any provider evidence exists.
 *    The retry uses a NEW partner_order_id, so a late success for the old one
 *    can never be taken for the new booking (it is flagged instead).
 *  - RECORD_INVESTIGATION: audit only; the state is unchanged.
 * Every call, refused ones included, is recorded with admin, reason, evidence and outcome.
 */
export async function resolveUnknownBookingOutcome(shipmentId: string, request: UnknownOutcomeRequest,
  client = new AdloggsClient(), now = new Date()): Promise<UnknownOutcomeResult> {
  if (!mongoose.Types.ObjectId.isValid(shipmentId)) return { resolved: false, state: "INVALID", message: "Invalid shipment id." };
  if (!UNKNOWN_OUTCOME_ACTIONS.includes(request.action)) return { resolved: false, state: "INVALID", message: `action must be one of ${UNKNOWN_OUTCOME_ACTIONS.join(", ")}.` };
  if (!request.adminId || !mongoose.Types.ObjectId.isValid(request.adminId)) return { resolved: false, state: "INVALID", message: "An authenticated admin is required." };
  const reason = String(request.reason ?? "").trim();
  if (reason.length < MIN_TEXT) return { resolved: false, state: "INVALID", message: `Give a reason (at least ${MIN_TEXT} characters).` };

  const shipment: any = await Shipment.findById(shipmentId).select("status shipmentNumber bookingIntent adloggs").lean();
  if (!shipment || shipment.bookingIntent?.state !== "OUTCOME_UNKNOWN") return { resolved: false, state: "INVALID", message: "Shipment has no unknown booking outcome." };

  const adminId = new mongoose.Types.ObjectId(request.adminId);
  const evidenceText = String(request.evidence ?? "").trim().slice(0, 500);
  const audit = (outcome: string, extra = "") => ({ action: request.action, at: now, adminId, note: reason.slice(0, 300),
    evidence: [evidenceText, extra].filter(Boolean).join(" | ").slice(0, 500) || undefined, outcome });
  const keepUnknown = async (outcome: string, message: string, extra = ""): Promise<UnknownOutcomeResult> => {
    await Shipment.updateOne({ _id: shipmentId, "bookingIntent.state": "OUTCOME_UNKNOWN" }, { $push: { "adloggs.adminActions": audit(outcome, extra) } });
    return { resolved: false, state: "OUTCOME_UNKNOWN", message };
  };

  if (request.action === "RECORD_INVESTIGATION") {
    if (evidenceText.length < MIN_TEXT) return { resolved: false, state: "INVALID", message: "Describe what was investigated (evidence)." };
    return keepUnknown("RECORDED", "Investigation recorded; the booking outcome is still unknown.");
  }

  if (request.action === "VERIFY_PROVIDER_ORDER") {
    const orderUuid = String(request.orderUuid || "").trim();
    if (!orderUuid || orderUuid.length > 200) return { resolved: false, state: "INVALID", message: "Provide the Adloggs order_uuid." };
    const ours: string | undefined = shipment.adloggs?.partnerOrderId;
    if (!ours) return keepUnknown("REFUSED_NO_PARTNER_ID", "This shipment has no partner_order_id, so no order can be correlated to it.");
    if (shipment.adloggs?.orderUuid && shipment.adloggs.orderUuid !== orderUuid) {
      return keepUnknown("REFUSED_CONFLICT", `A different provider order (${shipment.adloggs.orderUuid}) is already recorded for this shipment.`);
    }
    if ((shipment.adloggs?.foreignOrderEvidence ?? []).some((e: any) => e.orderUuid === orderUuid)) {
      return keepUnknown("REFUSED_FOREIGN", "Adloggs reported that order for a different partner_order_id; it does not belong to this shipment.");
    }
    const owner: any = await Shipment.findOne({ "adloggs.orderUuid": orderUuid }).select("_id").lean();
    if (owner && String(owner._id) !== String(shipment._id)) return keepUnknown("REFUSED_OWNED", "That order_uuid already belongs to another shipment.");

    // Correlation sources, strongest first.
    let source: CorrelationSource | null = null;
    const ce = shipment.adloggs?.createEvidence;
    if (ce?.orderUuid === orderUuid && ce.partnerOrderId === ours) source = "CREATE_RESPONSE";
    if (!source) {
      const events: any[] = await AdloggsWebhookEvent.find({ orderUuid }).select("partnerOrderId").limit(20).lean();
      if (events.some(e => e.partnerOrderId && e.partnerOrderId !== ours)) {
        return keepUnknown("REFUSED_FOREIGN", "Authenticated provider events tie that order to a different partner_order_id.");
      }
      if (events.some(e => e.partnerOrderId === ours)) source = "AUTHENTICATED_WEBHOOK";
    }

    let status;
    try {
      status = await client.getCurrentStatus(orderUuid);
    } catch (error) {
      return keepUnknown("VERIFY_FAILED", error instanceof AdloggsError ? `Could not verify with Adloggs: ${error.message}` : "Could not verify with Adloggs.");
    }
    if (status.partnerOrderId !== null) {
      if (status.partnerOrderId !== ours) return keepUnknown("REFUSED_FOREIGN", "Adloggs reports that order under a different partner_order_id.");
      source = source ?? "STATUS_RESPONSE";
    }
    if (!source) {
      return keepUnknown("UNCORRELATED",
        "The order exists at Adloggs, but nothing proves it belongs to this shipment (the status response carries no partner_order_id). The outcome stays unknown; escalate to Adloggs support.",
        `order ${orderUuid} exists (status ${status.statusCode}); uncorrelated`);
    }

    const cancelled = shipment.status === "CANCELLED" || shipment.adloggs?.cancellationRequired;
    try {
      const result = await Shipment.updateOne(
        { _id: shipmentId, "bookingIntent.state": "OUTCOME_UNKNOWN" },
        { $set: {
          "bookingIntent.state": "BOOKED", "bookingIntent.updatedAt": now,
          "adloggs.orderUuid": orderUuid, "adloggs.bookedAt": shipment.adloggs?.bookedAt ?? now, "adloggs.nextStatusPollAt": now,
          "adloggs.correlation": { source, verifiedAt: now, adminId },
          ...(cancelled ? cancellationRequestSet(now, "Shipment was cancelled before the booking was confirmed.") : {}),
        }, $unset: { attention: "" }, $push: { "adloggs.adminActions": audit("VERIFIED", `order ${orderUuid} via ${source}`) } },
      );
      if (!result.modifiedCount) return { resolved: false, state: "CHANGED", message: "Shipment changed; reload and retry." };
    } catch (error: any) {
      if (error?.code === 11000) return keepUnknown("REFUSED_OWNED", "That order_uuid already belongs to another shipment.");
      throw error;
    }
    const { replayUnmatchedWebhookEvents } = await import("./adloggsWebhookService");
    await replayUnmatchedWebhookEvents(orderUuid).catch(() => undefined);
    return { resolved: true, state: "BOOKED", correlation: source,
      message: `Adloggs order verified via ${source} and recorded.${cancelled ? " Provider cancellation queued." : ""}` };
  }

  // Rebooking (dual control). Refused while ANY evidence of a provider order exists.
  const evidence = await providerEvidence(shipment);
  if (evidence.length) return keepUnknown("REFUSED_EVIDENCE", `Rebooking is refused: ${evidence.join("; ")}. Verify or cancel that order instead.`);

  if (request.action === "REQUEST_REBOOK") {
    const providerReference = String(request.providerReference ?? "").trim();
    if (providerReference.length < 3 || providerReference.length > 120) {
      return { resolved: false, state: "INVALID", message: "Give the reference of Adloggs' written confirmation that no order exists." };
    }
    const result = await Shipment.updateOne({ _id: shipmentId, "bookingIntent.state": "OUTCOME_UNKNOWN" }, {
      $set: { "adloggs.rebookRequest": { adminId, reason: reason.slice(0, 300), providerReference, at: now } },
      $push: { "adloggs.adminActions": audit("REBOOK_REQUESTED", `provider ref ${providerReference}`) } });
    return result.modifiedCount
      ? { resolved: false, state: "OUTCOME_UNKNOWN", message: "Rebooking requested. A different admin must approve it." }
      : { resolved: false, state: "CHANGED", message: "Shipment changed; reload and retry." };
  }

  // APPROVE_REBOOK
  const pending = shipment.adloggs?.rebookRequest;
  if (!pending) return { resolved: false, state: "INVALID", message: "No rebooking request to approve." };
  if (String(pending.adminId) === String(adminId)) return keepUnknown("REFUSED_SAME_ADMIN", "The admin who requested the rebooking cannot approve it.");
  const oldPartnerId: string | undefined = shipment.adloggs?.partnerOrderId;
  const attemptNo = (shipment.adloggs?.previousPartnerOrderIds?.length ?? 0) + 2;
  const nextPartnerId = `${shipment.shipmentNumber || oldPartnerId || String(shipment._id)}-R${attemptNo}`.slice(0, 100);
  const cancelled = shipment.status === "CANCELLED" || shipment.adloggs?.cancellationRequired;
  const result = await Shipment.updateOne(
    { _id: shipmentId, "bookingIntent.state": "OUTCOME_UNKNOWN", "adloggs.orderUuid": { $exists: false }, "adloggs.createEvidence": { $exists: false } },
    { $set: {
      "bookingIntent.state": cancelled ? "CANCELLED" : "PENDING", "bookingIntent.updatedAt": now, "bookingIntent.attempts": 0,
      ...(cancelled ? {} : { "adloggs.partnerOrderId": nextPartnerId }),
    }, $unset: { attention: "", "adloggs.rebookRequest": "", "bookingIntent.lastError": "" },
    $push: {
      "adloggs.adminActions": audit(cancelled ? "CLOSED_NOT_BOOKED" : "REBOOK_APPROVED", `requested by ${pending.adminId}; provider ref ${pending.providerReference}`),
      ...(oldPartnerId && !cancelled ? { "adloggs.previousPartnerOrderIds": oldPartnerId } : {}),
      ...(oldPartnerId ? { "adloggs.attemptHistory": { partnerOrderId: oldPartnerId, outcome: cancelled ? "NO_ORDER_CONFIRMED_CLOSED" : "NO_ORDER_CONFIRMED_REBOOKED",
        retiredAt: now, adminId: pending.adminId, approvedBy: adminId, providerReference: pending.providerReference } } : {}),
    } },
  );
  if (!result.modifiedCount) return { resolved: false, state: "CHANGED", message: "Shipment changed; reload and retry." };
  if (cancelled) {
    // No provider order exists (dual control): a deferred local cancellation can now complete.
    const { completeDeferredCancellation } = await import("./adloggsCancellationWorkflow");
    await completeDeferredCancellation(shipmentId, now).catch(error => console.error("Deferred cancellation completion failed:", error?.message));
  }
  return cancelled
    ? { resolved: true, state: "CANCELLED", message: "Recorded (dual control) that no Adloggs order exists; any pending cancellation is completed." }
    : { resolved: true, state: "PENDING", message: `Rebooking approved (dual control) with new partner_order_id ${nextPartnerId}.` };
}
