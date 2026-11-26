import mongoose, { ClientSession } from "mongoose";
import AppSettings from "../models/AppSettings";
import SettingAuditLog from "../models/SettingAuditLog";
import Order from "../models/Order";
import { ACTIVE_COURIER_STATUSES } from "./orderStatusService";

/**
 * In-house delivery availability (Phase 1: admin ON/OFF with drain mode).
 *
 * This module is the only place that decides whether NEW in-house delivery
 * work may start: courier offers, offer acceptance and admin (re)assignment.
 * Work on orders that already have a courier (pickup, tracking, OTP,
 * completion, cancellation, COD settlement, wallets) is deliberately never
 * checked here, so switching the fleet off drains instead of stranding
 * parcels.
 */

export const IN_HOUSE_DELIVERY_SETTING = "inHouseDelivery.enabled";
export const IN_HOUSE_DELIVERY_DISABLED = "IN_HOUSE_DELIVERY_DISABLED";
export const IN_HOUSE_DELIVERY_STATE_UNAVAILABLE = "IN_HOUSE_DELIVERY_STATE_UNAVAILABLE";
export const IN_HOUSE_DELIVERY_DISABLED_MESSAGE =
  "In-house delivery is currently unavailable. New delivery assignments are temporarily disabled.";
const STATE_UNAVAILABLE_MESSAGE =
  "In-house delivery availability could not be verified, so no new assignment was made. Please try again.";

/** Socket event carrying the current state to courier and admin clients. */
export const IN_HOUSE_DELIVERY_STATE_EVENT = "in-house-delivery-state";

/** Orders that still need a courier: the statuses couriers are offered at. */
const AWAITING_COURIER_STATUSES = ["Accepted", "Processed", "Shipped"];

