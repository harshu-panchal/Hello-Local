import mongoose, { ClientSession } from "mongoose";
import Shipment, { ShipmentEventSource, ShipmentStatus } from "../models/Shipment";
import OrderItem from "../models/OrderItem";
import Order from "../models/Order";
import { sellerStage } from "./sellerFulfillmentStage";
import { withOrderTransaction } from "./orderTransactionService";
import Seller from "../models/Seller";
import ShipmentReconciliation from "../models/ShipmentReconciliation";
import { describeBookingStage, BookingStage, CANCELLABLE_BOOKING_INTENT_STATES } from "./bookingIntentService";
import { ADLOGGS_STATUS_LABELS, safeTrackingUrl } from "./adloggs/adloggsStatus";
import { orderDeliveryProvider } from "./deliveryProviderService";

/**
 * Internal shipment service (Phase 3A). Provider-independent: no booking,
 * no external calls, no prices, no COD. Shipments never dispatch couriers;
 * in-house delivery stays one courier per order with per-seller pickups.
 *
 * Source of truth: the existing OrderItem stages/statuses and the order's
 * sellerPickups. Shipment status is derived from them (`deriveShipmentStatus`)
 * and written by `syncOrderShipments`, which every lifecycle change calls
 * inside its own order transaction. Legacy orders (no `shipmentsCreated`)
 * have no shipment records; their shipments are synthesised for reads.
 */

const RANK: Record<string, number> = { CREATED: 0, PREPARING: 1, READY_FOR_PICKUP: 2, PICKED_UP: 3, DELIVERED: 4 };
export const TERMINAL_SHIPMENT_STATUSES: ShipmentStatus[] = ["CANCELLED", "RETURNED", "RETURNED_TO_ORIGIN"];

/**
 * Shipment transitions are forward-only:
 *  - any active status may move to a later active status (admins can skip
 *    stages today, e.g. Received → Processed, so skips are allowed);
 *  - CANCELLED is reachable from any status except DELIVERED;
 *  - RETURNED is reachable only from DELIVERED;
 *  - RETURNED_TO_ORIGIN (external RTO) is reachable only from PICKED_UP;
 *  - CANCELLED, RETURNED and RETURNED_TO_ORIGIN are terminal; nothing moves backwards.
 */
export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  if (from === to) return false;
  if (TERMINAL_SHIPMENT_STATUSES.includes(from)) return false;
  if (to === "CANCELLED") return from !== "DELIVERED";
  if (to === "RETURNED") return from === "DELIVERED";
  if (to === "RETURNED_TO_ORIGIN") return from === "PICKED_UP";
  return (RANK[to] ?? -1) > (RANK[from] ?? -1);
}

const STAGE_TO_SHIPMENT: Record<string, ShipmentStatus> = {
  Received: "CREATED",
  Pending: "CREATED",
  Accepted: "PREPARING",
  // Prepared stages become READY_FOR_PICKUP only with the seller's explicit
  // readiness confirmation (see deriveShipmentStatus); otherwise PREPARING.
  Processed: "PREPARING",
  Shipped: "PREPARING",
  "Picked up": "PICKED_UP",
  "On the way": "PICKED_UP",
  "Out for Delivery": "PICKED_UP",
  Delivered: "DELIVERED",
  Returned: "RETURNED",
  Cancelled: "CANCELLED",
  Rejected: "CANCELLED",
};

/** Seller stages that satisfy the existing preparation requirement (same as the in-house pickup gate). */
export const PREPARED_STAGES = ["Processed", "Shipped"];

/**
 * Status of one seller's shipment, computed from the existing order data plus
 * one explicit fact: whether the seller confirmed readiness (`ready`).
 * Item stages/statuses and pickups stay authoritative for everything else.
 */
