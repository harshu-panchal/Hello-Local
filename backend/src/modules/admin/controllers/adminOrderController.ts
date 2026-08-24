import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import { validateTransition } from "../../../services/orderStatusService";
import {
  reservationsFromOrderItems,
  releaseMany,
} from "../../../services/stockService";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Delivery from "../../../models/Delivery";
import DeliveryAssignment from "../../../models/DeliveryAssignment";
import Return from "../../../models/Return";
import { notifySellersOfOrderUpdate } from "../../../services/sellerNotificationService";
import { Server as SocketIOServer } from "socket.io";

/**
 * Get all orders with filters
 */
export const getAllOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus,
      seller,
      dateFrom,
      dateTo,
      search,
    } = req.query;

    const query: any = {};

    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) query.orderDate.$lte = new Date(dateTo as string);
    }
    if (search && typeof search === "string" && search.trim() !== "") {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { orderNumber: { $regex: safe, $options: "i" } },
        { customerName: { $regex: safe, $options: "i" } },
        { customerEmail: { $regex: safe, $options: "i" } },
        { customerPhone: { $regex: safe, $options: "i" } },
      ];
    }

    // If seller filter, need to check order items
    if (seller) {
      const orderItems = await OrderItem.find({ seller }).distinct("order");
      query._id = { $in: orderItems };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("customer", "name email phone")
        .populate("deliveryBoy", "name mobile")
        .populate("items")
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Order.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
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
 * Get order by ID
 */
export const getOrderById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    const order = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email")
      .populate({
        path: "items",
        populate: [
          {
            path: "product",
            select: "productName mainImage",
          },
          {
            path: "seller",
            select: "sellerName storeName",
          },
        ],
      })
      .populate("cancelledBy", "firstName lastName");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: order,
    });
  }
);

/**
 * Update order status
 */
export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const current = await Order.findById(id).select("status paymentStatus paymentMethod items couponCode");
    if (!current) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Admins may drive any stage, but only along legal edges — no reviving a
    // terminal order and re-triggering its money side-effects. (#H-05 / #H-09)
    const check = validateTransition(current.status, status, "admin");
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.message });
    }
    const nextStatus = check.status!;

    const updateData: any = { status: nextStatus };
    if (adminNotes) updateData.adminNotes = adminNotes;

    if (nextStatus === "Delivered") {
      updateData.deliveredAt = new Date();
    }

    if (nextStatus === "Cancelled") {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = req.user?.userId;
    }

    const order = await Order.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .populate("items");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }


    // Trigger notification if status is "Processed" (Confirmed) or if paymentStatus changed to "Paid"
    if (nextStatus === "Processed" || order.paymentStatus === "Paid") {
      const io: SocketIOServer = req.app.get("io");
      if (io) {
        notifySellersOfOrderUpdate(io, order, "STATUS_UPDATE");
      }
    }

    // Cancelling/rejecting/returning returns the stock the order was holding.
    // The admin path used to leave it permanently decremented. (#H-09)
    if (["Cancelled", "Rejected", "Returned"].includes(nextStatus)) {
      try {
        const items = await OrderItem.find({ order: id });
        const reservations = await reservationsFromOrderItems(
          items.map((oi) => ({ product: oi.product, quantity: oi.quantity, variation: oi.variation })),
        );
        await releaseMany(reservations);
        await OrderItem.updateMany({ order: id }, { $set: { status: "Cancelled" } });
      } catch (stockErr) {
        console.error(`Failed to restore stock for order ${id}:`, stockErr);
      }

      // Prepaid orders must be refunded, not merely closed. (#H-06)
      if (current.paymentStatus === "Paid" && current.paymentMethod !== "COD") {
        try {
          const { refundOrder } = await import("../../../services/refundService");
          await refundOrder(id, `Order ${nextStatus.toLowerCase()} by admin`);
        } catch (refundErr) {
          console.error(`Refund failed for order ${id}:`, refundErr);
        }
      }

      // Return the coupon use. (#H-29)
      try {
        const { releaseCoupon } = await import("../../../services/orderPricingService");
        await releaseCoupon(current.couponCode);
      } catch (couponErr) {
        console.error(`Coupon release failed for order ${id}:`, couponErr);
      }
    }

    // Distribute commissions if order is delivered
    if (nextStatus === "Delivered") {
      const { distributeCommissions } = await import("../../../services/commissionService");
      try {
        await distributeCommissions(id);
      } catch (error) {
        console.error("Error distributing commissions:", error);
      }
    }

    // Cancelling, rejecting or returning an order must claw back anything
    // already credited for it. (#H-07)
    if (["Cancelled", "Rejected", "Returned"].includes(nextStatus)) {
      const { reverseCommissions } = await import("../../../services/commissionService");
      try {
        const rev = await reverseCommissions(id);
        if (!rev.success) {
          console.error(`Commission reversal failed for order ${id}: ${rev.message}`);
        }
      } catch (error) {
        console.error("Error reversing commissions:", error);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  }
);

