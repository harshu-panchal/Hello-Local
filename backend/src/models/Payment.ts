import mongoose, { Document, Schema } from "mongoose";

export interface IPayment extends Document {
  order?: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  adRequest?: mongoose.Types.ObjectId;
  seller?: mongoose.Types.ObjectId;

  // Payment Info
  paymentMethod: string;
  paymentGateway?: string;
  transactionId?: string;
  paymentId?: string;

  // Razorpay Specific
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;

  // Amount
  amount: number;
  currency: string;
  gatewayFee?: number;
  gatewayTax?: number;
  netAmount?: number;

  // Status
  status:
  | "Pending"
  | "Processing"
  | "Completed"
  | "PartiallyRefunded"
  | "Failed"
  | "Refunded"
  | "Cancelled";

  // Payment Details
  paymentDate?: Date;
  paidAt?: Date;

  // Gateway Response
  gatewayResponse?: {
    success: boolean;
    message?: string;
    rawResponse?: any;
    isDuplicate?: boolean;
    refundId?: string;
    refundStatus?: string;
    autoRefundFailed?: boolean;
    refundError?: string;
    [key: string]: any;
  };

  // Refund Info
  refundAmount?: number;
  totalRefunded?: number;
  refundedAt?: Date;
  refundReason?: string;

  // Notes
  notes?: string;

  // Duplicate Payment Tracking (P1 #6)
  isDuplicate?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [
        function (this: any) {
          return !this.adRequest && !this.seller;
        },
        "Order is required for order payments",
      ],
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [
        function (this: any) {
          return !this.adRequest && !this.seller;
        },
        "Customer is required for order payments",
      ],
    },
    adRequest: {
      type: Schema.Types.ObjectId,
      ref: "SellerAdRequest",
      required: [
        function (this: any) {
          return !this.order && !this.customer;
        },
        "AdRequest is required for ad payments",
      ],
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: [
        function (this: any) {
          return !this.order && !this.customer;
        },
        "Seller is required for ad payments",
      ],
    },

    // Payment Info
    paymentMethod: {
      type: String,
      required: [true, "Payment method is required"],
      trim: true,
    },
    paymentGateway: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    paymentId: {
      type: String,
      trim: true,
    },

    // Razorpay Specific
    razorpayOrderId: {
      type: String,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      // A gateway payment id may only ever be recorded once. Blocks replaying a
      // captured payment onto a second order. (#C-01)
      unique: true,
      sparse: true,
    },
    razorpaySignature: {
      type: String,
      trim: true,
    },

    // Amount
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    gatewayFee: {
      type: Number,
      min: [0, "Gateway fee cannot be negative"],
    },
    gatewayTax: {
      type: Number,
      min: [0, "Gateway tax cannot be negative"],
    },
    netAmount: {
      type: Number,
      min: [0, "Net amount cannot be negative"],
    },

    // Status
    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Completed",
        "PartiallyRefunded",
        "Failed",
        "Refunded",
        "Cancelled",
      ],
      default: "Pending",
    },

    // Payment Details
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    paidAt: {
      type: Date,
    },

    // Gateway Response
    gatewayResponse: {
      success: Boolean,
      message: String,
      rawResponse: Schema.Types.Mixed,
    },

    // Refund Info
    refundAmount: {
      type: Number,
      min: [0, "Refund amount cannot be negative"],
      default: 0,
    },
    totalRefunded: {
      type: Number,
      min: [0, "Total refunded cannot be negative"],
      default: 0,
    },
    refundedAt: {
      type: Date,
    },
    refundReason: {
      type: String,
      trim: true,
    },

    // Notes
    notes: {
      type: String,
      trim: true,
    },

    // Duplicate Payment Tracking (P1 #6)
    isDuplicate: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

PaymentSchema.pre("validate", function (next) {
  const hasOrder = Boolean(this.order);
  const hasCustomer = Boolean(this.customer);
  const hasAdRequest = Boolean(this.adRequest);
  const hasSeller = Boolean(this.seller);

  const hasOrderContext = hasOrder || hasCustomer;
  const hasAdContext = hasAdRequest || hasSeller;

  if (hasOrderContext && hasAdContext) {
    this.invalidate("order", "Payment cannot have both Order and AdRequest context");
    this.invalidate("adRequest", "Payment cannot have both Order and AdRequest context");
  } else if (!hasOrderContext && !hasAdContext) {
    this.invalidate("order", "Payment must specify either an order or an ad request");
    this.invalidate("adRequest", "Payment must specify either an order or an ad request");
  } else if (hasOrderContext) {
    if (!hasOrder) {
      this.invalidate("order", "Order is required for order payments");
    }
    if (!hasCustomer) {
      this.invalidate("customer", "Customer is required for order payments");
    }
  } else if (hasAdContext) {
    if (!hasAdRequest) {
      this.invalidate("adRequest", "AdRequest is required for ad payments");
    }
    if (!hasSeller) {
      this.invalidate("seller", "Seller is required for ad payments");
    }
  }

  next();
});

// Indexes for faster queries
PaymentSchema.index({ order: 1 });
PaymentSchema.index({ customer: 1 });
PaymentSchema.index({ adRequest: 1 });
PaymentSchema.index({ seller: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ paymentDate: -1 });

const Payment = (mongoose.models.Payment as mongoose.Model<IPayment>) || mongoose.model<IPayment>("Payment", PaymentSchema);

export default Payment;
