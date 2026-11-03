import { Request, Response } from "express";
import Customer from "../../../models/Customer";
import Order from "../../../models/Order";
import Return from "../../../models/Return";
import Cart from "../../../models/Cart";
import Wishlist from "../../../models/Wishlist";
import Address from "../../../models/Address";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Get customer profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId || (req as any).user?.userType !== "Customer") {
    return res.status(401).json({
      success: false,
      message: "Unauthorized or not a customer",
    });
  }

  const customer = await Customer.findById(userId);

  if (!customer) {
    return res.status(401).json({
      success: false,
      message: "Customer not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Profile retrieved successfully",
    data: {
      id: customer._id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.dateOfBirth,
      registrationDate: customer.registrationDate,
      status: customer.status,
      refCode: customer.refCode,
      walletAmount: customer.walletAmount,
      totalOrders: customer.totalOrders,
      totalSpent: customer.totalSpent,
      latitude: customer.latitude,
      longitude: customer.longitude,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      pincode: customer.pincode,
      locationUpdatedAt: customer.locationUpdatedAt,
    },
  });
});

/**
 * Update customer profile
 */
export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { name, email, dateOfBirth, notificationPreferences, accountPrivacy } = req.body;


    if (!userId || (req as any).user?.userType !== "Customer") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized or not a customer",
      });
    }

    const customer = await Customer.findById(userId);

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Update fields if provided
    if (name) customer.name = name;
    if (email) {
      // Check if email is already taken by another customer
      const existingCustomer = await Customer.findOne({
        email,
        _id: { $ne: userId },
      });

      if (existingCustomer) {
        return res.status(409).json({
          success: false,
          message: "Email already in use by another customer",
        });
      }

      customer.email = email;
    }
    if (dateOfBirth) customer.dateOfBirth = new Date(dateOfBirth);
    if (notificationPreferences) customer.notificationPreferences = { ...customer.notificationPreferences, ...notificationPreferences };
    if (accountPrivacy) customer.accountPrivacy = { ...customer.accountPrivacy, ...accountPrivacy };


    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        dateOfBirth: customer.dateOfBirth,
        registrationDate: customer.registrationDate,
        status: customer.status,
        refCode: customer.refCode,
        walletAmount: customer.walletAmount,
        totalOrders: customer.totalOrders,
        totalSpent: customer.totalSpent,
        latitude: customer.latitude,
        longitude: customer.longitude,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode,
        notificationPreferences: customer.notificationPreferences,
        accountPrivacy: customer.accountPrivacy,
        donationStats: customer.donationStats,
      },

    });
  }
);

/**
 * Update customer location
 */
export const updateLocation = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { latitude, longitude, address, city, state, pincode } = req.body;

    if (!userId || (req as any).user?.userType !== "Customer") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized or not a customer",
      });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const customer = await Customer.findById(userId);

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Update location fields
    customer.latitude = latitude;
    customer.longitude = longitude;
    customer.address = address;
    customer.city = city;
    customer.state = state;
    customer.pincode = pincode;
    customer.locationUpdatedAt = new Date();

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Location updated successfully",
      data: {
        latitude: customer.latitude,
        longitude: customer.longitude,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode,
        locationUpdatedAt: customer.locationUpdatedAt,
      },
    });
  }
);

/**
 * Get customer location
 */
export const getLocation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId || (req as any).user?.userType !== "Customer") {
    return res.status(401).json({
      success: false,
      message: "Unauthorized or not a customer",
    });
  }

  const customer = await Customer.findById(userId).select(
    "latitude longitude address city state pincode locationUpdatedAt"
  );

  if (!customer) {
    return res.status(401).json({
      success: false,
      message: "Customer not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Location retrieved successfully",
    data: {
      latitude: customer.latitude,
      longitude: customer.longitude,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      pincode: customer.pincode,
      locationUpdatedAt: customer.locationUpdatedAt,
    },
  });
});

/**
 * Delete / Deactivate Customer Account
 */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId || (req as any).user?.userType !== "Customer") {
    return res.status(401).json({
      success: false,
      message: "Unauthorized or not a customer",
    });
  }

  const customer = await Customer.findById(userId);
  if (!customer) {
    return res.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  // 1. Guardrail: Check for active in-flight orders
  const activeOrders = await Order.countDocuments({
    customer: userId,
    status: { $in: ["Pending", "Accepted", "Processing", "Shipped", "Out for Delivery"] },
  });

  if (activeOrders > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete account while you have ${activeOrders} active order(s) in progress.`,
    });
  }

  // 2. Guardrail: Check for pending return requests
  const pendingReturns = await Return.countDocuments({
    customer: userId,
    status: { $in: ["Pending", "Approved", "Pickup Assigned"] },
  });

  if (pendingReturns > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete account while you have ${pendingReturns} return request(s) in progress.`,
    });
  }

  // 3. Anonymize PII & Release Phone / Email for future fresh registration
  const anonymizedPhone = `del_${Date.now()}_${customer.phone}`;
  const anonymizedEmail = customer.email ? `deleted_${customer._id}_${Date.now()}@hellolocal.deleted` : undefined;
  const anonymizedRef = `DEL_${Date.now()}_${customer._id.toString().slice(-4)}`;

  customer.name = "Deleted User";
  customer.phone = anonymizedPhone;
  if (anonymizedEmail) customer.email = anonymizedEmail;
  else customer.email = undefined as any;
  customer.refCode = anonymizedRef;
  customer.status = "Inactive";
  customer.isDeleted = true;
  customer.deletedAt = new Date();
  customer.fcmTokens = [];
  customer.fcmTokenMobile = [];

  await customer.save();

  // 4. Remove ephemeral data
  await Cart.deleteMany({ customer: userId });
  await Wishlist.deleteMany({ customer: userId });
  await Address.deleteMany({ customer: userId });

  return res.status(200).json({
    success: true,
    message: "Your account has been deleted successfully.",
  });
});
