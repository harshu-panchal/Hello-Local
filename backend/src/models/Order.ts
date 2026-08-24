import mongoose, { Document, Schema } from "mongoose";

export interface IOrder extends Document {
  // Order Info
  orderNumber: string;
  invoiceNumber?: string;
  orderDate: Date;
  timeSlot?: string;

  // Channel & Sales Source
  orderChannel: "ONLINE" | "OFFLINE";
  saleType: "ONLINE_DELIVERY" | "COUNTER_POS" | "PHONE_ORDER" | "TAKEAWAY";
  seller?: mongoose.Types.ObjectId; // Set for offline sales & single-seller orders

  // Customer Info
  customer: mongoose.Types.ObjectId;
  isWalkInCustomer?: boolean;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;

  // Delivery Info
  deliveryAddress: {
    address: string;
    city: string;
    state?: string;
    pincode: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
  };

  // Offline Payment Details
  offlinePaymentDetails?: {
    receivedAmount?: number;
    changeReturned?: number;
    paymentReference?: string;
    paymentNotes?: string;
  };

  // Bill Generation Tracking
  billNumber?: string;
  billGeneratedAt?: Date;

  // Order Items
  items: mongoose.Types.ObjectId[]; // References to OrderItem

  // Pricing
  subtotal: number;
  tax: number;
  shipping: number;
  platformFee: number;
  discount: number;
  couponCode?: string;
  /** Customer-chosen delivery tip, passed through to the courier. (#C-11) */
  tipAmount: number;
  total: number;
  grandTotal?: number; // Alias or computed total used in some controllers

  // Payment
  paymentMethod: string;
  paymentStatus: "Pending" | "Paid" | "Failed" | "Refunded";
  paymentId?: string;
  // Razorpay order id issued for THIS order. A checkout signature is only
  // accepted if it matches this value, which prevents replaying a signature
  // obtained for a different (cheaper) order. (#C-01)
  razorpayOrderId?: string;

  // Guard so the "new order" seller notification is sent only once, even when
  // both capturePayment and the Razorpay webhook fire for the same order.
  sellerNotified?: boolean;

  // Order Status
  status:
  | "Received"
  | "Accepted"
  | "Pending"
  | "Processed"
  | "Shipped"
  | "Picked up"
  | "On the way"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled"
  | "Rejected"
  | "Returned"
  | "Completed";

  // Delivery Assignment
  deliveryBoy?: mongoose.Types.ObjectId;
  deliveryBoyStatus?:
  | "Assigned"
  | "Picked Up"
  | "In Transit"
  | "Delivered"
  | "Failed";
  assignedAt?: Date;

  // Tracking
  trackingNumber?: string;
  estimatedDeliveryDate?: Date;
  deliveredAt?: Date;

  // Delivery OTP
  deliveryOtp?: string;
  deliveryOtpExpiresAt?: Date;
  deliveryOtpVerified?: boolean;
  /** Failed delivery-OTP guesses; capped to stop brute force. (#H-16) */
  deliveryOtpAttempts?: number;
  invoiceEnabled?: boolean;
  deliveryDistanceKm?: number;

  // Seller Pickups (for multi-seller orders)
  sellerPickups?: Array<{
    seller: mongoose.Types.ObjectId;
    pickedUpAt?: Date;
    pickedUpBy?: mongoose.Types.ObjectId; // delivery boy who picked up
    latitude?: number; // location where pickup was confirmed
    longitude?: number;
  }>;

  // Notes
  adminNotes?: string;
  customerNotes?: string;
  deliveryInstructions?: string;
  specialRequests?: string;

