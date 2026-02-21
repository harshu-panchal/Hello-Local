import mongoose, { Document, Schema } from "mongoose";

export type AdRequestStatus =
    | "Pending"
    | "Approved"
    | "Rejected"
    | "PaymentPending"
    | "PaymentVerified"
    | "Live"
    | "Expired";

export interface ISellerAdRequest extends Document {
    // Seller reference
    sellerId: mongoose.Types.ObjectId;
    sellerName: string;
    sellerEmail: string;
    sellerPhone?: string;

    // Ad Content
    shopName: string;
    tagline: string;
    description?: string;
    imageUrl: string;
    badge?: string;
    badgeColor?: string;
    ctaText?: string;
    ctaLink?: string;

    // Duration & Pricing
    durationDays: number; // number of days to show the ad
    adPrice: number;      // price quoted by admin (set when approving)
    requestedPrice?: number; // price asked by seller (may differ)

    // Payment
    paymentStatus: "Unpaid" | "Paid" | "Refunded";
    paymentMethod?: string;
    paymentReference?: string; // UPI transaction ID / bank ref
    paymentScreenshotUrl?: string;
    paymentNote?: string;
    paidAt?: Date;

    // Status & Approval workflow
    status: AdRequestStatus;
    adminNote?: string;        // reason for rejection or instructions
    approvedAt?: Date;
    rejectedAt?: Date;

    // Link to live ShopAd if approved
    shopAdId?: mongoose.Types.ObjectId;

    // Expiry (set when approved + paid)
    startDate?: Date;
    endDate?: Date;
    expiresAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const SellerAdRequestSchema = new Schema<ISellerAdRequest>(
    {
        sellerId: {
            type: Schema.Types.ObjectId,
            ref: "Seller",
            required: true,
        },
        sellerName: { type: String, required: true, trim: true },
        sellerEmail: { type: String, required: true, trim: true },
        sellerPhone: { type: String, trim: true },

        // Ad Content
        shopName: { type: String, required: true, trim: true },
        tagline: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        imageUrl: { type: String, required: true },
        badge: { type: String, default: "FEATURED" },
        badgeColor: { type: String, default: "#FF4B6E" },
        ctaText: { type: String, default: "Visit Shop" },
        ctaLink: { type: String },

        // Duration
        durationDays: { type: Number, required: true, min: 1, default: 30 },
        adPrice: { type: Number, default: 0 },
        requestedPrice: { type: Number },

        // Payment
        paymentStatus: {
            type: String,
            enum: ["Unpaid", "Paid", "Refunded"],
            default: "Unpaid",
        },
        paymentMethod: { type: String },
        paymentReference: { type: String },
        paymentScreenshotUrl: { type: String },
        paymentNote: { type: String },
        paidAt: { type: Date },

        // Status
        status: {
            type: String,
            enum: ["Pending", "Approved", "Rejected", "PaymentPending", "PaymentVerified", "Live", "Expired"],
            default: "Pending",
        },
        adminNote: { type: String },
        approvedAt: { type: Date },
        rejectedAt: { type: Date },

        shopAdId: { type: Schema.Types.ObjectId, ref: "ShopAd" },
        startDate: { type: Date },
        endDate: { type: Date },
        expiresAt: { type: Date },
    },
    { timestamps: true }
);

SellerAdRequestSchema.index({ sellerId: 1, status: 1 });
SellerAdRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ISellerAdRequest>("SellerAdRequest", SellerAdRequestSchema);