export function deriveShipmentStatus(sellerItems: any[], order: any, sellerId: string, ready = false): ShipmentStatus {
  if (order?.status === "Returned") return "RETURNED";
  const live = sellerItems.filter(item => item.status !== "Cancelled");
  if (!live.length) return "CANCELLED";
  if (live.every(item => item.status === "Returned")) return "RETURNED";
  if (live.every(item => item.status === "Delivered" || item.status === "Returned")) return "DELIVERED";
  if (order?.status === "Delivered") return "DELIVERED";
  if (order?.sellerPickups?.some((pickup: any) => String(pickup.seller) === sellerId && pickup.pickedUpAt)) return "PICKED_UP";
  const stage = sellerStage(live, order);
  if (ready && PREPARED_STAGES.includes(stage)) return "READY_FOR_PICKUP";
  return STAGE_TO_SHIPMENT[stage] ?? "CREATED";
}

function bySeller(items: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item.seller?._id ?? item.seller);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

/**
 * Create one shipment per seller for a newly placed order. Must run inside
 * the order-creation transaction after the order is saved, so the order and
 * its shipments commit or roll back together. Idempotent: keyed upserts on
 * the unique (order, seller) index never create a second record.
 */
export async function createOrderShipments(order: any, items: any[], session?: ClientSession): Promise<number> {
  const provider = orderDeliveryProvider(order);
  const sellers = [...bySeller(items).keys()].map(id => new mongoose.Types.ObjectId(id));
  if (!sellers.length) return 0;
  const now = new Date();
  await Shipment.bulkWrite(
    sellers.map((seller, index) => ({
      updateOne: {
        filter: { order: order._id, seller },
        update: {
          $setOnInsert: {
            order: order._id,
            seller,
            deliveryProvider: provider,
            shipmentNumber: `${order.orderNumber}-S${index + 1}`,
            status: "CREATED",
            statusChangedAt: now,
            history: [{ status: "CREATED", at: now, source: "system" }],
          },
        },
        upsert: true,
      },
    })),
    { session },
  );
  return sellers.length;
}

/**
 * Bring stored shipment statuses in line with the order's current data.
 * Call after the lifecycle change is written, with the same session. Only
 * valid forward transitions are applied; anything else is logged and left
 * alone, so a shipment never regresses and never blocks the existing flow.
 * A no-op (no database access) for orders without shipment records.
 */
