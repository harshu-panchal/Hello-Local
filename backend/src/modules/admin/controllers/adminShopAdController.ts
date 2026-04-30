import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import ShopAd from "../../../models/ShopAd";
import {
    MAX_ACTIVE_SHOP_ADS,
    addDays,
    enforceMaxActiveAdsNow,
    findNextAvailableWindow,
    getDurationDaysFromRange,
    shopAdActiveAtQuery,
    toDayStart,
} from "../../../utils/shopAdCapacity";

/**
 * Get all shop ads
 */
export const getAllShopAds = asyncHandler(async (req: Request, res: Response) => {
    const { status, sortBy = "order", sortOrder = "asc" } = req.query;

    let query: any = {};
    if (status === "active") query.isActive = true;
    else if (status === "inactive") query.isActive = false;

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "desc" ? -1 : 1;
    if (sortBy !== "createdAt") sort.createdAt = -1;

    const ads = await ShopAd.find(query).sort(sort);

    return res.status(200).json({
        success: true,
        message: "Shop ads fetched successfully",
        data: ads,
    });
});

/**
 * Get all ACTIVE shop ads (public endpoint for carousel)
 */
export const getActiveShopAds = asyncHandler(async (req: Request, res: Response) => {
    void req;
    const now = new Date();

    // Enforce strict max concurrency before returning the carousel payload.
    await enforceMaxActiveAdsNow(now);

    const ads = await ShopAd.find(shopAdActiveAtQuery(now))
        .sort({ order: 1, createdAt: -1 })
        .limit(MAX_ACTIVE_SHOP_ADS);

    return res.status(200).json({
        success: true,
        message: "Active shop ads fetched successfully",
        data: ads,
    });
});

/**
 * Get shop ad by ID
 */
export const getShopAdById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const ad = await ShopAd.findById(id);

    if (!ad) {
        return res.status(404).json({ success: false, message: "Shop ad not found" });
    }

    return res.status(200).json({ success: true, data: ad });
});

/**
 * Create a new shop ad
 */
export const createShopAd = asyncHandler(async (req: Request, res: Response) => {
    const {
        shopName, tagline, description, imageUrl, badge, badgeColor,
        ctaText, ctaLink, order, isActive, contactInfo, requestedBy, expiresAt,
        startDate, endDate
    } = req.body;

    if (!shopName || !tagline || !imageUrl) {
        return res.status(400).json({
            success: false,
            message: "Shop name, tagline, and image URL are required",
        });
    }

    const nowDay = toDayStart(new Date());
    const requestedStart = startDate ? toDayStart(new Date(startDate)) : nowDay;
    const safeRequestedStart = requestedStart < nowDay ? nowDay : requestedStart;
    const requestedEnd = endDate ? new Date(endDate) : undefined;
    const requestedExpires = expiresAt ? new Date(expiresAt) : undefined;
    const durationDays = getDurationDaysFromRange(safeRequestedStart, requestedEnd, requestedExpires);

    const shouldSchedule = isActive !== false;
    const scheduled = shouldSchedule
        ? await findNextAvailableWindow({ desiredStart: safeRequestedStart, durationDays })
        : { startDate: safeRequestedStart, endDate: addDays(safeRequestedStart, durationDays) };

    const ad = await ShopAd.create({
        shopName, tagline, description, imageUrl,
        badge: badge || "PREMIUM",
        badgeColor: badgeColor || "#FF4B6E",
        ctaText: ctaText || "Visit Shop",
        ctaLink,
        order: order ?? 0,
        isActive: isActive !== undefined ? isActive : true,
        contactInfo,
        requestedBy,
        startDate: scheduled.startDate,
        endDate: scheduled.endDate,
        expiresAt: scheduled.endDate,
        approvedAt: new Date(),
    });

    return res.status(201).json({
        success: true,
        message:
            shouldSchedule && scheduled.startDate.getTime() !== safeRequestedStart.getTime()
                ? "Capacity was full. Ad has been queued to the next available slot."
                : "Shop ad created successfully",
        data: ad,
        scheduledWindow: {
            requestedStartDate: safeRequestedStart,
            startDate: scheduled.startDate,
            endDate: scheduled.endDate,
        },
    });
});

