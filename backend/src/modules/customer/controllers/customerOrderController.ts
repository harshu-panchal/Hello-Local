import { Request, Response } from "express";
import Order from "../../../models/Order";
import Product from "../../../models/Product";
import OrderItem from "../../../models/OrderItem";
import Customer from "../../../models/Customer";
import Seller from "../../../models/Seller";
import mongoose from "mongoose";
import { calculateDistance } from "../../../utils/locationHelper";
import { notifySellersOfOrderUpdate } from "../../../services/sellerNotificationService";
import { generateDeliveryOtp } from "../../../services/deliveryOtpService";
import { Server as SocketIOServer } from "socket.io";
import { getOrderItemCommissionRate } from "../../../services/commissionService";
import { sendNotificationToUser } from "../../../services/firebaseAdmin";
import {
    findVariation,
    normalizeSelector,
    variationLabel,
    effectiveUnitPrice,
} from "../../../utils/productVariation";
import {
    priceOrder,
    consumeCoupon,
    releaseCoupon,
    PricingError,
} from "../../../services/orderPricingService";
import {
    reserveMany,
    releaseMany,
    reservationsFromOrderItems,
    StockError,
    type StockReservation,
} from "../../../services/stockService";
import { validateTransition } from "../../../services/orderStatusService";

// Create a new order
export const createOrder = async (req: Request, res: Response) => {
    const reservations: StockReservation[] = [];
    let orderCreated = false;

    try {
        const { items, address, paymentMethod, couponCode, tipAmount } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "Your cart is empty" });
        }
        if (!address || typeof address !== "object") {
            return res.status(400).json({ success: false, message: "A delivery address is required" });
        }

        // ── Customer ────────────────────────────────────────────────────────
        const customer = await Customer.findById(userId);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }
        if (customer.status !== "Active") {
            return res.status(403).json({
                success: false,
                message: "This account is not active and cannot place orders.",
            });
        }

        // ── Delivery coordinates ────────────────────────────────────────────
        const toNum = (v: unknown) =>
            v === null || v === undefined ? NaN : typeof v === "number" ? v : parseFloat(String(v));
        const deliveryLat = toNum(address.latitude);
        const deliveryLng = toNum(address.longitude);

        if (!Number.isFinite(deliveryLat) || !Number.isFinite(deliveryLng)) {
            return res.status(400).json({
                success: false,
                message: "Delivery address location (latitude/longitude) is required",
            });
        }
        if (deliveryLat < -90 || deliveryLat > 90 || deliveryLng < -180 || deliveryLng > 180) {
            return res.status(400).json({ success: false, message: "Invalid delivery address coordinates" });
        }

        // ── Resolve products and validate every line BEFORE touching stock ──
        // Validation must complete first: the old flow decremented stock inside
        // the loop and then ran the serviceability check, leaking stock and
        // orphaning OrderItems whenever that check failed. (#H-01)
        interface ResolvedLine {
            product: any;
            quantity: number;
            selector: string | null;
            variation: any | null;
            unitPrice: number;
        }
        const resolved: ResolvedLine[] = [];
        const sellerIds = new Set<string>();

        for (const item of items) {
            const productId = item?.product?.id || item?.product?._id || item?.productId;
            if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) {
                return res.status(400).json({ success: false, message: "Invalid product in cart" });
            }

            const quantity = Number(item?.quantity);
            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({ success: false, message: "Invalid item quantity" });
            }

            const product = await Product.findById(productId);
            if (!product) {
                return res.status(400).json({ success: false, message: `Product not found: ${productId}` });
            }
            if (product.status !== "Active" || !product.publish) {
                return res.status(400).json({
                    success: false,
                    message: `"${product.productName}" is no longer available`,
                });
            }
            if (product.totalAllowedQuantity && quantity > product.totalAllowedQuantity) {
                return res.status(400).json({
                    success: false,
                    message: `You can order at most ${product.totalAllowedQuantity} of "${product.productName}"`,
                });
            }

            const selector = normalizeSelector(item.variant ?? item.variation ?? null);
            const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
            const variation = hasVariations ? findVariation(product.variations as any, selector) : null;

            if (hasVariations && !variation) {
                return res.status(400).json({
                    success: false,
                    message: selector
                        ? `"${selector}" is not a valid option for "${product.productName}"`
                        : `Please choose an option for "${product.productName}"`,
                });
            }

            // Price is resolved from the database, never from the request. (#H-03)
            const unitPrice = effectiveUnitPrice(product as any, variation);
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                return res.status(400).json({
                    success: false,
                    message: `"${product.productName}" is not priced correctly. Please contact support.`,
                });
            }

            resolved.push({ product, quantity, selector, variation, unitPrice });
            if (product.seller) sellerIds.add(product.seller.toString());
        }

        // ── Every seller must be approved AND able to reach this address ────
        // The old check silently skipped sellers the query did not return, so a
        // Pending or Rejected seller passed straight through. (#H-14)
        const sellers = await Seller.find({ _id: { $in: [...sellerIds].map((s) => new mongoose.Types.ObjectId(s)) } });
        const sellerById = new Map(sellers.map((s) => [String(s._id), s]));

        for (const sellerId of sellerIds) {
            const seller = sellerById.get(sellerId);
            if (!seller) {
                return res.status(400).json({ success: false, message: "A seller in your cart no longer exists" });
            }
            if (seller.status !== "Approved") {
                return res.status(403).json({
                    success: false,
                    message: `${seller.storeName} is not currently accepting orders.`,
                });
            }

            let sLat: number | undefined;
            let sLng: number | undefined;
            if (seller.location?.coordinates?.length === 2) {
                sLng = seller.location.coordinates[0];
                sLat = seller.location.coordinates[1];
            } else if (seller.latitude && seller.longitude) {
                sLat = parseFloat(seller.latitude);
                sLng = parseFloat(seller.longitude);
            }

            if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) {
                return res.status(403).json({
                    success: false,
                    message: `${seller.storeName} has not set a shop location, so it cannot deliver yet.`,
                });
            }

            const distance = calculateDistance(deliveryLat, deliveryLng, sLat as number, sLng as number);
            const radius = seller.serviceRadiusKm || 10;
            if (distance > radius) {
                return res.status(403).json({
                    success: false,
                    message:
                        `Your address is ${distance.toFixed(2)} km from ${seller.storeName}, ` +
                        `which delivers within ${radius} km.`,
                });
            }
        }

        // ── Server-authoritative money ──────────────────────────────────────
        const { pricing, lines } = await priceOrder({
            lines: resolved.map((r) => ({
                productId: String(r.product._id),
                sellerId: String(r.product.seller),
                unitPrice: r.unitPrice,
                quantity: r.quantity,
                taxRefId: r.product.tax,
            })),
            customerId: userId,
            deliveryLat,
            deliveryLng,
            couponCode,
            tipAmount,
        });

        // ── Reserve stock (all-or-nothing) ──────────────────────────────────
        const taken = await reserveMany(
            resolved.map((r) => ({
                productId: String(r.product._id),
                quantity: r.quantity,
                variation: r.selector,
            })),
        );
        reservations.push(...taken);

        // ── Persist ─────────────────────────────────────────────────────────
        const resolvedPaymentMethod = paymentMethod || "COD";
        const isOnlinePayment = resolvedPaymentMethod !== "COD";

        const newOrder = new Order({
            customer: new mongoose.Types.ObjectId(userId),
            customerName: customer.name,
            customerEmail: customer.email,
            customerPhone: customer.phone,
            deliveryAddress: {
                address: address.address || address.street || "N/A",
                city: address.city || "N/A",
                state: address.state || "",
                pincode: address.pincode || "000000",
                landmark: address.landmark || "",
                latitude: deliveryLat,
                longitude: deliveryLng,
            },
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: "Pending",
            status: isOnlinePayment ? "Pending" : "Received",
            subtotal: pricing.subtotal,
            tax: pricing.tax,
            shipping: pricing.shipping,
            platformFee: pricing.platformFee,
            discount: pricing.discount,
            couponCode: pricing.couponCode,
            tipAmount: pricing.tip,
            total: pricing.total,
            deliveryDistanceKm: pricing.deliveryDistanceKm,
            items: [],
        });

        const orderItemIds: mongoose.Types.ObjectId[] = [];
        for (let i = 0; i < resolved.length; i++) {
            const r = resolved[i];
            const line = lines[i];
            const commRate = await getOrderItemCommissionRate(
                String(r.product._id),
                String(r.product.seller),
            );

            const orderItem = await OrderItem.create({
                order: newOrder._id,
                product: r.product._id,
                seller: r.product.seller,
                productName: r.product.productName,
                productImage: r.product.mainImage,
                sku: r.product.sku,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                total: line.lineTotal,
                subtotal: line.lineTotal,
                taxRate: line.taxRate,
                taxAmount: line.taxAmount,
                commissionRate: commRate,
                commissionAmount: Math.round(((line.lineTotal * commRate) / 100) * 100) / 100,
                variation: r.selector || undefined,
                variantTitle: variationLabel(r.variation),
                status: "Pending",
            });
            orderItemIds.push(orderItem._id as mongoose.Types.ObjectId);
        }

        newOrder.items = orderItemIds;
        await newOrder.save();
        orderCreated = true;

        // Count the coupon use only once the order exists. (#H-29)
        await consumeCoupon(pricing.couponCode);

        // ── Notifications (never block the response) ────────────────────────
        if (!isOnlinePayment) {
            try {
                const io: SocketIOServer = req.app.get("io") as SocketIOServer;
                if (io) {
                    Order.findById(newOrder._id)
                        .lean()
                        .then((saved) => (saved ? notifySellersOfOrderUpdate(io, saved, "NEW_ORDER") : undefined))
                        .catch((err) => console.error("Error notifying sellers (COD):", err));
                }
            } catch (err) {
                console.error("Error setting up seller notification:", err);
            }

            sendNotificationToUser(userId, "Customer", {
                title: "Order Placed Successfully",
                body: `Your COD order #${newOrder.orderNumber} has been placed. The seller will confirm shortly.`,
                data: {
                    type: "ORDER_PLACED",
                    orderId: String(newOrder._id),
                    orderNumber: newOrder.orderNumber || "",
                },
            }).catch((err) => console.error("COD order push notification failed:", err));
        }

        return res.status(201).json({
            success: true,
            message: "Order placed successfully",
            data: newOrder,
            // Surface a rejected coupon so the UI can explain the difference
            // rather than silently charging more than it displayed. (#C-11)
            ...(pricing.couponRejectionReason
                ? { warning: `Coupon not applied: ${pricing.couponRejectionReason}` }
                : {}),
        });
    } catch (error: any) {
        // Anything reserved before the failure goes back on the shelf. (#H-01)
        if (!orderCreated && reservations.length > 0) {
            await releaseMany(reservations);
        }

        console.error("Order creation error:", error?.message || error);

        const statusCode =
            error instanceof StockError || error instanceof PricingError
                ? error.statusCode
                : error?.statusCode || 500;

        return res.status(statusCode).json({
            success: false,
            message:
                statusCode === 500
                    ? "We could not place your order. Please try again."
                    : error.message,
        });
    }
};

