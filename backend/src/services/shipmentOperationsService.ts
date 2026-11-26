import mongoose from "mongoose";
import Shipment from "../models/Shipment";
import Order from "../models/Order";
import ShipmentReconciliation from "../models/ShipmentReconciliation";
import { SHIPMENT_STATUS_LABELS } from "./shipmentService";
import { describeBookingStage } from "./bookingIntentService";
import { providerReadinessFrom } from "./deliveryProviderService";
import AppSettings from "../models/AppSettings";
import { ADLOGGS_STATUS_LABELS } from "./adloggs/adloggsStatus";

/** false = never sent; "POSSIBLY" = a request may have reached the provider; true = verified booking. */
export function providerContactState(state?: string): false | "POSSIBLY" | true {
  if (state === "BOOKED") return true;
  if (state === "SUBMITTING" || state === "OUTCOME_UNKNOWN") return "POSSIBLY";
  return false;
}

/**
 * Admin shipment operations (Phase 5): read-only monitoring over stored
 * shipments (orders placed since Phase 3A). No status overrides, no booking
 * actions, no courier assignment. The only action is the existing idempotent
 * shipment reconciliation, exposed by the controller.
 */

export const SHIPMENT_FILTERS = [
  "all", "preparing", "ready", "picked_up", "delivered", "cancelled", "returned", "awaiting_booking", "attention",
  "booking_in_flight", "booking_unknown", "booking_confirmed", "cancellation_pending", "return_to_origin",
] as const;
export type ShipmentFilter = (typeof SHIPMENT_FILTERS)[number];
export const MAX_PAGE_SIZE = 100;
const SYNC_PENDING_SCAN_LIMIT = 500;

export class ShipmentOperationsError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); }
}