export async function syncOrderShipments(order: any, session?: ClientSession, source: ShipmentEventSource = "system"): Promise<{ updated: number; skipped: number }> {
  const result = { updated: 0, skipped: 0 };
  if (!order?.shipmentsCreated) return result;
  const shipmentQuery = Shipment.find({ order: order._id });
  if (session) shipmentQuery.session(session);
  const shipments = await shipmentQuery;
  if (!shipments.length) return result;
  const itemQuery = OrderItem.find({ order: order._id }).select("seller status fulfillmentStatus");
  if (session) itemQuery.session(session);
  const groups = bySeller(await itemQuery);
  const now = new Date();
  for (const shipment of shipments) {
    const sellerId = String(shipment.seller);
    // Authority boundary: once a verified external provider event has moved an
    // external shipment into transport (or past it), order data no longer
    // drives its status — only provider events do.
    if (shipment.deliveryProvider !== "IN_HOUSE" && ["PICKED_UP", "DELIVERED", "RETURNED_TO_ORIGIN"].includes(shipment.status)) continue;
    const target = deriveShipmentStatus(groups.get(sellerId) || [], order, sellerId, !!shipment.readyForPickupAt);
    if (target === shipment.status) continue;
    if (!canTransitionShipment(shipment.status, target)) {
      // Never regress a shipment, but never hide the inconsistency either:
      // it is logged and flagged for admins on the shipment itself.
      result.skipped++;
      const reason = `Lifecycle data implies ${target} but shipment is ${shipment.status}; left unchanged.`;
      console.warn(`Shipment ${shipment.shipmentNumber}: ${reason}`);
      await Shipment.updateOne({ _id: shipment._id }, { $set: { attention: { reason, at: now } } }, { session });
      continue;
    }
    const set: any = { status: target, statusChangedAt: now };
    // Internal booking intent: only for shipments of an external provider,
    // only after explicit readiness, at most once. No provider is contacted.
    let createdIntent = false;
    if (target === "READY_FOR_PICKUP" && shipment.deliveryProvider !== "IN_HOUSE" && !shipment.bookingIntent) {
      set.bookingIntent = { state: "PENDING", createdAt: now, updatedAt: now, attempts: 0 };
      createdIntent = true;
    }
    const unset: any = { attention: "" };
    if (target === "CANCELLED" && shipment.bookingIntent && CANCELLABLE_BOOKING_INTENT_STATES.includes(shipment.bookingIntent.state)) {
      // Cancels a pending, claimed or retrying intent; a stale worker's later
      // update is rejected because its lease token no longer matches.
      set["bookingIntent.state"] = "CANCELLED";
      set["bookingIntent.cancelledAt"] = now;
      set["bookingIntent.updatedAt"] = now;
      unset["bookingIntent.leaseToken"] = "";
      unset["bookingIntent.leaseUntil"] = "";
    }
    if (target === "CANCELLED" && shipment.deliveryProvider !== "IN_HOUSE") {
      if (shipment.adloggs?.orderUuid && !shipment.adloggs.cancellation) {
        // Booked externally: queue a provider cancellation (sent by the cancellation worker only).
        set["adloggs.cancellation"] = { state: "REQUESTED", reason: "Seller shipment cancelled in Hello Local", requestedAt: now, attempts: 0 };
      } else if (["SUBMITTING", "OUTCOME_UNKNOWN"].includes(String(shipment.bookingIntent?.state))) {
        // A booking may exist: remember to cancel it once it is confirmed.
        set["adloggs.cancellationRequired"] = true;
      }
    }
    await Shipment.updateOne(
      { _id: shipment._id, status: shipment.status },
      { $set: set, $unset: unset, $push: { history: { status: target, at: now, source } } },
      { session },
    );
    if (createdIntent) {
      // Inert reconciliation placeholder, created with the intent in the same
      // transaction: all provider amounts unknown (null), no obligations.
      await ShipmentReconciliation.updateOne(
        { shipment: shipment._id },
        { $setOnInsert: { shipment: shipment._id, order: order._id, seller: shipment.seller, deliveryProvider: shipment.deliveryProvider,
          currency: "INR", providerCost: null, providerRtoCharge: null, providerAdjustment: null, providerCredit: null, providerSettlementReference: null,
          status: "AWAITING_PROVIDER_DATA", events: [{ action: "CREATED_WITH_BOOKING_INTENT", at: now, source }] } },
        { upsert: true, session },
      );
    }
    result.updated++;
  }
  return result;
}

/**
 * Re-sync one order's shipments inside an order transaction and clear the
 * durable `shipmentSyncPending` marker in the same transaction. Idempotent:
 * the sync is derived from current data, so repeating it changes nothing.
 */
export async function reconcileOrderShipments(orderId: string): Promise<void> {
  await withOrderTransaction(orderId, async session => {
    const order = await Order.findById(orderId).session(session);
    if (!order) return;
    await syncOrderShipments(order, session, "system");
    await Order.updateOne({ _id: orderId }, { $unset: { shipmentSyncPending: "" } }, { session });
  });
}

/**
 * Background retry for flows that run outside an order transaction (returns).
 * Picks up orders whose marker is still set and reconciles them; failures stay
 * marked and are retried on the next run.
 */
export async function reconcilePendingShipmentSyncs(limit = 50): Promise<{ reconciled: number; failed: number }> {
  const pending = await Order.find({ shipmentSyncPending: true }).select("_id").limit(limit).lean();
  const outcome = { reconciled: 0, failed: 0 };
  for (const entry of pending) {
    try {
      await reconcileOrderShipments(String(entry._id));
      outcome.reconciled++;
    } catch (error) {
      outcome.failed++;
      console.error(`Shipment reconciliation for order ${entry._id} failed; will retry:`, error);
    }
  }
  return outcome;
}

export type ShipmentAudience = "customer" | "seller" | "admin" | "courier";

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  CREATED: "Order received",
  PREPARING: "Being prepared",
  READY_FOR_PICKUP: "Ready for pickup",
  PICKED_UP: "Collected",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  RETURNED_TO_ORIGIN: "Returned to store",
};

