import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscriptionPayment extends Document {
  sellerId?: mongoose.Types.ObjectId;
  sellerName?: string;
  sellerMobile: string;
  planId?: mongoose.Types.ObjectId;
  planName: string;
  amount: number; // in Rupees
  durationInDays: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  startDate?: Date;
  endDate?: Date;
  paymentDate?: Date;
  paymentMethod?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPaymentSchema = new Schema<ISubscriptionPayment>(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: 'Seller',
      required: false,
      index: true,
    },
    sellerName: {
      type: String,
      required: false,
      trim: true,
    },
    sellerMobile: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: false,
    },
    planName: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    durationInDays: {
      type: Number,
      required: true,
    },
    razorpayOrderId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    razorpaySignature: {
      type: String,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'PENDING'],
      default: 'PENDING',
      index: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    paymentMethod: {
      type: String,
      default: 'Razorpay',
    },
    notes: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

SubscriptionPaymentSchema.index({ sellerId: 1, createdAt: -1 });

const SubscriptionPayment = mongoose.model<ISubscriptionPayment>(
  'SubscriptionPayment',
  SubscriptionPaymentSchema
);

export default SubscriptionPayment;
