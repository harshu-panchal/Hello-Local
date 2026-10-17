import { Request, Response } from "express";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Customer from "../../../models/Customer";
import mongoose from "mongoose";
import { notifySellersOfOrderUpdate } from "../../../services/sellerNotificationService";
import { generateDeliveryOtp } from "../../../services/deliveryOtpService";
import { Server as SocketIOServer } from "socket.io";
import { getOrderItemCommissionRate } from "../../../services/commissionService";
import { sendNotificationToUser } from "../../../services/firebaseAdmin";
import crypto from "crypto";
import { variationLabel } from "../../../utils/productVariation";
import { consumeCoupon } from "../../../services/orderPricingService";
import { reserveMany } from "../../../services/stockService";
import { checkoutIdentity, prepareCheckout } from "../../../services/checkoutService";
import { orderError, withOrderTransaction } from "../../../services/orderTransactionService";
import { cancelOrderLifecycle } from "../../../services/orderLifecycleService";
import { runOrderEffects } from "../../../services/orderEffectService";

// Create a new order
export const quoteOrder = async (req: Request, res: Response) => {
  try {
    if (typeof req.body.idempotencyKey === "string") {
      const existing = await Order.findOne({ customer: req.user!.userId, checkoutKey: req.body.idempotencyKey });
      if (existing && existing.checkoutHash === checkoutIdentity(req.body)) {
        return res.json({ success: true, data: { total: existing.total, pricing: existing, replayed: true } });
      }
    }
    const quote = await prepareCheckout(req.user!.userId, req.body);
    return res.json({ success: true, data: { total: quote.pricing.total, pricing: quote.pricing, warning: quote.pricing.couponRejectionReason } });
  } catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: "Authentication required" });
    const checkoutKey = req.body.idempotencyKey || crypto.randomUUID();
    if (typeof checkoutKey !== "string" || checkoutKey.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(checkoutKey)) return res.status(400).json({ success: false, message: "Invalid checkout key" });
    const hash = checkoutIdentity(req.body);
    const result = await withOrderTransaction(`checkout:${userId}`, async session => {
      const existing = await Order.findOne({ customer: userId, checkoutKey }).session(session);
      if (existing) {
        if (existing.checkoutHash !== hash) orderError("Checkout changed. Start a new checkout attempt.", 409);
        return { order: existing, replayed: true, warning: undefined };
      }
      const { customer, resolved, latitude, longitude, paymentMethod, gstin, pricing, lines } = await prepareCheckout(userId, req.body, session);
      if (req.body.expectedTotal !== undefined && (!Number.isFinite(Number(req.body.expectedTotal)) || Math.abs(Number(req.body.expectedTotal) - pricing.total) > 0.009)) orderError("Checkout total changed. Please review the updated quote before placing your order.", 409);
      await reserveMany(resolved.map(line => ({ productId: String(line.product._id), quantity: line.quantity, variation: line.selector })), session);
      const order = new Order({ customer: userId, customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone,
        deliveryAddress: { address: req.body.address.address || req.body.address.street || "N/A", city: req.body.address.city || "N/A",
          state: req.body.address.state, pincode: req.body.address.pincode || "000000", landmark: req.body.address.landmark, latitude, longitude },
        gstin: gstin || undefined, checkoutKey, checkoutHash: hash, originalTotal: pricing.total,
        paymentMethod, paymentStatus: "Pending", status: paymentMethod === "COD" ? "Received" : "Pending",
        subtotal: pricing.subtotal, tax: pricing.tax, shipping: pricing.shipping, platformFee: pricing.platformFee, discount: pricing.discount,
        couponCode: pricing.couponCode, couponFunding: pricing.couponFunding, tipAmount: pricing.tip, total: pricing.total,
        deliveryDistanceKm: pricing.deliveryDistanceKm, isFreeDelivery: pricing.isFreeDelivery, freeDeliverySubsidy: pricing.freeDeliverySubsidy,
        deliveryOtp: crypto.randomInt(1000, 10000).toString(), deliveryOtpExpiresAt: new Date(Date.now() + 86400000), items: [] });
      for (let i = 0; i < resolved.length; i++) {
        const line = lines[i]; const selected = resolved[i];
        const commissionRate = await getOrderItemCommissionRate(String(selected.product._id), String(selected.product.seller));
        const base = pricing.couponFunding === "SELLER" ? Math.max(0, line.lineTotal - (line.discountAmount || 0)) : line.lineTotal;
        const [item] = await OrderItem.create([{ order: order._id, product: selected.product._id, seller: selected.product.seller,
          productName: selected.product.productName, productImage: selected.product.mainImage, sku: selected.product.sku,
          unitPrice: line.unitPrice, quantity: line.quantity, total: line.lineTotal, subtotal: line.lineTotal, discountAmount: line.discountAmount,
          taxRate: line.taxRate, taxAmount: line.taxAmount, commissionRate, commissionAmount: Math.round(base * commissionRate) / 100,
          variation: selected.selector || undefined, variantTitle: variationLabel(selected.variation), status: "Pending", fulfillmentStatus: "Received" }], { session });
        order.items.push(item._id as mongoose.Types.ObjectId);
      }
      await order.save({ session });
      await consumeCoupon(pricing.couponCode, session);
      return { order, replayed: false, warning: pricing.couponRejectionReason };
    });
    if (!result.replayed && result.order.paymentMethod === "COD") {
      const io = req.app.get("io") as SocketIOServer;
      if (io) void notifySellersOfOrderUpdate(io, result.order, "NEW_ORDER").catch(console.error);
      void sendNotificationToUser(userId, "Customer", { title: "Order placed", body: `Your COD order #${result.order.orderNumber} has been placed.`, data: { type: "ORDER_PLACED", orderId: String(result.order._id) } }).catch(console.error);
    }
    return res.status(result.replayed ? 200 : 201).json({ success: true, data: result.order, message: "Order placed successfully", warning: result.warning });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Failed to place order" });
  }
};

