import { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Product from "../../../models/Product";
import Seller from "../../../models/Seller";
import Tax from "../../../models/Tax";
import { asyncHandler } from "../../../utils/asyncHandler";
import {
  reserveMany,
  releaseMany,
  reservationsFromOrderItems,
  StockReservation,
} from "../../../services/stockService";
import {
  findVariation,
  normalizeSelector,
  effectiveUnitPrice,
  variationLabel,
} from "../../../utils/productVariation";

/**
 * Resolve tax rate for a product from the Tax collection.
 */
async function resolveProductTaxRate(taxRefId?: mongoose.Types.ObjectId | string | null): Promise<number> {
  if (!taxRefId) return 0;
  try {
    const tax = await Tax.findById(taxRefId).select("percentage rate status isActive");
    if (!tax) return 0;
    const t = tax as any;
    if (t.status === "Inactive" || t.isActive === false) return 0;
    const rate = Number(t.percentage ?? t.rate);
    return Number.isFinite(rate) && rate >= 0 ? rate : 0;
  } catch {
    return 0;
  }
}

/**
 * Ensure seller is approved before allowing POS operations.
 */
async function ensureSellerApproved(sellerId: string): Promise<string | null> {
  const seller = await Seller.findById(sellerId).select("status");
  if (!seller) return "Seller account not found.";
  if (seller.status !== "Approved") {
    return "Your seller account is awaiting admin approval. POS billing is enabled once approved.";
  }
  return null;
}

/**
 * Fast POS Product & Barcode Search for Seller Checkout
 * GET /api/orders/pos/products
 */
export const getPOSProducts = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { query, category, barcode, page = "1", limit = "50" } = req.query;

  const filter: any = {
    seller: new mongoose.Types.ObjectId(sellerId),
    status: "Active",
    publish: true,
  };

  if (category && mongoose.Types.ObjectId.isValid(category as string)) {
    filter.category = new mongoose.Types.ObjectId(category as string);
  }

  if (barcode) {
    filter.$or = [
      { barcode: String(barcode).trim() },
      { sku: String(barcode).trim() },
    ];
  } else if (query) {
    const q = String(query).trim();
    filter.$or = [
      { productName: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
      { barcode: { $regex: q, $options: "i" } },
      { tags: { $regex: q, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name")
      .populate("tax", "name percentage rate")
      .sort({ productName: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Product.countDocuments(filter),
  ]);

  const formatted = products.map((p: any) => {
    const hasVariations = Array.isArray(p.variations) && p.variations.length > 0;
    const variations = hasVariations
      ? p.variations.map((v: any) => ({
          id: v._id?.toString(),
          name: v.name || "Option",
          value: v.value || v.title || v.pack || "",
          price: v.price || p.price,
          discPrice: v.discPrice || 0,
          effectivePrice: effectiveUnitPrice(p, v),
          stock: Number(v.stock) || 0,
          status: v.status || "Available",
          sku: v.sku || "",
        }))
      : [];

    return {
      id: p._id.toString(),
      productName: p.productName,
      mainImage: p.mainImage || "",
      categoryName: p.category?.name || "General",
      price: p.price,
      discPrice: p.discPrice || 0,
      effectivePrice: effectiveUnitPrice(p, null),
      stock: p.stock,
      sku: p.sku || "",
      barcode: p.barcode || "",
      taxRate: p.tax ? Number(p.tax.percentage ?? p.tax.rate ?? 0) : 0,
      hasVariations,
      variations,
    };
  });

  return res.status(200).json({
    success: true,
    message: "POS products fetched successfully",
    data: formatted,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Create Offline In-Store Sale & Generate Bill
 * POST /api/orders/offline
 */
export const createOfflineSale = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;

  const approvalError = await ensureSellerApproved(sellerId);
  if (approvalError) {
    return res.status(403).json({ success: false, message: approvalError });
  }

  const {
    items,
    customer,
    paymentMethod = "Cash",
    offlinePaymentDetails = {},
    discount = 0,
    notes = "",
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Sale must contain at least one item" });
  }

  const allowedPaymentMethods = ["Cash", "UPI", "Card"];
  if (!allowedPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: `Invalid payment method. Allowed: ${allowedPaymentMethods.join(", ")}`,
    });
  }

  // 1. Resolve every product and line item from the database
  interface ResolvedPOSLine {
    product: any;
    quantity: number;
    selector: string | null;
    variation: any | null;
    unitPrice: number;
    lineSubtotal: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }

  const resolved: ResolvedPOSLine[] = [];
  let subtotal = 0;
  let totalTax = 0;

  for (const item of items) {
    const productId = item.productId || item.product?.id || item.product?._id;
    if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) {
      return res.status(400).json({ success: false, message: "Invalid product in cart" });
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: "Quantity must be a positive integer" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: `Product not found: ${productId}` });
    }

    // Ownership check: product MUST belong to the authenticated seller
    if (product.seller.toString() !== sellerId) {
      return res.status(403).json({
        success: false,
        message: `Unauthorized: "${product.productName}" belongs to a different seller`,
      });
    }

    const selector = normalizeSelector(item.variation ?? item.variant ?? null);
    const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
    const variation = hasVariations ? findVariation(product.variations as any, selector) : null;

    if (hasVariations && !variation) {
      return res.status(400).json({
        success: false,
        message: selector
          ? `"${selector}" is not a valid variation for "${product.productName}"`
          : `Please select a variation for "${product.productName}"`,
      });
    }

    // Server-authoritative unit price and tax rate
    const unitPrice = effectiveUnitPrice(product as any, variation);
    const taxRate = await resolveProductTaxRate(product.tax);

    const lineSubtotal = Math.round(unitPrice * quantity * 100) / 100;
    const taxAmount = Math.round(((lineSubtotal * taxRate) / 100) * 100) / 100;
    const lineTotal = Math.round((lineSubtotal + taxAmount) * 100) / 100;

    subtotal = Math.round((subtotal + lineSubtotal) * 100) / 100;
    totalTax = Math.round((totalTax + taxAmount) * 100) / 100;

    resolved.push({
      product,
      quantity,
      selector,
      variation,
      unitPrice,
      lineSubtotal,
      taxRate,
      taxAmount,
      lineTotal,
    });
  }

  // 2. Validate discount
  const discountAmount = Math.max(0, Number(discount) || 0);
  if (discountAmount > subtotal) {
    return res.status(400).json({
      success: false,
      message: `Discount (Rs.${discountAmount}) cannot exceed subtotal (Rs.${subtotal})`,
    });
  }

  const grandTotal = Math.max(0, Math.round((subtotal + totalTax - discountAmount) * 100) / 100);

  // 3. Validate Cash payment received amount
  let receivedAmount = Number(offlinePaymentDetails.receivedAmount);
  let changeReturned = 0;

  if (paymentMethod === "Cash") {
    if (!Number.isFinite(receivedAmount) || receivedAmount < grandTotal) {
      // If received amount wasn't provided or was less, default to exact amount
      receivedAmount = grandTotal;
      changeReturned = 0;
    } else {
      changeReturned = Math.round((receivedAmount - grandTotal) * 100) / 100;
    }
  } else {
    receivedAmount = grandTotal;
    changeReturned = 0;
  }

  // 4. Atomically reserve inventory (deduct stock)
  const reservations: StockReservation[] = [];
  try {
    const taken = await reserveMany(
      resolved.map((r) => ({
        productId: String(r.product._id),
        quantity: r.quantity,
        variation: r.selector,
      }))
    );
    reservations.push(...taken);
  } catch (stockErr: any) {
    return res.status(400).json({
      success: false,
      message: stockErr?.message || "Insufficient stock for one or more items",
    });
  }

  // 5. Generate unique sequential Bill Number & Order Number
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  const billNumber = `BILL-${dateStr}-${Date.now().toString().slice(-4)}${randomSuffix.slice(-2)}`;
  const orderNumber = `POS${dateStr}${Date.now().toString().slice(-4)}${randomSuffix.slice(-2)}`;

  // 6. Persist Order and OrderItems
  let orderCreated = false;
  try {
    const customerName = customer?.name?.trim() || "Walk-in Customer";
    const customerPhone = customer?.phone?.trim() || "";
    const customerEmail = customer?.email?.trim() || "";

    const newOrder = new Order({
      orderNumber,
      billNumber,
      invoiceNumber: billNumber,
      billGeneratedAt: new Date(),
      orderDate: new Date(),
      orderChannel: "OFFLINE",
      saleType: "COUNTER_POS",
      seller: new mongoose.Types.ObjectId(sellerId),
      isWalkInCustomer: !customer?.name?.trim(),
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress: {
        address: "In-Store Counter Sale",
        city: "Counter",
        pincode: "000000",
      },
      paymentMethod,
      paymentStatus: "Paid",
      status: "Delivered",
      subtotal,
      tax: totalTax,
      shipping: 0,
      platformFee: 0,
      discount: discountAmount,
      tipAmount: 0,
      total: grandTotal,
      grandTotal,
      offlinePaymentDetails: {
        receivedAmount,
        changeReturned,
        paymentReference: offlinePaymentDetails.paymentReference?.trim() || "",
        paymentNotes: notes?.trim() || offlinePaymentDetails.paymentNotes?.trim() || "",
      },
      items: [],
    });

    const orderItemIds: mongoose.Types.ObjectId[] = [];
    for (const r of resolved) {
      const orderItem = await OrderItem.create({
        order: newOrder._id,
        product: r.product._id,
        seller: new mongoose.Types.ObjectId(sellerId),
        productName: r.product.productName,
        productImage: r.product.mainImage,
        sku: r.product.sku,
        unitPrice: r.unitPrice,
        quantity: r.quantity,
        total: r.lineTotal,
        subtotal: r.lineSubtotal,
        taxRate: r.taxRate,
        taxAmount: r.taxAmount,
        commissionRate: 0,
        commissionAmount: 0,
        variation: r.selector || undefined,
        variantTitle: variationLabel(r.variation),
        status: "Delivered",
      });
      orderItemIds.push(orderItem._id as mongoose.Types.ObjectId);
    }

    newOrder.items = orderItemIds;
    await newOrder.save();
    orderCreated = true;

    // Fetch seller store details for instant bill printing
    const sellerInfo: any = await Seller.findById(sellerId).select(
      "sellerName storeName address city mobile email taxNumber storeBanner"
    );

    const billResponse = {
      id: newOrder._id.toString(),
      orderNumber: newOrder.orderNumber,
      billNumber: newOrder.billNumber,
      date: newOrder.orderDate,
      channel: newOrder.orderChannel,
      saleType: newOrder.saleType,
      customer: {
        name: newOrder.customerName,
        phone: newOrder.customerPhone,
        email: newOrder.customerEmail,
        isWalkIn: newOrder.isWalkInCustomer,
      },
      seller: {
        storeName: sellerInfo?.storeName || sellerInfo?.sellerName || "Store",
        address: sellerInfo?.address || "",
        city: sellerInfo?.city || "",
        phone: sellerInfo?.mobile || "",
        email: sellerInfo?.email || "",
        gstin: sellerInfo?.taxNumber || "",
        logo: sellerInfo?.storeBanner || "",
      },
      items: resolved.map((r, i) => ({
        srNo: i + 1,
        productId: r.product._id.toString(),
        productName: r.product.productName,
        variantTitle: variationLabel(r.variation),
        unitPrice: r.unitPrice,
        quantity: r.quantity,
        taxRate: r.taxRate,
        taxAmount: r.taxAmount,
        subtotal: r.lineSubtotal,
        total: r.lineTotal,
      })),
      pricing: {
        subtotal,
        tax: totalTax,
        discount: discountAmount,
        total: grandTotal,
      },
      payment: {
        method: paymentMethod,
        status: "Paid",
        receivedAmount,
        changeReturned,
        reference: offlinePaymentDetails.paymentReference || "",
      },
    };

    return res.status(201).json({
      success: true,
      message: "Offline sale created and bill generated successfully",
      data: billResponse,
    });
  } catch (err: any) {
    // If saving order failed, compensate/release the reserved stock
    if (!orderCreated && reservations.length > 0) {
      await releaseMany(reservations);
    }
    console.error("Error creating offline sale:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create offline sale",
    });
  }
});

