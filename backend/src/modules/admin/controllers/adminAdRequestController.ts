import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SellerAdRequest from "../../../models/SellerAdRequest";
import ShopAd from "../../../models/ShopAd";
import Notification from "../../../models/Notification";
import {
  MAX_ACTIVE_SHOP_ADS,
  findNextAvailableWindow,
  shopAdOverlapsQuery,
  toDayStart,
} from "../../../utils/shopAdCapacity";

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
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
    },
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
 * Admin: Approve request + set price + notify seller (does not make it Live)
 */
export const approveAdRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { adPrice, adminNote } = req.body;

  const request = await SellerAdRequest.findById(id);
  if (!request) return res.status(404).json({ success: false, message: "Request not found" });

  if (request.status !== "Pending") {
    return res
      .status(400)
      .json({ success: false, message: "Only pending requests can be approved." });
  }

  const price = Number.parseFloat(adPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Valid adPrice is required to approve a request." });
  }

  const durationDays = request.durationDays || 1;
  const desiredStart = toDayStart(new Date(request.startDate || new Date()));
  const scheduled = await findNextAvailableWindow({
    desiredStart,
    durationDays,
    excludeRequestId: request._id,
  });

  request.startDate = scheduled.startDate as any;
  request.endDate = scheduled.endDate as any;
  request.expiresAt = scheduled.endDate as any;
  request.status = "Approved";
  request.adPrice = price;
  request.adminNote = adminNote || "";
  request.approvedAt = new Date();
  await request.save();

  await Notification.create({
    recipientType: "Seller",
    recipientId: request.sellerId,
    title: "Ad Request Approved",
    message: `Your ad request for "${request.shopName}" is approved. Please submit payment proof to activate it. Scheduled start: ${scheduled.startDate.toLocaleDateString()}.`,
    type: "Info",
    link: `/seller/ad-requests?requestId=${request._id}`,
    actionLabel: "Submit Payment",
    priority: "High",
    isRead: false,
  });

  return res.status(200).json({
    success: true,
    message:
      scheduled.startDate.getTime() !== desiredStart.getTime()
        ? "Capacity was full. Request has been queued to the next available slot."
        : "Request approved. Waiting for seller payment proof.",
    data: { request },
    scheduledWindow: {
      requestedStartDate: desiredStart,
      startDate: scheduled.startDate,
      endDate: scheduled.endDate,
    },
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

  await Notification.create({
    recipientType: "Seller",
    recipientId: request.sellerId,
    title: "Ad Request Rejected",
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
 * Admin: Verify payment & make ad live (queues if needed)
 */
export const verifyPaymentAndActivate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { adminNote } = req.body;

  const request = await SellerAdRequest.findById(id);
  if (!request) return res.status(404).json({ success: false, message: "Request not found" });

  if (request.status !== "PaymentPending") {
    return res
      .status(400)
      .json({ success: false, message: "Request is not awaiting payment verification." });
  }

  if (request.shopAdId) {
    return res.status(400).json({ success: false, message: "This request is already linked to a live ad." });
  }

  const durationDays = request.durationDays || 1;
  const desiredStart = toDayStart(new Date(request.startDate || new Date()));
  const scheduled = await findNextAvailableWindow({
    desiredStart,
    durationDays,
    excludeRequestId: request._id,
  });

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
    startDate: scheduled.startDate,
    endDate: scheduled.endDate,
    expiresAt: scheduled.endDate,
    order: 0,
  });

  request.status = "Live";
  request.paymentStatus = "Paid";
  request.paidAt = new Date();
  request.shopAdId = shopAd._id as any;
  request.startDate = scheduled.startDate as any;
  request.endDate = scheduled.endDate as any;
  request.expiresAt = scheduled.endDate as any;
  request.adminNote = adminNote || request.adminNote;
  await request.save();

  await Notification.create({
    recipientType: "Seller",
    recipientId: request.sellerId,
    title: "Your Ad is Live",
    message: `Your ad for "${request.shopName}" is now scheduled. It will run until ${scheduled.endDate.toLocaleDateString()}.`,
    type: "Success",
    link: `/seller/ad-requests?requestId=${request._id}`,
    actionLabel: "View Status",
    priority: "High",
    isRead: false,
  });

  return res.status(200).json({
    success: true,
    message:
      scheduled.startDate.getTime() !== desiredStart.getTime()
        ? "Payment verified! Capacity was full, so the ad has been queued to the next available slot."
        : "Payment verified! Ad is now live on the home page carousel.",
    data: { request, shopAd },
    scheduledWindow: {
      requestedStartDate: desiredStart,
      startDate: scheduled.startDate,
      endDate: scheduled.endDate,
    },
  });
});

/**
 * Admin: Get ad request count stats
 */
export const getAdRequestStats = asyncHandler(async (_req: Request, res: Response) => {
  const [pending, approved, paymentPending, live, rejected, activeAds] = await Promise.all([
    SellerAdRequest.countDocuments({ status: "Pending" }),
    SellerAdRequest.countDocuments({ status: "Approved" }),
    SellerAdRequest.countDocuments({ status: "PaymentPending" }),
    SellerAdRequest.countDocuments({ status: "Live" }),
    SellerAdRequest.countDocuments({ status: "Rejected" }),
    ShopAd.countDocuments({ isActive: true }),
  ]);

  const dailyAvailability: Array<{ date: string; slotsBooked: number; available: number }> = [];
  const today = toDayStart(new Date());

  for (let i = 0; i < 14; i++) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [liveAdsCount, reservedSlotsCount] = await Promise.all([
      ShopAd.countDocuments(shopAdOverlapsQuery(dayStart, dayEnd)),
      SellerAdRequest.countDocuments({
        status: { $in: ["Approved", "PaymentPending", "PaymentVerified"] },
        startDate: { $lt: dayEnd },
        endDate: { $gt: dayStart },
      }),
    ]);

    const slotsBooked = liveAdsCount + reservedSlotsCount;
    dailyAvailability.push({
      date: dayStart.toISOString(),
      slotsBooked,
      available: Math.max(0, MAX_ACTIVE_SHOP_ADS - slotsBooked),
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      pending,
      approved,
      paymentPending,
      live,
      rejected,
      activeAds,
      maxAds: MAX_ACTIVE_SHOP_ADS,
      dailyAvailability,
    },
  });
});

