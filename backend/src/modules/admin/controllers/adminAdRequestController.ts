import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SellerAdRequest from "../../../models/SellerAdRequest";
import ShopAd from "../../../models/ShopAd";
import { MAX_ACTIVE_SHOP_ADS, addDays, countBookedForDay, findNextAvailableWindow, shopAdActiveAtQuery, toDayStart } from "../../../utils/shopAdCapacity";
import { adError, adStatus, notifyAd, refreshAdStatuses, withAdTransaction } from "../../../services/adLifecycleService";
import { validAdLink } from "../../../utils/adValidation";

export const getAllAdRequests = asyncHandler(async (req: Request, res: Response) => {
  await refreshAdStatuses();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const query = req.query.status ? { status: req.query.status } : {};
  const [requests, total] = await Promise.all([
    SellerAdRequest.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), SellerAdRequest.countDocuments(query),
  ]);
  return res.json({ success: true, data: requests, pagination: { page, limit, total } });
});
export const getAdRequestById = asyncHandler(async (req: Request, res: Response) => {
  await refreshAdStatuses();
  const request = await SellerAdRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ success: false, message: "Request not found" });
  return res.json({ success: true, data: request });
});
function notification(request: any, title: string, message: string) {
  return notifyAd({ recipientType: "Seller", recipientId: request.sellerId, title, message, type: "Info",
    link: `/seller/ad-requests?requestId=${request._id}`, actionLabel: "View Advertisement", priority: "High", isRead: false });
}
export const approveAdRequest = asyncHandler(async (req: Request, res: Response) => {
  const price = Number(req.body.adPrice);
  if (!Number.isFinite(price) || price <= 0) adError("A valid advertising price is required.");
  const request = await withAdTransaction(async session => {
    const request = await SellerAdRequest.findById(req.params.id).session(session);
    if (!request) adError("Request not found", 404);
    if (request!.status !== "Pending") adError("Only pending requests can be approved.");
    const scheduled = await findNextAvailableWindow({ desiredStart: request!.startDate ?? new Date(), durationDays: request!.durationDays, excludeRequestId: request!._id as any, session });
    Object.assign(request!, scheduled, { expiresAt: scheduled.endDate, status: "Approved", adPrice: price,
      adminNote: req.body.adminNote || "", approvedAt: new Date() });
    await request!.save({ session });
    return request!;
  });
  await notification(request, "Ad Request Approved", `Your ad for "${request.shopName}" is approved. Pay online or submit payment proof. Scheduled start: ${request.startDate?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}.`);
  return res.json({ success: true, message: "Request approved. Waiting for payment.", data: { request }, scheduledWindow: { startDate: request.startDate, endDate: request.endDate } });
});
export const rejectAdRequest = asyncHandler(async (req: Request, res: Response) => {
  const request = await withAdTransaction(async session => {
    const request = await SellerAdRequest.findById(req.params.id).session(session);
    if (!request) adError("Request not found", 404);
    if (!["Pending", "Approved", "PaymentPending"].includes(request!.status) || request!.paymentStatus === "Paid" || request!.razorpayOrderId) adError("A paid or active request cannot be rejected.");
    request!.status = "Rejected";
    request!.adminNote = req.body.adminNote || "Request rejected by admin.";
    request!.rejectedAt = new Date();
    await request!.save({ session });
    return request!;
  });
  await notification(request, "Ad Request Rejected", request.adminNote || "Request rejected.");
  return res.json({ success: true, message: "Request rejected.", data: request });
});
export const verifyPaymentAndActivate = asyncHandler(async (req: Request, res: Response) => {
  const result = await withAdTransaction(async session => {
    const request = await SellerAdRequest.findById(req.params.id).session(session);
    if (!request) adError("Request not found", 404);
    if (request!.shopAdId) {
      const shopAd = await ShopAd.findById(request!.shopAdId).session(session);
      if (!shopAd) adError("The linked ad was removed. Create a new request to advertise again.", 409);
      return { request: request!, shopAd: shopAd!, alreadyActivated: true };
    }
    if (!["PaymentPending", "PaymentVerified"].includes(request!.status)) adError("Request is not awaiting payment verification.");
    if (request!.status === "PaymentVerified" && request!.paymentStatus !== "Paid") adError("Online payment has not been captured.");
    if (request!.paymentStatus !== "Paid" && !request!.paymentReference && !request!.paymentScreenshotUrl) adError("Payment evidence is required.");
    const scheduled = await findNextAvailableWindow({ desiredStart: request!.startDate ?? new Date(), durationDays: request!.durationDays, excludeRequestId: request!._id as any, session });
    const [shopAd] = await ShopAd.create([{
      shopName: request!.shopName, tagline: request!.tagline, description: request!.description,
      imageUrl: request!.imageUrl, badge: request!.badge, badgeColor: request!.badgeColor,
      ctaText: request!.ctaText, ctaLink: validAdLink(request!.ctaLink, `/store/${request!.sellerId}`), isActive: true,
      requestedBy: `${request!.sellerName} (Seller)`, contactInfo: { name: request!.sellerName, phone: request!.sellerPhone, email: request!.sellerEmail },
      approvedAt: new Date(), ...scheduled, expiresAt: scheduled.endDate, order: 0,
    }], { session });
    Object.assign(request!, scheduled, { status: adStatus(shopAd), paymentStatus: "Paid", paidAt: request!.paidAt ?? new Date(),
      shopAdId: shopAd._id, expiresAt: scheduled.endDate, adminNote: req.body.adminNote ?? request!.adminNote });
    await request!.save({ session });
    return { request: request!, shopAd, alreadyActivated: false };
  });
  if (!result.alreadyActivated) await notification(result.request, "Your Advertising Schedule Is Confirmed", `Your ad for "${result.request.shopName}" is ${result.request.status.toLowerCase()} and runs until ${result.request.endDate?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}.`);
  return res.json({ success: true, message: result.alreadyActivated ? "This request is already activated." : `Payment verified. Ad is ${result.request.status.toLowerCase()}.`,
    data: result, scheduledWindow: { startDate: result.request.startDate, endDate: result.request.endDate } });
});
export const getAdRequestStats = asyncHandler(async (_req: Request, res: Response) => {
  await refreshAdStatuses();
  const statuses = ["Pending", "Approved", "PaymentPending", "PaymentVerified", "Live", "Scheduled", "Expired", "Paused", "Rejected"];
  const counts = await Promise.all(statuses.map(status => SellerAdRequest.countDocuments({ status })));
  const data: any = Object.fromEntries(statuses.map((status, i) => [status.charAt(0).toLowerCase() + status.slice(1), counts[i]]));
  data.activeAds = await ShopAd.countDocuments(shopAdActiveAtQuery(new Date()));
  data.maxAds = MAX_ACTIVE_SHOP_ADS;
  data.dailyAvailability = [];
  const today = toDayStart(new Date());
  for (let i = 0; i < 14; i++) {
    const start = addDays(today, i);
    const slotsBooked = await countBookedForDay(start, addDays(start, 1));
    data.dailyAvailability.push({ date: start.toISOString(), slotsBooked, available: Math.max(0, MAX_ACTIVE_SHOP_ADS - slotsBooked) });
  }
  return res.json({ success: true, data });
});
