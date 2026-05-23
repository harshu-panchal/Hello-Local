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
import AppSettings from "../../../models/AppSettings";
import { getRoadDistances } from "../../../services/mapService";
import { Server as SocketIOServer } from "socket.io";
import { getOrderItemCommissionRate } from "../../../services/commissionService";
import Admin from "../../../models/Admin";

// Create a new order
export const createOrder = async (req: Request, res: Response) => {
    let session: mongoose.ClientSession | null = null;
    try {
        // ... (existing code for session start)
        try {
            session = await mongoose.startSession();
            session.startTransaction();
        } catch (sessionError) {
            console.warn("MongoDB Transactions not supported or failed to start. Proceeding without transaction.");
            session = null;
        }

        const { items, address, paymentMethod, fees } = req.body;
        const userId = req.user?.userId;
        if (!userId) {
            if (session) await session.abortTransaction();
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        // ... (logging and validation checks for items, address, city, pincode)

        // Fetch customer details
        let customer: any = await Customer.findById(userId);

        // If customer not found, check if it's an Admin (for testing purposes)
        if (!customer) {
            const admin = await Admin.findById(userId);
            if (admin) {
                // Map Admin to a customer-like object
                customer = {
                    _id: admin._id,
                    name: `${admin.firstName} ${admin.lastName}`,
                    email: admin.email,
                    phone: admin.mobile,
                    // Add other necessary fields if required by Order model
                };
            }
        }

        if (!customer) {
            if (session) await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: "Customer not found",
            });
        }

        // Validate delivery address location
        // Handle both string and number types, and check for null/undefined (not truthy, since 0 is valid)
        const deliveryLat = address.latitude != null
            ? (typeof address.latitude === 'number' ? address.latitude : parseFloat(address.latitude))
            : null;
        const deliveryLng = address.longitude != null
            ? (typeof address.longitude === 'number' ? address.longitude : parseFloat(address.longitude))
            : null;

        if (deliveryLat == null || deliveryLng == null || isNaN(deliveryLat) || isNaN(deliveryLng)) {
            if (session) await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Delivery address location (latitude/longitude) is required",
                details: {
                    receivedLatitude: address.latitude,
                    receivedLongitude: address.longitude,
                    parsedLatitude: deliveryLat,
                    parsedLongitude: deliveryLng,
                }
            });
        }

        // Validate coordinates
        if (deliveryLat < -90 || deliveryLat > 90 || deliveryLng < -180 || deliveryLng > 180) {
            if (session) await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Invalid delivery address coordinates",
            });
        }

        // Initialize Order first to get an ID
        // Determine if this is an online payment (not COD).
        // Online orders start in 'Pending' state — they only become 'Received'
        // once payment is verified. COD orders are confirmed immediately.
        const resolvedPaymentMethod = paymentMethod || 'COD';
        const isOnlinePayment = resolvedPaymentMethod !== 'COD';

        const newOrder = new Order({
            customer: new mongoose.Types.ObjectId(userId),
            customerName: customer.name,
            customerEmail: customer.email,
            customerPhone: customer.phone,
            deliveryAddress: {
                address: address.address || address.street || 'N/A',
                city: address.city || 'N/A',
                state: address.state || '',
                pincode: address.pincode || '000000',
                landmark: address.landmark || '',
                latitude: deliveryLat,
                longitude: deliveryLng,
            },
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: 'Pending',
            // Online orders wait in 'Pending' until payment is verified.
            // COD orders are immediately 'Received'.
            status: isOnlinePayment ? 'Pending' : 'Received',
            subtotal: 0,
            tax: 0,
            shipping: fees?.deliveryFee || 0,
            platformFee: fees?.platformFee || 0,
            discount: 0,
            total: 0,
            items: []
        });

        let calculatedSubtotal = 0;
        const orderItemIds: mongoose.Types.ObjectId[] = [];
        const sellerIds = new Set<string>(); // Track unique sellers

        for (const item of items) {
            if (!item.product || !item.product.id) {
                throw new Error("Invalid item structure: product.id is missing");
            }

            const qty = Number(item.quantity) || 0;
            if (qty <= 0) {
                throw new Error("Invalid item quantity");
            }

            // Atomically check stock and decrement to prevent race conditions
            let product;
            // The frontend sends variation info as 'variant' or 'variation'
            // In the product model, it's stored in 'variations' array
            const variationValue = item.variant || item.variation;

            if (variationValue) {
                // Try to decrement stock for the specific variation first
                const variationConditions: any[] = [];
                if (mongoose.isValidObjectId(variationValue)) {
                    variationConditions.push({ "variations._id": variationValue });
                }
                variationConditions.push(
                    { "variations.value": variationValue },
                    { "variations.title": variationValue },
                    { "variations.pack": variationValue }
                );

                product = session
                    ? await Product.findOneAndUpdate(
                        {
                            _id: item.product.id,
                            $or: variationConditions,
                            "variations.stock": { $gte: qty }
                        },
                        { $inc: { "variations.$.stock": -qty, stock: -qty } },
                        { session, new: true }
                    )
                    : await Product.findOneAndUpdate(
                        {
                            _id: item.product.id,
                            $or: variationConditions,
                            "variations.stock": { $gte: qty }
                        },
                        { $inc: { "variations.$.stock": -qty, stock: -qty } },
                        { new: true }
                    );
            }

            if (!product) {
                // Either variationValue was not provided, or it didn't match (insufficient stock / invalid variation / not found)
                const checkProduct = await Product.findById(item.product.id);
                if (!checkProduct) {
                    const err = new Error(`Product not found with ID: ${item.product.id}`);
                    (err as any).statusCode = 400;
                    throw err;
                }

                const hasVariations = checkProduct.variations && checkProduct.variations.length > 0;

                if (hasVariations) {
                    if (!variationValue) {
                        const err = new Error(`Variation selection is required for product: ${checkProduct.productName}`);
                        (err as any).statusCode = 400;
                        throw err;
                    }

                    // A variation was provided, but didn't match. Check if it actually exists in product variations
                    const matchedVar = (checkProduct.variations || []).find((v: any) =>
                        (mongoose.isValidObjectId(variationValue) && v._id.toString() === variationValue.toString()) ||
                        v.value === variationValue ||
                        v.title === variationValue ||
                        v.pack === variationValue
                    );

                    if (matchedVar) {
                        const err = new Error(`Insufficient stock for variation "${variationValue}" of product "${checkProduct.productName}". Available: ${matchedVar.stock}, requested: ${qty}`);
                        (err as any).statusCode = 400;
                        throw err;
                    } else {
                        const err = new Error(`Invalid variation "${variationValue}" specified for product "${checkProduct.productName}". Please specify a valid variation.`);
                        (err as any).statusCode = 400;
                        throw err;
                    }
                } else {
                    if (variationValue) {
                        const err = new Error(`Product "${checkProduct.productName}" does not have variations defined, but variation "${variationValue}" was specified.`);
                        (err as any).statusCode = 400;
                        throw err;
                    }

                    // No variations, decrement top-level stock
                    product = session
                        ? await Product.findOneAndUpdate(
                            { _id: item.product.id, stock: { $gte: qty } },
                            { $inc: { stock: -qty } },
                            { session, new: true }
                        )
                        : await Product.findOneAndUpdate(
                            { _id: item.product.id, stock: { $gte: qty } },
                            { $inc: { stock: -qty } },
                            { new: true }
                        );

                    if (!product) {
                        const err = new Error(`Insufficient stock for product "${checkProduct.productName}". Available: ${checkProduct.stock}, requested: ${qty}`);
                        (err as any).statusCode = 400;
                        throw err;
                    }
                }
            }

            // Track seller IDs to validate location
            if (product.seller) {
                sellerIds.add(product.seller.toString());
            }

            // Determine the price based on variation and discounts
            let selectedVariation;
            if (product.variations && product.variations.length > 0) {
                selectedVariation = product.variations.find((v: any) =>
                    (v._id && v._id.toString() === variationValue) ||
                    v.value === variationValue ||
                    v.title === variationValue ||
                    v.pack === variationValue
                );
                if (!selectedVariation) {
                    const err = new Error(`Variation "${variationValue}" not found on product "${product.productName}"`);
                    (err as any).statusCode = 400;
                    throw err;
                }
            }

            const itemPrice = (selectedVariation?.discPrice && selectedVariation.discPrice > 0)
                ? selectedVariation.discPrice
                : (product.discPrice && product.discPrice > 0)
                    ? product.discPrice
                    : (selectedVariation?.price || product.price || 0);
            const itemTotal = itemPrice * qty;
            calculatedSubtotal += itemTotal;

            // Calculate commission rate snapshot
            const commRate = await getOrderItemCommissionRate(product._id.toString(), product.seller.toString());
            const commAmount = (itemTotal * commRate) / 100;

            // Create OrderItem
            const newOrderItemData = {
                order: newOrder._id,
                product: product._id,
                seller: product.seller,
                productName: product.productName,
                productImage: product.mainImage,
                sku: product.sku,
                unitPrice: itemPrice,
                quantity: qty,
                total: itemTotal,
                commissionRate: commRate,
                commissionAmount: commAmount,
                variation: variationValue,
                status: 'Pending'
            };

            const newOrderItem = new OrderItem(newOrderItemData);
            if (session) {
                await newOrderItem.save({ session });
            } else {
                await newOrderItem.save();
            }
            orderItemIds.push(newOrderItem._id as mongoose.Types.ObjectId);
        }

        // Validate all sellers can deliver to user's location
        if (sellerIds.size > 0) {
            const uniqueSellerIds = Array.from(sellerIds).map(id => new mongoose.Types.ObjectId(id));

            // Find sellers and check if user is within their service radius
            const sellers = await Seller.find({
                _id: { $in: uniqueSellerIds },
                status: "Approved",
                location: { $exists: true, $ne: null },
            });

            // Check each seller can deliver to user's location
            for (const seller of sellers) {
                if (!seller.location || !seller.location.coordinates) {
                    if (session) await session.abortTransaction();
                    return res.status(403).json({
                        success: false,
                        message: `Seller ${seller.storeName} does not have a valid location. Order cannot be placed.`,
                    });
                }

                const sellerLng = seller.location.coordinates[0];
                const sellerLat = seller.location.coordinates[1];
                const distance = calculateDistance(deliveryLat, deliveryLng, sellerLat, sellerLng);
                const serviceRadius = seller.serviceRadiusKm || 10;

                if (distance > serviceRadius) {
                    if (session) await session.abortTransaction();
                    return res.status(403).json({
                        success: false,
                        message: `Your delivery address is ${distance.toFixed(2)} km away from ${seller.storeName}. They only deliver within ${serviceRadius} km. Please select products from sellers in your area.`,
                    });
                }
            }
        }

        // Apply fees
        let platformFee = Number(fees?.platformFee) || 0;
        let deliveryFee = Number(fees?.deliveryFee) || 0;
        let deliveryDistanceKm = 0;

        // --- Distance-Based Delivery Charge Calculation ---
        try {
            const settings = await AppSettings.getSettings();
            const freeDeliveryThreshold = settings?.freeDeliveryThreshold || 0;

            // Check for Free Delivery eligibility first
            if (freeDeliveryThreshold > 0 && calculatedSubtotal >= freeDeliveryThreshold) {
                deliveryFee = 0;
            }
            // Only recalculate if enabled in settings (and not free delivery)
            else if (settings && settings.deliveryConfig?.isDistanceBased === true) {
                const config = settings.deliveryConfig;

                // Collect seller locations
                const sellerLocations: { lat: number; lng: number }[] = [];
                const uniqueSellerIds = Array.from(sellerIds).map(id => new mongoose.Types.ObjectId(id));
                const sellers = await Seller.find({ _id: { $in: uniqueSellerIds } }).select('location latitude longitude storeName');

                sellers.forEach(seller => {
                    let lat, lng;
                    if (seller.location?.coordinates?.length === 2) {
                        lng = seller.location.coordinates[0];
                        lat = seller.location.coordinates[1];
                    } else if (seller.latitude && seller.longitude) {
                        lat = parseFloat(seller.latitude);
                        lng = parseFloat(seller.longitude);
                    }

                    if (lat && lng) {
                        sellerLocations.push({ lat, lng });
                    }
                });

                if (sellerLocations.length > 0 && deliveryLat && deliveryLng) {
                    // Get distances (Road or Air based on API Key presence)
                    const distances = await getRoadDistances(
                        sellerLocations,
                        { lat: deliveryLat, lng: deliveryLng },
                        config.googleMapsKey
                    );

                    // Take the maximum distance (furthest seller)
                    deliveryDistanceKm = Math.max(...distances);

                    // Calculate Fee
                    // Formula: BaseCharge + (Max(0, Distance - BaseDistance) * KmRate)
                    const extraKm = Math.max(0, deliveryDistanceKm - config.baseDistance);
                    const calculatedDeliveryFee = config.baseCharge + (extraKm * config.kmRate);

                    // Override the delivery fee
                    deliveryFee = Math.ceil(calculatedDeliveryFee);

                    console.log(`DEBUG: Distance Calculation: MaxDistance=${deliveryDistanceKm}km, Fee=${deliveryFee} (Base: ${config.baseCharge}, Rate: ${config.kmRate}/km)`);
                }
            }
        } catch (calcError) {
            console.error("Error calculating distance-based delivery fee:", calcError);
            // Fallback to provided fee or 0
        }

        const finalTotal = calculatedSubtotal + platformFee + deliveryFee;

        // Update Order with calculated values and items
        newOrder.subtotal = Number(calculatedSubtotal.toFixed(2));
        newOrder.total = Number(finalTotal.toFixed(2));
        newOrder.items = orderItemIds;
        newOrder.shipping = deliveryFee; // Update with calculated fee
        newOrder.deliveryDistanceKm = deliveryDistanceKm; // Store distance for commission calc


        if (session) {
            await newOrder.save({ session });
            await session.commitTransaction();
        } else {
            // Validate before saving to catch errors with details
            const validationError = newOrder.validateSync();
            if (validationError) {
                console.error("DEBUG: Order Validation Error:", validationError.errors);
                throw validationError;
            }
            await newOrder.save();
        }


        // Notify sellers immediately for COD orders only.
        // Online-payment orders are notified AFTER payment is verified in capturePayment().
        if (!isOnlinePayment) {
            try {
                const io: SocketIOServer = (req.app.get("io") as SocketIOServer);
                if (io) {
                    // Reload order to ensure orderNumber is set (generated by pre-validate hook)
                    Order.findById(newOrder._id).lean().then(savedOrder => {
                        if (savedOrder) {
                            return notifySellersOfOrderUpdate(io, savedOrder, 'NEW_ORDER');
                        }
                    }).catch(notificationError => {
                        console.error("Error notifying sellers (COD):", notificationError);
                    });
                }
            } catch (error) {
                console.error("Error setting up seller notification:", error);
            }
        }

        return res.status(201).json({
            success: true,
            message: "Order placed successfully",
            data: newOrder,
        });

    } catch (error: any) {
        if (session) {
            try {
                await session.abortTransaction();
            } catch (abortError) {
                console.error("Error aborting transaction:", abortError);
            }
        }

        console.error("DEBUG: Order Creation Error Detail:", {
            message: error.message,
            name: error.name,
            errors: error.errors ? Object.keys(error.errors).map(key => ({
                field: key,
                message: error.errors[key].message,
                value: error.errors[key].value
            })) : undefined,
            stack: error.stack,
            body: req.body
        });

        // Return a more informative error message if it's a validation error
        let errorMessage = "Error creating order. " + error.message;
        if (error.name === 'ValidationError') {
            const fields = Object.keys(error.errors).join(', ');
            errorMessage = `Validation failed for fields: ${fields}. ${error.message}`;
        }

        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: error.message,
            details: error.errors,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (session) session.endSession();
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
    let session: mongoose.ClientSession | null = null;
    try {
        const { id } = req.params;
        const { reason } = req.body;
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

        if (!reason) {
            return res.status(400).json({ success: false, message: "Cancellation reason is required" });
        }

        // Only start session if we are on a replica set (required for transactions)
        try {
            session = await mongoose.startSession();
            session.startTransaction();
        } catch (sessionError) {
            console.warn("MongoDB Transactions not supported or failed to start. Proceeding without transaction.");
            session = null;
        }

        const order = session
            ? await Order.findOne({ _id: id, customer: userId }).session(session)
            : await Order.findOne({ _id: id, customer: userId });

        if (!order) {
            if (session) await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (['Delivered', 'Cancelled', 'Returned', 'Rejected', 'Out for Delivery', 'Shipped'].includes(order.status)) {
            if (session) await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled as it is already ${order.status}`
            });
        }

        // Restore stock
        for (const item of order.items) {
            const orderItem = session
                ? await OrderItem.findById(item).session(session)
                : await OrderItem.findById(item);

            if (orderItem) {
                const product = session
                    ? await Product.findById(orderItem.product).session(session)
                    : await Product.findById(orderItem.product);

                if (product) {
                    // Check if it was a variation
                    if (orderItem.variation) {
                        // Try to find matching variation
                        const variationIndex = product.variations?.findIndex((v: any) => v.value === orderItem.variation || v.title === orderItem.variation || v.pack === orderItem.variation);

                        if (variationIndex !== undefined && variationIndex !== -1 && product.variations && product.variations[variationIndex]) {
                            const currentStock = product.variations[variationIndex].stock || 0;
                            product.variations[variationIndex].stock = currentStock + orderItem.quantity;
                        } else if (product.variations && product.variations.length > 0) {
                            // Fallback to first variation if specific one not found (should be rare)
                            const currentStock = product.variations[0].stock || 0;
                            product.variations[0].stock = currentStock + orderItem.quantity;
                        }
                    }

                    // Helper: also increment main stock if variations are just attributes or if simple product
                    product.stock += orderItem.quantity;
                    if (session) {
                        await product.save({ session });
                    } else {
                        await product.save();
                    }
                }

                orderItem.status = 'Cancelled';
                if (session) {
                    await orderItem.save({ session });
                } else {
                    await orderItem.save();
                }
            }
        }

        order.status = 'Cancelled';
        order.cancellationReason = reason;
        order.cancelledAt = new Date();
        order.cancelledBy = new mongoose.Types.ObjectId(userId); // Use Customer ID as canceller

        if (session) {
            await order.save({ session });
            await session.commitTransaction();
        } else {
            await order.save();
        }

        // Notify
        try {
            const io = (req.app as any).get("io");
            if (io) {
                await notifySellersOfOrderUpdate(io, order, 'ORDER_CANCELLED');

                // Notify delivery boy if assigned
                if (order.deliveryBoy) {
                    // Update delivery status to Failed since order is cancelled
                    // We do this in background to not block response
                    Order.findByIdAndUpdate(order._id, { deliveryBoyStatus: 'Failed' }).exec();

                    // Notify the specific delivery boy
                    const deliveryBoyId = order.deliveryBoy.toString();
                    io.to(`delivery-${deliveryBoyId}`).emit('order-cancelled', {
                        orderId: order._id,
                        orderNumber: order.orderNumber,
                        message: "Order has been cancelled by the customer"
                    });

                    console.log(`Notification sent to delivery boy ${deliveryBoyId} for cancelled order ${order.orderNumber}`);
                }

                // Emit to order room for real-time updates on tracking screen
                io.to(`order-${order._id}`).emit('order-cancelled', {
                    orderId: order._id,
                    status: 'Cancelled',
                    message: "Order has been cancelled"
                });
            }
        } catch (err) {
            console.error("Notification error:", err);
        }

        return res.status(200).json({
            success: true,
            message: "Order cancelled successfully",
            data: {
                id: order._id,
                status: order.status,
                cancelledAt: order.cancelledAt
            }
        });

    } catch (error: any) {
        if (session) {
            try {
                await session.abortTransaction();
            } catch (e) { }
        }
        console.error('Error cancelling order:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to cancel order",
            error: error.message
        });
    } finally {
        if (session) session.endSession();
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