// Get authenticated customer's orders
export const getMyOrders = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }
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
            .populate('deliveryBoy', 'name phone profileImage vehicleNumber');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        // Get customer's permanent delivery OTP
        const customer = await Customer.findById(userId).select('deliveryOtp');
        const deliveryOtp = customer?.deliveryOtp;

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
            deliveryPartner: orderObj.deliveryBoy
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
        const result = await generateDeliveryOtp(id);

        // Emit socket event if needed (customer room)
        const io = (req.app as any).get("io");
        if (io) {
            io.to(`order-${id}`).emit('delivery-otp-refreshed', {
                orderId: id,
                deliveryOtp: order.deliveryOtp, // The service saves it to the order
                expiresAt: order.deliveryOtpExpiresAt
            });
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error refreshing delivery OTP:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to refresh delivery OTP",
            error: error.message
        });
    }
};

// Cancel Order
export const cancelOrder = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid Order ID format" });
        }
        if (!reason || !String(reason).trim()) {
            return res.status(400).json({ success: false, message: "Cancellation reason is required" });
        }

        const order = await Order.findOne({ _id: id, customer: userId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // One shared transition table decides this, rather than an ad-hoc list
        // that disagreed with the seller and admin paths. (#H-05)
        const check = validateTransition(order.status, "Cancelled", "customer");
        if (!check.valid) {
            return res.status(400).json({ success: false, message: check.message });
        }

        // Claim the cancellation atomically so two concurrent requests cannot
        // both restore the stock.
        const claimed = await Order.findOneAndUpdate(
            { _id: id, customer: userId, status: order.status },
            {
                $set: {
                    status: "Cancelled",
                    cancellationReason: String(reason).trim(),
                    cancelledAt: new Date(),
                    cancelledBy: new mongoose.Types.ObjectId(userId),
                },
            },
            { new: true },
        );

        if (!claimed) {
            return res.status(409).json({
                success: false,
                message: "This order was updated by someone else. Please refresh and try again.",
            });
        }

        // ── Restore stock to the exact variation that was taken ─────────────
        const orderItems = await OrderItem.find({ _id: { $in: claimed.items } });
        const reservations = await reservationsFromOrderItems(
            orderItems.map((oi) => ({
                product: oi.product,
                quantity: oi.quantity,
                variation: oi.variation,
            })),
        );
        await releaseMany(reservations);

        await OrderItem.updateMany({ _id: { $in: claimed.items } }, { $set: { status: "Cancelled" } });

        // Give the coupon use back. (#H-29)
        await releaseCoupon(claimed.couponCode);

        // Reverse anything already credited for this order. (#H-07)
        try {
            const { reverseCommissions } = await import("../../../services/commissionService");
            const rev = await reverseCommissions(id);
            if (!rev.success) {
                console.error(`Commission reversal failed for cancelled order ${id}: ${rev.message}`);
            }
        } catch (revErr) {
            console.error(`Commission reversal threw for cancelled order ${id}:`, revErr);
        }

        // A prepaid order that is cancelled must be refunded, not just closed.
        // (#H-06)
        if (claimed.paymentStatus === "Paid" && claimed.paymentMethod !== "COD") {
            try {
                const { refundOrder } = await import("../../../services/refundService");
                await refundOrder(id, `Order cancelled by customer: ${String(reason).trim()}`);
            } catch (refundErr) {
                console.error(`Refund failed for cancelled order ${id}:`, refundErr);
            }
        }

        // ── Notify ──────────────────────────────────────────────────────────
        try {
            const io = (req.app as any).get("io");
            if (io) {
                await notifySellersOfOrderUpdate(io, claimed, "ORDER_CANCELLED");

                if (claimed.deliveryBoy) {
                    await Order.updateOne({ _id: claimed._id }, { $set: { deliveryBoyStatus: "Failed" } });
                    io.to(`delivery-${claimed.deliveryBoy.toString()}`).emit("order-cancelled", {
                        orderId: claimed._id,
                        orderNumber: claimed.orderNumber,
                        message: "Order has been cancelled by the customer",
                    });
                }

                io.to(`order-${claimed._id}`).emit("order-cancelled", {
                    orderId: claimed._id,
                    status: "Cancelled",
                    message: "Order has been cancelled",
                });
            }
        } catch (err) {
            console.error("Notification error:", err);
        }

        return res.status(200).json({
            success: true,
            message: "Order cancelled successfully",
            data: {
                id: claimed._id,
                status: claimed.status,
                cancelledAt: claimed.cancelledAt,
            },
        });
    } catch (error: any) {
        console.error("Error cancelling order:", error?.message || error);
        return res.status(500).json({ success: false, message: "Failed to cancel order" });
    }
};

// Update Order Notes (Instructions/Special Requests)
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