/**
 * Cancel abandoned orders that have been pending payment for more than 30 minutes,
 * returning reserved stock to the shelf and releasing unused coupons.
 */
export async function cleanupExpiredPendingOrders(customerFilter?: string): Promise<number> {
  const expired = await Order.find({ ...(customerFilter ? { customer: customerFilter } : {}), status: "Pending", paymentStatus: "Pending", createdAt: { $lt: new Date(Date.now() - 1800000) } }).select("_id");
  let cancelled = 0;
  for (const order of expired) {
    try {
      const result = await cancelOrderLifecycle(String(order._id), "system", { expiredOnly: true, reason: "Online payment timed out / abandoned" });
      if (!result.unchanged) cancelled++;
      await runOrderEffects(String(order._id));
    } catch (error) { console.error("Pending order cleanup will retry", error); }
  }
  return cancelled;
}

export const getMyOrders = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        // Clean up any stale abandoned pending orders for this customer
        await cleanupExpiredPendingOrders(userId);

        const { status, page = 1, limit = 10 } = req.query;

        const query: any = { customer: userId };

        if (status) {
            query.status = status; // Note: Model field is 'status', not 'orderStatus'
        }

        const skip = (Number(page) - 1) * Number(limit);

        const orders = await Order.find(query)
            .populate({
                path: 'items',
                populate: { path: 'product', select: 'productName mainImage price' }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await Order.countDocuments(query);

        // Transform orders to match frontend Order type
        const transformedOrders = orders.map(order => {
            const orderObj = order.toObject();
            return {
                ...orderObj,
                id: orderObj._id.toString(),
                totalItems: Array.isArray(orderObj.items) ? orderObj.items.length : 0,
                totalAmount: orderObj.total,
                fees: {
                    platformFee: orderObj.platformFee || 0,
                    deliveryFee: orderObj.shipping || 0
                },
                // Keep original fields for backward compatibility
                subtotal: orderObj.subtotal,
                address: orderObj.deliveryAddress
            };
        });

        return res.status(200).json({
            success: true,
            data: transformedOrders,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error fetching orders",
            error: error.message,
        });
    }
};

