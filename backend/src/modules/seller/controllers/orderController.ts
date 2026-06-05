import { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import { asyncHandler } from "../../../utils/asyncHandler";
import WalletTransaction from "../../../models/WalletTransaction";
import { notifyDeliveryBoysOfNewOrder } from "../../../services/orderNotificationService";
import { Server as SocketIOServer } from "socket.io";
import { sendNotificationToUser } from "../../../services/firebaseAdmin";

/**
 * Get seller's orders with filters, sorting, and pagination
 */
export const getOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const {
      dateFrom,
      dateTo,
      status,
      search,
      page = "1",
      limit = "10",
      sortBy = "orderDate",
      sortOrder = "desc",
    } = req.query;

    // Find all order IDs that contain items from this seller
    const orderItems = await OrderItem.find({ seller: sellerId }).distinct("order");

    // Build query - filter by orders containing this seller's items.
    // Exclude orders that are still awaiting online payment (status='Pending' AND
    // paymentStatus='Pending'). These orders are not yet confirmed and should not
    // be visible to the seller until payment is verified.
    const query: any = {
        _id: { $in: orderItems },
        $nor: [{ status: 'Pending', paymentStatus: 'Pending' }],
    };

    // Date range filter
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) {
        query.orderDate.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        // Include the entire "To" day — a bare date parses to 00:00, which would
        // otherwise exclude every order placed later that same day. (#orders-filter)
        const end = new Date(dateTo as string);
        end.setHours(23, 59, 59, 999);
        query.orderDate.$lte = end;
      }
    }

    // Status filter
    if (status && status !== 'All Status') {
      // Map frontend status to backend status
      const statusMapping: Record<string, string> = {
        'Received': 'Received',
        'Accepted': 'Accepted',
        'Processed': 'Processed',
        'On the way': 'Out for Delivery',
        'Delivered': 'Delivered',
        'Rejected': 'Rejected',
        'Cancelled': 'Cancelled',
      };
      query.status = statusMapping[status as string] || status;
    }

    // Search filter — match Order ID, invoice, customer, or status.
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { invoiceNumber: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { customerPhone: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Sort — map the frontend's column keys to the real DB fields. Without this,
    // sorting by Order Id / Delivery Date / Amount targets non-existent fields
    // (orderId / deliveryDate / amount) and silently does nothing. (#orders-sort)
    const sortFieldMap: Record<string, string> = {
      orderId: "orderNumber",
      deliveryDate: "estimatedDeliveryDate",
      orderDate: "orderDate",
      status: "status",
      amount: "total",
    };
    const sortKey = sortFieldMap[sortBy as string] || "orderDate";
    const sort: any = {};
    sort[sortKey] = sortOrder === "asc" ? 1 : -1;

    // Get orders with populated customer and delivery info
    const orders = await Order.find(query)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Order.countDocuments(query);

    // Compute each order's amount for THIS seller = sum of the seller's own items.
    // The order's `total` includes other sellers' items + shipping/fees, so showing it
    // would not match the seller's invoice (which only lists this seller's items). (#22/286)
    const pageOrderIds = orders.map(o => o._id);
    const sellerTotals = await OrderItem.aggregate([
      { $match: { order: { $in: pageOrderIds }, seller: new mongoose.Types.ObjectId(sellerId) } },
      { $group: { _id: "$order", amount: { $sum: "$total" } } },
    ]);
    const sellerAmountByOrder = new Map<string, number>(
      sellerTotals.map((r: any) => [r._id.toString(), r.amount])
    );

    // Format response for frontend
    const formattedOrders = orders.map(order => ({
      id: order._id,
      orderId: order.orderNumber,
      deliveryDate: order.estimatedDeliveryDate
        ? order.estimatedDeliveryDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : order.orderDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
      orderDate: order.orderDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
      status: order.status === 'Out for Delivery' ? 'On the way' : order.status,
      amount: sellerAmountByOrder.get((order._id as any).toString()) ?? order.total,
      customerName: (order.customer as any)?.name || order.customerName || '',
      customerPhone: (order.customer as any)?.phone || order.customerPhone || '',
      deliveryBoyName: (order.deliveryBoy as any)?.name || '',
    }));

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: formattedOrders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  }
);

/**
 * Get order by ID with populated order items, customer, and delivery info
 */
