import { Request, Response } from "express";
import Seller from "../../../models/Seller";
import Product from "../../../models/Product";
import Order from "../../../models/Order";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendNotification } from "../../../services/notificationService";
import { sendNotificationToUser } from "../../../services/firebaseAdmin";

/**
 * Get all sellers (Admin only)
 */
export const getAllSellers = asyncHandler(
  async (req: Request, res: Response) => {
    const { status, search, page, limit } = req.query;

    // Build query
    const query: any = {};
    if (status) {
      query.status = status;
    }
    if (search && typeof search === "string" && search.trim()) {
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { sellerName: { $regex: escapedSearch, $options: "i" } },
        { storeName: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
        { mobile: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const pageNum = page ? parseInt(page as string, 10) : undefined;
    const limitNum = limit ? parseInt(limit as string, 10) : undefined;

    if (pageNum && limitNum) {
      const skip = (pageNum - 1) * limitNum;
      const [sellers, total] = await Promise.all([
        Seller.find(query)
          .select("-password")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum),
        Seller.countDocuments(query),
      ]);

      return res.status(200).json({
        success: true,
        message: "Sellers fetched successfully",
        data: sellers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    }

    const sellers = await Seller.find(query)
      .select("-password") // Exclude password
      .sort({ createdAt: -1 }); // Sort by newest first

    return res.status(200).json({
      success: true,
      message: "Sellers fetched successfully",
      data: sellers,
    });
  }
);

/**
 * Get seller by ID
 */
export const getSellerById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const seller = await Seller.findById(id).select("-password");

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Seller fetched successfully",
      data: seller,
    });
  }
);

/**
 * Update seller status (Approve/Reject)
 */
export const updateSellerStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["Approved", "Pending", "Rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid status is required (Approved, Pending, or Rejected)",
      });
    }

    // Read the previous status first so we can decide whether to notify, then use
    // an atomic update (validates ONLY the status field) — using .save() would
    // re-validate the whole document and could reject sellers with legacy data.
    const existing = await Seller.findById(id).select("status");
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }
    const previousStatus = existing.status;

    const seller = await Seller.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).select("-password");

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Notify the seller when their account is approved or rejected (#admin-approval).
    // Notifications must never break the status update, so each is wrapped in try/catch.
    if (status !== previousStatus && (status === "Approved" || status === "Rejected")) {
      const title =
        status === "Approved" ? "Account Approved 🎉" : "Account Application Update";
      const message =
        status === "Approved"
          ? "Congratulations! Your seller account has been approved. You can now add products and start selling."
          : "Your seller account application was not approved. Please contact support for more information.";

      // In-app notification (persisted, shown in the seller's notification list)
      try {
        await sendNotification("Seller", seller._id.toString(), title, message, {
          type: status === "Approved" ? "Success" : "Error",
          priority: "High",
        });
      } catch (err) {
        console.error("Failed to create seller status notification:", err);
      }

      // Push notification (FCM) for background/closed app
      try {
        await sendNotificationToUser(seller._id.toString(), "Seller", {
          title,
          body: message,
          data: { type: "ACCOUNT_STATUS", status },
        });
      } catch (err) {
        console.error("Failed to push seller status notification:", err);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Seller status updated to ${status}`,
      data: seller,
    });
  }
);

/**
 * Update seller details
 */
export const updateSeller = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    // Remove password from update data if present
    delete updateData.password;

    // Handle location update (convert lat/lng to GeoJSON)
    if (updateData.latitude && updateData.longitude) {
      const latitude = parseFloat(updateData.latitude);
      const longitude = parseFloat(updateData.longitude);

      if (!isNaN(latitude) && !isNaN(longitude)) {
        // Update GeoJSON location for geospatial queries
        updateData.location = {
          type: "Point",
          coordinates: [longitude, latitude], // MongoDB GeoJSON: [longitude, latitude]
        };
        // Ensure string fields are also synchronized
        updateData.latitude = latitude.toString();
        updateData.longitude = longitude.toString();
      }
    }

    // Handle serviceRadiusKm update
    if (
      updateData.serviceRadiusKm !== undefined &&
      updateData.serviceRadiusKm !== null &&
      updateData.serviceRadiusKm !== ""
    ) {
      const radius =
        typeof updateData.serviceRadiusKm === "string"
          ? parseFloat(updateData.serviceRadiusKm)
          : Number(updateData.serviceRadiusKm);

      if (!isNaN(radius) && radius >= 0.1 && radius <= 100) {
        updateData.serviceRadiusKm = radius; // Ensure it's saved as a number
      } else {
        return res.status(400).json({
          success: false,
          message: "Service radius must be between 0.1 and 100 kilometers",
        });
      }
    } else if (
      updateData.serviceRadiusKm === "" ||
      updateData.serviceRadiusKm === null
    ) {
      // If empty string or null is sent, remove it from updates to keep existing value
      delete updateData.serviceRadiusKm;
    }

    const seller = await Seller.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Seller updated successfully",
      data: seller,
    });
  }
);

/**
 * Delete seller
 */
export const deleteSeller = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const seller = await Seller.findById(id);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Check if seller has active products
    const productCount = await Product.countDocuments({ seller: id });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete seller "${seller.storeName}" because they have ${productCount} product(s) listed in catalog. Please delete or reassign their products first.`,
      });
    }

    // Check if seller has pending/active orders
    const activeOrderCount = await Order.countDocuments({
      "items.seller": id,
      status: { $in: ["Pending", "Accepted", "Processing", "Out for Delivery"] },
    });
    if (activeOrderCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete seller "${seller.storeName}" because they have ${activeOrderCount} in-flight customer order(s) currently in progress.`,
      });
    }

    await Seller.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Seller deleted successfully",
    });
  }
);