/** Verified external-delivery facts for one audience (never tokens, OTPs, phones or costs). */
export interface ExternalDeliveryView {
  provider: "Adloggs";
  booked: boolean;
  providerStatus?: string;
  providerStatusLabel?: string;
  /** When Hello Local received the latest status (the provider sends no event time). */
  providerStatusReceivedAt?: Date;
  riderName?: string;
  /** Approved Adloggs HTTPS tracking page only. */
  trackUrl?: string;
  returnToOrigin?: "INITIATED" | "COMPLETED";
  cancellation?: string;
  /**
   * A cancellation was requested and waits for the delivery partner: AWAITING_PROVIDER
   * (completes after the partner confirms), BLOCKED (partner refused; support is handling it),
   * COMPLETED or WITHDRAWN.
   */
  cancellationRequest?: "AWAITING_PROVIDER" | "BLOCKED" | "COMPLETED" | "WITHDRAWN";
  /** Customer only: code to give the Adloggs rider at delivery. */
  deliveryOtp?: string;
  /** Seller only: code to give the rider at pickup / when the parcel is returned. */
  pickupOtp?: string;
  returnOtp?: string;
  /** Admin only. */
  orderUuid?: string;
  partnerOrderId?: string;
  lastStatusSyncAt?: Date;
  lateBookingEvidence?: boolean;
}

export function externalView(shipment: any, audience: ShipmentAudience): ExternalDeliveryView | undefined {
  if (shipment.deliveryProvider === "IN_HOUSE") return undefined;
  const a = shipment.adloggs || {};
  const booked = shipment.bookingIntent?.state === "BOOKED" || !!a.orderUuid;
  const view: ExternalDeliveryView = {
    provider: "Adloggs",
    booked,
    ...(a.providerStatus ? { providerStatus: a.providerStatus, providerStatusLabel: ADLOGGS_STATUS_LABELS[a.providerStatus as keyof typeof ADLOGGS_STATUS_LABELS],
      providerStatusReceivedAt: a.providerStatusReceivedAt } : {}),
    ...(a.riderName ? { riderName: a.riderName } : {}),
    ...(a.rto?.state ? { returnToOrigin: a.rto.state } : {}),
    ...(a.cancellation?.state ? { cancellation: a.cancellation.state } : {}),
    ...(a.pendingLocalCancellation?.state ? { cancellationRequest: a.pendingLocalCancellation.state } : {}),
  };
  // Our codes for the rider, only to the party who must hand them over, only while relevant.
  const open = !["DELIVERED", "CANCELLED", "RETURNED", "RETURNED_TO_ORIGIN"].includes(shipment.status);
  if (booked && open && a.otps) {
    if (audience === "customer" && a.rto?.state !== "INITIATED") view.deliveryOtp = a.otps.delivery;
    if (audience === "seller" && shipment.status !== "PICKED_UP") view.pickupOtp = a.otps.pickup;
    if (audience === "seller" && a.rto?.state === "INITIATED") view.returnOtp = a.otps.return;
  }
  const trackUrl = safeTrackingUrl(a.trackUrl);
  if (trackUrl && audience !== "courier") view.trackUrl = trackUrl;
  if (audience === "admin") Object.assign(view, { orderUuid: a.orderUuid, partnerOrderId: a.partnerOrderId, lastStatusSyncAt: a.lastStatusSyncAt, lateBookingEvidence: a.lateBookingEvidence });
  return view;
}