/**
 * Get Seller Bills / Invoices (Online + Offline)
 * GET /api/orders/bills
 */
export const getSellerBills = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const {
    channel = "ALL", // "ALL" | "ONLINE" | "OFFLINE"
    dateFrom,
    dateTo,
    paymentMethod,
    search,
    page = "1",
    limit = "20",
    sortBy = "orderDate",
    sortOrder = "desc",
  } = req.query;

  // Find orders that belong to this seller
  const sellerObjId = new mongoose.Types.ObjectId(sellerId);
  const sellerItemOrderIds = await OrderItem.find({ seller: sellerObjId }).distinct("order");

  const query: any = {
    $or: [{ seller: sellerObjId }, { _id: { $in: sellerItemOrderIds } }],
    $nor: [{ status: "Pending", paymentStatus: "Pending" }], // Exclude unverified online checkouts
  };

  if (channel === "ONLINE") {
    query.orderChannel = "ONLINE";
  } else if (channel === "OFFLINE") {
    query.orderChannel = "OFFLINE";
  }

  if (paymentMethod && paymentMethod !== "All") {
    query.paymentMethod = paymentMethod;
  }

  if (dateFrom || dateTo) {
    query.orderDate = {};
    if (dateFrom) query.orderDate.$gte = new Date(dateFrom as string);
    if (dateTo) {
      const end = new Date(dateTo as string);
      end.setHours(23, 59, 59, 999);
      query.orderDate.$lte = end;
    }
  }

  if (search) {
    const q = String(search).trim();
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { billNumber: { $regex: q, $options: "i" } },
        { invoiceNumber: { $regex: q, $options: "i" } },
        { orderNumber: { $regex: q, $options: "i" } },
        { customerName: { $regex: q, $options: "i" } },
        { customerPhone: { $regex: q, $options: "i" } },
      ],
    });
  }

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const skip = (pageNum - 1) * limitNum;

  const sort: any = {};
  sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

  const [orders, total, statsAggregation] = await Promise.all([
    Order.find(query).sort(sort).skip(skip).limit(limitNum).populate("items").lean(),
    Order.countDocuments(query),
    Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          totalBills: { $sum: 1 },
          cashTotal: {
            $sum: {
              $cond: [{ $eq: ["$paymentMethod", "Cash"] }, "$total", 0],
            },
          },
          upiTotal: {
            $sum: {
              $cond: [{ $eq: ["$paymentMethod", "UPI"] }, "$total", 0],
            },
          },
          cardTotal: {
            $sum: {
              $cond: [{ $eq: ["$paymentMethod", "Card"] }, "$total", 0],
            },
          },
          onlineChannelTotal: {
            $sum: {
              $cond: [{ $eq: ["$orderChannel", "ONLINE"] }, "$total", 0],
            },
          },
          offlineChannelTotal: {
            $sum: {
              $cond: [{ $eq: ["$orderChannel", "OFFLINE"] }, "$total", 0],
            },
          },
        },
      },
    ]),
  ]);

  const stats = statsAggregation[0] || {
    totalRevenue: 0,
    totalBills: 0,
    cashTotal: 0,
    upiTotal: 0,
    cardTotal: 0,
    onlineChannelTotal: 0,
    offlineChannelTotal: 0,
  };

  const formatted = orders.map((o: any) => ({
    id: o._id.toString(),
    billNumber: o.billNumber || o.invoiceNumber || o.orderNumber,
    orderNumber: o.orderNumber,
    date: o.orderDate || o.createdAt,
    channel: o.orderChannel || "ONLINE",
    saleType: o.saleType || "ONLINE_DELIVERY",
    customerName: o.customerName || "Walk-in Customer",
    customerPhone: o.customerPhone || "",
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    status: o.status,
    itemCount: Array.isArray(o.items) ? o.items.length : 0,
    subtotal: o.subtotal,
    tax: o.tax,
    discount: o.discount || 0,
    total: o.total,
  }));

  return res.status(200).json({
    success: true,
    message: "Seller bills fetched successfully",
    data: formatted,
    stats: {
      totalRevenue: stats.totalRevenue,
      totalBills: stats.totalBills,
      cashSales: stats.cashTotal,
      upiSales: stats.upiTotal,
      cardSales: stats.cardTotal,
      onlineSales: stats.onlineChannelTotal,
      offlineSales: stats.offlineChannelTotal,
    },
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Get Specific Bill Details by Order ID
 * GET /api/orders/bills/:id
 */
export const getBillById = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid Bill/Order ID format" });
  }

  const order = await Order.findById(id).populate({
    path: "items",
    populate: { path: "product", select: "productName mainImage sku barcode" },
  });

  if (!order) {
    return res.status(404).json({ success: false, message: "Bill not found" });
  }

  // Verify that this seller owns this order or has items in this order
  const isDirectOwner = order.seller && order.seller.toString() === sellerId;
  const hasItems = (order.items as any[]).some(
    (item) => item.seller?.toString() === sellerId
  );

  if (!isDirectOwner && !hasItems) {
    return res.status(403).json({ success: false, message: "Unauthorized access to this bill" });
  }

  // Fetch seller details
  const sellerInfo: any = await Seller.findById(sellerId).select(
    "sellerName storeName address city mobile email taxNumber storeBanner"
  );

  // Filter items for this seller if multi-seller order
  const sellerItems = (order.items as any[]).filter(
    (item) => !item.seller || item.seller.toString() === sellerId
  );

  const billData = {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    billNumber: order.billNumber || order.invoiceNumber || order.orderNumber,
    orderDate: order.orderDate || order.createdAt,
    billGeneratedAt: order.billGeneratedAt || order.createdAt,
    channel: order.orderChannel || "ONLINE",
    saleType: order.saleType || "ONLINE_DELIVERY",
    customer: {
      name: order.customerName || "Walk-in Customer",
      phone: order.customerPhone || "",
      email: order.customerEmail || "",
      isWalkIn: order.isWalkInCustomer || false,
    },
    seller: {
      storeName: sellerInfo?.storeName || sellerInfo?.sellerName || "Store",
      address: sellerInfo?.address || "",
      city: sellerInfo?.city || "",
      phone: sellerInfo?.mobile || "",
      email: sellerInfo?.email || "",
      gstin: sellerInfo?.taxNumber || "",
      logo: sellerInfo?.storeBanner || "",
    },
    items: sellerItems.map((it: any, index: number) => ({
      srNo: index + 1,
      product: it.productName,
      unit: it.variantTitle || "Standard",
      price: it.unitPrice,
      qty: it.quantity,
      subtotal: it.subtotal || it.total,
      taxRate: it.taxRate || 0,
      taxAmount: it.taxAmount || 0,
      total: it.total,
    })),
    pricing: {
      subtotal: isDirectOwner
        ? order.subtotal
        : sellerItems.reduce((sum, it) => sum + (it.subtotal || it.total), 0),
      tax: isDirectOwner
        ? order.tax
        : sellerItems.reduce((sum, it) => sum + (it.taxAmount || 0), 0),
      shipping: order.shipping || 0,
      discount: order.discount || 0,
      total: isDirectOwner
        ? order.total
        : sellerItems.reduce((sum, it) => sum + it.total, 0),
    },
    payment: {
      method: order.paymentMethod,
      status: order.paymentStatus,
      receivedAmount: order.offlinePaymentDetails?.receivedAmount || order.total,
      changeReturned: order.offlinePaymentDetails?.changeReturned || 0,
      reference: order.offlinePaymentDetails?.paymentReference || "",
      notes: order.offlinePaymentDetails?.paymentNotes || "",
    },
    status: order.status,
  };

  return res.status(200).json({
    success: true,
    message: "Bill details fetched successfully",
    data: billData,
  });
});

