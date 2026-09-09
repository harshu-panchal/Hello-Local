import mongoose, { Document, Schema } from "mongoose";

export interface IRefund extends Document {
  order?: mongoose.Types.ObjectId;
  payment: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  adRequest?: mongoose.Types.ObjectId;
  seller?: mongoose.Types.ObjectId;
  returnRequest?: mongoose.Types.ObjectId;
  idempotencyKey?: string;

  // Refund Info
  amount: number;
  reason: string;
  status: "Pending" | "Approved" | "Processed" | "Rejected" | "Completed" | "Failed";
  /** Gateway message when a refund attempt did not go through. (#H-06) */
  failureReason?: string;

  // Processing
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  rejectionReason?: string;

  // Gateway Info
  refundTransactionId?: string;
  gatewayResponse?: any;

  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<IRefund>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [
        function (this: any) {
          return !this.adRequest && !this.seller;
        },
        "Order is required for order refunds",
      ],
    },
    payment: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: [true, "Payment is required"],
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [
        function (this: any) {
          return !this.adRequest && !this.seller;
        },
        "Customer is required for order refunds",
      ],
    },
    adRequest: {
      type: Schema.Types.ObjectId,
      ref: "SellerAdRequest",
      required: [
        function (this: any) {
          return !this.order && !this.customer;
        },
        "AdRequest is required for ad refunds",
      ],
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: [
        function (this: any) {
          return !this.order && !this.customer;
        },
        "Seller is required for ad refunds",
      ],
    },
    returnRequest: {
      type: Schema.Types.ObjectId,
      ref: "Return",
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },

    // Refund Info
    amount: {
      type: Number,
      required: [true, "Refund amount is required"],
      min: [0, "Refund amount cannot be negative"],
    },
    reason: {
      type: String,
      required: [true, "Refund reason is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Processed", "Rejected", "Completed",
      "Failed",
    ],
      default: "Pending",
    },

    // Processing
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    processedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },

    // Gateway Info
    refundTransactionId: {
      type: String,
      trim: true,
    },
    gatewayResponse: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

RefundSchema.pre("validate", function (next) {
  const hasOrder = Boolean(this.order);
  const hasCustomer = Boolean(this.customer);
  const hasAdRequest = Boolean(this.adRequest);
  const hasSeller = Boolean(this.seller);

  const hasOrderContext = hasOrder || hasCustomer;
  const hasAdContext = hasAdRequest || hasSeller;

  if (hasOrderContext && hasAdContext) {
    this.invalidate("order", "Refund cannot have both Order and AdRequest context");
    this.invalidate("adRequest", "Refund cannot have both Order and AdRequest context");
  } else if (!hasOrderContext && !hasAdContext) {
    this.invalidate("order", "Refund must specify either an order or an ad request");
    this.invalidate("adRequest", "Refund must specify either an order or an ad request");
  } else if (hasOrderContext) {
    if (!hasOrder) {
      this.invalidate("order", "Order is required for order refunds");
    }
    if (!hasCustomer) {
      this.invalidate("customer", "Customer is required for order refunds");
    }
  } else if (hasAdContext) {
    if (!hasAdRequest) {
      this.invalidate("adRequest", "AdRequest is required for ad refunds");
    }
    if (!hasSeller) {
      this.invalidate("seller", "Seller is required for ad refunds");
    }
  }

  next();
});

// Indexes
RefundSchema.index({ order: 1 });
RefundSchema.index({ customer: 1 });
RefundSchema.index({ adRequest: 1 });
RefundSchema.index({ seller: 1 });
RefundSchema.index({ status: 1 });
RefundSchema.index({ returnRequest: 1 });
RefundSchema.index({ idempotencyKey: 1 }, { sparse: true });
RefundSchema.index({ refundTransactionId: 1 }, { sparse: true });

const Refund = (mongoose.models.Refund as mongoose.Model<IRefund>) || mongoose.model<IRefund>("Refund", RefundSchema);

export default Refund;
