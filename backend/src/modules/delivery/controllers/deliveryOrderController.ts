import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Order from "../../../models/Order";
import { notifySellersOfOrderUpdate } from "../../../services/sellerNotificationService";
import OrderItem from "../../../models/OrderItem";
import Seller from "../../../models/Seller";
import {
  generateDeliveryOtp,
  verifyDeliveryOtp,
} from "../../../services/deliveryOtpService";
import { runOrderEffects } from "../../../services/orderEffectService";
import { changeCourierStage, confirmOrderPickup, sellerStage } from "../../../services/orderLifecycleService";
import {
  ACTIVE_COURIER_STATUSES,
} from "../../../services/orderStatusService";

/**
 * Helper to map order items for response
 */
const mapOrderItems = (items: any[]) => {
  if (!items || !Array.isArray(items)) return [];
  return items.filter((item: any) => item.status !== "Cancelled").map((item: any) => ({
    name: item.productName || "Unknown Item",
    quantity: item.quantity || 0,
    price: item.total || 0, // Using total price for the line item
    image: item.productImage,
  }));
};

/**
 * Get All Orders History
 * Returns all past orders with pagination
 */
export const getAllOrdersHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ deliveryBoy: deliveryId })
      .populate("items") // Populate OrderItems
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({ deliveryBoy: deliveryId });

    // Batched Commission Fetch for Efficiency
    const { default: Commission } = await import("../../../models/Commission");
    const orderIds = orders.map((o) => o._id);
    const commissions = await Commission.find({
      order: { $in: orderIds },
      type: "DELIVERY_BOY",
    });

    const commissionMap = new Map();
    commissions.forEach((c) => {
      commissionMap.set(c.order.toString(), c.commissionAmount);
    });

    // Format orders for frontend
    const formattedOrders = orders.map((order) => ({
      id: order._id,
      orderId: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,

      address: `${order.deliveryAddress.address}, ${order.deliveryAddress.city}`,
      deliveryAddress: order.deliveryAddress,
      totalAmount: order.total,
      deliveryEarning: commissionMap.get(order._id.toString()) || 0, // Add Earning
      items: mapOrderItems(order.items),
      createdAt: order.createdAt,
      estimatedDeliveryTime: order.estimatedDeliveryDate
        ? new Date(order.estimatedDeliveryDate).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
        : "N/A",
    }));

    res.status(200).json({
      success: true,
      data: formattedOrders,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  },
);

/**
 * Get Today's Assigned Orders
 */
export const getTodayOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const orders = await Order.find({
      deliveryBoy: deliveryId,
      $or: [
        { createdAt: { $gte: todayStart, $lte: todayEnd } }, // Created today
        { updatedAt: { $gte: todayStart, $lte: todayEnd } }, // OR Updated today
      ],
    })
      .populate("items")
      .sort({ updatedAt: -1 });

    const formattedOrders = orders.map((order) => ({
      id: order._id,
      orderId: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,

      address: `${order.deliveryAddress?.address || ""}, ${order.deliveryAddress?.city || ""}`,
      deliveryAddress: order.deliveryAddress,
      items: mapOrderItems(order.items), // Real items
      totalAmount: order.total,
      estimatedDeliveryTime: order.estimatedDeliveryDate
        ? new Date(order.estimatedDeliveryDate).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
        : "N/A",
      createdAt: order.createdAt,
      // Distance calculation to be implemented. sending null/undefined for now to avoid fake data
      sellerPickups: order.sellerPickups || [],
      settlementStatus: order.settlementStatus,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      distance: null,
    }));

    return res.status(200).json({
      success: true,
      data: formattedOrders,
    });
  },
);

/**
 * Get Pending Orders
 */
export const getPendingOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;

    // Four of the five statuses this used to query ("Ready for pickup",
    // "Picked Up", "Assigned", "In Transit") are not in the Order enum, so only
    // "Out for Delivery" ever matched and the courier's pending list was mostly
    // empty. ACTIVE_COURIER_STATUSES is the real in-flight set. (#H-31)
    const orders = await Order.find({
      deliveryBoy: deliveryId,
      status: { $in: ACTIVE_COURIER_STATUSES },
    })
      .populate("items")
      .sort({ createdAt: -1 });

    const formattedOrders = orders.map((order) => ({
      id: order._id,
      orderId: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      address: `${order.deliveryAddress?.address || ""}, ${order.deliveryAddress?.city || ""}`,
      items: mapOrderItems(order.items), // Real items
      totalAmount: order.total,
      estimatedDeliveryTime: order.estimatedDeliveryDate
        ? new Date(order.estimatedDeliveryDate).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
        : "N/A",
      createdAt: order.createdAt,
      distance: null,
    }));

    return res.status(200).json({
      success: true,
      data: formattedOrders,
    });
  },
);

/**
 * Get Specific Order Details
 */
