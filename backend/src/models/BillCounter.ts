import mongoose, { Schema } from "mongoose";

/**
 * Monotonic counters for invoice/bill serial numbers.
 * `_id` is the counter key, e.g. "posBill:<sellerId>:<FY>".
 */
export interface IBillCounter {
  _id: string;
  seq: number;
}

const BillCounterSchema = new Schema<IBillCounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: true },
);

const BillCounter =
  (mongoose.models.BillCounter as mongoose.Model<IBillCounter>) ||
  mongoose.model<IBillCounter>("BillCounter", BillCounterSchema);

export default BillCounter;