/**
 * Cancel Offline Sale and Restore Stock
 * POST /api/orders/offline/:id/cancel
 */
export const cancelOfflineSale = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  const { reason = "Customer return / cancelled by seller" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid Sale ID format" });
  }

  const order = await Order.findById(id).populate("items");
  if (!order) {
    return res.status(404).json({ success: false, message: "Sale not found" });
  }

  if (order.orderChannel !== "OFFLINE" || order.seller?.toString() !== sellerId) {
    return res.status(403).json({
      success: false,
      message: "Only offline sales created by your store can be cancelled from POS",
    });
  }

  if (order.status === "Cancelled") {
    return res.status(400).json({ success: false, message: "Sale is already cancelled" });
  }

  // Restore inventory
  const reservations = await reservationsFromOrderItems(order.items as any[]);
  await releaseMany(reservations);

  order.status = "Cancelled";
  order.paymentStatus = "Refunded";
  order.cancellationReason = String(reason);
  order.cancelledAt = new Date();
  await order.save();

  // Mark all items cancelled
  await OrderItem.updateMany({ order: order._id }, { $set: { status: "Cancelled" } });

  return res.status(200).json({
    success: true,
    message: "Sale cancelled and stock restored successfully",
    data: { id: order._id, status: order.status, paymentStatus: order.paymentStatus },
  });
});