export interface ShipmentView {
  /** External provider facts (non-in-house shipments only). */
  external?: ExternalDeliveryView;
  id?: string;
  shipmentNumber?: string;
  seller: string;
  status: ShipmentStatus;
  statusLabel: string;
  itemCount: number;
  /** Items of this shipment already returned (a partial return keeps the shipment DELIVERED). */
  returnedItemCount: number;
  readyForPickupAt?: Date;
  /** Ready and not yet collected. */
  waitingForPickup: boolean;
  /** Store name of the seller fulfilling this shipment. */
  sellerName?: string;
  /** Recorded tracking events (customer, seller, admin). */
  timeline?: TimelineEvent[];
  /** Admin only. Internal intent; never means a provider accepted anything. */
  bookingIntent?: { state: string; createdAt?: Date; cancelledAt?: Date; attempts?: number; lastError?: string; providerContacted: false | "POSSIBLY" | true };
  /** Admin only. Plain description of where booking stands. */
  bookingStage?: BookingStage;
  /** Admin only: an inconsistency a sync could not apply. */
  attention?: { reason: string; at: Date };
  /** false for legacy orders, whose shipments are computed, not stored. */
  persisted: boolean;
  deliveryProvider?: string;
  statusChangedAt?: Date;
  history?: Array<{ status: ShipmentStatus; at: Date; source: ShipmentEventSource }>;
}

/**
 * Shipments of an order for one audience. Sellers only ever see their own
 * shipment; provider and history are admin-only. POS sales have none.
 */
export async function getOrderShipments(order: any, options: { audience: ShipmentAudience; sellerId?: string }): Promise<ShipmentView[]> {
  if (!order || order.orderChannel === "OFFLINE") return [];
  const items = await OrderItem.find({ order: order._id }).select("seller status fulfillmentStatus").lean();
  const groups = bySeller(items);
  const onlySeller = options.audience === "seller" ? String(options.sellerId || "") : undefined;
  if (options.audience === "seller" && !onlySeller) return [];
  const admin = options.audience === "admin";
  const withTimeline = options.audience !== "courier";
  const countLive = (sellerId: string) => (groups.get(sellerId) || []).filter((item: any) => item.status !== "Cancelled").length;
  const countReturned = (sellerId: string) => (groups.get(sellerId) || []).filter((item: any) => item.status === "Returned").length;

  let views: ShipmentView[];
  if (order.shipmentsCreated) {
    const stored = await Shipment.find({ order: order._id, ...(onlySeller ? { seller: onlySeller } : {}) }).sort({ shipmentNumber: 1 }).lean();
    views = stored.map((shipment: any) => ({
      id: String(shipment._id),
      shipmentNumber: shipment.shipmentNumber,
      seller: String(shipment.seller),
      status: shipment.status,
      statusLabel: SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus],
      itemCount: countLive(String(shipment.seller)),
      returnedItemCount: countReturned(String(shipment.seller)),
      readyForPickupAt: shipment.readyForPickupAt,
      waitingForPickup: shipment.status === "READY_FOR_PICKUP",
      persisted: true,
      statusChangedAt: shipment.statusChangedAt,
      ...(externalView(shipment, options.audience) ? { external: externalView(shipment, options.audience) } : {}),
      ...(withTimeline ? { timeline: buildShipmentTimeline({ order, sellerId: String(shipment.seller), status: shipment.status,
        history: shipment.history, readyForPickupAt: shipment.readyForPickupAt,
        external: shipment.deliveryProvider !== "IN_HOUSE", rto: shipment.adloggs?.rto }) } : {}),
      ...(admin ? {
        deliveryProvider: shipment.deliveryProvider,
        history: shipment.history,
        bookingStage: describeBookingStage(shipment),
        ...(shipment.bookingIntent ? { bookingIntent: publicBookingIntent(shipment.bookingIntent) } : {}),
        ...(shipment.attention ? { attention: shipment.attention } : {}),
      } : {}),
    }));
  } else {
    // Legacy order: synthesise read-only shipments from the same rules. Nothing
    // is written; events without a recorded time are shown as unavailable.
    views = [...groups.entries()]
      .filter(([sellerId]) => !onlySeller || sellerId === onlySeller)
      .map(([sellerId, sellerItems]) => {
        const status = deriveShipmentStatus(sellerItems, order, sellerId);
        return {
          seller: sellerId,
          status,
          statusLabel: SHIPMENT_STATUS_LABELS[status],
          itemCount: sellerItems.filter((item: any) => item.status !== "Cancelled").length,
          returnedItemCount: sellerItems.filter((item: any) => item.status === "Returned").length,
          waitingForPickup: false,
          persisted: false,
          ...(withTimeline ? { timeline: buildShipmentTimeline({ order, sellerId, status }) } : {}),
          ...(admin ? { deliveryProvider: orderDeliveryProvider(order), bookingStage: "NOT_APPLICABLE" as BookingStage } : {}),
        };
      });
  }

  // Store names (already public on product pages) so customers can tell shipments apart.
  if (views.length) {
    const sellers = await Seller.find({ _id: { $in: [...new Set(views.map(view => view.seller))] } }).select("storeName").lean();
    const names = new Map(sellers.map((seller: any) => [String(seller._id), seller.storeName as string]));
    for (const view of views) view.sellerName = names.get(view.seller);
  }
  return views;
}

