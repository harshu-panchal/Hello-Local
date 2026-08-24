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

        // Find orders associated with this seller (both multi-seller online items and direct offline sales)
        const sellerOrderItems = await OrderItem.find({ seller: sellerId }).select('order');
        const directOrders = await Order.find({ seller: sellerId }).distinct('_id');
        const sellerOrderIds = [
            ...new Set([
                ...sellerOrderItems.map((item) => item.order?.toString()).filter(Boolean),
                ...directOrders.map((id) => id.toString()),
            ]),
        ];

        // 1. KPI Metrics
        const sellerObjectIds = sellerOrderIds.map(id => new mongoose.Types.ObjectId(id));

        // Delivered / Completed orders
        const deliveredOrderIds = await Order.find({
            _id: { $in: sellerOrderIds },
            status: { $in: ["Delivered", "Completed"] },
        }).distinct("_id");

        const [
            totalOrders,
            completedOrders,
            pendingOrders,
            cancelledOrders,
            offlineOrdersCount,
            onlineOrdersCount,
            totalProduct,
            totalCategoryCount,
            totalSubcategoryCount,
            totalCustomerCount,
            revenueData,
            offlineRevenueData,
        ] = await Promise.all([
            Order.countDocuments({ _id: { $in: sellerOrderIds } }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: { $in: ["Delivered", "Completed"] } }),
            Order.countDocuments({
                _id: { $in: sellerOrderIds },
                status: { $in: ["Received", "Accepted", "Processed"] },
            }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: "Cancelled" }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, orderChannel: "OFFLINE" }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, orderChannel: "ONLINE" }),
            Product.countDocuments({ seller: sellerId }),
            Product.distinct("category", { seller: sellerId }).then(ids => ids.length),
            Product.distinct("subcategory", { seller: sellerId }).then(ids => ids.length),
            Order.distinct("customer", { _id: { $in: sellerOrderIds } }).then(ids => ids.length),
            // Total revenue across delivered/completed items
            OrderItem.aggregate([
                { $match: { seller: sellerId, order: { $in: deliveredOrderIds } } },
                { $group: { _id: null, total: { $sum: "$total" } } }
            ]).catch(() => []),
            // Offline revenue
            Order.aggregate([
                { $match: { _id: { $in: sellerObjectIds }, orderChannel: "OFFLINE", status: { $ne: "Cancelled" } } },
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
                    offlineOrdersCount,
                    onlineOrdersCount,
                    soldOutProducts,
                    lowStockProducts,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    offlineRevenue: Math.round((offlineRevenueData[0]?.total || 0) * 100) / 100,
                    onlineRevenue: Math.round((Math.max(0, totalRevenue - (offlineRevenueData[0]?.total || 0))) * 100) / 100,
                    yearlyOrderData,
                    dailyOrderData
                },
                newOrders: formattedNewOrders
            }
        });
    }
);
