import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SellerAdRequest from "../../../models/SellerAdRequest";
import Notification from "../../../models/Notification";
import Seller from "../../../models/Seller";

/**
 * Seller: Submit a new ad request
 */
export const createAdRequest = asyncHandler(async (req: Request, res: Response) => {
    const sellerId = req.user?.userId;
    if (!sellerId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
        shopName, tagline, description, imageUrl, badge, badgeColor,
        ctaText, ctaLink, durationDays, requestedPrice,
        sellerPhone, paymentNote,
        paymentMethod, paymentReference, paymentScreenshotUrl
    } = req.body;

    if (!shopName || !tagline || !imageUrl || !durationDays) {
        return res.status(400).json({
            success: false,
            message: "Shop name, tagline, image, and duration are required.",
        });
    }

    // Fetch seller details from DB
    const seller = await Seller.findById(sellerId).select("sellerName email mobile storeName");
    if (!seller) {
        return res.status(404).json({ success: false, message: "Seller not found." });
    }

    // Determine status: if payment info is provided, it's PaymentPending
    const hasPayment = paymentReference || paymentScreenshotUrl;
    const status = hasPayment ? "PaymentPending" : "Pending";

    const adRequest = await SellerAdRequest.create({
        sellerId,
        sellerName: seller.sellerName || seller.storeName || "Unknown Seller",
        sellerEmail: seller.email || "",
        sellerPhone: sellerPhone || seller.mobile || "",
        shopName,
        tagline,
        description,
        imageUrl,
        badge: badge || "FEATURED",
        badgeColor: badgeColor || "#FF4B6E",
        ctaText: ctaText || "Visit Shop",
        ctaLink,
        durationDays: parseInt(durationDays) || 30,
        requestedPrice: requestedPrice ? parseFloat(requestedPrice) : undefined,
        // If payment is provided, we set the adPrice to the requestedPrice or a default based on duration
        adPrice: requestedPrice ? parseFloat(requestedPrice) : 0,
        paymentNote,
        status,
        paymentStatus: "Unpaid",
        paymentMethod: paymentMethod || "UPI",
        paymentReference,
        paymentScreenshotUrl,
    });

    // Notify admin
    await Notification.create({
        recipientType: "Admin",
        title: hasPayment ? "💳 New Ad & Payment Submitted" : "📢 New Ad Request from Seller",
        message: hasPayment
            ? `${adRequest.sellerName} submitted an ad for "${shopName}" with payment proof. Please verify & go live.`
            : `${adRequest.sellerName} has requested a shop ad for "${shopName}" (${durationDays} days).`,
        type: hasPayment ? "Payment" : "Info",
        link: `/admin/shop-ads?tab=requests&requestId=${adRequest._id}`,
        actionLabel: hasPayment ? "Verify & Go Live" : "Review Request",
        priority: hasPayment ? "Urgent" : "High",
        isRead: false,
    });

    return res.status(201).json({
        success: true,
        message: hasPayment
            ? "Ad and payment proof submitted successfully! Admin will verify and activate your ad."
            : "Ad request submitted successfully! Admin will review and get back to you.",
        data: adRequest,
    });
});

/**
 * Seller: Get own ad requests
 */
export const getMyAdRequests = asyncHandler(async (req: Request, res: Response) => {
    const sellerId = req.user?.userId;
    if (!sellerId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const requests = await SellerAdRequest.find({ sellerId }).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: requests });
});

/**
 * Seller: Get specific ad request
 */
export const getMyAdRequestById = asyncHandler(async (req: Request, res: Response) => {
    const sellerId = req.user?.userId;
    const { id } = req.params;

    const request = await SellerAdRequest.findOne({ _id: id, sellerId });
    if (!request) {
        return res.status(404).json({ success: false, message: "Ad request not found" });
    }

    return res.status(200).json({ success: true, data: request });
});

/**
 * Seller: Submit payment proof after admin approval
 */
export const submitPaymentProof = asyncHandler(async (req: Request, res: Response) => {
    const sellerId = req.user?.userId;
    const { id } = req.params;
    const { paymentMethod, paymentReference, paymentScreenshotUrl, paymentNote } = req.body;

    const request = await SellerAdRequest.findOne({ _id: id, sellerId });
    if (!request) {
        return res.status(404).json({ success: false, message: "Ad request not found" });
    }

    if (request.status !== "Approved") {
        return res.status(400).json({
            success: false,
            message: "Payment can only be submitted for approved requests.",
        });
    }

    if (!paymentReference && !paymentScreenshotUrl) {
        return res.status(400).json({
            success: false,
            message: "Payment reference or screenshot is required.",
        });
    }

    request.paymentMethod = paymentMethod || "UPI";
    request.paymentReference = paymentReference;
    request.paymentScreenshotUrl = paymentScreenshotUrl;
    request.paymentNote = paymentNote;
    request.status = "PaymentPending";
    await request.save();

    // Notify admin about payment
    await Notification.create({
        recipientType: "Admin",
        title: "💳 Payment Proof Submitted",
        message: `${request.sellerName} has submitted payment proof for ad "${request.shopName}". Please verify.`,
        type: "Payment",
        link: `/admin/shop-ads?tab=requests&requestId=${request._id}`,
        actionLabel: "Verify Payment",
        priority: "Urgent",
        isRead: false,
    });

    return res.status(200).json({
        success: true,
        message: "Payment proof submitted! Admin will verify and activate your ad.",
        data: request,
    });
});

/**
 * Seller: Cancel/delete own pending request
 */
export const cancelAdRequest = asyncHandler(async (req: Request, res: Response) => {
    const sellerId = req.user?.userId;
    const { id } = req.params;

    const request = await SellerAdRequest.findOne({ _id: id, sellerId });
    if (!request) {
        return res.status(404).json({ success: false, message: "Ad request not found" });
    }

    if (!["Pending", "Rejected"].includes(request.status)) {
        return res.status(400).json({
            success: false,
            message: "Only pending or rejected requests can be cancelled.",
        });
    }

    await request.deleteOne();
    return res.status(200).json({ success: true, message: "Ad request cancelled." });
});

/**
 * Seller: Get public stats about ad availability
 */
export const getPublicAdStats = asyncHandler(async (_req: Request, res: Response) => {
    const activeAds = await SellerAdRequest.countDocuments({ status: "Live" });
    const maxAds = 10; // This should ideally come from a config

    return res.status(200).json({
        success: true,
        data: {
            activeAds,
            maxAds,
            slotsAvailable: Math.max(0, maxAds - activeAds),
        },
    });
});

