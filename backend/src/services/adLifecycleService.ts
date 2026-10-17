import mongoose, { ClientSession, Schema } from "mongoose";
import SellerAdRequest from "../models/SellerAdRequest";
import type { AdRequestStatus } from "../models/SellerAdRequest";
import ShopAd from "../models/ShopAd";

// Every capacity-changing write takes this document's transaction write lock.
// MongoDB retries a competing transaction against a fresh snapshot.
const ScheduleLock = mongoose.models.AdScheduleLock || mongoose.model("AdScheduleLock",
  new Schema({ _id: String, revision: { type: Number, default: 0 } }));

export async function withAdTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  try {
    await ScheduleLock.updateOne({ _id: "schedule" }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  } catch (error: any) {
    if (error.code !== 11000) throw error;
  }
  const session = await mongoose.startSession();
  try {
    return (await session.withTransaction(async () => {
      await ScheduleLock.updateOne({ _id: "schedule" }, { $inc: { revision: 1 } }, { session });
      return work(session);
    })) as T;
  } finally {
    await session.endSession();
  }
}

export function adError(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

export function adStatus(ad: { isActive: boolean; startDate?: Date; endDate?: Date; expiresAt?: Date }, now = new Date()): AdRequestStatus {
  const end = ad.endDate ?? ad.expiresAt;
  if (end && end <= now) return "Expired";
  if (!ad.isActive) return "Paused";
  return ad.startDate && ad.startDate > now ? "Scheduled" : "Live";
}

export async function syncLinkedAd(ad: any, session: ClientSession, deleted = false) {
  await SellerAdRequest.updateMany({ shopAdId: ad._id }, { $set: {
    status: deleted ? "Removed" : adStatus(ad),
    startDate: ad.startDate, endDate: ad.endDate, expiresAt: ad.expiresAt,
  } }, { session });
}

// Called on authenticated management reads. Public ad reads never write.
export async function refreshAdStatuses(scope: Record<string, unknown> = {}) {
  const requests = await SellerAdRequest.aggregate([
    { $match: { ...scope, status: { $in: ["Live", "Scheduled", "Paused", "Expired", "Removed"] } } },
    { $lookup: { from: ShopAd.collection.name, localField: "shopAdId", foreignField: "_id", as: "ads" } },
    { $project: { status: 1, updatedAt: 1, startDate: 1, endDate: 1, expiresAt: 1,
      ad: { $arrayElemAt: ["$ads", 0] } } },
  ]);
  const changes = [];
  for (const request of requests) {
    const status: AdRequestStatus = request.ad ? adStatus(request.ad) : "Removed";
    const dates = request.ad ? { startDate: request.ad.startDate, endDate: request.ad.endDate, expiresAt: request.ad.expiresAt } : {};
    const datesChanged = Object.entries(dates).some(([key, value]) => String(value ?? "") !== String(request[key] ?? ""));
    if (status !== request.status || datesChanged) changes.push({ updateOne: {
      // Do not overwrite an admin edit that committed after the lookup snapshot.
      filter: { _id: request._id, status: request.status, updatedAt: request.updatedAt },
      update: { $set: { status, ...dates } },
    } });
  }
  if (changes.length) await SellerAdRequest.bulkWrite(changes);
}

export async function notifyAd(data: any) {
  // A notification failure must not turn a committed booking into a failed request.
  try {
    const Notification = (await import("../models/Notification")).default;
    await Notification.create(data);
  } catch (error) {
    console.error("Ad notification failed:", error);
  }
}

export async function findAdOrFail(id: string, session: ClientSession) {
  const ad = await ShopAd.findById(id).session(session);
  if (!ad) adError("Shop ad not found", 404);
  return ad!;
}
