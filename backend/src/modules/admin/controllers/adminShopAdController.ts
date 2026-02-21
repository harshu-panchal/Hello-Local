import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import ShopAd from "../../../models/ShopAd";

const MAX_ACTIVE_ADS = 10;

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
    const now = new Date();
    const ads = await ShopAd.find({
        isActive: true,
        $or: [
            // If dates are set, check if now is between them
            {
                startDate: { $lte: now },
                endDate: { $gte: now }
            },
            // Fallback for legacy ads without startDate
            {
                startDate: { $exists: false },
                $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }]
            }
        ],
    })
        .sort({ order: 1, createdAt: -1 })
        .limit(MAX_ACTIVE_ADS);

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

    // Check limit if activating
    if (isActive !== false) {
        const checkStart = startDate ? new Date(startDate) : new Date();
        const checkEnd = endDate ? new Date(endDate) : (expiresAt ? new Date(expiresAt) : new Date(checkStart.getTime() + 24 * 60 * 60 * 1000));

        const duration = Math.ceil((checkEnd.getTime() - checkStart.getTime()) / (1000 * 60 * 60 * 24)) || 1;

        for (let i = 0; i < duration; i++) {
            const dayStart = new Date(checkStart);
            dayStart.setDate(dayStart.getDate() + i);
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const activeOnThisDay = await ShopAd.countDocuments({
                isActive: true,
                startDate: { $lt: dayEnd },
                endDate: { $gt: dayStart }
            });

            if (activeOnThisDay >= MAX_ACTIVE_ADS) {
                return res.status(400).json({
                    success: false,
                    message: `Slots are already full for ${dayStart.toDateString()}. Cannot add more ads for this range.`,
                });
            }
        }
    }

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
        expiresAt: expiresAt ? new Date(expiresAt) : (endDate ? new Date(endDate) : undefined),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : (startDate ? new Date(new Date(startDate).getTime() + 24 * 60 * 60 * 1000) : undefined),
        approvedAt: new Date(),
    });

    return res.status(201).json({
        success: true,
        message: "Shop ad created successfully",
        data: ad,
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

    // If trying to activate or change dates while active, check range limit
    if ((updateData.isActive === true || (ad.isActive && (updateData.startDate || updateData.endDate || updateData.expiresAt)))) {
        const checkStart = new Date(updateData.startDate || ad.startDate || new Date());
        const checkEnd = new Date(updateData.endDate || updateData.expiresAt || ad.endDate || ad.expiresAt || new Date(checkStart.getTime() + 24 * 60 * 60 * 1000));

        const duration = Math.ceil((checkEnd.getTime() - checkStart.getTime()) / (1000 * 60 * 60 * 24)) || 1;

        for (let i = 0; i < duration; i++) {
            const dayStart = new Date(checkStart);
            dayStart.setDate(dayStart.getDate() + i);
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const activeOnThisDay = await ShopAd.countDocuments({
                _id: { $ne: id },
                isActive: true,
                startDate: { $lt: dayEnd },
                endDate: { $gt: dayStart }
            });

            if (activeOnThisDay >= MAX_ACTIVE_ADS) {
                return res.status(400).json({
                    success: false,
                    message: `Slots are already full for ${dayStart.toDateString()}. Cannot set this active range.`,
                });
            }
        }
    }

    const updatedAd = await ShopAd.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
    });

    return res.status(200).json({
        success: true,
        message: "Shop ad updated successfully",
        data: updatedAd,
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

    // If activating, check limit for its date range
    if (!ad.isActive) {
        const checkStart = ad.startDate || new Date();
        const checkEnd = ad.endDate || ad.expiresAt || new Date(checkStart.getTime() + 24 * 60 * 60 * 1000);

        const duration = Math.ceil((checkEnd.getTime() - checkStart.getTime()) / (1000 * 60 * 60 * 24)) || 1;

        for (let i = 0; i < duration; i++) {
            const dayStart = new Date(checkStart);
            dayStart.setDate(dayStart.getDate() + i);
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const activeOnThisDay = await ShopAd.countDocuments({
                _id: { $ne: id },
                isActive: true,
                startDate: { $lt: dayEnd },
                endDate: { $gt: dayStart }
            });

            if (activeOnThisDay >= MAX_ACTIVE_ADS) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot activate: Slots full for ${dayStart.toDateString()} in this ad's range.`,
                });
            }
        }
    }

    ad.isActive = !ad.isActive;
    await ad.save();

    return res.status(200).json({
        success: true,
        message: `Shop ad ${ad.isActive ? "activated" : "deactivated"} successfully`,
        data: ad,
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