/** Admin view of an intent: lease token omitted; provider contact stated honestly. */
function publicBookingIntent(intent: any) {
  const { leaseToken: _token, ...rest } = intent;
  const providerContacted = intent.state === "BOOKED" ? true : ["SUBMITTING", "OUTCOME_UNKNOWN"].includes(intent.state) ? "POSSIBLY" : false;
  return { ...rest, providerContacted };
}

export type TimelineEventType =
  | "ORDER_PLACED" | "SELLER_ACCEPTED" | "READY_FOR_PICKUP" | "PICKED_UP" | "DELIVERED" | "RETURNED"
  | "RETURN_TO_ORIGIN_STARTED" | "RETURNED_TO_ORIGIN" | "CANCELLED";

export interface TimelineEvent {
  type: TimelineEventType;
  label: string;
  /** When it happened, or null when the platform never recorded the time. */
  at: Date | null;
  timestampAvailable: boolean;
}

const TIMELINE_ORDER: TimelineEventType[] = [
  "ORDER_PLACED", "SELLER_ACCEPTED", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERED", "RETURNED",
  "RETURN_TO_ORIGIN_STARTED", "RETURNED_TO_ORIGIN", "CANCELLED",
];
const TIMELINE_LABELS: Record<TimelineEventType, string> = {
  ORDER_PLACED: "Order placed",
  SELLER_ACCEPTED: "Seller accepted and is preparing",
  READY_FOR_PICKUP: "Seller confirmed ready for pickup",
  PICKED_UP: "Collected by courier",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  RETURN_TO_ORIGIN_STARTED: "Delivery failed; returning to store",
  RETURNED_TO_ORIGIN: "Returned to store",
  CANCELLED: "Cancelled",
};

/**
 * Seller shipment timeline built only from recorded facts:
 *  - order placement             Order.createdAt
 *  - seller accepted             shipment history (PREPARING); time unavailable on older orders
 *  - ready for pickup            explicit seller confirmation (readyForPickupAt)
 *  - collected                   courier-confirmed Order.sellerPickups only (never the seller's "Shipped")
 *  - delivered                   shipment history, else Order.deliveredAt
 *  - returned / cancelled        shipment history, else the order's own timestamp when it applies to the whole order
 * One event per type (duplicates suppressed), in lifecycle order. No ETA,
 * location, route, provider or tracking-number data exists here.
 */