export function parseListQuery(query: any): { filter: ShipmentFilter; page: number; limit: number } {
  const filter = (query.filter ?? "all") as ShipmentFilter;
  if (!SHIPMENT_FILTERS.includes(filter)) throw new ShipmentOperationsError(`Unknown filter. Valid filters: ${SHIPMENT_FILTERS.join(", ")}.`);
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new ShipmentOperationsError("page must be a whole number from 1 to 10000.");
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new ShipmentOperationsError(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}.`);
  return { filter, page, limit };
}

async function syncPendingOrderIds(): Promise<mongoose.Types.ObjectId[]> {
  return Order.find({ shipmentSyncPending: true }).select("_id").limit(SYNC_PENDING_SCAN_LIMIT).lean()
    .then(rows => rows.map((row: any) => row._id));
}

async function filterQuery(filter: ShipmentFilter): Promise<Record<string, unknown>> {
  switch (filter) {
    case "preparing": return { status: { $in: ["CREATED", "PREPARING"] } };
    case "ready": return { status: "READY_FOR_PICKUP" };
    case "picked_up": return { status: "PICKED_UP" };
    case "delivered": return { status: "DELIVERED" };
    case "cancelled": return { status: "CANCELLED" };
    case "returned": return { status: "RETURNED" };
    case "awaiting_booking": return { "bookingIntent.state": { $in: ["PENDING", "CLAIMED", "RETRYABLE_FAILURE"] } };
    case "attention": return { $or: [
      { "attention.at": { $exists: true } },
      { "bookingIntent.state": "FAILED" },
      { order: { $in: await syncPendingOrderIds() } },
      { "bookingIntent.state": "OUTCOME_UNKNOWN" },
      { "adloggs.cancellation.state": { $in: ["REJECTED", "UNKNOWN"] } },
    ] };
    case "booking_in_flight": return { "bookingIntent.state": "SUBMITTING" };
    case "booking_unknown": return { "bookingIntent.state": "OUTCOME_UNKNOWN" };
    case "booking_confirmed": return { "bookingIntent.state": "BOOKED" };
    case "cancellation_pending": return { $or: [
      { "adloggs.cancellation.state": { $in: ["REQUESTED", "IN_PROGRESS", "UNKNOWN", "REJECTED"] } },
      { "adloggs.pendingLocalCancellation.state": { $in: ["AWAITING_PROVIDER", "BLOCKED"] } },
      { "adloggs.providerStatus": "CANCELLED", status: { $ne: "CANCELLED" } },
    ] };
    case "return_to_origin": return { $or: [{ status: "RETURNED_TO_ORIGIN" }, { "adloggs.rto.state": { $exists: true } }] };
    default: return {};
  }
}

export type OperationalState =
  | "WAITING_FOR_SELLER"
  | "WAITING_FOR_PICKUP"
  | "WAITING_FOR_BOOKING_INTEGRATION"
  | "IN_TRANSIT"
  | "COMPLETED"
  | "CANCELLED"
  | "INTERNAL_SYNC_ISSUE"
  | "OPERATIONAL_FAILURE"
  | "BOOKING_REQUEST_IN_PROGRESS"
  | "BOOKING_OUTCOME_UNKNOWN"
  | "BOOKING_CONFIRMED"
  | "RIDER_ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "CANCELLATION_PENDING"
  | "RETURN_TO_ORIGIN";

/**
 * One plain state per shipment, in priority order. Only an evidenced internal
 * failure (FAILED booking preparation) is a failure; a pending intent with no
 * provider integration is "waiting", never "failed".
 */
export function classifyShipment(shipment: any, orderSyncPending: boolean): OperationalState {
  // An unknown external booking outcome blocks rebooking: always shown first.
  if (shipment.bookingIntent?.state === "OUTCOME_UNKNOWN") return "BOOKING_OUTCOME_UNKNOWN";
  if (["REQUESTED", "IN_PROGRESS"].includes(shipment.adloggs?.cancellation?.state)) return "CANCELLATION_PENDING";
  if (shipment.status === "RETURNED_TO_ORIGIN" || shipment.adloggs?.rto?.state) return "RETURN_TO_ORIGIN";
  if (shipment.attention || orderSyncPending) return "INTERNAL_SYNC_ISSUE";
  if (shipment.bookingIntent?.state === "FAILED") return "OPERATIONAL_FAILURE";
  if (shipment.bookingIntent?.state === "SUBMITTING") return "BOOKING_REQUEST_IN_PROGRESS";
  const provider = shipment.adloggs?.providerStatus;
  if (shipment.status === "READY_FOR_PICKUP" && shipment.bookingIntent?.state === "BOOKED") {
    return provider === "ASSIGNED" || provider === "ARRIVED_AT_PICKUP" ? "RIDER_ASSIGNED" : "BOOKING_CONFIRMED";
  }
  if (shipment.status === "PICKED_UP" && (provider === "OUT_FOR_DELIVERY" || provider === "ARRIVED_AT_DELIVERY")) return "OUT_FOR_DELIVERY";
  switch (shipment.status) {
    case "CREATED": case "PREPARING": return "WAITING_FOR_SELLER";
    case "READY_FOR_PICKUP":
      return shipment.deliveryProvider !== "IN_HOUSE" && shipment.bookingIntent && shipment.bookingIntent.state !== "CANCELLED"
        ? "WAITING_FOR_BOOKING_INTEGRATION" : "WAITING_FOR_PICKUP";
    case "PICKED_UP": return "IN_TRANSIT";
    case "DELIVERED": case "RETURNED": return "COMPLETED";
    case "RETURNED_TO_ORIGIN": return "RETURN_TO_ORIGIN";
    default: return "CANCELLED";
  }
}

export async function listShipments(options: { filter: ShipmentFilter; page: number; limit: number }) {
  const query = await filterQuery(options.filter);
  const [rows, total] = await Promise.all([
    Shipment.find(query).sort({ createdAt: -1 }).skip((options.page - 1) * options.limit).limit(options.limit)
      .populate("order", "orderNumber status shipmentSyncPending deliveryBoy deliveredAt")
      .populate("seller", "storeName").lean(),
    Shipment.countDocuments(query),
  ]);
  const external = rows.filter((row: any) => row.deliveryProvider !== "IN_HOUSE").map((row: any) => row._id);
  const costs = external.length
    ? new Map((await ShipmentReconciliation.find({ shipment: { $in: external } }).select("shipment estimatedProviderCost providerBookingFee").lean())
      .map((record: any) => [String(record.shipment), record]))
    : new Map();
  const data = rows.map((shipment: any) => {
    const order = shipment.order && typeof shipment.order === "object" ? shipment.order : null;
    const historyAt = (status: string) => shipment.history?.find((entry: any) => entry.status === status)?.at ?? null;
    const syncPending = !!order?.shipmentSyncPending;
    return {
      id: String(shipment._id),
      shipmentNumber: shipment.shipmentNumber,
      order: order ? { id: String(order._id), orderNumber: order.orderNumber, status: order.status } : null,
      seller: shipment.seller && typeof shipment.seller === "object"
        ? { id: String(shipment.seller._id), storeName: shipment.seller.storeName } : { id: String(shipment.seller) },
      deliveryProvider: shipment.deliveryProvider,
      status: shipment.status,
      statusLabel: SHIPMENT_STATUS_LABELS[shipment.status as keyof typeof SHIPMENT_STATUS_LABELS],
      readyForPickupAt: shipment.readyForPickupAt ?? null,
      pickedUpAt: historyAt("PICKED_UP"),
      deliveredAt: historyAt("DELIVERED"),
      bookingStage: describeBookingStage(shipment),
      bookingIntent: shipment.bookingIntent ? {
        state: shipment.bookingIntent.state, attempts: shipment.bookingIntent.attempts ?? 0,
        lastError: shipment.bookingIntent.lastError ?? null, providerContacted: providerContactState(shipment.bookingIntent.state),
      } : null,
      external: shipment.deliveryProvider === "IN_HOUSE" ? null : {
        orderUuid: shipment.adloggs?.orderUuid ?? null,
        partnerOrderId: shipment.adloggs?.partnerOrderId ?? null,
        providerStatus: shipment.adloggs?.providerStatus ?? null,
        providerStatusLabel: shipment.adloggs?.providerStatus ? ADLOGGS_STATUS_LABELS[shipment.adloggs.providerStatus as keyof typeof ADLOGGS_STATUS_LABELS] : null,
        lastStatusSyncAt: shipment.adloggs?.lastStatusSyncAt ?? null,
        riderName: shipment.adloggs?.riderName ?? null,
        cancellation: shipment.adloggs?.cancellation?.state ?? null,
        returnToOrigin: shipment.adloggs?.rto?.state ?? null,
        outcomeUnknown: shipment.bookingIntent?.state === "OUTCOME_UNKNOWN",
        rebookRequested: Boolean(shipment.adloggs?.rebookRequest),
        cancellationRequest: shipment.adloggs?.pendingLocalCancellation?.state ?? null,
        rtoResolution: shipment.adloggs?.rto?.resolution?.state ?? null,
        rtoVerified: shipment.status === "RETURNED_TO_ORIGIN" && shipment.adloggs?.providerStatus === "RTO_DELIVERED",
        cancellationBlockedReason: shipment.adloggs?.pendingLocalCancellation?.blockedReason ?? null,
        providerCancelledUnhandled: shipment.adloggs?.providerStatus === "CANCELLED" && shipment.status !== "CANCELLED"
          && shipment.adloggs?.pendingLocalCancellation?.state !== "AWAITING_PROVIDER",
        correlationSource: shipment.adloggs?.correlation?.source ?? null,
        estimatedProviderCost: costs.get(String(shipment._id))?.estimatedProviderCost ?? null,
        providerBookingFee: costs.get(String(shipment._id))?.providerBookingFee ?? null,
      },
      attention: shipment.attention ?? null,
      syncPending,
      missingOrder: !order,
      operationalState: classifyShipment(shipment, syncPending),
      createdAt: shipment.createdAt,
    };
  });
  return { data, pagination: { page: options.page, limit: options.limit, total, pages: Math.ceil(total / options.limit) } };
}

/**
 * Exception counts. `missingShipments` checks only the last 30 days of
 * orders that should have shipment records, to keep the scan bounded.
 */
export async function getShipmentExceptions(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const settings = await AppSettings.findOne({}).select("inHouseDelivery.enabled deliveryProvider").lean();
  const addlogs = providerReadinessFrom(settings).find(provider => provider.id === "ADDLOGS")!;
  const [attention, bookingAwaitingIntegration, bookingInProgress, bookingRetrying, bookingFailed, bookingCancelled,
    readyWaitingPickup, syncPendingOrders, missing] = await Promise.all([
    Shipment.countDocuments({ "attention.at": { $exists: true } }),
    Shipment.countDocuments({ "bookingIntent.state": "PENDING" }),
    Shipment.countDocuments({ "bookingIntent.state": "CLAIMED" }),
    Shipment.countDocuments({ "bookingIntent.state": "RETRYABLE_FAILURE" }),
    Shipment.countDocuments({ "bookingIntent.state": "FAILED" }),
    Shipment.countDocuments({ "bookingIntent.state": "CANCELLED" }),
    Shipment.countDocuments({ status: "READY_FOR_PICKUP" }),
    Order.countDocuments({ shipmentSyncPending: true }),
    Order.aggregate([
      { $match: { shipmentsCreated: true, createdAt: { $gte: since } } },
      { $lookup: { from: Shipment.collection.name, localField: "_id", foreignField: "order", as: "shipments", pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }] } },
      { $match: { shipments: { $size: 0 } } },
      { $count: "count" },
    ]),
  ]);
  return {
    attention,
    syncPendingOrders,
    missingShipments: { count: missing[0]?.count ?? 0, windowDays: 30 },
    readyWaitingPickup,
    booking: {
      awaitingIntegration: bookingAwaitingIntegration,
      attemptInProgress: bookingInProgress,
      retrying: bookingRetrying,
      failed: bookingFailed,
      cancelled: bookingCancelled,
      // Honest context for the pending count: no provider is integrated.
      integrationAvailable: addlogs.operational,
      integrationNote: addlogs.reason,
    },
  };
}

/**
 * Admin-only reconciliation view for one shipment. Customer delivery charge is
 * read from the order (authoritative, order-level) and labelled as such;
 * provider amounts are null until a provider reports them. No margin is
 * computed from unknown values.
 */
export async function getShipmentReconciliation(shipmentId: string) {
  if (!mongoose.Types.ObjectId.isValid(shipmentId)) throw new ShipmentOperationsError("Invalid shipment id.");
  const shipment: any = await Shipment.findById(shipmentId).select("order seller deliveryProvider shipmentNumber status").lean();
  if (!shipment) throw new ShipmentOperationsError("Shipment not found.", 404);
  const [order, record]: any[] = await Promise.all([
    Order.findById(shipment.order).select("orderNumber shipping isFreeDelivery paymentMethod").lean(),
    ShipmentReconciliation.findOne({ shipment: shipment._id }).lean(),
  ]);
  const inHouse = shipment.deliveryProvider === "IN_HOUSE";
  return {
    shipment: { id: String(shipment._id), shipmentNumber: shipment.shipmentNumber, status: shipment.status, deliveryProvider: shipment.deliveryProvider },
    customerDeliveryCharge: order ? {
      amount: order.shipping ?? 0, currency: "INR", scope: "ORDER",
      note: "Charged once per customer order; not allocated to individual seller shipments.",
    } : null,
    applicability: inHouse ? "NOT_APPLICABLE_IN_HOUSE" : record ? "TRACKED" : "NOT_YET_ELIGIBLE",
    note: inHouse
      ? "In-house delivery costs are the existing courier earnings and settlements; no provider reconciliation applies."
      : record ? "Provider amounts are unknown until the provider reports them. No payable or settlement has been created."
        : "A record is created when the seller confirms readiness for an external-provider shipment.",
    record: record ? {
      currency: record.currency,
      estimatedProviderCost: record.estimatedProviderCost ?? null, // serviceability estimate — not a charge
      providerBookingFee: record.providerBookingFee ?? null,       // fee reported at booking — not a final invoice
      providerDistanceKm: record.providerDistanceKm ?? null,
      providerCost: record.providerCost ?? null,                   // final invoiced cost — unknown until invoiced
      providerRtoCharge: record.providerRtoCharge ?? null,         // verified RTO charge — unknown until reported
      costBearer: record.costBearer ?? "PLATFORM",                 // Hello Local bears provider costs (approved policy)
      providerAdjustment: record.providerAdjustment ?? null,
      providerCredit: record.providerCredit ?? null,
      providerSettlementReference: record.providerSettlementReference ?? null,
      status: record.status,
      events: record.events,
      createdAt: record.createdAt,
    } : null,
  };
}