/**
 * Update a shop ad
 */
export const updateShopAd = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = { ...req.body };
    if (updateData.expiresAt) updateData.expiresAt = new Date(updateData.expiresAt);
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

    const ad = await ShopAd.findById(id);
    if (!ad) {
        return res.status(404).json({ success: false, message: "Shop ad not found" });
    }

    const willBeActive = updateData.isActive !== undefined ? updateData.isActive : ad.isActive;
    const nowDay = toDayStart(new Date());

    const requestedStart = toDayStart(new Date(updateData.startDate || ad.startDate || nowDay));
    const safeRequestedStart = requestedStart < nowDay ? nowDay : requestedStart;
    const requestedEnd = updateData.endDate || updateData.expiresAt || ad.endDate || ad.expiresAt;
    const durationDays = getDurationDaysFromRange(safeRequestedStart, requestedEnd, requestedEnd);

    const scheduled = willBeActive
        ? await findNextAvailableWindow({
            desiredStart: safeRequestedStart,
            durationDays,
            excludeShopAdId: id,
        })
        : { startDate: safeRequestedStart, endDate: addDays(safeRequestedStart, durationDays) };

    updateData.startDate = scheduled.startDate;
    updateData.endDate = scheduled.endDate;
    updateData.expiresAt = scheduled.endDate;

    const updatedAd = await ShopAd.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
    });

    return res.status(200).json({
        success: true,
        message:
            willBeActive && scheduled.startDate.getTime() !== safeRequestedStart.getTime()
                ? "Capacity was full. Ad has been queued to the next available slot."
                : "Shop ad updated successfully",
        data: updatedAd,
        scheduledWindow: { requestedStartDate: safeRequestedStart, startDate: scheduled.startDate, endDate: scheduled.endDate },
    });
});

/**
 * Delete a shop ad
 */
export const deleteShopAd = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const ad = await ShopAd.findByIdAndDelete(id);

    if (!ad) {
        return res.status(404).json({ success: false, message: "Shop ad not found" });
    }

    return res.status(200).json({ success: true, message: "Shop ad deleted successfully" });
});

/**
 * Toggle ad active status
 */
export const toggleShopAdStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const ad = await ShopAd.findById(id);

    if (!ad) {
        return res.status(404).json({ success: false, message: "Shop ad not found" });
    }

    const nowDay = toDayStart(new Date());
    let scheduledWindow: { requestedStartDate: Date; startDate: Date; endDate: Date } | undefined;

    // If activating, queue to next available slot if needed.
    if (!ad.isActive) {
        const requestedStart = toDayStart(new Date(ad.startDate || nowDay));
        const safeRequestedStart = requestedStart < nowDay ? nowDay : requestedStart;
        const durationDays = getDurationDaysFromRange(
            safeRequestedStart,
            ad.endDate || undefined,
            ad.expiresAt || undefined
        );

        const scheduled = await findNextAvailableWindow({
            desiredStart: safeRequestedStart,
            durationDays,
            excludeShopAdId: id,
        });

        ad.startDate = scheduled.startDate as any;
        ad.endDate = scheduled.endDate as any;
        ad.expiresAt = scheduled.endDate as any;

        scheduledWindow = {
            requestedStartDate: safeRequestedStart,
            startDate: scheduled.startDate,
            endDate: scheduled.endDate,
        };
    }

    ad.isActive = !ad.isActive;
    await ad.save();

    return res.status(200).json({
        success: true,
        message: `Shop ad ${ad.isActive ? "activated" : "deactivated"} successfully`,
        data: ad,
        ...(scheduledWindow ? { scheduledWindow } : {}),
    });
});

/**
 * Reorder shop ads
 */
export const reorderShopAds = asyncHandler(async (req: Request, res: Response) => {
    const { orders } = req.body; // [{ id: string, order: number }]

    if (!Array.isArray(orders)) {
        return res.status(400).json({ success: false, message: "Orders array is required" });
    }

    await Promise.all(
        orders.map(({ id, order }: { id: string; order: number }) =>
            ShopAd.findByIdAndUpdate(id, { order })
        )
    );

    return res.status(200).json({ success: true, message: "Shop ads reordered successfully" });
});