export class InHouseDeliveryError extends Error {
  readonly statusCode: number;
  readonly reason: string;
  constructor(message: string, statusCode: number, reason: string) {
    super(message);
    this.name = "InHouseDeliveryError";
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

export function isInHouseDeliveryError(error: unknown): error is InHouseDeliveryError {
  return error instanceof InHouseDeliveryError;
}

/**
 * Read the persisted switch. Always hits the database (no cache), so a change
 * applies to the very next operation. Only an explicit `false` disables;
 * a missing settings document or field is a legacy install and stays enabled.
 * Database errors propagate so callers can fail closed.
 */
export async function isInHouseDeliveryEnabled(session?: ClientSession): Promise<boolean> {
  const query = AppSettings.findOne({}).select("inHouseDelivery").lean();
  if (session) query.session(session);
  const settings: any = await query;
  return settings?.inHouseDelivery?.enabled !== false;
}

/**
 * Errors the driver labels for a transaction retry (write conflicts, commit
 * uncertainty). They must reach `withTransaction` unchanged so it re-runs the
 * whole unit of work against the newer data; wrapping them would turn a
 * routine retry into a spurious "state unavailable" failure.
 */
export function isTransactionRetryError(error: any): boolean {
  if (!error) return false;
  const has = (label: string) =>
    (typeof error.hasErrorLabel === "function" && error.hasErrorLabel(label)) ||
    (Array.isArray(error.errorLabels) && error.errorLabels.includes(label));
  return has("TransientTransactionError") || has("UnknownTransactionCommitResult");
}

/**
 * Throws unless new in-house delivery work may start. A failed read is treated
 * as "not allowed" rather than assumed enabled.
 *
 * This is a READ check, suitable for best-effort paths (offer broadcasts,
 * reconnect replay, recovery). It does not serialize against a concurrent
 * toggle; the assignment write uses `claimInHouseAssignment` for that.
 */
export async function assertNewInHouseDeliveryAllowed(session?: ClientSession): Promise<void> {
  let enabled: boolean;
  try {
    enabled = await isInHouseDeliveryEnabled(session);
  } catch (error) {
    if (session && isTransactionRetryError(error)) throw error;
    console.error("In-house delivery state could not be read:", error);
    throw new InHouseDeliveryError(STATE_UNAVAILABLE_MESSAGE, 503, IN_HOUSE_DELIVERY_STATE_UNAVAILABLE);
  }
  if (!enabled) {
    throw new InHouseDeliveryError(IN_HOUSE_DELIVERY_DISABLED_MESSAGE, 409, IN_HOUSE_DELIVERY_DISABLED);
  }
}

/** Make sure the settings singleton exists before an assignment transaction starts. */
export async function ensureInHouseDeliverySettings(): Promise<void> {
  await AppSettings.getSettings();
}

/**
 * Authoritative gate for creating or moving an in-house assignment.
 *
 * MongoDB snapshot reads inside a transaction do not conflict with another
 * transaction's write, so merely READING the switch here would let an accept
 * that started before an admin disable commit after it. Instead this performs
 * a conditional WRITE on the same settings document the toggle writes:
 *
 *   - enabled  → `$inc inHouseDelivery.assignmentSeq` (matches, writes)
 *   - disabled → the filter matches nothing → assignment refused
 *
 * Both the toggle and every assignment now write one document, so MongoDB
 * serializes them (one gets a WriteConflict and `withTransaction` retries it
 * against the committed state). Disabling therefore takes effect at the commit
 * of the toggle transaction: an assignment that commits afterwards must have
 * re-run its claim against the disabled document and failed.
 */
export async function claimInHouseAssignment(session: ClientSession): Promise<void> {
  let matched: number;
  try {
    const result = await AppSettings.updateOne(
      { "inHouseDelivery.enabled": { $ne: false } },
      { $inc: { "inHouseDelivery.assignmentSeq": 1 } },
      { session },
    );
    matched = result.matchedCount;
  } catch (error) {
    if (isTransactionRetryError(error)) throw error;
    console.error("In-house delivery assignment gate failed:", error);
    throw new InHouseDeliveryError(STATE_UNAVAILABLE_MESSAGE, 503, IN_HOUSE_DELIVERY_STATE_UNAVAILABLE);
  }
  if (matched === 0) {
    // Either the switch is off, or the settings document is missing (it is
    // created before the transaction starts, so treat that as unavailable).
    let exists = false;
    try {
      exists = !!(await AppSettings.findOne({}).select("_id").session(session).lean());
    } catch (error) {
      if (isTransactionRetryError(error)) throw error;
    }
    if (!exists) throw new InHouseDeliveryError(STATE_UNAVAILABLE_MESSAGE, 503, IN_HOUSE_DELIVERY_STATE_UNAVAILABLE);
    throw new InHouseDeliveryError(IN_HOUSE_DELIVERY_DISABLED_MESSAGE, 409, IN_HOUSE_DELIVERY_DISABLED);
  }
}

/** Non-throwing variant for broadcast paths that must simply skip work. */
export async function canStartNewInHouseDelivery(): Promise<{ allowed: boolean; reason?: string; message?: string }> {
  try {
    await assertNewInHouseDeliveryAllowed();
    return { allowed: true };
  } catch (error) {
    if (isInHouseDeliveryError(error)) return { allowed: false, reason: error.reason, message: error.message };
    throw error;
  }
}

export interface InHouseDeliveryStatus {
  enabled: boolean;
  updatedAt?: Date;
  updatedBy?: string;
  /** Orders with an in-house courier that are still in flight (drain set). */
  activeAssignments: number;
  /** Paid/COD orders ready for a courier but not yet assigned one. */
  awaitingCourier: number;
  /** A waiting-order recovery has been requested and has not completed yet. */
  recoveryPending: boolean;
  /** Outcome of the most recent waiting-order recovery, if any. */
  lastRecovery?: Record<string, unknown>;
}

export async function getInHouseDeliveryStatus(): Promise<InHouseDeliveryStatus> {
  const settings: any = await AppSettings.findOne({}).select("inHouseDelivery").lean();
  const payable = { $or: [{ paymentMethod: "COD" }, { paymentStatus: { $in: ["Paid", "PartiallyRefunded"] } }] };
  const [activeAssignments, awaitingCourier] = await Promise.all([
    Order.countDocuments({ deliveryBoy: { $ne: null }, status: { $in: ACTIVE_COURIER_STATUSES } }),
    Order.countDocuments({ deliveryBoy: null, orderChannel: { $ne: "OFFLINE" }, status: { $in: AWAITING_COURIER_STATUSES }, deliveryProvider: { $in: [null, "IN_HOUSE"] }, ...payable }),
  ]);
  return {
    enabled: settings?.inHouseDelivery?.enabled !== false,
    updatedAt: settings?.inHouseDelivery?.updatedAt,
    updatedBy: settings?.inHouseDelivery?.updatedBy ? String(settings.inHouseDelivery.updatedBy) : undefined,
    activeAssignments,
    awaitingCourier,
    recoveryPending: settings?.inHouseDelivery?.recovery?.pending === true,
    lastRecovery: settings?.inHouseDelivery?.recovery?.lastRun || undefined,
  };
}

/** Courier-facing view: the switch plus whether this courier still has work to finish. */
export async function getCourierServiceStatus(courierId: string) {
  const [enabled, activeDeliveries] = await Promise.all([
    isInHouseDeliveryEnabled(),
    Order.countDocuments({ deliveryBoy: courierId, status: { $in: ACTIVE_COURIER_STATUSES } }),
  ]);
  return {
    inHouseDeliveryEnabled: enabled,
    activeDeliveries,
    message: enabled ? undefined : IN_HOUSE_DELIVERY_DISABLED_MESSAGE,
  };
}

/**
 * Change the switch. The update is conditional on the value read, and the
 * audit record is written in the same transaction, so concurrent toggles
 * cannot both "win" or leave an unaudited change. Setting the current value
 * again is a no-op and is not audited.
 */
export async function setInHouseDeliveryEnabled(enabled: boolean, adminId?: string): Promise<{ enabled: boolean; changed: boolean }> {
  if (typeof enabled !== "boolean") throw new InHouseDeliveryError("`enabled` must be true or false.", 400, "INVALID_PAYLOAD");
  await AppSettings.getSettings(); // make sure the singleton exists
  const session = await mongoose.startSession();
  try {
    return (await session.withTransaction(async () => {
      const current: any = await AppSettings.findOne({}).select("inHouseDelivery").session(session).lean();
      if (!current) throw new InHouseDeliveryError("Settings are not initialised.", 500, "SETTINGS_MISSING");
      const previous = current.inHouseDelivery?.enabled !== false;
      if (previous === enabled) return { enabled, changed: false };
      const updatedBy = adminId && mongoose.Types.ObjectId.isValid(adminId) ? new mongoose.Types.ObjectId(adminId) : undefined;
      // Turning ON durably requests a waiting-order recovery (picked up by the
      // request itself or, after a crash, by the background worker). Turning
      // OFF cancels any outstanding request.
      const update: any = {
        $set: {
          "inHouseDelivery.enabled": enabled,
          "inHouseDelivery.updatedAt": new Date(),
          "inHouseDelivery.updatedBy": updatedBy,
          "inHouseDelivery.recovery.pending": enabled,
        },
      };
      if (enabled) update.$inc = { "inHouseDelivery.recovery.requestSeq": 1 };
      const result = await AppSettings.updateOne(
        { _id: current._id, "inHouseDelivery.enabled": previous ? { $ne: false } : false },
        update,
        { session },
      );
      if (!result.modifiedCount) {
        throw new InHouseDeliveryError("The setting was changed by someone else. Reload and try again.", 409, "CONCURRENT_UPDATE");
      }
      await SettingAuditLog.create([{ setting: IN_HOUSE_DELIVERY_SETTING, previousValue: previous, newValue: enabled, changedBy: updatedBy }], { session });
      return { enabled, changed: true };
    })) as { enabled: boolean; changed: boolean };
  } finally {
    await session.endSession();
  }
}
