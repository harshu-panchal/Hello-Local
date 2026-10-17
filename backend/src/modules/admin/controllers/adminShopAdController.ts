import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import ShopAd from "../../../models/ShopAd";
import { MAX_ACTIVE_SHOP_ADS, addDays, findNextAvailableWindow, getDurationDaysFromRange, shopAdActiveAtQuery, toDayStart } from "../../../utils/shopAdCapacity";
import { adError, findAdOrFail, syncLinkedAd, withAdTransaction } from "../../../services/adLifecycleService";
import { validAdDate, validAdLink, validateAdContent } from "../../../utils/adValidation";

export const getAllShopAds = asyncHandler(async (req: Request, res: Response) => {
  const { search, status, sortBy = "order", sortOrder = "asc" } = req.query;
  const query: any = {};
  if (status === "active") Object.assign(query, shopAdActiveAtQuery(new Date()));
  else if (status === "inactive") query.isActive = false;
  if (typeof search === "string" && search.trim()) {
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = ["shopName", "tagline", "requestedBy"].map(key => ({ [key]: { $regex: safe, $options: "i" } }));
  }
  const key = ["order", "createdAt", "shopName", "expiresAt"].includes(String(sortBy)) ? String(sortBy) : "order";
  const ads = await ShopAd.find(query).sort({ [key]: sortOrder === "desc" ? -1 : 1, ...(key !== "createdAt" ? { createdAt: -1 as const } : {}) });
  return res.json({ success: true, data: ads });
});

export const getActiveShopAds = asyncHandler(async (_req: Request, res: Response) => {
  const ads = await ShopAd.find(shopAdActiveAtQuery(new Date()))
    .select("shopName tagline description imageUrl badge badgeColor ctaText ctaLink order isActive approvedAt startDate endDate expiresAt createdAt updatedAt")
    .sort({ order: 1, createdAt: -1 }).limit(MAX_ACTIVE_SHOP_ADS).lean();
  res.setHeader("Cache-Control", "no-store");
  return res.json({ success: true, data: ads });
});

export const getShopAdById = asyncHandler(async (req: Request, res: Response) => {
  const ad = await ShopAd.findById(req.params.id);
  if (!ad) return res.status(404).json({ success: false, message: "Shop ad not found" });
  return res.json({ success: true, data: ad });
});

const contentKeys = ["shopName", "tagline", "description", "imageUrl", "badge", "badgeColor", "ctaText", "ctaLink", "order", "isActive", "contactInfo", "requestedBy"];
function content(body: any) { return Object.fromEntries(contentKeys.filter(key => body[key] !== undefined).map(key => [key, body[key]])); }
function windowInput(body: any, ad?: any, validate = true) {
  const start = body.startDate ? toDayStart(validAdDate(body.startDate, "Start date")) : ad?.startDate ?? toDayStart(new Date());
  const endValue = body.endDate || body.expiresAt;
  const parsedEnd = endValue ? validAdDate(endValue, "Expiry date") : ad?.endDate ?? ad?.expiresAt;
  const end = typeof endValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endValue) ? toDayStart(parsedEnd!) : parsedEnd;
  if (validate && end && end <= start) adError("Expiry must be after the start date.");
  return { start, end, duration: validate ? getDurationDaysFromRange(start, end, end) : 0 };
}

export const createShopAd = asyncHandler(async (req: Request, res: Response) => {
  validateAdContent(req.body);
  const input = windowInput(req.body);
  const data = content(req.body);
  data.ctaLink = validAdLink(data.ctaLink);
  const result = await withAdTransaction(async session => {
    const start = input.start < toDayStart(new Date()) ? toDayStart(new Date()) : input.start;
    const scheduled = data.isActive === false ? { startDate: start, endDate: addDays(start, input.duration) }
      : await findNextAvailableWindow({ desiredStart: start, durationDays: input.duration, session });
    const [ad] = await ShopAd.create([{ ...data, ...scheduled, expiresAt: scheduled.endDate, approvedAt: new Date() }], { session });
    return { ad, scheduled };
  });
  return res.status(201).json({ success: true, message: "Shop ad saved with its scheduled dates.", data: result.ad, scheduledWindow: result.scheduled });
});