export const getOrderDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const deliveryId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    // Scoped to the assigned courier. Without this, any authenticated courier
    // could read any order in the system — customer name, phone and full
    // delivery address included. (#H-15)
    const order = await Order.findOne({
      _id: id,
      deliveryBoy: deliveryId,
    }).populate("items");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Fetch Delivery Earning for this order
    const { default: Commission } = await import("../../../models/Commission");
    const commission = await Commission.findOne({
      order: id,
      type: "DELIVERY_BOY",
    });

    const formattedOrder = {
      id: order._id,
      orderId: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      address: `${order.deliveryAddress?.address || ""}, ${order.deliveryAddress?.city || ""}`,
      deliveryAddress: order.deliveryAddress,
      status: order.status,
      items: mapOrderItems(order.items), // Real populated items
      totalAmount: order.total,
      createdAt: order.createdAt,
      distance: null,
      deliveryEarning: commission ? commission.commissionAmount : 0,
      sellerPickups: order.sellerPickups || [],
      settlementStatus: order.settlementStatus,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    };

    return res.status(200).json({
      success: true,
      data: formattedOrder,
    });
  },
);

/**
 * Update Order Status
 */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const order = await changeCourierStage(req.params.id, req.user!.userId, String(req.body.status || ""));
  const io = req.app.get("io");
  io?.to(`order-${req.params.id}`).emit("order-status-update", { orderId: req.params.id, status: order.status });
  return res.json({ success: true, message: "Delivery stage updated", data: order });
});

/**
 * Get Return Orders
 */
export const getReturnOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;

    const orders = await Order.find({
      deliveryBoy: deliveryId,
      status: { $in: ["Returned", "Cancelled", "Rejected"] },
    })
      .populate("items")
      .sort({ updatedAt: -1 });

    const formattedOrders = orders.map((order) => ({
      id: order._id,
      orderId: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      address: `${order.deliveryAddress?.address || ""}, ${order.deliveryAddress?.city || ""}`,
      items: mapOrderItems(order.items),
      totalAmount: order.total,
      createdAt: order.createdAt,
      distance: null,
    }));

    return res.status(200).json({
      success: true,
      data: formattedOrders,
    });
  },
);

/**
 * Get Seller Locations for Order
 * Returns all unique seller shop locations for items in this order
 */
export const getSellerLocationsForOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const deliveryId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    // Verify order exists and is assigned to this delivery boy
    const order = await Order.findById(id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.deliveryBoy?.toString() !== deliveryId) {
      return res
        .status(403)
        .json({ success: false, message: "This order is not assigned to you" });
    }

    // Get all unique seller IDs from active (non-cancelled) order items
    const orderItems = await OrderItem.find({ order: id, status: { $ne: "Cancelled" } });
    const sellerIds = [
      ...new Set(orderItems.map((item) => item.seller.toString())),
    ];

    // Get seller details including locations
    const sellers = await Seller.find({ _id: { $in: sellerIds } }).select(
      "storeName address city latitude longitude location",
    );

    // Format seller locations supporting GeoJSON coordinates and legacy strings
    const sellerLocations = sellers
      .map((seller) => {
        let lat: number | undefined;
        let lng: number | undefined;
        if (seller.location?.coordinates?.length === 2) {
          lng = seller.location.coordinates[0];
          lat = seller.location.coordinates[1];
        } else if (seller.latitude && seller.longitude) {
          lat = parseFloat(seller.latitude);
          lng = parseFloat(seller.longitude);
        }

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        return {
          sellerId: seller._id.toString(),
          readyForPickup: ["Processed", "Shipped"].includes(sellerStage(orderItems.filter(item => String(item.seller) === String(seller._id)), order)),
          storeName: seller.storeName,
          address: seller.address,
          city: seller.city,
          latitude: lat,
          longitude: lng,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      data: sellerLocations,
    });
  },
);

/**
 * Send Delivery OTP
 * Generates and sends OTP to customer
 */
export const sendDeliveryOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const deliveryId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.deliveryBoy?.toString() !== deliveryId) {
      return res
        .status(403)
        .json({ success: false, message: "This order is not assigned to you" });
    }

    if (order.status === "Delivered") {
      return res
        .status(400)
        .json({ success: false, message: "Order is already delivered" });
    }

    if (order.status !== "Out for Delivery") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Order must be picked up before sending delivery OTP",
        });
    }

    try {
      const result = await generateDeliveryOtp(id, { courierId: deliveryId });

      // Emit otp-sent event to delivery boy
      const io = (req.app as any).get("io");
      if (io) {
        io.to(`delivery-${deliveryId}`).emit("otp-sent", {
          orderId: id,
          orderNumber: order.orderNumber,
          message: "Delivery OTP sent to customer",
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to send delivery OTP",
      });
    }
  },
);

/**
 * Verify Delivery OTP and mark order as delivered
 */
