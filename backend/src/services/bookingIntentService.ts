import crypto from "crypto";
import Shipment, { BookingIntentState, IBookingIntent } from "../models/Shipment";

/**
 * Booking-intent lifecycle. Every transition is a single conditional update
 * fenced by the claim token, so duplicate workers, crashes and concurrent
 * cancellation are safe.
 *
 *   PENDING ──claim──▶ CLAIMED ──markSubmitting──▶ SUBMITTING ──verified success──▶ BOOKED
 *      ▲                  │                            ├─ definitive provider rejection ─▶ RETRYABLE_FAILURE / FAILED
 *      └──── release ─────┘                            └─ timeout / lost answer / crash ─▶ OUTCOME_UNKNOWN
 *   CLAIMED lease expiry: claimable again (nothing was sent).
 *   SUBMITTING lease expiry: OUTCOME_UNKNOWN (something may have been sent) — never re-claimed.
 *   OUTCOME_UNKNOWN leaves only by an admin resolution (verified provider order, or
 *   an explicit, audited "no booking exists").
 *   PENDING / CLAIMED / RETRYABLE_FAILURE ──shipment cancelled──▶ CANCELLED.
 *
 * A claim only means "one worker may try now". Only BOOKED means a provider
 * accepted the shipment, and only after a verified response (order_uuid).
 */

const TRANSITIONS: Record<BookingIntentState, BookingIntentState[]> = {
  PENDING: ["CLAIMED", "CANCELLED"],
  CLAIMED: ["PENDING", "SUBMITTING", "RETRYABLE_FAILURE", "FAILED", "CANCELLED"],
  SUBMITTING: ["BOOKED", "RETRYABLE_FAILURE", "FAILED", "OUTCOME_UNKNOWN"],
  OUTCOME_UNKNOWN: ["BOOKED", "PENDING"], // admin resolution only
  BOOKED: [],
  RETRYABLE_FAILURE: ["CLAIMED", "FAILED", "CANCELLED"],
  FAILED: [],
  CANCELLED: [],
};
export const TERMINAL_BOOKING_INTENT_STATES: BookingIntentState[] = ["BOOKED", "FAILED", "CANCELLED"];
/** States the lifecycle sync moves to CANCELLED when the shipment is cancelled. */
export const CANCELLABLE_BOOKING_INTENT_STATES: BookingIntentState[] = ["PENDING", "CLAIMED", "RETRYABLE_FAILURE"];