export function buildShipmentTimeline(input: {
  order: any; sellerId: string; status: ShipmentStatus;
  history?: Array<{ status: string; at: Date }>; readyForPickupAt?: Date;
  /** External provider shipment: pickup/delivery come from verified provider events in the history. */
  external?: boolean;
  rto?: { state?: string; initiatedAt?: Date; completedAt?: Date };
}): TimelineEvent[] {
  const { order, sellerId, status } = input;
  const events = new Map<TimelineEventType, TimelineEvent>();
  const add = (type: TimelineEventType, at: Date | null | undefined) => {
    if (events.has(type)) return;
    events.set(type, { type, label: TIMELINE_LABELS[type], at: at ? new Date(at) : null, timestampAvailable: !!at });
  };
  const historyAt = (wanted: string) => input.history?.find(entry => entry.status === wanted)?.at;
  const cancelled = status === "CANCELLED";

  add("ORDER_PLACED", order?.createdAt);
  const acceptedAt = historyAt("PREPARING");
  if (acceptedAt || (!cancelled && status !== "CREATED")) add("SELLER_ACCEPTED", acceptedAt);
  if (input.readyForPickupAt) add("READY_FOR_PICKUP", input.readyForPickupAt);
  const pickup = order?.sellerPickups?.find((entry: any) => String(entry.seller) === sellerId && entry.pickedUpAt);
  if (pickup) add("PICKED_UP", pickup.pickedUpAt);
  // External shipments: pickup only from a verified provider event recorded in the history.
  else if (input.external && historyAt("PICKED_UP")) add("PICKED_UP", historyAt("PICKED_UP"));
  if (status === "DELIVERED" || status === "RETURNED") add("DELIVERED", historyAt("DELIVERED") ?? (input.external ? undefined : order?.deliveredAt));
  if (status === "RETURNED") add("RETURNED", historyAt("RETURNED"));
  if (input.rto?.state) add("RETURN_TO_ORIGIN_STARTED", input.rto.initiatedAt);
  if (status === "RETURNED_TO_ORIGIN") add("RETURNED_TO_ORIGIN", historyAt("RETURNED_TO_ORIGIN") ?? input.rto?.completedAt);
  if (cancelled) add("CANCELLED", historyAt("CANCELLED") ?? (["Cancelled", "Rejected"].includes(order?.status) ? order?.cancelledAt : undefined));
  return [...events.values()].sort((a, b) => TIMELINE_ORDER.indexOf(a.type) - TIMELINE_ORDER.indexOf(b.type));
}

export type ShipmentSummaryState =
  | "NONE" | "PENDING" | "IN_PROGRESS" | "PARTIALLY_DELIVERED" | "DELIVERED" | "RETURNED" | "RETURNED_TO_ORIGIN" | "CANCELLED";

export interface ShipmentSummary {
  state: ShipmentSummaryState;
  total: number;
  active: number;
  cancelled: number;
  delivered: number;
  counts: Partial<Record<ShipmentStatus, number>>;
  /** Some sellers' shipments were cancelled while others continue/finished. */
  partiallyCancelled: boolean;
}

/**
 * Read-only roll-up of an order's shipments. Never writes the order and never
 * drives settlement: an order is DELIVERED only when every non-cancelled
 * shipment is delivered (or returned afterwards).
 */
export function summarizeShipments(shipments: Array<{ status: ShipmentStatus }>): ShipmentSummary {
  const counts: Partial<Record<ShipmentStatus, number>> = {};
  for (const shipment of shipments) counts[shipment.status] = (counts[shipment.status] || 0) + 1;
  const total = shipments.length;
  const cancelled = counts.CANCELLED || 0;
  const live = shipments.filter(shipment => shipment.status !== "CANCELLED");
  // A return-to-origin was never delivered to the customer.
  const rto = live.filter(shipment => shipment.status === "RETURNED_TO_ORIGIN").length;
  const delivered = live.filter(shipment => shipment.status === "DELIVERED" || shipment.status === "RETURNED").length;
  let state: ShipmentSummaryState;
  if (!total) state = "NONE";
  else if (!live.length) state = "CANCELLED";
  else if (rto === live.length) state = "RETURNED_TO_ORIGIN";
  else if (live.every(shipment => shipment.status === "RETURNED")) state = "RETURNED";
  else if (delivered === live.length) state = "DELIVERED";
  else if (delivered > 0) state = "PARTIALLY_DELIVERED";
  else if (rto > 0 && live.every(shipment => shipment.status === "RETURNED_TO_ORIGIN" || shipment.status === "PICKED_UP")) state = "IN_PROGRESS";
  else if (live.every(shipment => shipment.status === "CREATED")) state = "PENDING";
  else state = "IN_PROGRESS";
  return { state, total, active: live.length - delivered, cancelled, delivered, counts, partiallyCancelled: cancelled > 0 && live.length > 0 };
}