export const verifyDeliveryOtpController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { otp } = req.body;
    const deliveryId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.deliveryBoy?.toString() !== deliveryId) {
      return res
        .status(403)
        .json({ success: false, message: "This order is not assigned to you" });
    }

    try {
      const previousStatus = order.status;
      const result = await verifyDeliveryOtp(id, otp, deliveryId);
      // Note: verifyDeliveryOtp is from service, not this controller

      // Reload order to get updated status
      const updatedOrder = await Order.findById(id);

      // Durable settlement tasks retry independently of delivery completion.
      await runOrderEffects(id);

      // Emit socket events for real-time status update
      if (updatedOrder && updatedOrder.status === "Delivered") {
        const io = (req.app as any).get("io");
        if (io && previousStatus !== "Delivered") {
          // Emit order-delivered event to customer
          io.to(`order-${id}`).emit("order-delivered", {
            orderId: id,
            orderNumber: updatedOrder.orderNumber,
            message: "Order has been delivered successfully",
          });

          // Also emit to delivery boy room
          io.to(`delivery-${deliveryId}`).emit("order-delivered", {
            orderId: id,
            orderNumber: updatedOrder.orderNumber,
            message: "Order delivered successfully",
          });

          // Notify sellers of status update
          notifySellersOfOrderUpdate(io, updatedOrder, "STATUS_UPDATE");
        }
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: updatedOrder,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to verify delivery OTP",
      });
    }
  },
);

/**
 * Check Proximity to Seller
 * Checks if delivery boy is within 500m of a specific seller
 */
export const checkSellerProximity = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sellerId, latitude, longitude } = req.body;
    const deliveryId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    if (!sellerId || latitude === undefined || longitude === undefined) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Seller ID, latitude, and longitude are required",
        });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.deliveryBoy?.toString() !== deliveryId) {
      return res
        .status(403)
        .json({ success: false, message: "This order is not assigned to you" });
    }

    // Seller coordinates live in two places: a GeoJSON `location` and the
    // legacy `latitude`/`longitude` strings. This only read the strings, so a
    // seller whose position was set through the GeoJSON path always returned
    // "Seller location not found". (#H-38)
    const seller = await Seller.findById(sellerId).select(
      "location latitude longitude storeName",
    );
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });
    }

    let sellerLat: number | undefined;
    let sellerLng: number | undefined;
    if (seller.location?.coordinates?.length === 2) {
      sellerLng = seller.location.coordinates[0];
      sellerLat = seller.location.coordinates[1];
    } else if (seller.latitude && seller.longitude) {
      sellerLat = parseFloat(seller.latitude);
      sellerLng = parseFloat(seller.longitude);
    }

    if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) {
      return res
        .status(404)
        .json({ success: false, message: "Seller location not set" });
    }

    const { calculateDistance } = await import("../../../utils/locationHelper");
    const distance = calculateDistance(
      latitude,
      longitude,
      sellerLat as number,
      sellerLng as number,
    );

    const withinRange = distance <= 0.5; // 500m = 0.5km

    return res.status(200).json({
      success: true,
      data: {
        withinRange,
        distance: distance.toFixed(3), // in km
        distanceMeters: Math.round(distance * 1000), // in meters
        sellerName: seller.storeName,
      },
    });
  },
);

/**
 * Confirm Seller Pickup
 * Confirms pickup from a specific seller and updates order status
 */
export const confirmSellerPickup = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const result = await confirmOrderPickup(id, req.user!.userId, String(req.body.sellerId || ""), Number(req.body.latitude), Number(req.body.longitude));
  const io = req.app.get("io");
  io?.to(`order-${id}`).emit("seller-pickup-confirmed", { orderId: id, sellerId: req.body.sellerId, allPickedUp: result.allPickedUp, newStatus: result.order.status });
  io?.to(`order-${id}`).emit("order-status-update", { orderId: id, status: result.order.status });
  return res.json({ success: true, message: result.allPickedUp ? "All pickups confirmed. Order is Out for Delivery." : "Seller pickup confirmed.", data: result });
});

/**
 * Check Proximity to Customer
 * Checks if delivery boy is within 500m of customer delivery address
 */
export const checkCustomerProximity = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    const deliveryId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    if (latitude === undefined || longitude === undefined) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Latitude and longitude are required",
        });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.deliveryBoy?.toString() !== deliveryId) {
      return res
        .status(403)
        .json({ success: false, message: "This order is not assigned to you" });
    }

    // Get customer location from delivery address
    const customerLat = order.deliveryAddress?.latitude;
    const customerLng = order.deliveryAddress?.longitude;

    if (!customerLat || !customerLng) {
      return res.status(400).json({
        success: false,
        message: "Customer delivery address coordinates not available",
      });
    }

    // Calculate distance
    const { calculateDistance } = await import("../../../utils/locationHelper");
    const distance = calculateDistance(
      latitude,
      longitude,
      customerLat,
      customerLng,
    );

    const withinRange = distance <= 0.5; // 500m = 0.5km

    return res.status(200).json({
      success: true,
      data: {
        withinRange,
        distance: distance.toFixed(3), // in km
        distanceMeters: Math.round(distance * 1000), // in meters
        customerName: order.customerName,
      },
    });
  },
);