/**
 * Assign delivery boy to order
 */
export const assignDeliveryBoy = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: "Delivery boy ID is required",
      });
    }

    // Verify delivery boy exists and is active
    const deliveryBoy = await Delivery.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    if (deliveryBoy.status !== "Active") {
      return res.status(400).json({
        success: false,
        message: "Delivery boy is not active",
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // A finished order cannot be reassigned. This used to be allowed, which
    // silently orphaned the previous courier's assignment. (#H-30)
    if (["Delivered", "Cancelled", "Rejected", "Returned"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order is ${order.status} and cannot be assigned.`,
      });
    }

    if (order.deliveryBoy && String(order.deliveryBoy) !== String(deliveryBoyId)) {
      console.warn(
        `Order ${order.orderNumber} reassigned from ${order.deliveryBoy} to ${deliveryBoyId}`,
      );
    }

    // Update order
    order.deliveryBoy = deliveryBoyId as any;
    order.deliveryBoyStatus = "Assigned";
    order.assignedAt = new Date();
    await order.save();

    // Create or update delivery assignment
    await DeliveryAssignment.findOneAndUpdate(
      { order: id },
      {
        order: id,
        deliveryBoy: deliveryBoyId,
        assignedAt: new Date(),
        assignedBy: req.user?.userId,
        status: "Assigned",
      },
      { upsert: true, new: true }
    );

    const updatedOrder = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email")
      .populate("items");

    // Tell the courier. Assignment used to be silent — no socket event and no
    // push — so a partner only discovered the job by refreshing. (#H-30)
    try {
      const io = req.app.get("io");
      if (io) {
        io.to(`delivery-${deliveryBoyId}`).emit("order-assigned", {
          orderId: order._id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          total: order.total,
          deliveryAddress: order.deliveryAddress,
          message: "A new order has been assigned to you",
        });
      }
    } catch (socketErr) {
      console.error("Socket notify on assignment failed:", socketErr);
    }

    try {
      const { sendNotificationToUser } = await import("../../../services/firebaseAdmin");
      await sendNotificationToUser(String(deliveryBoyId), "Delivery", {
        title: "New delivery assigned",
        body: `Order #${order.orderNumber} has been assigned to you.`,
        data: {
          type: "ORDER_ASSIGNED",
          orderId: String(order._id),
          orderNumber: order.orderNumber || "",
        },
      });
    } catch (pushErr) {
      console.error("Push notify on assignment failed:", pushErr);
    }

    return res.status(200).json({
      success: true,
      message: "Delivery boy assigned successfully",
      data: updatedOrder,
    });
  }
);

/**
 * Get orders by status
 */
