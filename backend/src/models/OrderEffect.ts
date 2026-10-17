import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true },
  order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  kind: { type: String, enum: ["Refund", "Settlement", "Reversal"], required: true },
  amount: Number,
  reason: String,
  status: { type: String, enum: ["Pending", "Processing", "Complete", "Failed"], default: "Pending" },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  lastError: String,
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
export default mongoose.models.OrderEffect || mongoose.model("OrderEffect", schema);
