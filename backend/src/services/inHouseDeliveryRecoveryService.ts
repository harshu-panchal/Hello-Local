import crypto from "crypto";
import type { Server as SocketIOServer } from "socket.io";
import AppSettings from "../models/AppSettings";
import Order from "../models/Order";
import { courierOfferStatuses } from "./orderLifecycleService";
import { notifyDeliveryBoysOfNewOrder, type CourierOfferOutcome } from "./orderNotificationService";
import { canStartNewInHouseDelivery } from "./inHouseDeliveryService";
import { IN_HOUSE_ORDER_FILTER } from "./deliveryProviderService";

/**
 * Waiting-order recovery (Phase 1.1).
 *
 * While in-house delivery is OFF, orders that become ready for a courier are
 * not offered. When an admin switches it back ON, the toggle transaction sets
 * `inHouseDelivery.recovery.pending`. This service then re-offers those orders
 * through the normal dispatch path (`notifyDeliveryBoysOfNewOrder`), so:
 *
 *  - eligibility is re-checked per order by the same code the seller path uses
 *    (exists, no courier, in an offer status, paid or COD);
 *  - nothing is ever assigned here: couriers still have to accept, and every
 *    acceptance goes through the transactional assignment gate;
 *  - the switch is re-read before every order, so turning it OFF mid-run
 *    stops further offers.
 *
 * Durability: the request flag lives in MongoDB. The admin request runs the
 * recovery immediately; if that run is interrupted (crash, DB error) the
 * flag stays set and the background worker retries it. A lease on the
 * settings document guarantees a single runner at a time, across processes.
 */

export const RECOVERY_EVENT = "in-house-delivery-recovery";
/** Same freshness window the courier reconnect replay uses. */
export const RECOVERY_MAX_ORDER_AGE_MS = 4 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const PAGE_SIZE = 100;
/** Safety cap per run; reported as `truncated` (with a retry hint) so nothing is silently dropped. */
const MAX_ORDERS_PER_RUN = 1000;
const MAX_LISTED = 20;

const PAYABLE = { $or: [{ paymentMethod: "COD" }, { paymentStatus: { $in: ["Paid", "PartiallyRefunded"] } }] };

export interface RecoveryResult {
  status: "completed" | "aborted" | "skipped" | "failed";
  reason?: string;
  trigger: string;
  requestSeq?: number;
  startedAt: Date;
  finishedAt: Date;
  considered: number;
  offered: number;
  alreadyOffered: number;
  noCouriers: number;
  ineligible: number;
  stale: number;
  staleOrders: string[];
  failed: number;
  truncated: boolean;
  aborted: boolean;
  errors: string[];
}

type Dispatch = (io: SocketIOServer, order: any, options: { skipIfOfferOpen?: boolean }) => Promise<CourierOfferOutcome>;

function emptyResult(trigger: string, startedAt: Date): RecoveryResult {
  return {
    status: "skipped", trigger, startedAt, finishedAt: startedAt, considered: 0, offered: 0, alreadyOffered: 0,
    noCouriers: 0, ineligible: 0, stale: 0, staleOrders: [], failed: 0, truncated: false, aborted: false, errors: [],
  };
}

/**
 * Mark a recovery as requested (used by the admin "retry recovery" action).
 * Refused while in-house delivery is OFF.
 */
export async function requestInHouseDeliveryRecovery(): Promise<boolean> {
  const result = await AppSettings.updateOne(
    { "inHouseDelivery.enabled": { $ne: false } },
    { $set: { "inHouseDelivery.recovery.pending": true }, $inc: { "inHouseDelivery.recovery.requestSeq": 1 } },
  );
  return result.matchedCount > 0;
}

