import mongoose from "mongoose";
import { Request, Response } from "express";
import OrderItem from "../../../models/OrderItem";
import Order from "../../../models/Order";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Get seller's sales report with filters, sorting, and pagination
 */
export const getSalesReport = asyncHandler(
    async (req: Request, res: Response) => {
        const sellerId = (req as any).user.userId;
        const {
            channel = "ALL", // "ALL" | "ONLINE" | "OFFLINE"
            fromDate,
            toDate,
            search,
            paymentMethod,
            page = "1",
            limit = "10",
            sortBy = "createdAt",
            sortOrder = "desc",
        } = req.query;

        // Build query - filter by authenticated seller (fixing previous sellerId bug)
        const sellerObjId = new mongoose.Types.ObjectId(sellerId);
        const query: any = { seller: sellerObjId };

        // If filtering by channel or payment method, find matching orders first
        if (channel !== "ALL" || (paymentMethod && paymentMethod !== "All")) {
            const orderFilter: any = {};
            if (channel === "ONLINE") orderFilter.orderChannel = "ONLINE";
            if (channel === "OFFLINE") orderFilter.orderChannel = "OFFLINE";
            if (paymentMethod && paymentMethod !== "All") orderFilter.paymentMethod = paymentMethod;

            const matchingOrders = await Order.find(orderFilter).distinct("_id");
            query.order = { $in: matchingOrders };
        }

        // Date range filter
        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) {
                query.createdAt.$gte = new Date(fromDate as string);
            }
            if (toDate) {
                const endDay = new Date(toDate as string);
                endDay.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDay;
            }
        }

        // Search filter (on product name, variant, or order/bill numbers)
        if (search) {
            const s = String(search).trim();
            const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            const matchingSearchOrders = await Order.find({
                $or: [
                    { orderNumber: { $regex: escaped, $options: "i" } },
                    { billNumber: { $regex: escaped, $options: "i" } },
                    { invoiceNumber: { $regex: escaped, $options: "i" } },
                ]
            }).distinct("_id");

            query.$or = [
                { productName: { $regex: escaped, $options: "i" } },
                { variantTitle: { $regex: escaped, $options: "i" } },
                { order: { $in: matchingSearchOrders } },
            ];
        }

        // Pagination
        const pageNum = Math.max(1, parseInt(page as string) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
        const skip = (pageNum - 1) * limitNum;

        // Sort
        const sort: any = {};
        sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

        // Get order items with populated order info
        const orderItems = await OrderItem.find(query)
            .populate({
                path: "order",
                select: "orderNumber billNumber invoiceNumber orderChannel saleType paymentMethod paymentStatus status createdAt"
            })
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Get total count for pagination
        const total = await OrderItem.countDocuments(query);

        // Format response for frontend
        const reports = orderItems.map((item: any) => ({
            orderId: item.order?.orderNumber || item.order?.billNumber || item._id.toString().slice(-4),
            billNumber: item.order?.billNumber || item.order?.invoiceNumber || item.order?.orderNumber || '',
            orderItemId: item._id.toString().slice(-4),
            product: item.productName,
            variant: item.variantTitle || "Standard",
            quantity: item.quantity,
            price: item.unitPrice,
            taxAmount: item.taxAmount || 0,
            channel: item.order?.orderChannel || "ONLINE",
            paymentMethod: item.order?.paymentMethod || "N/A",
            status: item.status || item.order?.status || "Delivered",
            total: item.total || item.subtotal,
            date: item.createdAt ? new Date(item.createdAt).toISOString().replace('T', ' ').split('.')[0] : '',
        }));

        return res.status(200).json({
            success: true,
            message: "Sales report fetched successfully",
            data: reports,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    }
);
