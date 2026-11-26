import mongoose, { Document, Schema } from "mongoose";

/**
 * Durable receipt of an authenticated Adloggs status webhook (Phase 6).
 * Stores only correlation fields and the status code — never OTPs, rider
 * phone/location, or customer data. The provider sends no event id or
 * timestamp, so duplicates are detected by (order_uuid, status, partner id).
 */
export const WEBHOOK_EVENT_STATES = ["RECEIVED", "APPLIED", "DUPLICATE", "STALE", "UNMATCHED", "MISMATCH", "UNKNOWN_STATUS", "INVALID"] as const;

export interface IAdloggsWebhookEvent extends Document {
  eventKey: string;
  orderUuid: string;
  partnerOrderId?: string;
  statusCode: number;
  riderName?: string;
  receivedAt: Date;
  state: (typeof WEBHOOK_EVENT_STATES)[number];
  processedAt?: Date;
}

const schema = new Schema<IAdloggsWebhookEvent>({
  eventKey: { type: String, required: true },
  orderUuid: { type: String, required: true, maxlength: 200 },
  partnerOrderId: { type: String, maxlength: 100 },
  statusCode: { type: Number, required: true },
  riderName: { type: String, maxlength: 120 },
  receivedAt: { type: Date, required: true },
  state: { type: String, enum: WEBHOOK_EVENT_STATES, required: true },
  processedAt: { type: Date },
}, { timestamps: true });

schema.index({ eventKey: 1 }, { unique: true });
schema.index({ orderUuid: 1, state: 1, receivedAt: 1 });

const AdloggsWebhookEvent =
  (mongoose.models.AdloggsWebhookEvent as mongoose.Model<IAdloggsWebhookEvent>) ||
  mongoose.model<IAdloggsWebhookEvent>("AdloggsWebhookEvent", schema);

export default AdloggsWebhookEvent;