export const getOrderById = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    // First check if this seller has items in this order
    const sellerItems = await OrderItem.find({ order: id, seller: sellerId })
      .populate("seller", "storeName")
      .populate("product");

    if (!sellerItems || sellerItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get order with populated data
    const order = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get only this seller's order items
    const orderItems = sellerItems;

    // Format order items for frontend
    // Format order items for frontend
    const formattedItems = orderItems.map(item => {
      // Readable label for a variation, trying each possible field. (#order-unit)
      const label = (v: any) => v && (v.value || v.title || v.pack);

      // 0. Prefer the snapshot stored at order time (most reliable).
      let unit = (item as any).variantTitle || '';

      const product = item.product as any;
      if (!unit && product && Array.isArray(product.variations) && product.variations.length) {
        // 1. Match the stored variation by id OR readable value/title/pack.
        let match: any = null;
        if (item.variation) {
          match = product.variations.find((v: any) =>
            (v._id && v._id.toString() === item.variation) ||
            v.value === item.variation ||
            v.title === item.variation ||
            v.pack === item.variation
          );
        }
        // 2. Fallback: match by price; or if there's only one variation, use it.
        if (!match) {
          match =
            product.variations.find((v: any) => v.price === item.unitPrice || v.discPrice === item.unitPrice) ||
            (product.variations.length === 1 ? product.variations[0] : null);
        }
        if (match) unit = label(match) || '';
      }

      // 3. If the stored variation is a readable string (not an ObjectId), use it;
      //    otherwise show N/A rather than leaking a raw id.
      if (!unit) {
        const v = item.variation || '';
        unit = /^[0-9a-fA-F]{24}$/.test(v) ? 'N/A' : (v || 'N/A');
      }

      return {
        srNo: item._id.toString().slice(-4), // Use last 4 chars of ID as srNo
        product: item.productName || 'Unknown Product',
        soldBy: (item.seller as any)?.storeName || 'N/A',
        unit: unit,
        price: item.unitPrice || 0,
        tax: 0,
        taxPercent: 0,
        qty: item.quantity || 0,
        subtotal: item.total || 0,
      };
    });

    // Seller-specific totals (sum of THIS seller's items only) so the invoice
    // header matches the line items and the order list amount. (#22/286)
    const sellerSubtotal = formattedItems.reduce((sum, i) => sum + (i.subtotal || 0), 0);
    const sellerTax = formattedItems.reduce((sum, i) => sum + (i.tax || 0), 0);
    const sellerGrandTotal = sellerSubtotal + sellerTax;

    // Format order data for frontend
    const orderDetail = {
      id: order._id,
      orderNumber: order.orderNumber || 'N/A',
      invoiceNumber: order.invoiceNumber || order.orderNumber || 'N/A',
      orderDate: order.orderDate ? order.orderDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      deliveryDate: order.estimatedDeliveryDate ? order.estimatedDeliveryDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      timeSlot: order.timeSlot || 'N/A',
      status: order.status === 'Out for Delivery' ? 'On the way' : order.status,
      customerName: (order.customer as any)?.name || order.customerName || '',
      customerEmail: (order.customer as any)?.email || order.customerEmail || '',
      customerPhone: (order.customer as any)?.phone || order.customerPhone || '',
      deliveryBoyName: (order.deliveryBoy as any)?.name || '',
      deliveryBoyPhone: (order.deliveryBoy as any)?.mobile || '',
      items: formattedItems,
      subtotal: sellerSubtotal,
      tax: sellerTax,
      grandTotal: sellerGrandTotal,
      paymentMethod: order.paymentMethod || 'N/A',
      paymentStatus: order.paymentStatus || 'Pending',
      deliveryAddress: order.deliveryAddress || {},
    };

    return res.status(200).json({
      success: true,
      message: "Order details fetched successfully",
      data: orderDetail,
    });
  }
);

/**
 * Update order status (seller can update: Accepted, On the way, Delivered, Cancelled)
 */
