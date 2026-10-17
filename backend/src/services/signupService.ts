import crypto from 'crypto';
import SignupProof from '../models/SignupProof';

export async function issueSignupProof(mobile: string, role: 'Seller' | 'Delivery'): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await SignupProof.findOneAndUpdate({ _id: `${role}:${mobile}` }, { $set: {
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  } }, { upsert: true });
  return token;
}

async function takeSignupProof(mobile: string, role: 'Seller' | 'Delivery', token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return SignupProof.findOneAndDelete({
    _id: `${role}:${mobile}`,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt: { $gt: new Date() },
  });
}

export async function consumeSignupProof(mobile: string, role: 'Seller' | 'Delivery', token: unknown): Promise<boolean> {
  return Boolean(await takeSignupProof(mobile, role, token));
}

export async function createVerifiedSignup<T>(mobile: string, role: 'Seller' | 'Delivery', token: unknown, create: () => Promise<T>): Promise<T> {
  const proof = await takeSignupProof(mobile, role, token);
  if (!proof) throw Object.assign(new Error('Verify your mobile number before registering. Please request a new signup OTP.'), { statusCode: 401 });
  try {
    return await create();
  } catch (error) {
    // A validation/database failure must not strand a verified applicant. Do not
    // replace a newer grant, and retain the original expiry when restoring.
    await SignupProof.updateOne({ _id: `${role}:${mobile}` }, { $setOnInsert: {
      tokenHash: proof.tokenHash, expiresAt: proof.expiresAt,
    } }, { upsert: true }).catch((restoreError: unknown) => console.error('Could not restore signup verification:', restoreError));
    throw error;
  }
}