  // Cancellation/Return
  cancellationReason?: string;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    // Order Info
    orderNumber: {
      type: String,
      required: [true, "Order number is required"],
      unique: true,
      trim: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
    },
    billNumber: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    billGeneratedAt: {
      type: Date,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    timeSlot: {
      type: String,
      trim: true,
    },

    // Channel & Source
    orderChannel: {
      type: String,
      enum: ["ONLINE", "OFFLINE"],
      default: "ONLINE",
      index: true,
    },
    saleType: {
      type: String,
      enum: ["ONLINE_DELIVERY", "COUNTER_POS", "PHONE_ORDER", "TAKEAWAY"],
      default: "ONLINE_DELIVERY",
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      index: true,
    },

    // Customer Info
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [
        function (this: any) {
          return this.orderChannel !== "OFFLINE";
        },
        "Customer is required for online orders",
      ],
    },
    isWalkInCustomer: {
      type: Boolean,
      default: false,
    },
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      default: "Walk-in Customer",
      trim: true,
    },
    customerEmail: {
      type: String,
      required: [
        function (this: any) {
          return this.orderChannel !== "OFFLINE";
        },
        "Customer email is required for online orders",
      ],
      trim: true,
    },
    customerPhone: {
      type: String,
      required: [
        function (this: any) {
          return this.orderChannel !== "OFFLINE";
        },
        "Customer phone is required for online orders",
      ],
      trim: true,
    },

    // Delivery Info (Optional for offline sales)
    deliveryAddress: {
      address: {
        type: String,
        required: [
          function (this: any) {
            return this.orderChannel !== "OFFLINE";
          },
          "Delivery address is required for online orders",
        ],
        trim: true,
      },
      city: {
        type: String,
        required: [
          function (this: any) {
            return this.orderChannel !== "OFFLINE";
          },
          "City is required for online orders",
        ],
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      pincode: {
        type: String,
        required: [
          function (this: any) {
            return this.orderChannel !== "OFFLINE";
          },
          "Pincode is required for online orders",
        ],
        trim: true,
      },
      landmark: {
        type: String,
        trim: true,
      },
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
    },

    // Offline Payment Details
    offlinePaymentDetails: {
      receivedAmount: {
        type: Number,
        min: [0, "Received amount cannot be negative"],
      },
      changeReturned: {
        type: Number,
        min: [0, "Change returned cannot be negative"],
        default: 0,
      },
      paymentReference: {
        type: String,
        trim: true,
      },
      paymentNotes: {
        type: String,
        trim: true,
      },
    },

    // Order Items
    items: [
      {
        type: Schema.Types.ObjectId,
        ref: "OrderItem",
      },
    ],

    // Pricing
    subtotal: {
      type: Number,
      required: [true, "Subtotal is required"],
      min: [0, "Subtotal cannot be negative"],
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, "Tax cannot be negative"],
    },
    shipping: {
      type: Number,
      default: 0,
      min: [0, "Shipping cannot be negative"],
    },
    platformFee: {
      type: Number,
      default: 0,
      min: [0, "Platform fee cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
    },
    couponCode: {
      type: String,
      trim: true,
    },
    tipAmount: {
      type: Number,
      default: 0,
      min: [0, "Tip cannot be negative"],
    },
    total: {
      type: Number,
      required: [true, "Total is required"],
      min: [0, "Total cannot be negative"],
    },
    grandTotal: {
      type: Number,
    },

    // Payment
    paymentMethod: {
      type: String,
      required: [true, "Payment method is required"],
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
    paymentId: {
      type: String,
      trim: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
    },
    sellerNotified: {
      type: Boolean,
      default: false,
    },

    // Order Status
    status: {
      type: String,
      enum: [
        "Received",
        "Accepted",
        "Pending",
        "Processed",
        "Shipped",
        "Picked up",
        "On the way",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
        "Rejected",
        "Returned",
        "Completed",
      ],
      default: "Received",
    },

    // Delivery Assignment
    deliveryBoy: {
      type: Schema.Types.ObjectId,
      ref: "Delivery",
    },
    deliveryBoyStatus: {
      type: String,
      enum: ["Assigned", "Picked Up", "In Transit", "Delivered", "Failed"],
    },
    assignedAt: {
      type: Date,
    },

    // Tracking
    trackingNumber: {
      type: String,
      trim: true,
    },
    estimatedDeliveryDate: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },

    // Delivery OTP
    deliveryOtp: {
      type: String,
      trim: true,
    },
    deliveryOtpExpiresAt: {
      type: Date,
    },
    deliveryOtpVerified: {
      type: Boolean,
      default: false,
    },
    deliveryOtpAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    invoiceEnabled: {
      type: Boolean,
      default: false,
    },
    deliveryDistanceKm: {
      type: Number,
    },

    // Seller Pickups (for multi-seller orders)
    sellerPickups: [
      {
        seller: {
          type: Schema.Types.ObjectId,
          ref: "Seller",
          required: true,
        },
        pickedUpAt: {
          type: Date,
        },
        pickedUpBy: {
          type: Schema.Types.ObjectId,
          ref: "Delivery",
        },
        latitude: {
          type: Number,
        },
        longitude: {
          type: Number,
        },
      },
    ],

    // Notes
    adminNotes: {
      type: String,
      trim: true,
    },
    customerNotes: {
      type: String,
      trim: true,
    },
    deliveryInstructions: {
      type: String,
      trim: true,
    },
    specialRequests: {
      type: String,
      trim: true,
    },

    // Cancellation/Return
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  },
);

// Generate order number before validation
OrderSchema.pre("validate", async function (this: IOrder, next) {
  if (!this.orderNumber) {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    this.orderNumber = `ORD${timestamp}${random}`;
  }
  next();
});

// Indexes for faster queries
OrderSchema.index({ customer: 1, orderDate: -1 });
OrderSchema.index({ seller: 1, orderChannel: 1, orderDate: -1 });
OrderSchema.index({ orderChannel: 1, status: 1, orderDate: -1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ orderDate: -1 });
OrderSchema.index({ deliveryBoy: 1 });
OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ paymentStatus: 1, status: 1 });
OrderSchema.index({ deliveryBoy: 1, status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ razorpayOrderId: 1 });

const Order =
  (mongoose.models.Order as mongoose.Model<IOrder>) ||
  mongoose.model<IOrder>("Order", OrderSchema);

export default Order;