export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID format",
      });
    }

    // Validate allowed status updates for seller
    const allowedStatuses = ['Accepted', 'Processed', 'On the way', 'Delivered', 'Cancelled', 'Rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Seller can only update to: ${allowedStatuses.join(', ')}`,
      });
    }

    // Check if this seller has items in this order
    const sellerItems = await OrderItem.findOne({ order: id, seller: sellerId });

    if (!sellerItems) {
      console.log(`[Order Update] Seller ${sellerId} not authorized for order ${id}`);
      return res.status(404).json({
        success: false,
        message: "Order not found or you are not authorized to manage this order",
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if status is already the same
    if (order.status === status) {
      return res.status(400).json({
        success: false,
        message: `Order is already ${status}`,
      });
    }

    const previousStatus = order.status;
    order.status = status === 'On the way' ? 'Out for Delivery' : status;
    
    // Update seller's items status in this order if applicable
    const itemStatusMap: Record<string, string> = {
      'Accepted': 'Pending',
      'Processed': 'Pending',
      'On the way': 'Shipped',
      'Delivered': 'Delivered',
      'Cancelled': 'Cancelled',
      'Rejected': 'Cancelled'
    };

    if (itemStatusMap[status]) {
      await OrderItem.updateMany(
        { order: id, seller: sellerId },
        { status: itemStatusMap[status] }
      );
    }

    await order.save();

    // Notify customer about status change (socket + push)
    try {
      const io: SocketIOServer = (req.app.get("io") as SocketIOServer);
      const customerStatusMessages: Record<string, { title: string; body: string }> = {
        'Accepted':  { title: '✅ Order Confirmed!',        body: `Your order #${order.orderNumber} has been confirmed by the seller.` },
        'Processed': { title: '📦 Order Being Prepared',    body: `Your order #${order.orderNumber} is being prepared for delivery.` },
        'On the way':{ title: '🚚 Out for Delivery!',       body: `Your order #${order.orderNumber} is on the way to you!` },
        'Delivered': { title: '🎉 Order Delivered!',        body: `Your order #${order.orderNumber} has been delivered. Enjoy!` },
        'Cancelled': { title: '❌ Order Cancelled',         body: `Your order #${order.orderNumber} has been cancelled by the seller.` },
        'Rejected':  { title: '❌ Order Rejected',          body: `Your order #${order.orderNumber} has been rejected. Please contact support.` },
      };
      const msgInfo = customerStatusMessages[status];
      if (msgInfo && order.customer) {
        const customerId = order.customer.toString();
        // Real-time socket (for open app / tracking screen)
        if (io) {
          io.to(`order-${id}`).emit('order-status-update', {
            orderId: id,
            orderNumber: order.orderNumber,
            status: order.status,
            message: msgInfo.body,
          });
        }
        // Push notification (for background / closed app)
        sendNotificationToUser(customerId, 'Customer', {
          title: msgInfo.title,
          body: msgInfo.body,
          data: {
            type: 'ORDER_STATUS_UPDATE',
            orderId: id,
            orderNumber: order.orderNumber || '',
            status: order.status,
          }
        }).catch(err => console.error(`❌ Customer push notification failed for order ${id}:`, err));
      }
    } catch (notifyErr) {
      console.error('Error sending customer status notification:', notifyErr);
    }

    // Trigger delivery notification if seller accepts the order
    if (status === 'Accepted' && previousStatus !== 'Accepted') {
      try {
        const io: SocketIOServer = (req.app.get("io") as SocketIOServer);
        if (io) {
          // Need to fetch full order with details for the notification service
          // Using lean() to get a plain JS object which is what the service expects mostly,
          // but checking the service implementation, it uses .items mainly for seller location.
          // We should ensure the passed order object has populated items with sellers.
          const fullOrder = await Order.findById(order._id)
            .populate({
              path: 'items',
              populate: { path: 'seller' }
            })
            .lean();

          if (fullOrder) {
            await notifyDeliveryBoysOfNewOrder(io, fullOrder);
            console.log(`Delivery notification triggered for Accepted order ${order.orderNumber}`);
          }
        }
      } catch (notifyError) {
        console.error('Error notifying delivery boys on seller acceptance:', notifyError);
        // Don't fail the request, just log
      }
    }

    // If order is delivered, trigger the commission flow via processOrderStatusTransition
    if (status === 'Delivered' && previousStatus !== 'Delivered') {
      try {
        const { processOrderStatusTransition } = await import("../../../services/orderService");
        await processOrderStatusTransition(id, 'Delivered', previousStatus);

        // If COD, add a pending WalletTransaction for confirmation
        if (order.paymentMethod === 'COD') {
          // Use per-item commission rates snapshotted at order creation (not current seller rate)
          const sellerOrderItems = await OrderItem.find({ order: id, seller: sellerId });
          if (sellerOrderItems.length > 0) {
            const sellerSubtotal = sellerOrderItems.reduce((sum, item) => sum + (item.total || 0), 0);
            const totalCommission = sellerOrderItems.reduce((sum, item) => sum + ((item as any).commissionAmount || 0), 0);
            const netEarning = sellerSubtotal - totalCommission;

            await WalletTransaction.create({
              userId: sellerId,
              userType: 'SELLER',
              amount: netEarning,
              type: 'Credit',
              description: `Earnings from COD Order #${order.orderNumber} (Pending Settlement)`,
              reference: `ORD-COD-PEND-${order.orderNumber}-${Date.now()}`,
              status: 'Pending',
              relatedOrder: order._id
            });
          }
        }
      } catch (transitionError: any) {
        console.error("Error processing order status transition for seller:", transitionError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: {
        id: order._id,
        status: order.status,
      },
    });
  }
);
