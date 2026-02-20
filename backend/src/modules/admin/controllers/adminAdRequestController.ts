import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SellerAdRequest from "../../../models/SellerAdRequest";
import ShopAd from "../../../models/ShopAd";
import Notification from "../../../models/Notification";

const MAX_ACTIVE_ADS = 10;

/**
 * Admin: Get all ad requests
 */
export const getAllAdRequests = asyncHandler(async (req: Request, res: Response) => {
    const { status, page = 1, limit = 50 } = req.query;
    const query: any = {};
    if (status) query.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [requests, total] = await Promise.all([
        SellerAdRequest.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit as string)),
        SellerAdRequest.countDocuments(query),
    ]);

    return res.status(200).json({
        success: true,
        data: requests,
        pagination: { page: parseInt(page as string), limit: parseInt(limit as string), total },
    });
});

/**
 * Admin: Get single ad request
 */
export const getAdRequestById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const request = await SellerAdRequest.findById(id);
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    return res.status(200).json({ success: true, data: request });
});

/**
 * Admin: Approve request + set price + notify seller
 */
export const approveAdRequest = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adPrice, adminNote } = req.body;

    const request = await SellerAdRequest.findById(id);
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    if (request.status !== "Pending") {
        return res.status(400).json({ success: false, message: "Only pending requests can be approved." });
    }

    // Check active ad limit
    const activeCount = await ShopAd.countDocuments({ isActive: true });
    if (activeCount >= MAX_ACTIVE_ADS) {
        return res.status(400).json({
            success: false,
            message: `Maximum of ${MAX_ACTIVE_ADS} active ads allowed. Please deactivate an existing ad first.`,
        });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + request.durationDays);

    // Create the live ShopAd
    const shopAd = await ShopAd.create({
        shopName: request.shopName,
        tagline: request.tagline,
        description: request.description,
        imageUrl: request.imageUrl,
        badge: request.badge,
        badgeColor: request.badgeColor,
        ctaText: request.ctaText,
        ctaLink: request.ctaLink,
        isActive: true,
        requestedBy: `${request.sellerName} (Seller)`,
        contactInfo: {
            name: request.sellerName,
            phone: request.sellerPhone,
            email: request.sellerEmail,
        },
        approvedAt: new Date(),
        expiresAt,
        order: activeCount, // append at end
    });

    // Update request to Live directly
    request.status = "Live";
    request.adPrice = parseFloat(adPrice) || 0;
    request.adminNote = adminNote || "";
    request.approvedAt = new Date();
    request.paidAt = new Date();
    request.paymentStatus = "Paid"; // Assumed paid or override when admin manually approves to live
    request.shopAdId = shopAd._id as any;
    request.expiresAt = expiresAt;
    await request.save();

    // Notify seller that it's LIVE
    await Notification.create({
        recipientType: "Seller",
        recipientId: request.sellerId,
        title: "🎉 Your Ad is Now Live!",
        message: `Congratulations! Your ad for "${request.shopName}" has been approved and is now showing on the Hello Local homepage! It will run until ${expiresAt.toLocaleDateString()}.`,
        type: "Payment",
        link: `/seller/ad-requests?requestId=${request._id}`,
        actionLabel: "View Status",
        priority: "High",
        isRead: false,
    });

    return res.status(200).json({
        success: true,
        message: "Ad approved and is now LIVE on the homepage carousel.",
        data: { request, shopAd },
    });
});

/**
 * Admin: Reject ad request
 */
export const rejectAdRequest = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await SellerAdRequest.findById(id);
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    if (!["Pending", "PaymentPending"].includes(request.status)) {
        return res.status(400).json({ success: false, message: "This request cannot be rejected." });
    }

    request.status = "Rejected";
    request.adminNote = adminNote || "Request rejected by admin.";
    request.rejectedAt = new Date();
    await request.save();

    // Notify seller
    await Notification.create({
        recipientType: "Seller",
        recipientId: request.sellerId,
        title: "❌ Ad Request Rejected",
        message: `Your ad request for "${request.shopName}" was rejected. Reason: ${request.adminNote}`,
        type: "Warning",
        link: `/seller/ad-requests?requestId=${request._id}`,
        actionLabel: "View Details",
        priority: "High",
        isRead: false,
    });

    return res.status(200).json({ success: true, message: "Request rejected.", data: request });
});

/**
 * Admin: Verify payment & make ad live
 */
export const verifyPaymentAndActivate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await SellerAdRequest.findById(id);
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    if (request.status !== "PaymentPending") {
        return res.status(400).json({ success: false, message: "Request is not awaiting payment verification." });
    }

    // Enforce 10 ad limit before making live
    const activeCount = await ShopAd.countDocuments({ isActive: true });
    if (activeCount >= MAX_ACTIVE_ADS) {
        return res.status(400).json({
            success: false,
            message: `Cannot activate: maximum ${MAX_ACTIVE_ADS} active ads already reached. Deactivate one first.`,
        });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + request.durationDays);

    // Create the live ShopAd
    const shopAd = await ShopAd.create({
        shopName: request.shopName,
        tagline: request.tagline,
        description: request.description,
        imageUrl: request.imageUrl,
        badge: request.badge,
        badgeColor: request.badgeColor,
        ctaText: request.ctaText,
        ctaLink: request.ctaLink,
        isActive: true,
        requestedBy: `${request.sellerName} (Seller)`,
        contactInfo: {
            name: request.sellerName,
            phone: request.sellerPhone,
            email: request.sellerEmail,
        },
        approvedAt: new Date(),
        expiresAt,
        order: activeCount, // append at end
    });

    // Update request
    request.status = "Live";
    request.paymentStatus = "Paid";
    request.paidAt = new Date();
    request.shopAdId = shopAd._id as any;
    request.expiresAt = expiresAt;
    request.adminNote = adminNote || request.adminNote;
    await request.save();

    // Notify seller
    await Notification.create({
        recipientType: "Seller",
        recipientId: request.sellerId,
        title: "🎉 Your Ad is Now Live!",
        message: `Your ad for "${request.shopName}" is now showing on the Hello Local homepage! It will run until ${expiresAt.toLocaleDateString()}.`,
        type: "Success",
        link: `/seller/ad-requests?requestId=${request._id}`,
        actionLabel: "View Status",
        priority: "High",
        isRead: false,
    });

    return res.status(200).json({
        success: true,
        message: "Payment verified! Ad is now live on the home page carousel.",
        data: { request, shopAd },
    });
});

/**
 * Admin: Get ad request count stats
 */
export const getAdRequestStats = asyncHandler(async (req: Request, res: Response) => {
    const [pending, approved, paymentPending, live, rejected, activeAds] = await Promise.all([
        SellerAdRequest.countDocuments({ status: "Pending" }),
        SellerAdRequest.countDocuments({ status: "Approved" }),
        SellerAdRequest.countDocuments({ status: "PaymentPending" }),
        SellerAdRequest.countDocuments({ status: "Live" }),
        SellerAdRequest.countDocuments({ status: "Rejected" }),
        ShopAd.countDocuments({ isActive: true }),
    ]);

    return res.status(200).json({
        success: true,
        data: { pending, approved, paymentPending, live, rejected, activeAds, maxAds: MAX_ACTIVE_ADS },
    });
});
