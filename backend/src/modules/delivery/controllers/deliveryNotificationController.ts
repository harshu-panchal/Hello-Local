import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Notification from "../../../models/Notification";

/**
 * Get Notifications
 * Fetches notifications for the logged-in delivery partner
 */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;

    const notifications = await Notification.find({
        recipientType: { $in: ["Delivery", "All"] },
        $or: [
            { recipientId: deliveryId },
            { recipientId: null } // Broadcasts to all delivery partners
        ]
    })
        .sort({ createdAt: -1 })
        .limit(50); // Limit to last 50 notifications

    return res.status(200).json({
        success: true,
        data: notifications
    });
});

/**
 * Mark Notification as Read
 */
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const deliveryId = req.user?.userId;

    const notification = await Notification.findOneAndUpdate(
        {
            _id: id,
            recipientType: { $in: ["Delivery", "All"] },
            $or: [
                { recipientId: deliveryId },
                { recipientId: null }
            ]
        },
        { isRead: true, readAt: new Date() },
        { new: true }
    );

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: "Notification not found or access denied"
        });
    }

    return res.status(200).json({
        success: true,
        message: "Notification marked as read",
        data: notification
    });
});

/**
 * Mark All Notifications as Read
 */
export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;

    await Notification.updateMany(
        {
            recipientType: { $in: ["Delivery", "All"] },
            $or: [
                { recipientId: deliveryId },
                { recipientId: null }
            ],
            isRead: false
        },
        { isRead: true, readAt: new Date() }
    );

    return res.status(200).json({
        success: true,
        message: "All notifications marked as read"
    });
});
