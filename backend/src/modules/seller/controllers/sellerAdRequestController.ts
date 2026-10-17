import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SellerAdRequest from "../../../models/SellerAdRequest";
import Seller from "../../../models/Seller";
import mongoose from "mongoose";
import { MAX_ACTIVE_SHOP_ADS, addDays, countBookedForDay, findNextAvailableWindow, toDayStart } from "../../../utils/shopAdCapacity";
import { adError, notifyAd, refreshAdStatuses, withAdTransaction } from "../../../services/adLifecycleService";
import { validAdDate, validAdDuration, validAdLink, validateAdContent } from "../../../utils/adValidation";

export const createAdRequest = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = req.user?.userId;
  if (!sellerId) return res.status(401).json({ success: false, message: "Unauthorized" });
  validateAdContent(req.body);
  const duration = validAdDuration(req.body.durationDays);
  const desiredStart = toDayStart(validAdDate(req.body.startDate, "Start date"));
  const price = duration * 500;
  if (req.body.requestedPrice !== undefined && Number(req.body.requestedPrice) !== price) adError(`Expected price is INR ${price}.`);
  const seller = await Seller.findById(sellerId).select("sellerName email mobile storeName slug");
  if (!seller) return res.status(404).json({ success: false, message: "Seller not found" });
  const ctaLink = validAdLink(req.body.ctaLink, `/store/${sellerId}`);
  const hasPayment = Boolean(req.body.paymentReference || req.body.paymentScreenshotUrl);
  const { request, scheduled } = await withAdTransaction(async session => {
    const scheduled = await findNextAvailableWindow({ desiredStart, durationDays: duration, session });
    const [request] = await SellerAdRequest.create([{
      sellerId, sellerName: seller.sellerName || seller.storeName, sellerEmail: seller.email,
      sellerPhone: req.body.sellerPhone || seller.mobile,
      shopName: req.body.shopName, tagline: req.body.tagline, description: req.body.description,
      imageUrl: req.body.imageUrl, badge: req.body.badge || "FEATURED", badgeColor: req.body.badgeColor || "#FF4B6E",
      ctaText: req.body.ctaText || "Visit Shop", ctaLink, durationDays: duration,
      requestedPrice: price, adPrice: price, paymentNote: req.body.paymentNote,
      status: hasPayment ? "PaymentPending" : "Pending", paymentStatus: "Unpaid",
      paymentMethod: req.body.paymentMethod || "UPI", paymentReference: req.body.paymentReference,
      paymentScreenshotUrl: req.body.paymentScreenshotUrl, ...scheduled, expiresAt: scheduled.endDate,
    }], { session });
    return { request, scheduled };
  });
  await notifyAd({ recipientType: "Admin", title: "New Advertisement Request", message: `${request.sellerName} submitted an ad for "${request.shopName}".`,
    type: "Info", link: `/admin/shop-ads?tab=requests&requestId=${request._id}`, actionLabel: "Review Request", priority: "High", isRead: false });
  return res.status(201).json({ success: true, message: "Ad request submitted. Dates will be confirmed when approved and activated.", data: request,
    scheduledWindow: { requestedStartDate: desiredStart, ...scheduled } });
});
export const getMyAdRequests = asyncHandler(async (req: Request, res: Response) => {
  await refreshAdStatuses({ sellerId: new mongoose.Types.ObjectId(req.user!.userId) });
  const requests = await SellerAdRequest.find({ sellerId: req.user?.userId }).sort({ createdAt: -1 });
  return res.json({ success: true, data: requests });
});
export const getMyAdRequestById = asyncHandler(async (req: Request, res: Response) => {
  await refreshAdStatuses({ sellerId: new mongoose.Types.ObjectId(req.user!.userId) });
  const request = await SellerAdRequest.findOne({ _id: req.params.id, sellerId: req.user?.userId });
  if (!request) return res.status(404).json({ success: false, message: "Ad request not found" });
  return res.json({ success: true, data: request });
});
export const submitPaymentProof = asyncHandler(async (req: Request, res: Response) => {
  if (!req.body.paymentReference && !req.body.paymentScreenshotUrl) adError("Payment reference or screenshot is required.");
  if (req.body.paymentMethod === "Razorpay") adError("Use Pay Online to complete a gateway payment.");
  const request = await withAdTransaction(async session => {
    const request = await SellerAdRequest.findOne({ _id: req.params.id, sellerId: req.user?.userId }).session(session);
    if (!request) adError("Ad request not found", 404);
    if (request!.status !== "Approved" || request!.paymentStatus === "Paid") adError("Payment proof can only be submitted for an unpaid approved request.");
    Object.assign(request!, { paymentMethod: req.body.paymentMethod || "UPI", paymentReference: req.body.paymentReference,
      paymentScreenshotUrl: req.body.paymentScreenshotUrl, paymentNote: req.body.paymentNote, status: "PaymentPending" });
    await request!.save({ session });
    return request!;
  });
  await notifyAd({ recipientType: "Admin", title: "Advertisement Payment Proof Submitted", message: `Verify payment for "${request.shopName}".`,
    type: "Payment", link: `/admin/shop-ads?tab=requests&requestId=${request._id}`, actionLabel: "Verify Payment", priority: "High", isRead: false });
  return res.json({ success: true, message: "Payment proof submitted for admin verification.", data: request });
});
export const cancelAdRequest = asyncHandler(async (req: Request, res: Response) => {
  await withAdTransaction(async session => {
    const request = await SellerAdRequest.findOne({ _id: req.params.id, sellerId: req.user?.userId }).session(session);
    if (!request) adError("Ad request not found", 404);
    if (!["Pending", "Rejected"].includes(request!.status) || request!.paymentStatus === "Paid") adError("Only unpaid pending or rejected requests can be cancelled.");
    await request!.deleteOne({ session });
  });
  return res.json({ success: true, message: "Ad request cancelled." });
});
export const getPublicAdStats = asyncHandler(async (req: Request, res: Response) => {
  const start = toDayStart(req.query.date ? validAdDate(req.query.date, "Date") : new Date());
  const duration = validAdDuration(req.query.duration ?? 1);
  const dailyStats = [];
  let maxBooked = 0;
  for (let day = 0; day < duration; day++) {
    const date = addDays(start, day);
    const booked = await countBookedForDay(date, addDays(date, 1));
    maxBooked = Math.max(maxBooked, booked);
    dailyStats.push({ date: date.toISOString(), slotsBooked: booked, slotsAvailable: Math.max(0, MAX_ACTIVE_SHOP_ADS - booked) });
  }
  return res.json({ success: true, data: { maxAds: MAX_ACTIVE_SHOP_ADS, slotsBookedInRange: maxBooked,
    slotsAvailableInRange: Math.max(0, MAX_ACTIVE_SHOP_ADS - maxBooked), dailyStats, selectedDate: start.toISOString(), duration } });
});
