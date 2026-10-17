import crypto from 'crypto';
import { verifyToken, TokenPayload } from './jwtService';
import RevokedToken from '../models/RevokedToken';
import Customer from '../models/Customer';
import Seller from '../models/Seller';
import Delivery from '../models/Delivery';
import Admin from '../models/Admin';

export class SessionError extends Error {}
export const tokenHash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
export const sessionRoom = (token: string): string => `auth-session-${tokenHash(token)}`;

export async function validateSession(token: string): Promise<TokenPayload> {
  let decoded: TokenPayload;
  try { decoded = verifyToken(token); } catch (error: any) { throw new SessionError(error.message); }
  const Models = { Customer, Seller, Delivery, Admin };
  const Model = Models[decoded.userType];
  if (!Model || !/^[a-f0-9]{24}$/i.test(decoded.userId || '')) throw new SessionError('Invalid session');
  if (await RevokedToken.exists({ _id: tokenHash(token) })) throw new SessionError('This session has been logged out. Please log in again.');
  const account = await (Model as any).findById(decoded.userId).select('status role authVersion').lean();
  if (!account) throw new SessionError('Account no longer exists. Please log in again.');
  const allowed = decoded.userType === 'Seller'
    ? account.status === 'Approved' || account.status === 'Pending'
    : account.status === 'Active';
  if (!allowed) throw new SessionError('Your account is not active. Please contact support.');
  if ((decoded.sessionVersion ?? 0) !== (account.authVersion ?? 0)) {
    throw new SessionError('This session has been invalidated. Please log in again.');
  }
  return { ...decoded, accountStatus: account.status,
    ...(decoded.userType === 'Admin' ? { role: account.role } : {}) };
}

export async function revokeSession(token: string): Promise<void> {
  const decoded = verifyToken(token);
  if (!decoded.exp) throw new SessionError('Invalid session expiry');
  await RevokedToken.updateOne({ _id: tokenHash(token) }, {
    $set: { expiresAt: new Date(decoded.exp * 1000) },
  }, { upsert: true });
}
