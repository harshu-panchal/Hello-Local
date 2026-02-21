import mongoose, { Document, Schema } from "mongoose";

export interface IShopAd extends Document {
    shopName: string;
    tagline: string;
    description?: string;
    imageUrl: string;
    badge?: string;
    badgeColor?: string;
    ctaText?: string;
    ctaLink?: string;
    order: number;
    isActive: boolean;
    contactInfo?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    requestedBy?: string; // seller/shopkeeper name or email who requested this ad
    approvedAt?: Date;
    startDate?: Date;
    endDate?: Date;
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ShopAdSchema = new Schema<IShopAd>(
    {
        shopName: {
            type: String,
            required: true,
            trim: true,
        },
        tagline: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        imageUrl: {
            type: String,
            required: true,
        },
        badge: {
            type: String,
            trim: true,
            default: "PREMIUM",
        },
        badgeColor: {
            type: String,
            default: "#FF4B6E",
        },
        ctaText: {
            type: String,
            default: "Visit Shop",
        },
        ctaLink: {
            type: String,
        },
        order: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        contactInfo: {
            name: { type: String },
            phone: { type: String },
            email: { type: String },
        },
        requestedBy: {
            type: String,
        },
        approvedAt: {
            type: Date,
        },
        startDate: {
            type: Date,
        },
        endDate: {
            type: Date,
        },
        expiresAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// Index for efficient queries
ShopAdSchema.index({ order: 1, isActive: 1 });
ShopAdSchema.index({ createdAt: -1 });

export default mongoose.model<IShopAd>("ShopAd", ShopAdSchema);
