import mongoose, { Schema, model, Document } from "mongoose";

/**
 * Step 6 — P2 #1: Lightweight Settlement Audit Log
 *
 * Persists normalized Razorpay settlement events (`settlement.processed`)
 * to provide audit visibility into funds wired from Razorpay's nodal account
 * into Hello-Local's merchant bank account.
 *
 * This is an informational audit snapshot only. It has zero coupling with
 * order completion, payment capture, seller commission, or COD reconciliation.
 */
export interface ISettlement extends Document {
    settlementId: string;
    utr?: string;
    amount: number;
    fees?: number;
    tax?: number;
    status: string;
    settledAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const SettlementSchema = new Schema<ISettlement>(
    {
        settlementId: {
            type: String,
            required: [true, "Settlement ID is required"],
            unique: true,
            trim: true,
            index: true,
        },
        utr: {
            type: String,
            trim: true,
            sparse: true,
            index: true,
        },
        amount: {
            type: Number,
            required: [true, "Settlement amount is required"],
            min: [0, "Settlement amount cannot be negative"],
        },
        fees: {
            type: Number,
            min: [0, "Settlement fees cannot be negative"],
        },
        tax: {
            type: Number,
            min: [0, "Settlement tax cannot be negative"],
        },
        status: {
            type: String,
            required: [true, "Settlement status is required"],
            trim: true,
            default: "processed",
        },
        settledAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

SettlementSchema.index({ settledAt: -1 });

const Settlement = mongoose.models.Settlement || model<ISettlement>("Settlement", SettlementSchema);

export default Settlement;
