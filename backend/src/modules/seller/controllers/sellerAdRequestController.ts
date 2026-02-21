import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SellerAdRequest from "../../../models/SellerAdRequest";
import Notification from "../../../models/Notification";
import Seller from "../../../models/Seller";
import ShopAd from "../../../models/ShopAd";

const MAX_ACTIVE_ADS = 10;

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
        paymentMethod, paymentReference, paymentScreenshotUrl,
        startDate // User selected start date
    } = req.body;

    if (!shopName || !tagline || !imageUrl || !durationDays) {
        return res.status(400).json({
            success: false,
            message: "Shop name, tagline, image, and duration are required.",
        });
    }

    if (!startDate) {
        return res.status(400).json({ success: false, message: "Start date is required." });
    }

    const duration = parseInt(durationDays) || 1;
    const expectedPrice = duration * 500;

    // Validate price
    if (requestedPrice && parseFloat(requestedPrice) !== expectedPrice) {
        return res.status(400).json({
            success: false,
            message: `Invalid price for ${duration} days. Expected ₹${expectedPrice}.`,
        });
    }

    const requestedStartDate = new Date(startDate);
    requestedStartDate.setHours(0, 0, 0, 0); // Normalize to start of day

    const requestedEndDate = new Date(requestedStartDate);
    requestedEndDate.setDate(requestedEndDate.getDate() + duration); // Multi-day duration

    // Check availability for EVERY day in the range
    for (let i = 0; i < duration; i++) {
        const checkDay = new Date(requestedStartDate);
        checkDay.setDate(checkDay.getDate() + i);

        const nextDay = new Date(checkDay);
        nextDay.setDate(nextDay.getDate() + 1);

        // Count ads active on this specific day
        const bookedCount = await SellerAdRequest.countDocuments({
            status: { $in: ["Approved", "PaymentPending", "PaymentVerified", "Live"] },
            startDate: { $lt: nextDay },
            endDate: { $gt: checkDay }
        });

        if (bookedCount >= MAX_ACTIVE_ADS) {
            return res.status(400).json({
                success: false,
                message: `Slots are full for ${checkDay.toDateString()}. Please choose other dates.`,
            });
        }
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
        durationDays: duration,
        requestedPrice: expectedPrice,
        adPrice: expectedPrice,
        paymentNote,
        status,
        paymentStatus: "Unpaid",
        paymentMethod: paymentMethod || "UPI",
        paymentReference,
        paymentScreenshotUrl,
        startDate: requestedStartDate,
        endDate: requestedEndDate,
        expiresAt: requestedEndDate, // Consistency
    });

    // Notify admin
    await Notification.create({
        recipientType: "Admin",
        title: hasPayment ? "💳 New Ad & Payment Submitted" : "📢 New Ad Request from Seller",
        message: hasPayment
            ? `${adRequest.sellerName} submitted an ad for "${shopName}" (${duration} days) with payment proof.`
            : `${adRequest.sellerName} has requested a shop ad for "${shopName}" (${duration} days).`,
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
export const getPublicAdStats = asyncHandler(async (req: Request, res: Response) => {
    const { date, duration = 1 } = req.query;
    const checkDate = date ? new Date(date as string) : new Date();
    checkDate.setHours(0, 0, 0, 0);

    const dur = parseInt(duration as string) || 1;
    let maxSlotsBooked = 0;
    const dailyStats = [];

    for (let i = 0; i < dur; i++) {
        const dayStart = new Date(checkDate);
        dayStart.setDate(dayStart.getDate() + i);

        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const bookedCount = await SellerAdRequest.countDocuments({
            status: { $in: ["Approved", "PaymentPending", "PaymentVerified", "Live"] },
            startDate: { $lt: dayEnd },
            endDate: { $gt: dayStart }
        });

        if (bookedCount > maxSlotsBooked) maxSlotsBooked = bookedCount;

        dailyStats.push({
            date: dayStart.toISOString(),
            slotsBooked: bookedCount,
            slotsAvailable: Math.max(0, MAX_ACTIVE_ADS - bookedCount)
        });
    }

    return res.status(200).json({
        success: true,
        data: {
            maxAds: MAX_ACTIVE_ADS,
            slotsBookedInRange: maxSlotsBooked,
            slotsAvailableInRange: Math.max(0, MAX_ACTIVE_ADS - maxSlotsBooked),
            dailyStats,
            selectedDate: checkDate.toISOString(),
            duration: dur
        },
    });
});

