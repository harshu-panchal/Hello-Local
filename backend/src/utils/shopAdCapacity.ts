import mongoose, { ClientSession, FilterQuery } from "mongoose";
import ShopAd, { IShopAd } from "../models/ShopAd";
import SellerAdRequest from "../models/SellerAdRequest";
import { validAdDuration } from "./adValidation";

export const MAX_ACTIVE_SHOP_ADS = 10;
const DAY_MS = 86400000;
const INDIA_OFFSET_MS = 330 * 60000;

// Advertising calendar dates are always in India, independent of server timezone.
export function toDayStart(date: Date): Date {
  const shifted = new Date(date.getTime() + INDIA_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - INDIA_OFFSET_MS);
}
export function addDays(date: Date, days: number): Date { return new Date(date.getTime() + days * DAY_MS); }

function endAfter(at: Date) {
  return { $or: [{ endDate: { $gt: at } }, { endDate: null, $or: [
    { expiresAt: { $gt: at } }, { expiresAt: null },
  ] }] };
}
export function shopAdActiveAtQuery(at: Date): FilterQuery<IShopAd> {
  return { isActive: true, $and: [
    { $or: [{ startDate: { $lte: at } }, { startDate: null }] }, endAfter(at),
  ] };
}
export function shopAdOverlapsQuery(start: Date, end: Date, opts?: { excludeShopAdId?: string | mongoose.Types.ObjectId }): FilterQuery<IShopAd> {
  return { ...(opts?.excludeShopAdId ? { _id: { $ne: opts.excludeShopAdId } } : {}), isActive: true, $and: [
    { $or: [{ startDate: { $lt: end } }, { startDate: null }] }, endAfter(start),
  ] };
}
export function getDurationDaysFromRange(start?: Date, end?: Date, expires?: Date): number {
  const finish = end ?? expires;
  if (!start || !finish) return 1;
  return validAdDuration(Math.max(1, Math.ceil((finish.getTime() - start.getTime()) / DAY_MS)));
}

export async function countBookedForDay(start: Date, end: Date, options: {
  excludeShopAdId?: string | mongoose.Types.ObjectId;
  excludeRequestId?: string | mongoose.Types.ObjectId;
  session?: ClientSession;
} = {}): Promise<number> {
  const live = await ShopAd.countDocuments(shopAdOverlapsQuery(start, end, options)).session(options.session ?? null);
  const reserved = await SellerAdRequest.countDocuments({
    ...(options.excludeRequestId ? { _id: { $ne: options.excludeRequestId } } : {}),
    status: { $in: ["Approved", "PaymentPending", "PaymentVerified"] },
    startDate: { $lt: end }, endDate: { $gt: start },
  }).session(options.session ?? null);
  return live + reserved;
}

export async function findNextAvailableWindow(params: {
  desiredStart: Date; durationDays: number;
  excludeShopAdId?: string | mongoose.Types.ObjectId;
  excludeRequestId?: string | mongoose.Types.ObjectId;
  session?: ClientSession;
}): Promise<{ startDate: Date; endDate: Date }> {
  const duration = validAdDuration(params.durationDays);
  const today = toDayStart(new Date());
  const requested = toDayStart(params.desiredStart);
  const start = requested < today ? today : requested;
  if (!Number.isFinite(start.getTime())) throw Object.assign(new Error("Invalid start date"), { statusCode: 400 });
  if (params.session) await normalizeLegacyActiveAds(new Date(), params.session);
  for (let offset = 0; offset <= 3650; offset++) {
    const candidate = addDays(start, offset);
    let available = true;
    for (let day = 0; day < duration; day++) {
      const dayStart = addDays(candidate, day);
      if (await countBookedForDay(dayStart, addDays(dayStart, 1), params) >= MAX_ACTIVE_SHOP_ADS) {
        available = false; break;
      }
    }
    if (available) return { startDate: candidate, endDate: addDays(candidate, duration) };
  }
  throw Object.assign(new Error("No advertising slots available in the scheduling horizon."), { statusCode: 409 });
}

// Management writes may normalize old ads; expiry is never extended if already set.
export async function normalizeLegacyActiveAds(now: Date, session?: ClientSession): Promise<void> {
  const ads = await ShopAd.find({ isActive: true, startDate: null }).session(session ?? null);
  for (const ad of ads) {
    const end = ad.endDate ?? ad.expiresAt ?? addDays(toDayStart(now), 30);
    await ShopAd.updateOne({ _id: ad._id }, { $set: {
      startDate: toDayStart(now), endDate: end, expiresAt: end, isActive: end > now,
    } }, { session });
  }
}
