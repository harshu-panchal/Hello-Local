import { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import { asyncHandler } from "../../../utils/asyncHandler";

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  email: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: Date;
  channel: "ONLINE" | "OFFLINE" | "BOTH";
  city: string;
  isWalkIn: boolean;
}

/**
 * Get distinct customer directory for the authenticated seller
 */
export const getSellerCustomers = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const sellerObjId = mongoose.Types.ObjectId.isValid(sellerId)
    ? new mongoose.Types.ObjectId(sellerId)
    : sellerId;

  const { search, channel = "ALL", page = "1", limit = "20" } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  // Find all order IDs associated with this seller (items sold + direct counter POS orders)
  const sellerOrderItems = await OrderItem.find({ seller: sellerObjId }).select("order total");
  const directOrders = await Order.find({ seller: sellerObjId }).distinct("_id");

  const sellerOrderIds = [
    ...new Set([
      ...sellerOrderItems.map((item) => item.order?.toString()).filter(Boolean),
      ...directOrders.map((id) => id.toString()),
    ]),
  ];

  if (sellerOrderIds.length === 0) {
    return res.status(200).json({
      success: true,
      data: [],
      pagination: {
        total: 0,
        page: pageNum,
        pages: 1,
        limit: limitNum,
      },
      stats: {
        totalCustomers: 0,
        totalOrders: 0,
        totalRevenue: 0,
      },
    });
  }

  // Precompute seller's share of total for each order
  const orderSellerShareMap = new Map<string, number>();
  for (const item of sellerOrderItems) {
    if (item.order) {
      const orderKey = item.order.toString();
      const current = orderSellerShareMap.get(orderKey) || 0;
      orderSellerShareMap.set(orderKey, current + (Number(item.total) || 0));
    }
  }

  // Fetch orders with customer details
  const orders = await Order.find({
    _id: { $in: sellerOrderIds },
    $nor: [{ status: "Pending", paymentStatus: "Pending" }],
  })
    .select("customer customerName customerPhone customerEmail isWalkInCustomer orderChannel total orderDate deliveryAddress status")
    .sort({ orderDate: -1 })
    .lean();

  // Deduplicate and aggregate customers by normalized phone number or customer ID or name
  const customerMap = new Map<string, {
    id: string;
    name: string;
    phone: string;
    email: string;
    orderCount: number;
    totalSpent: number;
    lastOrderDate: Date;
    channels: Set<string>;
    city: string;
    isWalkIn: boolean;
  }>();

  for (const order of orders) {
    // Skip cancelled orders for spend calculation but count if needed
    const isCancelled = order.status === "Cancelled";
    const rawPhone = (order.customerPhone || "").trim();
    const rawName = (order.customerName || "Customer").trim();
    const rawEmail = (order.customerEmail || "").trim();
    const customerId = order.customer ? order.customer.toString() : "";

    // Key to group by: phone is the most reliable identifier in Indian retail
    const key = rawPhone || customerId || rawName.toLowerCase();
    if (!key) continue;

    // Use seller's specific item total, or order.total for direct POS bills
    const orderTotal = isCancelled
      ? 0
      : (orderSellerShareMap.get(order._id.toString()) ?? Number(order.total) ?? 0);

    const orderDate = new Date(order.orderDate || Date.now());
    const channelType = order.orderChannel || "ONLINE";
    const city = order.deliveryAddress?.city || "";

    const existing = customerMap.get(key);
    if (!existing) {
      const channelSet = new Set<string>();
      channelSet.add(channelType);
      customerMap.set(key, {
        id: customerId || key,
        name: rawName,
        phone: rawPhone,
        email: rawEmail,
        orderCount: 1,
        totalSpent: orderTotal,
        lastOrderDate: orderDate,
        channels: channelSet,
        city,
        isWalkIn: Boolean(order.isWalkInCustomer),
      });
    } else {
      existing.orderCount += 1;
      existing.totalSpent += orderTotal;
      existing.channels.add(channelType);
      if (orderDate > existing.lastOrderDate) {
        existing.lastOrderDate = orderDate;
      }
      if (!existing.phone && rawPhone) existing.phone = rawPhone;
      if (!existing.email && rawEmail) existing.email = rawEmail;
      if (!existing.city && city) existing.city = city;
    }
  }

  let aggregatedList = Array.from(customerMap.values()).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    orderCount: c.orderCount,
    totalSpent: Math.round(c.totalSpent),
    lastOrderDate: c.lastOrderDate,
    channel: (c.channels.has("ONLINE") && c.channels.has("OFFLINE")
      ? "BOTH"
      : c.channels.has("OFFLINE")
      ? "OFFLINE"
      : "ONLINE") as "ONLINE" | "OFFLINE" | "BOTH",
    city: c.city,
    isWalkIn: c.isWalkIn,
  }));

  // Channel filter
  if (channel === "ONLINE") {
    aggregatedList = aggregatedList.filter((c) => c.channel === "ONLINE" || c.channel === "BOTH");
  } else if (channel === "OFFLINE") {
    aggregatedList = aggregatedList.filter((c) => c.channel === "OFFLINE" || c.channel === "BOTH");
  }

  // Search filter
  if (search && typeof search === "string" && search.trim()) {
    const term = search.trim().toLowerCase();
    aggregatedList = aggregatedList.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        c.city.toLowerCase().includes(term)
    );
  }

  // Sort by latest order
  aggregatedList.sort((a, b) => b.lastOrderDate.getTime() - a.lastOrderDate.getTime());

  const total = aggregatedList.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedData = aggregatedList.slice(startIndex, startIndex + limitNum);

  // Overall stats
  const totalRevenue = aggregatedList.reduce((acc, c) => acc + c.totalSpent, 0);
  const totalOrders = aggregatedList.reduce((acc, c) => acc + c.orderCount, 0);

  return res.status(200).json({
    success: true,
    data: paginatedData,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
    },
    stats: {
      totalCustomers: total,
      totalOrders,
      totalRevenue,
    },
  });
});