// Get single order details
export const getOrderById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Order ID format",
            });
        }

        // Find order and ensure it belongs to the user
        const order = await Order.findOne({ _id: id, customer: userId })
            .populate({
                path: 'items',
                populate: [
                    { path: 'product', select: 'productName mainImage pack manufacturer price' },
                    { path: 'seller', select: 'storeName city phone fssaiLicNo' }
                ]
            })
            .populate('deliveryBoy', 'name phone mobile profileImage vehicleNumber');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        // Get customer's permanent delivery OTP
        const customer = await Customer.findById(userId).select('deliveryOtp');
        const deliveryOtp = order.deliveryOtp || customer?.deliveryOtp;

        // Transform order to match frontend Order type
        const orderObj = order.toObject();
        const transformedOrder = {
            ...orderObj,
            id: orderObj._id.toString(),
            totalItems: Array.isArray(orderObj.items) ? orderObj.items.length : 0,
            totalAmount: orderObj.total,
            fees: {
                platformFee: orderObj.platformFee || 0,
                deliveryFee: orderObj.shipping || 0
            },
            // Keep original fields for backward compatibility
            subtotal: orderObj.subtotal,
            address: orderObj.deliveryAddress,
            // Include invoice enabled flag
            invoiceEnabled: orderObj.invoiceEnabled || false,
            // Include customer's permanent delivery OTP
            deliveryOtp,
            // Map deliveryBoy to deliveryPartner for frontend
            deliveryPartner: orderObj.deliveryBoy ? { ...(orderObj.deliveryBoy as any), phone: (orderObj.deliveryBoy as any).mobile || (orderObj.deliveryBoy as any).phone } : null
        };

        return res.status(200).json({
            success: true,
            data: transformedOrder,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error fetching order detail",
            error: error.message,
        });
    }
};

/**
 * Refresh Delivery OTP
 */
export const refreshDeliveryOtp = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Order ID format",
            });
        }

        const order = await Order.findOne({ _id: id, customer: userId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.status === 'Delivered') {
            return res.status(400).json({ success: false, message: "Order is already delivered" });
        }

        // Generate and send new OTP
        const result = await generateDeliveryOtp(id, { refresh: true });

        // Emit socket event if needed (customer room)
        const io = (req.app as any).get("io");
        if (io) {
            io.to(`order-${id}`).emit('delivery-otp-refreshed', {
                orderId: id,
                // The shared tracking room includes the courier; never broadcast the code here.
                expiresAt: (await Order.findById(id).select("deliveryOtpExpiresAt"))?.deliveryOtpExpiresAt
            });
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error refreshing delivery OTP:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: "Failed to refresh delivery OTP",
            error: error.message
        });
    }
};

// Cancel Order
export const cancelOrder = async (req: Request, res: Response) => {
  try {
    if (!String(req.body.reason || "").trim()) return res.status(400).json({ success: false, message: "Cancellation reason is required" });
    const result = await cancelOrderLifecycle(req.params.id, "customer", { userId: req.user!.userId, reason: String(req.body.reason) });
    await runOrderEffects(req.params.id);
    const io = req.app.get("io");
    io?.to(`order-${req.params.id}`).emit("order-cancelled", { orderId: req.params.id, status: result.order.status });
    if (io && !result.unchanged) await notifySellersOfOrderUpdate(io, result.order, "ORDER_CANCELLED");
    return res.json({ success: true, message: "Order cancelled. Any prepaid refund is being processed.", data: { id: result.order._id, status: result.order.status } });
  } catch (error: any) { return res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
};

export const updateOrderNotes = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { deliveryInstructions, specialRequests } = req.body;
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Order ID format",
            });
        }

        const order = await Order.findOne({ _id: id, customer: userId });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (['Delivered', 'Cancelled', 'Returned'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot update notes for ${order.status} order`
            });
        }

        if (deliveryInstructions !== undefined) order.deliveryInstructions = deliveryInstructions;
        if (specialRequests !== undefined) order.specialRequests = specialRequests;

        await order.save();

        return res.status(200).json({
            success: true,
            message: "Order notes updated",
            data: {
                deliveryInstructions: order.deliveryInstructions,
                specialRequests: order.specialRequests
            }
        });
    } catch (error: any) {
        console.error('Error updating order notes:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to update order notes",
            error: error.message
        });
    }
};
