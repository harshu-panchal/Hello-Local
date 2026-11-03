import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Delivery from "../../../models/Delivery";
import DeliveryAssignment from "../../../models/DeliveryAssignment";

/**
 * Update Delivery Profile
 * Updates personal and vehicle information
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    const {
        name,
        email,
        address,
        city,
        vehicleNumber,
        vehicleType,
        bankName,
        accountNumber,
        ifscCode,
        accountName
    } = req.body;

    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
        return res.status(404).json({
            success: false,
            message: "Delivery partner not found"
        });
    }

    // Update fields if provided
    if (name) delivery.name = name;
    if (email) delivery.email = email;
    if (address) delivery.address = address;
    if (city) delivery.city = city;
    if (vehicleNumber) delivery.vehicleNumber = vehicleNumber;
    if (vehicleType) delivery.vehicleType = vehicleType;

    // Bank details updates
    if (bankName) delivery.bankName = bankName;
    if (accountNumber) delivery.accountNumber = accountNumber;
    if (ifscCode) delivery.ifscCode = ifscCode;
    if (accountName) delivery.accountName = accountName;

    await delivery.save();

    return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: delivery
    });
});

/**
 * Update Availability Status
 * Toggles isOnline status
 */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    const { isOnline } = req.body;

    if (typeof isOnline !== 'boolean') {
        return res.status(400).json({
            success: false,
            message: "isOnline status must be a boolean"
        });
    }

    const delivery = await Delivery.findByIdAndUpdate(
        deliveryId,
        { isOnline },
        { new: true }
    );

    if (!delivery) {
        return res.status(404).json({
            success: false,
            message: "Delivery partner not found"
        });
    }

    return res.status(200).json({
        success: true,
        message: `Status updated to ${isOnline ? 'Online' : 'Offline'}`,
        data: {
            isOnline: delivery.isOnline
        }
    });
});

/**
 * Update Delivery Settings
 * Updates notification, location, sound preferences
 */
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    const { notifications, location, sound } = req.body;

    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
        return res.status(404).json({
            success: false,
            message: "Delivery partner not found"
        });
    }

    // Initialize settings if not present
    if (!delivery.settings) {
        delivery.settings = {
            notifications: true,
            location: true,
            sound: true
        };
    }

    if (typeof notifications === 'boolean') delivery.settings.notifications = notifications;
    if (typeof location === 'boolean') delivery.settings.location = location;
    if (typeof sound === 'boolean') delivery.settings.sound = sound;

    await delivery.save();

    return res.status(200).json({
        success: true,
        message: "Settings updated successfully",
        data: delivery.settings
    });
});

/**
 * Delete / Deactivate Delivery Partner Account
 */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const deliveryId = req.user?.userId;

  if (!deliveryId || (req as any).user?.userType !== "Delivery") {
    return res.status(401).json({
      success: false,
      message: "Unauthorized or not a delivery partner",
    });
  }

  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    return res.status(404).json({
      success: false,
      message: "Delivery partner not found",
    });
  }

  // 1. Guardrail: Check for active in-flight assignments
  const activeAssignments = await DeliveryAssignment.countDocuments({
    deliveryBoy: deliveryId,
    status: { $in: ["Assigned", "Picked Up", "In Transit"] },
  });

  if (activeAssignments > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete account while you have ${activeAssignments} active delivery assignment(s).`,
    });
  }

  // 2. Guardrail: Check for pending cash collections
  if (delivery.cashCollected > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete account with ₹${delivery.cashCollected} pending cash collection. Please deposit collected cash first.`,
    });
  }

  // 3. Anonymize PII & Release mobile/email
  const anonymizedMobile = `del_${Date.now()}_${delivery.mobile}`;
  const anonymizedEmail = `deleted_${delivery._id}_${Date.now()}@hellolocal.deleted`;

  delivery.name = "Deleted Partner";
  delivery.mobile = anonymizedMobile;
  delivery.email = anonymizedEmail;
  delivery.isOnline = false;
  delivery.status = "Inactive";
  delivery.isDeleted = true;
  delivery.deletedAt = new Date();
  delivery.fcmTokens = [];
  delivery.fcmTokenMobile = [];

  await delivery.save();

  return res.status(200).json({
    success: true,
    message: "Delivery partner account has been deleted successfully.",
  });
});
