import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscriptionPlan extends Document {
  name: string;
  description?: string;
  price: number; // in Rupees (e.g. 499)
  durationInDays: number; // e.g. 30, 90, 365
  features: string[];
  isActive: boolean;
  isPopular?: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Plan price is required'],
      min: [0, 'Price cannot be negative'],
    },
    durationInDays: {
      type: Number,
      required: [true, 'Duration in days is required'],
      min: [1, 'Duration must be at least 1 day'],
      default: 30,
    },
    features: {
      type: [String],
      default: [
        '0% Commission on all orders',
        'Unlimited product listings',
        'Direct store settlement',
        'Full customer order management',
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

SubscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });

const SubscriptionPlan = mongoose.model<ISubscriptionPlan>(
  'SubscriptionPlan',
  SubscriptionPlanSchema
);

export default SubscriptionPlan;