export function canTransitionBookingIntent(from: BookingIntentState, to: BookingIntentState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const DEFAULT_LEASE_MS = 2 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;

/** Filter for intents a worker may take now (fresh, due for retry, or lease expired). */
function claimableFilter(now: Date) {
  return {
    deliveryProvider: { $ne: "IN_HOUSE" },
    status: "READY_FOR_PICKUP",
    $or: [
      { "bookingIntent.state": "PENDING" },
      { "bookingIntent.state": "RETRYABLE_FAILURE", "bookingIntent.nextAttemptAt": { $lte: now } },
      { "bookingIntent.state": "CLAIMED", "bookingIntent.leaseUntil": { $lte: now } },
    ],
  };
}

/**
 * Atomically claim one claimable intent (optionally a specific shipment).
 * Returns the claim token, or null when nothing is claimable / someone else
 * won. At most one claimer succeeds per shipment.
 */
export async function claimBookingIntent(options: { shipmentId?: string; leaseMs?: number; now?: Date } = {}):
  Promise<{ shipmentId: string; token: string; attempts: number } | null> {
  const now = options.now || new Date();
  const token = crypto.randomUUID();
  const claimed: any = await Shipment.findOneAndUpdate(
    { ...claimableFilter(now), ...(options.shipmentId ? { _id: options.shipmentId } : {}) },
    {
      $set: {
        "bookingIntent.state": "CLAIMED",
        "bookingIntent.leaseToken": token,
        "bookingIntent.leaseUntil": new Date(now.getTime() + (options.leaseMs ?? DEFAULT_LEASE_MS)),
        "bookingIntent.updatedAt": now,
      },
      $inc: { "bookingIntent.attempts": 1 },
    },
    { new: true, sort: { "bookingIntent.createdAt": 1 } },
  ).lean();
  if (!claimed) return null;
  return { shipmentId: String(claimed._id), token, attempts: claimed.bookingIntent?.attempts ?? 1 };
}

/**
 * Record an internal failure for the holder of a claim. Ignored (returns
 * false) if the claim was lost, expired-and-retaken, or the shipment was
 * cancelled meanwhile — a stale worker can never resurrect an intent.
 */
export async function recordBookingIntentFailure(shipmentId: string, token: string, failure: {
  reason: string; retryable: boolean; retryAfterMs?: number; maxAttempts?: number; now?: Date;
}): Promise<{ recorded: boolean; state?: BookingIntentState }> {
  const now = failure.now || new Date();
  const current: any = await Shipment.findOne({ _id: shipmentId }).select("bookingIntent").lean();
  const attempts = current?.bookingIntent?.attempts ?? 0;
  const exhausted = attempts >= (failure.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const state: BookingIntentState = failure.retryable && !exhausted ? "RETRYABLE_FAILURE" : "FAILED";
  const result = await Shipment.updateOne(
    // From CLAIMED (nothing sent) or SUBMITTING (the provider definitively rejected it).
    { _id: shipmentId, "bookingIntent.state": { $in: ["CLAIMED", "SUBMITTING"] }, "bookingIntent.leaseToken": token },
    {
      $set: {
        "bookingIntent.state": state,
        "bookingIntent.lastError": String(failure.reason).slice(0, 500),
        "bookingIntent.updatedAt": now,
        ...(state === "RETRYABLE_FAILURE" ? { "bookingIntent.nextAttemptAt": new Date(now.getTime() + (failure.retryAfterMs ?? 60_000)) } : {}),
      },
      $unset: { "bookingIntent.leaseToken": "", "bookingIntent.leaseUntil": "" },
    },
  );
  return result.modifiedCount ? { recorded: true, state } : { recorded: false };
}

/** Give a claim back untouched (e.g. graceful worker shutdown). */
export async function releaseBookingIntentClaim(shipmentId: string, token: string, now = new Date()): Promise<boolean> {
  const result = await Shipment.updateOne(
    { _id: shipmentId, "bookingIntent.state": "CLAIMED", "bookingIntent.leaseToken": token },
    { $set: { "bookingIntent.state": "PENDING", "bookingIntent.updatedAt": now }, $unset: { "bookingIntent.leaseToken": "", "bookingIntent.leaseUntil": "" } },
  );
  return result.modifiedCount > 0;
}

/**
 * Mark that the create request is about to be sent. Persisted BEFORE the
 * network call: from here on, a crash or lost answer means OUTCOME_UNKNOWN,
 * never a silent retry. Returns false (and nothing may be sent) if the claim
 * was lost or the shipment was cancelled meanwhile.
 */
export async function markBookingSubmitting(shipmentId: string, token: string, details: {
  partnerOrderId: string; pickupSnapshot: unknown; leaseMs?: number; now?: Date;
}): Promise<boolean> {
  const now = details.now || new Date();
  const result = await Shipment.updateOne(
    { _id: shipmentId, status: "READY_FOR_PICKUP", "bookingIntent.state": "CLAIMED", "bookingIntent.leaseToken": token,
      "adloggs.orderUuid": { $exists: false } },
    { $set: {
      "bookingIntent.state": "SUBMITTING",
      "bookingIntent.submittedAt": now,
      "bookingIntent.updatedAt": now,
      "bookingIntent.leaseUntil": new Date(now.getTime() + (details.leaseMs ?? DEFAULT_LEASE_MS)),
      "adloggs.partnerOrderId": details.partnerOrderId,
      "adloggs.pickupSnapshot": details.pickupSnapshot,
    } },
  );
  return result.modifiedCount > 0;
}

/** Record an outcome that cannot be known from our side (timeout, lost answer, malformed success). */
export async function markBookingOutcomeUnknown(shipmentId: string, token: string, reason: string, now = new Date()): Promise<boolean> {
  const result = await Shipment.updateOne(
    { _id: shipmentId, "bookingIntent.state": "SUBMITTING", "bookingIntent.leaseToken": token },
    { $set: {
      "bookingIntent.state": "OUTCOME_UNKNOWN", "bookingIntent.lastError": String(reason).slice(0, 500), "bookingIntent.updatedAt": now,
      attention: { reason: `Adloggs booking outcome unknown: ${String(reason).slice(0, 200)}. Do not rebook until reconciled.`, at: now },
    }, $unset: { "bookingIntent.leaseToken": "", "bookingIntent.leaseUntil": "" } },
  );
  return result.modifiedCount > 0;
}

/**
 * Crash recovery: a SUBMITTING intent whose lease expired may already exist at
 * the provider. It becomes OUTCOME_UNKNOWN; it is never re-claimed.
 */
export async function sweepStaleSubmissions(now = new Date()): Promise<number> {
  const result = await Shipment.updateMany(
    { "bookingIntent.state": "SUBMITTING", "bookingIntent.leaseUntil": { $lte: now } },
    { $set: {
      "bookingIntent.state": "OUTCOME_UNKNOWN", "bookingIntent.lastError": "Worker stopped after the request may have been sent.",
      "bookingIntent.updatedAt": now,
      attention: { reason: "Adloggs booking outcome unknown after an interrupted attempt. Do not rebook until reconciled.", at: now },
    }, $unset: { "bookingIntent.leaseToken": "", "bookingIntent.leaseUntil": "" } },
  );
  return result.modifiedCount;
}

export type BookingStage =
  | "SELLER_NOT_READY"
  | "READY_NO_BOOKING_REQUIRED"
  | "AWAITING_BOOKING_INTEGRATION"
  | "BOOKING_ATTEMPT_IN_PROGRESS"
  | "BOOKING_REQUEST_IN_FLIGHT"
  | "BOOKING_OUTCOME_UNKNOWN"
  | "BOOKING_CONFIRMED"
  | "BOOKING_PREPARATION_RETRYING"
  | "BOOKING_PREPARATION_FAILED"
  | "BOOKING_CANCELLED"
  | "NOT_APPLICABLE";

/**
 * Plain admin-facing description. Only BOOKING_CONFIRMED means a provider
 * accepted the shipment (verified order_uuid). A pending intent is
 * "awaiting booking integration", not "failed".
 */
export function describeBookingStage(shipment: { status: string; deliveryProvider?: string; bookingIntent?: Partial<IBookingIntent> | null }): BookingStage {
  const intent = shipment.bookingIntent;
  if (intent?.state === "BOOKED") return "BOOKING_CONFIRMED";
  if (intent?.state === "OUTCOME_UNKNOWN") return "BOOKING_OUTCOME_UNKNOWN";
  if (intent?.state === "SUBMITTING") return "BOOKING_REQUEST_IN_FLIGHT";
  if (intent?.state === "CANCELLED") return "BOOKING_CANCELLED";
  if (intent?.state === "FAILED") return "BOOKING_PREPARATION_FAILED";
  if (intent?.state === "RETRYABLE_FAILURE") return "BOOKING_PREPARATION_RETRYING";
  if (intent?.state === "CLAIMED") return "BOOKING_ATTEMPT_IN_PROGRESS";
  if (intent?.state === "PENDING") return "AWAITING_BOOKING_INTEGRATION";
  if (["CANCELLED", "PICKED_UP", "DELIVERED", "RETURNED", "RETURNED_TO_ORIGIN"].includes(shipment.status)) return "NOT_APPLICABLE";
  if (shipment.status === "READY_FOR_PICKUP") return shipment.deliveryProvider === "IN_HOUSE" ? "READY_NO_BOOKING_REQUIRED" : "AWAITING_BOOKING_INTEGRATION";
  return "SELLER_NOT_READY";
}
