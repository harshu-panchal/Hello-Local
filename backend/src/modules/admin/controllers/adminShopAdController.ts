import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import ShopAd from "../../../models/ShopAd";

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
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ order: 1, createdAt: -1 });

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
    } = req.body;

    if (!shopName || !tagline || !imageUrl) {
        return res.status(400).json({
            success: false,
            message: "Shop name, tagline, and image URL are required",
        });
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
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
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

    const ad = await ShopAd.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
    });

    if (!ad) {
        return res.status(404).json({ success: false, message: "Shop ad not found" });
    }

    return res.status(200).json({
        success: true,
        message: "Shop ad updated successfully",
        data: ad,
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
