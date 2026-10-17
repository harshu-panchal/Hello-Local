import mongoose, { Schema } from 'mongoose';

// One short-lived, phone-bound grant; no account is reserved before verification.
const schema = new Schema({
  _id: { type: String, required: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});
export default mongoose.models.SignupProof || mongoose.model('SignupProof', schema);
