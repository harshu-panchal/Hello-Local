import { Request, Response } from "express";
import Notification from "../../../models/Notification";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Get the authenticated seller's notifications (newest first) + unread count.
 */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;

  const notifications = await Notification.find({
    recipientType: "Seller",
    recipientId: sellerId,
  })
    .sort({ createdAt: -1 })
    .limit(50);

  const unreadCount = await Notification.countDocuments({
    recipientType: "Seller",
    recipientId: sellerId,
    isRead: false,
  });

  return res.status(200).json({
    success: true,
    data: { notifications, unreadCount },
  });
});

/**
 * Mark a single notification as read.
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;

  await Notification.findOneAndUpdate(
    { _id: id, recipientType: "Seller", recipientId: sellerId },
    { isRead: true }
  );

  return res.status(200).json({ success: true, message: "Notification marked as read" });
});

/**
 * Mark all of the seller's notifications as read.
 */
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;

  await Notification.updateMany(
    { recipientType: "Seller", recipientId: sellerId, isRead: false },
    { isRead: true }
  );

  return res.status(200).json({ success: true, message: "All notifications marked as read" });
});
