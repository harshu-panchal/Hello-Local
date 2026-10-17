import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  _id: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});
export default mongoose.models.RevokedToken || mongoose.model('RevokedToken', schema);
