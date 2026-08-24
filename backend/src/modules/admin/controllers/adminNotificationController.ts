import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Notification from "../../../models/Notification";
import Customer from "../../../models/Customer";
import Seller from "../../../models/Seller";
import Delivery from "../../../models/Delivery";
import Admin from "../../../models/Admin";
import { sendNotificationToUser } from "../../../services/firebaseAdmin";

/**
 * Create a new notification
 */
export const createNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      recipientType,
      recipientId,
      title,
      message,
      type,
      link,
      actionLabel,
      priority,
      expiresAt,
    } = req.body;

    if (!recipientType || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "Recipient type, title, and message are required",
      });
    }

    const notification = await Notification.create({
      recipientType,
      recipientId,
      title,
      message,
      type: type || "Info",
      link,
      actionLabel,
      priority: priority || "Medium",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: req.user?.userId,
      isRead: false,
    });

    return res.status(201).json({
      success: true,
      message: "Notification created successfully",
      data: notification,
    });
  }
);

/**
 * Get all notifications
 */
export const getNotifications = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      recipientType,
      recipientId,
      isRead,
      type,
      priority,
      search,
    } = req.query;

    const query: any = {};

    if (recipientType && recipientType !== "All") query.recipientType = recipientType;
    if (recipientId) query.recipientId = recipientId;
    if (isRead !== undefined) query.isRead = isRead === "true";
    if (type) query.type = type;
    if (priority) query.priority = priority;

    const andConditions: any[] = [
      {
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gte: new Date() } },
        ],
      },
    ];

    if (search && typeof search === "string" && search.trim() !== "") {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      andConditions.push({
        $or: [
          { title: { $regex: safe, $options: "i" } },
          { message: { $regex: safe, $options: "i" } },
          { recipientType: { $regex: safe, $options: "i" } },
        ],
      });
    }

    query.$and = andConditions;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .populate("createdBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Notification.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Notifications fetched successfully",
      data: notifications,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Get notification by ID
 */
export const getNotificationById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const notification = await Notification.findById(id).populate(
      "createdBy",
      "firstName lastName"
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification fetched successfully",
      data: notification,
    });
  }
);

/**
 * Mark notification as read
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const notification = await Notification.findByIdAndUpdate(
    id,
    {
      isRead: true,
      readAt: new Date(),
    },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

/**
 * Update notification
 */
export const updateNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const notification = await Notification.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification updated successfully",
      data: notification,
    });
  }
);

/**
 * Dispatch a saved notification to its audience.
 *
 * This used to set `sentAt` and return "Notification sent successfully" without
 * contacting Firebase, a socket, SMS or email — the admin screen reported
 * success and nothing was ever delivered. (#H-24)
 */
export const sendNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (notification.sentAt) {
      return res.status(400).json({
        success: false,
        message: "This notification has already been sent.",
      });
    }

    const payload = {
      title: notification.title,
      body: notification.message,
      data: {
        type: "ADMIN_BROADCAST",
        notificationId: String(notification._id),
        ...(notification.link ? { link: String(notification.link) } : {}),
      },
    };

    // Resolve the audience.
    const audiences: Array<"Customer" | "Seller" | "Delivery" | "Admin"> =
      notification.recipientType === "All"
        ? ["Customer", "Seller", "Delivery"]
        : [notification.recipientType as "Customer" | "Seller" | "Delivery" | "Admin"];

    let delivered = 0;
    let failed = 0;

    if (notification.recipientId) {
      // Targeted at one account.
      const result = await sendNotificationToUser(
        String(notification.recipientId),
        audiences[0],
        payload,
      );
      delivered += result?.successCount ?? 0;
      failed += result?.failureCount ?? 0;
    } else {
      // Broadcast: fan out to everyone in the audience who has a device token.
      for (const audience of audiences) {
        const Model =
          audience === "Customer" ? Customer
            : audience === "Seller" ? Seller
              : audience === "Delivery" ? Delivery
                : Admin;

        const recipients = await (Model as any)
          .find({
            $or: [
              { fcmTokens: { $exists: true, $ne: [] } },
              { fcmTokenMobile: { $exists: true, $ne: [] } },
            ],
          })
          .select("_id")
          .lean();

        for (const r of recipients) {
          try {
            const result = await sendNotificationToUser(String(r._id), audience, payload);
            delivered += result?.successCount ?? 0;
            failed += result?.failureCount ?? 0;
          } catch (err) {
            failed += 1;
            console.error(`Broadcast to ${audience} ${r._id} failed:`, err);
          }
        }
      }
    }

    // Also push it to the live socket rooms so open sessions update instantly.
    try {
      const io = req.app.get("io");
      if (io) {
        for (const audience of audiences) {
          const room =
            audience === "Admin" ? "admin-notifications"
              : audience === "Delivery" ? "delivery-notifications"
                : null;
          if (room) io.to(room).emit("admin-notification", payload);
        }
      }
    } catch (socketErr) {
      console.error("Socket broadcast failed:", socketErr);
    }

    notification.sentAt = new Date();
    await notification.save();

    return res.status(200).json({
      success: true,
      message:
        delivered > 0
          ? `Notification sent to ${delivered} device(s).`
          : "Notification recorded, but no devices were reachable.",
      data: { notification, delivered, failed },
    });
  }
);

/**
 * Mark multiple notifications as read
 */
export const markMultipleAsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Notification IDs array is required",
      });
    }

    const result = await Notification.updateMany(
      { _id: { $in: notificationIds } },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      data: {
        modified: result.modifiedCount,
      },
    });
  }
);

/**
 * Delete notification
 */
export const deleteNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const notification = await Notification.findByIdAndDelete(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  }
);
