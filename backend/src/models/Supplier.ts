import mongoose, { Document, Schema } from "mongoose";

export interface ISupplier extends Document {
  seller: mongoose.Types.ObjectId;
  name: string;
  companyName?: string;
  phone: string;
  email?: string;
  category?: string;
  address?: string;
  notes?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    category: {
      type: String,
      trim: true,
      default: "General",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

SupplierSchema.index({ seller: 1, phone: 1 });
SupplierSchema.index({ seller: 1, name: "text", companyName: "text" });

export default mongoose.model<ISupplier>("Supplier", SupplierSchema);
