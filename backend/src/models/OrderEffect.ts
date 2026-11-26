import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true },
  order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  // ExternalSettlement: seller settlement for orders delivered by an external provider (Adloggs).
  // It is HELD (never executed) until external financial execution is approved.
  kind: { type: String, enum: ["Refund", "Settlement", "Reversal", "ExternalSettlement"], required: true },
  amount: Number,
  reason: String,
  // Held: deliberately not executed (approval gate); never picked up by the worker.
  status: { type: String, enum: ["Pending", "Processing", "Complete", "Failed", "Held"], default: "Pending" },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  lastError: String,
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
export default mongoose.models.OrderEffect || mongoose.model("OrderEffect", schema);