export async function runInHouseDeliveryRecovery(
  io: SocketIOServer | undefined,
  options: { trigger?: string; dispatch?: Dispatch; now?: () => Date } = {},
): Promise<RecoveryResult> {
  const trigger = options.trigger || "worker";
  const dispatch = options.dispatch || notifyDeliveryBoysOfNewOrder;
  const now = options.now || (() => new Date());
  const startedAt = now();
  const result = emptyResult(trigger, startedAt);

  if (!io) {
    result.reason = "Real-time server unavailable";
    return result;
  }

  // Claim the run: only when ON, requested, and no live lease.
  const token = crypto.randomUUID();
  const claimed: any = await AppSettings.findOneAndUpdate(
    {
      "inHouseDelivery.enabled": { $ne: false },
      "inHouseDelivery.recovery.pending": true,
      "inHouseDelivery.recovery.leaseUntil": { $not: { $gt: startedAt } },
    },
    { $set: { "inHouseDelivery.recovery.leaseUntil": new Date(startedAt.getTime() + LEASE_MS), "inHouseDelivery.recovery.leaseToken": token } },
    { new: true, projection: { "inHouseDelivery.recovery": 1 } },
  ).lean();
  if (!claimed) {
    result.reason = "No recovery pending, in-house delivery is off, or a recovery is already running";
    return result;
  }
  result.requestSeq = claimed.inHouseDelivery?.recovery?.requestSeq;

  const heartbeat = setInterval(() => {
    void AppSettings.updateOne(
      { "inHouseDelivery.recovery.leaseToken": token },
      { $set: { "inHouseDelivery.recovery.leaseUntil": new Date(Date.now() + LEASE_MS) } },
    ).catch(error => console.error("In-house recovery lease renewal failed", error));
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  let fatal = false;
  try {
    const cutoff = new Date(startedAt.getTime() - RECOVERY_MAX_ORDER_AGE_MS);
    // Only orders committed to the in-house fleet (legacy orders included).
    // Orders committed to another provider are never picked up here, whatever
    // the global selection is: recovery never reroutes.
    const base = { status: { $in: courierOfferStatuses }, deliveryBoy: null, orderChannel: { $ne: "OFFLINE" }, ...IN_HOUSE_ORDER_FILTER, ...PAYABLE };

    // Older than the replay window: not auto-offered, but reported to admins.
    result.stale = await Order.countDocuments({ ...base, createdAt: { $lt: cutoff } });
    if (result.stale > 0) {
      const stale = await Order.find({ ...base, createdAt: { $lt: cutoff } }).sort({ createdAt: 1 }).limit(MAX_LISTED).select("orderNumber").lean();
      result.staleOrders = stale.map((o: any) => String(o.orderNumber));
    }

    let lastId: any = null;
    pages: while (true) {
      const page: any[] = await Order.find({ ...base, createdAt: { $gte: cutoff }, ...(lastId ? { _id: { $gt: lastId } } : {}) })
        .sort({ _id: 1 }).limit(PAGE_SIZE).select("_id orderNumber").lean();
      if (!page.length) break;
      for (const candidate of page) {
        lastId = candidate._id;
        // Orders that already carry an open offer cost nothing and do not count.
        if (result.considered - result.alreadyOffered >= MAX_ORDERS_PER_RUN) { result.truncated = true; break pages; }
        // Strict OFF: stop the moment the switch is off (or unreadable).
        if (!(await canStartNewInHouseDelivery()).allowed) { result.aborted = true; break pages; }
        result.considered++;
        try {
          const full = await Order.findById(candidate._id).populate({ path: "items", populate: { path: "seller" } }).lean();
          if (!full) { result.ineligible++; continue; }
          const outcome = await dispatch(io, full, { skipIfOfferOpen: true });
          if (outcome === "offered") result.offered++;
          else if (outcome === "alreadyOffered") result.alreadyOffered++;
          else if (outcome === "noCouriers" || outcome === "allBusy") result.noCouriers++;
          else if (outcome === "ineligible") result.ineligible++;
          else if (outcome === "disabled") { result.aborted = true; break pages; }
          else { result.failed++; if (result.errors.length < MAX_LISTED) result.errors.push(`${candidate.orderNumber}: offer could not be sent`); }
        } catch (error: any) {
          result.failed++;
          if (result.errors.length < MAX_LISTED) result.errors.push(`${candidate.orderNumber}: ${error?.message || "failed"}`);
        }
      }
      if (page.length < PAGE_SIZE) break;
    }
    result.status = result.aborted ? "aborted" : "completed";
  } catch (error: any) {
    fatal = true;
    result.status = "failed";
    result.errors.push(error?.message || "Recovery failed");
    console.error("In-house waiting-order recovery failed:", error);
  } finally {
    clearInterval(heartbeat);
    result.finishedAt = now();
    try {
      // The request is satisfied only by a full, non-aborted run, and only if
      // no newer ON request arrived meanwhile (requestSeq unchanged). An
      // aborted run needs nothing: switching OFF already cleared the flag.
      // A fatal error leaves it set so the worker retries.
      if (!fatal && !result.aborted) {
        await AppSettings.updateOne(
          { "inHouseDelivery.recovery.leaseToken": token, "inHouseDelivery.recovery.requestSeq": result.requestSeq },
          { $set: { "inHouseDelivery.recovery.pending": false } },
        );
      }
      const { staleOrders: _s, truncated: _t, status: _st, reason: _r, ...persisted } = result;
      await AppSettings.updateOne(
        { "inHouseDelivery.recovery.leaseToken": token },
        { $set: {
          "inHouseDelivery.recovery.lastRun": { ...persisted, errors: [...result.errors, ...(result.staleOrders.length ? [`Older than 4h, not auto-offered: ${result.staleOrders.join(", ")}`] : []), ...(result.truncated ? [`Run capped at ${MAX_ORDERS_PER_RUN} orders; use "Retry recovery" to offer the rest`] : [])] },
          "inHouseDelivery.recovery.leaseUntil": new Date(0),
        } },
      );
    } catch (error) {
      console.error("In-house recovery bookkeeping failed (lease will expire):", error);
    }
    io.to("admin-notifications").emit(RECOVERY_EVENT, result);
  }
  return result;
}
