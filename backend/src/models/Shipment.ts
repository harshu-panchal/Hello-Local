import mongoose, { Document, Schema } from "mongoose";

/**
 * Internal seller shipment (Phase 3A).
 *
 * One record per seller per online customer order, created inside the same
 * transaction as the order. It represents that seller's part of fulfilment;
 * it does not dispatch couriers, carry prices or hold provider payloads.
 *
 * `status` is derived from the existing authoritative data (the seller's
 * OrderItems and the order's sellerPickups) and synchronised inside the same
 * transaction as every lifecycle change, so it can never disagree with them.
 */
export const SHIPMENT_STATUSES = [
  "CREATED",           // order placed; seller has not accepted yet
  "PREPARING",         // seller accepted; preparing or prepared, not yet confirmed ready
  "READY_FOR_PICKUP",  // seller prepared AND explicitly confirmed ready for pickup (Phase 4)
  "PICKED_UP",         // courier confirmed pickup from this seller
  "DELIVERED",         // delivered to the customer
  "RETURNED",          // delivered, then returned
  "CANCELLED",         // all of this seller's items were cancelled
  "RETURNED_TO_ORIGIN", // external provider returned it to the seller (RTO); never delivered to the customer
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** "provider" = a verified external delivery-provider event (Adloggs). */
export type ShipmentEventSource = "system" | "seller" | "delivery" | "admin" | "customer" | "provider";

/**
 * Booking-intent states.
 *  - PENDING            eligible; no attempt has been made
 *  - CLAIMED            a worker holds a bounded lease; the request has NOT been sent
 *  - SUBMITTING         the create request may have been sent (persisted BEFORE sending)
 *  - OUTCOME_UNKNOWN    the request may have reached the provider but no verified
 *                       answer was recorded; never retried automatically
 *  - BOOKED             a verified provider success response (order_uuid) was persisted
 *  - RETRYABLE_FAILURE  definitively not booked; may be retried later
 *  - FAILED             definitively not booked; needs an admin
 *  - CANCELLED          the shipment was cancelled before any request was sent
 */
export const BOOKING_INTENT_STATES = [
  "PENDING", "CLAIMED", "SUBMITTING", "OUTCOME_UNKNOWN", "BOOKED", "RETRYABLE_FAILURE", "FAILED", "CANCELLED",
] as const;
export type BookingIntentState = (typeof BOOKING_INTENT_STATES)[number];

export interface IBookingIntent {
  state: BookingIntentState;
  createdAt: Date;
  updatedAt?: Date;
  cancelledAt?: Date;
  attempts?: number;
  leaseToken?: string;
  leaseUntil?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  submittedAt?: Date;
}

/** Adloggs provider statuses (official order_status_id values, Adloggs API doc V2). */
export const ADLOGGS_PROVIDER_STATUSES = [
  "PENDING", "ASSIGNED", "ARRIVED_AT_PICKUP", "PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED_AT_DELIVERY",
  "DELIVERED", "CANCELLED", "RETURN_INITIATED", "RTO_DELIVERED",
] as const;
export type AdloggsProviderStatus = (typeof ADLOGGS_PROVIDER_STATUSES)[number];

export const ADLOGGS_CANCELLATION_STATES = ["REQUESTED", "IN_PROGRESS", "CONFIRMED", "REJECTED", "UNKNOWN"] as const;
export type AdloggsCancellationState = (typeof ADLOGGS_CANCELLATION_STATES)[number];

/**
 * Adloggs-specific facts for one seller shipment. Only verified provider data
 * is stored: no OTPs, no rider phone or location, no customer contact data.
 */
export interface IShipmentAdloggs {
  /** Stable identifier sent as partner_order_id; set once, reused on every attempt. */
  partnerOrderId?: string;
  /** Provider order identifier from a verified create response (or admin-verified lookup). */
  orderUuid?: string;
  /** Provider tracking page, stored only if it is an approved Adloggs HTTPS URL. */
  trackUrl?: string;
  bookedAt?: Date;
  /** True when the uuid arrived after the local intent had moved on (e.g. cancelled). */
  lateBookingEvidence?: boolean;
  providerStatus?: AdloggsProviderStatus;
  providerStatusCode?: number;
  /** When Hello Local RECEIVED the latest provider status (the provider sends no event time). */
  providerStatusReceivedAt?: Date;
  riderName?: string;
  statusEvents?: Array<{ status: AdloggsProviderStatus; code: number; receivedAt: Date; source: "WEBHOOK" | "POLL" }>;
  lastStatusSyncAt?: Date;
  nextStatusPollAt?: Date;
  statusPollFailures?: number;
  pollLeaseToken?: string;
  pollLeaseUntil?: Date;
  /** Pickup data frozen when the booking was first prepared, reused on retries. */
  pickupSnapshot?: { contactName: string; address: string; city: string; state: string; pincode: string; lat: number; lng: number; category: string; weightKg: number };
  /** Local cancellation happened while a booking outcome was pending. */
  cancellationRequired?: boolean;
  cancellation?: {
    state: AdloggsCancellationState; reason?: string; requestedAt: Date; attempts?: number;
    leaseToken?: string; leaseUntil?: Date; nextAttemptAt?: Date; lastError?: string; resolvedAt?: Date;
  };
  rto?: {
    state: "INITIATED" | "COMPLETED"; initiatedAt?: Date; completedAt?: Date;
    /**
     * Operational resolution of a VERIFIED return to origin (RTO_DELIVERED). PENDING_DECISION
     * is set automatically and escalated if left open; REFUNDED = items cancelled, refund queued.
     */
    resolution?: { state: "PENDING_DECISION" | "REFUNDED"; since: Date; decidedAt?: Date; adminId?: mongoose.Types.ObjectId; restocked?: boolean; escalatedAt?: Date };
  };
  adminActions?: Array<{ action: string; at: Date; adminId?: mongoose.Types.ObjectId; note?: string; evidence?: string; outcome?: string }>;
  /** A create response that DID correlate (same partner_order_id) but could not be saved as BOOKED. */
  createEvidence?: { orderUuid: string; partnerOrderId: string; at: Date };
  /** Provider orders seen for this shipment that did NOT correlate; never treated as this shipment's order. */
  foreignOrderEvidence?: Array<{ orderUuid: string; partnerOrderId?: string; reason: string; at: Date }>;
  /** How the current orderUuid was proven to belong to this shipment. */
  correlation?: { source: "CREATE_RESPONSE" | "STATUS_RESPONSE" | "AUTHENTICATED_WEBHOOK"; verifiedAt: Date; adminId?: mongoose.Types.ObjectId };
  /** partner_order_ids retired by an approved rebooking (late events for them are flagged, never applied). */
  previousPartnerOrderIds?: string[];
  /** First half of the dual-control rebooking approval. */
  rebookRequest?: { adminId: mongoose.Types.ObjectId; reason: string; providerReference: string; at: Date };
  /**
   * A local cancellation (and its refund) waiting for VERIFIED provider
   * cancellation. Items stay active and nothing is refunded until then.
   */
  pendingLocalCancellation?: {
    state: PendingLocalCancellationState; requestedBy: string; userId?: string; reason?: string; status: "Cancelled" | "Rejected";
    requestedAt: Date; completedAt?: Date; blockedReason?: string;
    /** Set once when the request waited too long and was escalated to admins. */
    escalatedAt?: Date;
  };
  /**
   * Hello Local-generated 4-digit codes sent to Adloggs with the booking (Adloggs:
   * "we create the OTPs and send them"). Shown only to the party who must give
   * them to the rider: delivery -> customer, pickup/return -> seller.
   */
  otps?: { pickup: string; delivery: string; return: string; createdAt: Date };
  /** COD only: the amount sent as collectible_amount for this shipment (fixed at booking). */
  codCollectibleAmount?: number;
  /** Provider orders cancelled by Adloggs and replaced by an admin-approved rebooking. */
  supersededOrders?: Array<{ orderUuid: string; partnerOrderId?: string; reason?: string; at: Date }>;
  /**
   * Permanent record of every RETIRED booking attempt: which partner_order_id was used,
   * the provider order it produced (if any), why it was retired, when and by whom.
   */
  attemptHistory?: Array<{ partnerOrderId: string; orderUuid?: string; outcome: string; retiredAt: Date;
    adminId?: mongoose.Types.ObjectId; approvedBy?: mongoose.Types.ObjectId; providerReference?: string }>;
}

export const PENDING_LOCAL_CANCELLATION_STATES = ["AWAITING_PROVIDER", "COMPLETED", "BLOCKED", "WITHDRAWN"] as const;
export type PendingLocalCancellationState = (typeof PENDING_LOCAL_CANCELLATION_STATES)[number];

export interface IShipment extends Document {
  order: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;
  deliveryProvider: "IN_HOUSE" | "ADDLOGS";
  shipmentNumber: string;
  status: ShipmentStatus;
  statusChangedAt: Date;
  history: Array<{ status: ShipmentStatus; at: Date; source: ShipmentEventSource }>;
  /** Seller's explicit "ready for pickup" confirmation (Phase 4). Set once; never cleared. */
  readyForPickupAt?: Date;
  readyBy?: mongoose.Types.ObjectId;
  /**
   * Internal record that this shipment is eligible for an external booking.
   * Created only for non-in-house shipments once the seller confirms
   * readiness. PENDING means NO provider has been contacted; no booking
   * worker exists yet.
   */
  bookingIntent?: IBookingIntent;
  /** Set when a lifecycle sync found an inconsistency an admin should look at. */
  attention?: { reason: string; at: Date };
  /** External delivery (Adloggs) facts; absent for in-house shipments. */
  adloggs?: IShipmentAdloggs;
  createdAt: Date;
  updatedAt: Date;
}

const ShipmentSchema = new Schema<IShipment>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    // Copied from the parent order when created; never re-read from the global setting.
    deliveryProvider: { type: String, enum: ["IN_HOUSE", "ADDLOGS"], required: true },
    shipmentNumber: { type: String, required: true, trim: true },
    status: { type: String, enum: SHIPMENT_STATUSES, default: "CREATED", required: true },
    statusChangedAt: { type: Date, default: Date.now },
    history: [
      {
        _id: false,
        status: { type: String, enum: SHIPMENT_STATUSES, required: true },
        at: { type: Date, required: true },
        source: { type: String, enum: ["system", "seller", "delivery", "admin", "customer", "provider"], required: true },
      },
    ],
    readyForPickupAt: { type: Date },
    readyBy: { type: Schema.Types.ObjectId, ref: "Seller" },
    bookingIntent: {
      type: new Schema({
        state: { type: String, enum: BOOKING_INTENT_STATES, required: true },
        createdAt: { type: Date, required: true },
        updatedAt: { type: Date },
        cancelledAt: { type: Date },
        attempts: { type: Number, default: 0, min: 0 },
        leaseToken: { type: String },
        leaseUntil: { type: Date },
        nextAttemptAt: { type: Date },
        lastError: { type: String, trim: true, maxlength: 500 },
        submittedAt: { type: Date },
      }, { _id: false }),
      default: undefined,
    },
    adloggs: {
      type: new Schema({
        partnerOrderId: { type: String, trim: true, maxlength: 100 },
        orderUuid: { type: String, trim: true, maxlength: 200 },
        trackUrl: { type: String, trim: true, maxlength: 500 },
        bookedAt: { type: Date },
        lateBookingEvidence: { type: Boolean },
        providerStatus: { type: String, enum: ADLOGGS_PROVIDER_STATUSES },
        providerStatusCode: { type: Number },
        providerStatusReceivedAt: { type: Date },
        riderName: { type: String, trim: true, maxlength: 120 },
        statusEvents: [{ _id: false, status: { type: String, enum: ADLOGGS_PROVIDER_STATUSES, required: true },
          code: { type: Number, required: true }, receivedAt: { type: Date, required: true },
          source: { type: String, enum: ["WEBHOOK", "POLL"], required: true } }],
        lastStatusSyncAt: { type: Date },
        nextStatusPollAt: { type: Date },
        statusPollFailures: { type: Number, min: 0 },
        pollLeaseToken: { type: String },
        pollLeaseUntil: { type: Date },
        pickupSnapshot: { type: new Schema({ contactName: String, address: String, city: String, state: String, pincode: String,
          lat: Number, lng: Number, category: String, weightKg: Number }, { _id: false }), default: undefined },
        cancellationRequired: { type: Boolean },
        cancellation: { type: new Schema({
          state: { type: String, enum: ADLOGGS_CANCELLATION_STATES, required: true },
          reason: { type: String, trim: true, maxlength: 300 }, requestedAt: { type: Date, required: true },
          attempts: { type: Number, min: 0 }, leaseToken: String, leaseUntil: Date, nextAttemptAt: Date,
          lastError: { type: String, trim: true, maxlength: 500 }, resolvedAt: Date,
        }, { _id: false }), default: undefined },
        rto: { type: new Schema({ state: { type: String, enum: ["INITIATED", "COMPLETED"], required: true },
          initiatedAt: Date, completedAt: Date,
          resolution: { type: new Schema({ state: { type: String, enum: ["PENDING_DECISION", "REFUNDED"], required: true },
            since: { type: Date, required: true }, decidedAt: Date, adminId: { type: Schema.Types.ObjectId, ref: "Admin" },
            restocked: Boolean, escalatedAt: Date }, { _id: false }), default: undefined },
        }, { _id: false }), default: undefined },
        adminActions: [{ _id: false, action: { type: String, required: true }, at: { type: Date, required: true },
          adminId: { type: Schema.Types.ObjectId, ref: "Admin" }, note: { type: String, trim: true, maxlength: 300 },
          evidence: { type: String, trim: true, maxlength: 500 }, outcome: { type: String, trim: true, maxlength: 60 } }],
        createEvidence: { type: new Schema({ orderUuid: { type: String, required: true }, partnerOrderId: { type: String, required: true },
          at: { type: Date, required: true } }, { _id: false }), default: undefined },
        foreignOrderEvidence: [{ _id: false, orderUuid: { type: String, required: true }, partnerOrderId: String,
          reason: { type: String, maxlength: 300 }, at: { type: Date, required: true } }],
        correlation: { type: new Schema({ source: { type: String, enum: ["CREATE_RESPONSE", "STATUS_RESPONSE", "AUTHENTICATED_WEBHOOK"], required: true },
          verifiedAt: { type: Date, required: true }, adminId: { type: Schema.Types.ObjectId, ref: "Admin" } }, { _id: false }), default: undefined },
        previousPartnerOrderIds: { type: [String], default: undefined },
        rebookRequest: { type: new Schema({ adminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
          reason: { type: String, required: true, maxlength: 300 }, providerReference: { type: String, required: true, maxlength: 120 },
          at: { type: Date, required: true } }, { _id: false }), default: undefined },
        pendingLocalCancellation: { type: new Schema({
          state: { type: String, enum: PENDING_LOCAL_CANCELLATION_STATES, required: true },
          requestedBy: { type: String, enum: ["customer", "seller", "delivery", "admin", "system"], required: true },
          userId: { type: String, maxlength: 64 }, reason: { type: String, trim: true, maxlength: 300 },
          status: { type: String, enum: ["Cancelled", "Rejected"], required: true },
          requestedAt: { type: Date, required: true }, completedAt: Date, blockedReason: { type: String, maxlength: 300 }, escalatedAt: Date,
        }, { _id: false }), default: undefined },
        codCollectibleAmount: { type: Number, min: 0 },
        otps: { type: new Schema({ pickup: { type: String, match: /^[0-9]{4}$/, required: true },
          delivery: { type: String, match: /^[0-9]{4}$/, required: true }, return: { type: String, match: /^[0-9]{4}$/, required: true },
          createdAt: { type: Date, required: true } }, { _id: false }), default: undefined },
        attemptHistory: [{ _id: false, partnerOrderId: { type: String, required: true }, orderUuid: String,
          outcome: { type: String, required: true, maxlength: 60 }, retiredAt: { type: Date, required: true },
          adminId: { type: Schema.Types.ObjectId, ref: "Admin" }, approvedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
          providerReference: { type: String, maxlength: 120 } }],
        supersededOrders: [{ _id: false, orderUuid: { type: String, required: true }, partnerOrderId: String,
          reason: { type: String, maxlength: 300 }, at: { type: Date, required: true } }],
      }, { _id: false }),
      default: undefined,
    },
    attention: {
      type: new Schema({ reason: { type: String, required: true }, at: { type: Date, required: true } }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true },
);

// One shipment per seller per order, enforced by the database.
ShipmentSchema.index({ order: 1, seller: 1 }, { unique: true });
ShipmentSchema.index({ shipmentNumber: 1 }, { unique: true });
ShipmentSchema.index({ seller: 1, status: 1, createdAt: -1 });
ShipmentSchema.index({ deliveryProvider: 1, status: 1 });
// Future booking worker: find pending intents without scanning every shipment.
ShipmentSchema.index({ "bookingIntent.state": 1, deliveryProvider: 1 }, { sparse: true });
// Admin shipment operations (Phase 5): status filters and newest-first paging.
ShipmentSchema.index({ status: 1, createdAt: -1 });
ShipmentSchema.index({ createdAt: -1 });
ShipmentSchema.index({ "attention.at": 1 }, { sparse: true });
// Adloggs (Phase 6): one shipment per provider order; correlation and worker queues.
ShipmentSchema.index({ "adloggs.orderUuid": 1 }, { unique: true, partialFilterExpression: { "adloggs.orderUuid": { $type: "string" } } });
ShipmentSchema.index({ "adloggs.partnerOrderId": 1 }, { unique: true, partialFilterExpression: { "adloggs.partnerOrderId": { $type: "string" } } });
ShipmentSchema.index({ "adloggs.nextStatusPollAt": 1 }, { sparse: true });
ShipmentSchema.index({ "adloggs.cancellation.state": 1 }, { sparse: true });

const Shipment =
  (mongoose.models.Shipment as mongoose.Model<IShipment>) ||
  mongoose.model<IShipment>("Shipment", ShipmentSchema);

export default Shipment;
