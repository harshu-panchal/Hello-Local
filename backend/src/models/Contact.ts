import mongoose, { Schema, Document } from 'mongoose';

export interface IContact extends Document {
  name: string;
  email: string;
  subject?: string;
  message: string;
  status?: "Pending" | "Replied";
  repliedAt?: Date;
  replySubject?: string;
  replyMessage?: string;
  createdAt: Date;
}

const ContactSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ["Pending", "Replied"],
    default: "Pending",
  },
  repliedAt: { type: Date },
  replySubject: { type: String },
  replyMessage: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IContact>('Contact', ContactSchema);
