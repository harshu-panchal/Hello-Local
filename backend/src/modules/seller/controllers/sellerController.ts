import { Request, Response } from "express";
import Seller from "../../../models/Seller";
import Product from "../../../models/Product";
import Order from "../../../models/Order";
import SubscriptionPayment from "../../../models/SubscriptionPayment";
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
    const existing = await Seller.findById(id).select("status subscription firstApprovedAt");
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

    // When transitioning to Approved, ensure merchant trial/subscription starts from approval time
    // Only applies on the first approval so re-approving never hands out free time (#first-approval)
    if (status === "Approved") {
      const isFirstApproval = !existing.firstApprovedAt;
      const sub = seller.subscription;
      const now = new Date();

      if (isFirstApproval) {
        seller.firstApprovedAt = now;

        if (sub && sub.planName === "7-Day Free Trial") {
          const trialDays = sub.durationInDays || 7;
          const startDate = now;
          const endDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
          seller.subscription = {
            ...(typeof (sub as any)?.toObject === "function" ? (sub as any).toObject() : sub),
            status: "active",
            startDate,
            endDate,
          };
          await Seller.findByIdAndUpdate(seller._id, {
            firstApprovedAt: now,
            subscription: seller.subscription,
          });

          try {
            await SubscriptionPayment.findOneAndUpdate(
              { sellerId: seller._id, paymentMethod: "FREE_TRIAL" },
              {
                startDate,
                endDate,
                notes: "VoLoMart-style 7-Day Free Trial activated on admin approval",
              }
            );
          } catch (auditErr) {
            console.error("Failed to update free trial audit payment on approval:", auditErr);
          }
        } else if (previousStatus === "Pending" && sub?.durationInDays && sub?.status === "active") {
          // Upfront paid plan at registration: start purchased duration from first approval
          const startDate = now;
          const endDate = new Date(now.getTime() + sub.durationInDays * 24 * 60 * 60 * 1000);
          seller.subscription = {
            ...(typeof (sub as any)?.toObject === "function" ? (sub as any).toObject() : sub),
            status: "active",
            startDate,
            endDate,
          };
          await Seller.findByIdAndUpdate(seller._id, {
            firstApprovedAt: now,
            subscription: seller.subscription,
          });
        } else if (!sub || !sub.endDate) {
          // Legacy merchant who never had a plan or end date
          seller.subscription = {
            status: "active",
            planName: "New Merchant Trial Pass",
            startDate: now,
            endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          };
          await Seller.findByIdAndUpdate(seller._id, {
            firstApprovedAt: now,
            subscription: seller.subscription,
          });
        } else {
          await Seller.findByIdAndUpdate(seller._id, { firstApprovedAt: now });
        }
      } else {
        // Re-approving an already once-approved seller: NEVER grant free time to expired accounts.
        // Only give a starter pass if the seller genuinely has no subscription record at all.
        if (!sub || !sub.endDate) {
          seller.subscription = {
            status: "active",
            planName: "New Merchant Trial Pass",
            startDate: now,
            endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          };
          await Seller.findByIdAndUpdate(seller._id, { subscription: seller.subscription });
        }
      }
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

    // Handle commission and commissionRate synchronization & validation
    if (updateData.commission !== undefined || updateData.commissionRate !== undefined) {
      const commVal = updateData.commission !== undefined ? Number(updateData.commission) : Number(updateData.commissionRate);
      if (!isNaN(commVal) && commVal >= 0 && commVal <= 100) {
        updateData.commission = commVal;
        updateData.commissionRate = commVal;
      } else {
        return res.status(400).json({
          success: false,
          message: "Commission rate must be a valid number between 0 and 100%",
        });
      }
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