export const getOrdersByStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { status } = req.params;
    const {
      page = 1,
      limit = 10,
      paymentStatus,
      seller,
      dateFrom,
      dateTo,
      search,
    } = req.query;

    const validStatuses = [
      "Received",
      "Pending",
      "Processed",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Rejected",
      "Returned",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const query: any = { status };

    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) query.orderDate.$lte = new Date(dateTo as string);
    }
    if (search && typeof search === "string" && search.trim() !== "") {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { orderNumber: { $regex: safe, $options: "i" } },
        { customerName: { $regex: safe, $options: "i" } },
        { customerEmail: { $regex: safe, $options: "i" } },
        { customerPhone: { $regex: safe, $options: "i" } },
      ];
    }

    if (seller) {
      const orderItems = await OrderItem.find({ seller }).distinct("order");
      query._id = { $in: orderItems };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("customer", "name email phone")
        .populate("deliveryBoy", "name mobile")
        .populate("items")
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Order.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: `Orders with status ${status} fetched successfully`,
      data: orders,
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
 * Get all return requests
 */
export const getReturnRequests = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      seller,
      dateFrom,
      dateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};

    // Status filter
    if (status && status !== "all") {
      query.status = status;
    }

    // Date filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo as string);
      }
    }

    // Search filter (complex because we need to search populated fields)
    // For now, simpler implementation - search by order ID or return reason or customer
    if (search) {
      // Find orders matching search first
      const orders = await Order.find({
        orderNumber: { $regex: search as string, $options: "i" },
      }).select("_id");
      const orderIds = orders.map((o) => o._id);

      query.$or = [
        { order: { $in: orderIds } },
        { reason: { $regex: search as string, $options: "i" } },
        { description: { $regex: search as string, $options: "i" } },
      ];
    }

    // Seller filter requires looking up order items
    if (seller && seller !== "all") {
      // Find order items for this seller
      const orderItems = await OrderItem.find({ seller }).select("_id");
      const orderItemIds = orderItems.map((oi) => oi._id);
      query.orderItem = { $in: orderItemIds };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const [requests, total] = await Promise.all([
      Return.find(query)
        .populate("order", "orderNumber")
        .populate("customer", "name email phone")
        .populate({
          path: "orderItem",
          populate: {
            path: "product",
            select: "productName mainImage",
          },
        })
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit as string)),
      Return.countDocuments(query),
    ]);

    // Transform logic to match frontend expectations if necessary
    // AdminReturnRequest.tsx expects: _id, orderItemId, userName, productName, variant, price, quantity, total, status, requestedAt
    // It seems flattened. Let's send structured data and let frontend handle it, or flatten it here.
    // The frontend uses "request.orderItemId", "request.userName", "request.productName" etc.
    // This implies a flattened structure.

    const transformedRequests = requests.map((req: any) => ({
      _id: req._id,
      orderId: req.order?._id,
      orderNumber: req.order?.orderNumber,
      orderItemId: req.orderItem?._id, // Frontend displays this
      userId: req.customer?._id,
      userName: req.customer?.name || "Unknown",
      // product info from orderItem
      productId: req.orderItem?.product?._id,
      productName: req.orderItem?.productName || "Unknown Product",
      variant: req.orderItem?.variation,
      price: req.orderItem?.unitPrice || 0,
      quantity: req.quantity,
      total: req.quantity * (req.orderItem?.unitPrice || 0),
      reason: req.reason,
      status: req.status,
      requestedAt: req.createdAt,
      processedAt: req.processedAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Return requests fetched successfully",
      data: transformedRequests,
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
 * Get return request by ID
 */
export const getReturnRequestById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const returnRequest = await Return.findById(id)
      .populate("order")
      .populate("customer", "name email phone")
      .populate({
        path: "orderItem",
        populate: [
          { path: "product", select: "productName mainImage" },
          { path: "seller", select: "sellerName storeName" },
        ],
      })
      .populate("processedBy", "firstName lastName");

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Return request details fetched successfully",
      data: returnRequest,
    });
  }
);

/**
 * Process return request (Update)
 */
export const processReturnRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, rejectionReason, refundAmount, adminNotes } = req.body;

    const validStatuses = ["Approved", "Rejected", "Processing", "Completed"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const returnRequest = await Return.findById(id);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    const updateData: any = {
      processedBy: req.user?.userId,
      processedAt: new Date(),
    };

    if (status) updateData.status = status;

    // Handle rejection reason (frontend sends 'adminNotes' for rejection reason)
    if (status === "Rejected") {
      if (rejectionReason) updateData.rejectionReason = rejectionReason;
      else if (adminNotes) updateData.rejectionReason = adminNotes;
    }

    if (status === "Approved" && refundAmount) {
      updateData.refundAmount = refundAmount;
    }

    const updatedReturn = await Return.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("order")
      .populate("orderItem")
      .populate("customer", "name email phone");

    return res.status(200).json({
      success: true,
      message: `Return request ${status ? status.toLowerCase() : "updated"
        } successfully`,
      data: updatedReturn,
    });
  }
);

/**
 * Export orders to CSV
 */
export const exportOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const { status, dateFrom, dateTo } = req.query;

    const query: any = {};
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) query.orderDate.$lte = new Date(dateTo as string);
    }

    const orders = await Order.find(query)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .sort({ orderDate: -1 })
      .lean();

    // Convert to CSV format
    const csvHeaders = [
      "Order Number",
      "Customer Name",
      "Customer Email",
      "Customer Phone",
      "Order Date",
      "Status",
      "Payment Status",
      "Total Amount",
      "Delivery Address",
      "Delivery Boy",
    ];

    const csvRows = orders.map((order) => [
      order.orderNumber,
      order.customerName,
      order.customerEmail,
      order.customerPhone,
      order.orderDate.toISOString(),
      order.status,
      order.paymentStatus,
      order.total.toString(),
      `${order.deliveryAddress.address}, ${order.deliveryAddress.city} - ${order.deliveryAddress.pincode}`,
      order.deliveryBoy ? (order.deliveryBoy as any).name : "Not Assigned",
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=orders_${Date.now()}.csv`
    );
    res.send(csvContent);
  }
);