export const updateShopAd = asyncHandler(async (req: Request, res: Response) => {
  const result = await withAdTransaction(async session => {
    const ad = await findAdOrFail(req.params.id, session);
    const data = content(req.body);
    validateAdContent({ ...ad.toObject(), ...data });
    if (data.ctaLink !== undefined) data.ctaLink = validAdLink(data.ctaLink);
    const input = windowInput(req.body, ad, false);
    const changedDate = (req.body.startDate && toDayStart(input.start).getTime() !== (ad.startDate && toDayStart(ad.startDate).getTime())) ||
      ((req.body.endDate || req.body.expiresAt) && toDayStart(input.end!).getTime() !== (ad.endDate && toDayStart(ad.endDate).getTime()));
    const activating = data.isActive === true && !ad.isActive;
    if (changedDate || activating) {
      if (!changedDate && input.end && input.end <= new Date()) adError("This ad has expired. Choose new dates to renew it.");
      const active = data.isActive ?? ad.isActive;
      input.duration = windowInput(req.body, ad).duration;
      // Resuming an unexpired ad preserves its existing end date.
      const resumeStart = input.start > toDayStart(new Date()) ? input.start : toDayStart(new Date());
      const duration = activating && !changedDate ? getDurationDaysFromRange(resumeStart, input.end, input.end) : input.duration;
      const scheduled = active ? await findNextAvailableWindow({ desiredStart: input.start, durationDays: duration, excludeShopAdId: ad._id as any, session })
        : { startDate: input.start, endDate: input.end ?? addDays(input.start, duration) };
      Object.assign(data, scheduled, { expiresAt: scheduled.endDate });
    }
    Object.assign(ad, data);
    await ad.save({ session });
    await syncLinkedAd(ad, session);
    return ad;
  });
  return res.json({ success: true, message: "Shop ad updated successfully", data: result });
});

export const deleteShopAd = asyncHandler(async (req: Request, res: Response) => {
  await withAdTransaction(async session => {
    const ad = await findAdOrFail(req.params.id, session);
    await syncLinkedAd(ad, session, true);
    await ad.deleteOne({ session });
  });
  return res.json({ success: true, message: "Shop ad deleted successfully" });
});

export const toggleShopAdStatus = asyncHandler(async (req: Request, res: Response) => {
  const ad = await withAdTransaction(async session => {
    const ad = await findAdOrFail(req.params.id, session);
    if (!ad.isActive) {
      const end = ad.endDate ?? ad.expiresAt;
      if (end && end <= new Date()) adError("This ad has expired. Choose new dates to renew it.");
      const start = ad.startDate && ad.startDate > new Date() ? ad.startDate : toDayStart(new Date());
      const scheduled = await findNextAvailableWindow({ desiredStart: start, durationDays: getDurationDaysFromRange(start, end, end), excludeShopAdId: ad._id as any, session });
      Object.assign(ad, scheduled, { expiresAt: scheduled.endDate });
    }
    ad.isActive = !ad.isActive;
    await ad.save({ session });
    await syncLinkedAd(ad, session);
    return ad;
  });
  return res.json({ success: true, message: `Shop ad ${ad.isActive ? "activated" : "paused"}.`, data: ad });
});

export const reorderShopAds = asyncHandler(async (req: Request, res: Response) => {
  if (!Array.isArray(req.body.orders)) return res.status(400).json({ success: false, message: "Orders array is required" });
  await Promise.all(req.body.orders.map(({ id, order }: { id: string; order: number }) => ShopAd.findByIdAndUpdate(id, { order }, { runValidators: true })));
  return res.json({ success: true, message: "Shop ads reordered successfully" });
});
