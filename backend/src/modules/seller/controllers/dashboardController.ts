import { Request, Response } from "express";
import Order from "../../../models/Order";
import Product from "../../../models/Product";
import OrderItem from "../../../models/OrderItem";
import { asyncHandler } from "../../../utils/asyncHandler";
import mongoose from "mongoose";

/**
 * Get seller's dashboard statistics
 */
export const getDashboardStats = asyncHandler(
    async (req: Request, res: Response) => {
        const sellerId = new mongoose.Types.ObjectId((req as any).user.userId);

        // Find orders associated with this seller
        // Since Order model doesn't have sellerId, we find orders via OrderItem
        const sellerOrderItems = await OrderItem.find({ seller: sellerId }).select('order');
        const sellerOrderIds = [...new Set(sellerOrderItems.map(item => item.order.toString()))];

        // 1. KPI Metrics
        const sellerObjectIds = sellerOrderIds.map(id => new mongoose.Types.ObjectId(id));

        // Orders that are actually Delivered. Revenue is based on the ORDER's final
        // status, not the order-item status — items aren't always synced to
        // "Delivered" when a delivery partner/admin marks the order delivered, which
        // previously made revenue show ₹0. (#252)
        const deliveredOrderIds = await Order.find({
            _id: { $in: sellerOrderIds },
            status: "Delivered",
        }).distinct("_id");

        const [
            totalOrders,
            completedOrders,
            pendingOrders,    // Orders received by seller but not yet accepted/rejected
            cancelledOrders,
            totalProduct,
            totalCategoryCount,
            totalSubcategoryCount,
            totalCustomerCount,
            revenueData,
        ] = await Promise.all([
            Order.countDocuments({ _id: { $in: sellerOrderIds } }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: "Delivered" }),
            // "Pending" for seller = orders they need to action (Received = new, Accepted = in progress, Processed = ready)
            Order.countDocuments({
                _id: { $in: sellerOrderIds },
                status: { $in: ["Received", "Accepted", "Processed"] }
            }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: "Cancelled" }),
            Product.countDocuments({ seller: sellerId }),
            Product.distinct("category", { seller: sellerId }).then(ids => ids.length),
            Product.distinct("subcategory", { seller: sellerId }).then(ids => ids.length),
            Order.distinct("customer", { _id: { $in: sellerOrderIds } }).then(ids => ids.length),
            // Total revenue = sum of this seller's items across the seller's
            // Delivered orders (based on order status, not item status). (#252)
            OrderItem.aggregate([
                { $match: { seller: sellerId, order: { $in: deliveredOrderIds } } },
                { $group: { _id: null, total: { $sum: "$total" } } }
            ]).catch(() => []),
        ]);

        // 2. Alert Metrics (Low Stock < 5)
        // Check Product model usage
        const products = await Product.find({ seller: sellerId });
        let soldOutProducts = 0;
        let lowStockProducts = 0;

        products.forEach(product => {
            let isSoldOut = true;
            let isLowStock = false;

            if (product.variations && product.variations.length > 0) {
                product.variations.forEach((v: any) => {
                    if ((v.stock || 0) > 0) isSoldOut = false;
                    if ((v.stock || 0) > 0 && (v.stock || 0) < 5) isLowStock = true;
                    if (v.stock && v.stock > 0) isSoldOut = false;
                    if (v.stock && v.stock > 0 && v.stock < 5) isLowStock = true;
                });
            } else {
                // Handle products without variations (fallback)
                if (product.stock > 0) isSoldOut = false;
                if (product.stock > 0 && product.stock < 5) isLowStock = true;
            }

            if (isSoldOut) soldOutProducts++;
            else if (isLowStock) lowStockProducts++;
        });

        const totalRevenue = revenueData[0]?.total || 0;

        // 3. New Orders Table (Latest 10)
        const newOrders = await Order.find({ _id: { $in: sellerOrderIds } })
            .sort({ createdAt: -1 })
            .limit(10);

        const formattedNewOrders = newOrders.map(order => ({
            id: order._id.toString(),                       // MongoDB ObjectId — used for navigation
            orderId: order.orderNumber || order._id.toString(), // Human-readable order number for display
            orderDate: new Date(order.orderDate).toLocaleDateString('en-GB'),
            status: order.status === 'Out for Delivery' ? 'Out For Delivery' : order.status,
            amount: order.total,
        }));

        // 4. Chart Data (Last 12 months)
        const currentYear = new Date().getFullYear();
        const monthlyStats = await Order.aggregate([
            {
                $match: {
                    _id: { $in: sellerObjectIds },
                    orderDate: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lte: new Date(`${currentYear}-12-31`)
                    }
                }
            },
            {
                $group: {
                    _id: { $month: "$orderDate" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const yearlyOrderData = months.map((month, index) => {
            const monthStat = monthlyStats.find(s => s._id === index + 1);
            return { date: month, value: monthStat ? monthStat.count : 0 };
        });

        // 5. Daily Chart Data (Current Month)
        const currentMonth = new Date().getMonth();
        const dailyStats = await Order.aggregate([
            {
                $match: {
                    _id: { $in: sellerObjectIds },
                    orderDate: {
                        $gte: new Date(currentYear, currentMonth, 1),
                        $lte: new Date(currentYear, currentMonth + 1, 0)
                    }
                }
            },
            {
                $group: {
                    _id: { $dayOfMonth: "$orderDate" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const dailyOrderData = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dayStat = dailyStats.find(s => s._id === day);
            return { date: day.toString(), value: dayStat ? dayStat.count : 0 };
        });

        return res.status(200).json({
            success: true,
            message: "Dashboard stats fetched successfully",
            data: {
                stats: {
                    totalUser: totalCustomerCount,
                    totalCategory: totalCategoryCount,
                    totalSubcategory: totalSubcategoryCount,
                    totalProduct,
                    totalOrders,
                    completedOrders,
                    pendingOrders,
                    cancelledOrders,
                    soldOutProducts,
                    lowStockProducts,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    yearlyOrderData,
                    dailyOrderData
                },
                newOrders: formattedNewOrders
            }
        });
    }
);
