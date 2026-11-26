import mongoose, { Document, Schema } from "mongoose";

/**
 * Provider reconciliation record for one external-provider shipment (Phase 5).
 *
 * A placeholder for facts a delivery provider will report later (its cost,
 * adjustments, credits, settlement reference). It creates NO payable, NO
 * settlement obligation and NO COD liability, and nothing reads it in any
 * financial flow. In-house shipments never get one: their costs are the
 * existing courier earnings.
 *
 * Money follows the project convention (rupee Numbers rounded to 2 decimals)
 * with an explicit currency. Unknown values are `null`, never 0. The
 * customer's delivery charge is NOT copied here: it stays authoritative on
 * the order (`Order.shipping`, order-level) and is read from there.
 */
export const RECONCILIATION_STATUSES = ["AWAITING_PROVIDER_DATA"] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface IShipmentReconciliation extends Document {
  shipment: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;
  deliveryProvider: "IN_HOUSE" | "ADDLOGS";
  currency: "INR";
  /** Serviceability `estimated_price` at booking time — an estimate, never a charge. */
  estimatedProviderCost: number | null;
  /** Create-order response `fee` — provider-reported at booking, not a final invoice. */
  providerBookingFee: number | null;
  /** Create-order response `distance` (km). */
  providerDistanceKm: number | null;
  /** Final invoiced provider cost: unknown until an invoice/settlement document exists. */
  providerCost: number | null;
  /** Verified return-to-origin charge from Adloggs (null = unknown, never assumed zero). Borne by Hello Local. */
  providerRtoCharge: number | null;
  /**
   * Who bears provider costs (approved policy: Hello Local bears delivery and RTO costs).
   * Informational only: nothing is ever deducted from seller earnings or added to customer charges.
   */
  costBearer: "PLATFORM";
  providerAdjustment: number | null;
  providerCredit: number | null;
  providerSettlementReference: string | null;
  status: ReconciliationStatus;
  events: Array<{ action: string; at: Date; source: string }>;
  createdAt: Date;
  updatedAt: Date;
}

/** null (unknown) or a finite amount with at most 2 decimal places. */
const optionalMoney = {
  type: Number,
  default: null,
  validate: {
    validator: (value: number | null) => value === null || (Number.isFinite(value) && Math.round(value * 100) / 100 === value),
    message: "Amounts must be null (unknown) or a finite value with at most 2 decimal places",
  },
};

const ShipmentReconciliationSchema = new Schema<IShipmentReconciliation>(
  {
    shipment: { type: Schema.Types.ObjectId, ref: "Shipment", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    deliveryProvider: { type: String, enum: ["IN_HOUSE", "ADDLOGS"], required: true },
    currency: { type: String, enum: ["INR"], default: "INR", required: true },
    estimatedProviderCost: optionalMoney,
    providerBookingFee: optionalMoney,
    providerDistanceKm: { type: Number, default: null, min: 0 },
    providerCost: optionalMoney,
    providerRtoCharge: optionalMoney,
    costBearer: { type: String, enum: ["PLATFORM"], default: "PLATFORM", required: true },
    providerAdjustment: optionalMoney,
    providerCredit: optionalMoney,
    providerSettlementReference: { type: String, default: null, trim: true },
    status: { type: String, enum: RECONCILIATION_STATUSES, default: "AWAITING_PROVIDER_DATA", required: true },
    events: [{ _id: false, action: { type: String, required: true }, at: { type: Date, required: true }, source: { type: String, required: true } }],
  },
  { timestamps: true },
);

// Exactly one record per shipment.
ShipmentReconciliationSchema.index({ shipment: 1 }, { unique: true });
ShipmentReconciliationSchema.index({ order: 1 });
ShipmentReconciliationSchema.index({ deliveryProvider: 1, status: 1 });

const ShipmentReconciliation =
  (mongoose.models.ShipmentReconciliation as mongoose.Model<IShipmentReconciliation>) ||
  mongoose.model<IShipmentReconciliation>("ShipmentReconciliation", ShipmentReconciliationSchema);

export default ShipmentReconciliation;
