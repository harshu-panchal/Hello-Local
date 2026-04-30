import mongoose, { FilterQuery } from "mongoose";
import ShopAd, { IShopAd } from "../models/ShopAd";
import SellerAdRequest, { ISellerAdRequest } from "../models/SellerAdRequest";

export const MAX_ACTIVE_SHOP_ADS = 10;
const DEFAULT_LEGACY_DURATION_DAYS = 30;
const MAX_SCHEDULER_SEARCH_DAYS = 3650; // 10 years safety bound

export function toDayStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getEffectiveEndForQuery(endDate?: Date, expiresAt?: Date) {
  // If endDate exists use it; otherwise fall back to expiresAt.
  // This is stored in DB, so we handle missing fields in query logic too.
  return endDate ?? expiresAt;
}

export function shopAdActiveAtQuery(at: Date): FilterQuery<IShopAd> {
  return {
    isActive: true,
    $or: [
      {
        startDate: { $lte: at },
        $or: [{ endDate: { $gte: at } }, { expiresAt: { $gte: at } }],
      },
      {
        startDate: { $exists: false },
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: at } },
        ],
      },
    ],
  };
}

export function shopAdOverlapsQuery(
  rangeStart: Date,
  rangeEnd: Date,
  opts?: { excludeShopAdId?: string | mongoose.Types.ObjectId }
): FilterQuery<IShopAd> {
  const excludeShopAdId = opts?.excludeShopAdId;

  return {
    ...(excludeShopAdId ? { _id: { $ne: excludeShopAdId } } : {}),
    isActive: true,
    $or: [
      {
        startDate: { $lt: rangeEnd },
        $or: [{ endDate: { $gt: rangeStart } }, { expiresAt: { $gt: rangeStart } }],
      },
      {
        startDate: { $exists: false },
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: rangeStart } },
        ],
      },
    ],
  };
}

export function getDurationDaysFromRange(startDate?: Date, endDate?: Date, expiresAt?: Date): number {
  const start = startDate ? toDayStart(startDate) : undefined;
  const end = getEffectiveEndForQuery(endDate, expiresAt);

  if (!start || !end) return 1;

  const deltaMs = end.getTime() - start.getTime();
  const days = Math.ceil(deltaMs / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}

async function countBookedForDay(params: {
  dayStart: Date;
  dayEnd: Date;
  excludeShopAdId?: string | mongoose.Types.ObjectId;
  excludeRequestId?: string | mongoose.Types.ObjectId;
}): Promise<number> {
  const { dayStart, dayEnd, excludeShopAdId, excludeRequestId } = params;

  const [liveAdsCount, reservedSlotsCount] = await Promise.all([
    ShopAd.countDocuments(shopAdOverlapsQuery(dayStart, dayEnd, { excludeShopAdId })),
    SellerAdRequest.countDocuments({
      ...(excludeRequestId ? { _id: { $ne: excludeRequestId } } : {}),
      status: { $in: ["Approved", "PaymentPending", "PaymentVerified"] },
      startDate: { $lt: dayEnd },
      endDate: { $gt: dayStart },
    } as FilterQuery<ISellerAdRequest>),
  ]);

  return liveAdsCount + reservedSlotsCount;
}

export async function findNextAvailableWindow(params: {
  desiredStart: Date;
  durationDays: number;
  excludeShopAdId?: string | mongoose.Types.ObjectId;
  excludeRequestId?: string | mongoose.Types.ObjectId;
}): Promise<{ startDate: Date; endDate: Date }> {
  const durationDays = Math.max(1, Math.floor(params.durationDays || 1));
  const desiredStart = toDayStart(params.desiredStart);

  // Ensure legacy "always active" ads are converted into explicit windows so queuing can progress.
  await normalizeLegacyActiveAds(new Date());

  for (let offset = 0; offset <= MAX_SCHEDULER_SEARCH_DAYS; offset++) {
    const candidateStart = addDays(desiredStart, offset);
    const candidateEnd = addDays(candidateStart, durationDays);

    let ok = true;
    for (let i = 0; i < durationDays; i++) {
      const dayStart = addDays(candidateStart, i);
      const dayEnd = addDays(dayStart, 1);
      const booked = await countBookedForDay({
        dayStart,
        dayEnd,
        excludeShopAdId: params.excludeShopAdId,
        excludeRequestId: params.excludeRequestId,
      });

      if (booked >= MAX_ACTIVE_SHOP_ADS) {
        ok = false;
        break;
      }
    }

    if (ok) {
      return { startDate: candidateStart, endDate: candidateEnd };
    }
  }

  throw new Error("No available ad slots found in scheduling horizon.");
}

export async function normalizeLegacyActiveAds(now: Date): Promise<void> {
  // Legacy ads (no startDate) are treated as "always active". To make queuing/capacity deterministic,
  // we normalize them into an explicit time window starting today.
  const legacyAds = await ShopAd.find({
    isActive: true,
    startDate: { $exists: false },
  }).select("_id startDate endDate expiresAt createdAt");

  if (legacyAds.length === 0) return;

  const today = toDayStart(now);

  await Promise.all(
    legacyAds.map(async (ad) => {
      const effectiveEnd =
        ad.expiresAt ??
        addDays(today, DEFAULT_LEGACY_DURATION_DAYS);

      // Ensure end is after start.
      const normalizedEnd = effectiveEnd > today ? effectiveEnd : addDays(today, 1);

      await ShopAd.updateOne(
        { _id: ad._id },
        {
          $set: {
            startDate: today,
            endDate: normalizedEnd,
            expiresAt: normalizedEnd,
          },
        }
      );
    })
  );
}

export async function enforceMaxActiveAdsNow(now: Date): Promise<void> {
  await normalizeLegacyActiveAds(now);

  const activeNow = await ShopAd.find(shopAdActiveAtQuery(now))
    .sort({ order: 1, createdAt: -1 })
    .select("_id startDate endDate expiresAt createdAt order")
    .lean();

  if (activeNow.length <= MAX_ACTIVE_SHOP_ADS) return;

  const overflow = activeNow.slice(MAX_ACTIVE_SHOP_ADS);

  // Overflow ads get queued starting tomorrow (or later) to avoid >MAX active at the same time.
  const schedulingBase = addDays(toDayStart(now), 1);

  for (const ad of overflow) {
    const durationDays = getDurationDaysFromRange(
      ad.startDate ? new Date(ad.startDate) : undefined,
      ad.endDate ? new Date(ad.endDate) : undefined,
      ad.expiresAt ? new Date(ad.expiresAt) : undefined
    );

    const { startDate, endDate } = await findNextAvailableWindow({
      desiredStart: schedulingBase,
      durationDays,
      excludeShopAdId: ad._id,
    });

    await ShopAd.updateOne(
      { _id: ad._id },
      { $set: { startDate, endDate, expiresAt: endDate } }
    );

    // Keep SellerAdRequest in sync if this ad is linked to one.
    await SellerAdRequest.updateOne(
      { shopAdId: ad._id, status: "Live" },
      { $set: { startDate, endDate, expiresAt: endDate } }
    );
  }

  // Safety: after scheduling, we should not still have >MAX active.
  // If legacy/indefinite ads exist elsewhere, the scheduler would have thrown.
}
