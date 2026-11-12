import { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Product from "../../../models/Product";
import Seller from "../../../models/Seller";
import Tax from "../../../models/Tax";
import BillCounter from "../../../models/BillCounter";
import { asyncHandler } from "../../../utils/asyncHandler";
import {
  reserveMany,
  releaseMany,
  reservationsFromOrderItems,
} from "../../../services/stockService";
import {
  findVariation,
  normalizeSelector,
  effectiveUnitPrice,
  variationLabel,
} from "../../../utils/productVariation";
import {
  activeTaxRate,
  allocateDiscountAndTax,
  escapeRegex,
  financialYearLabel,
  formatBillNumber,
  formatPosOrderNumber,
  normalizeIndianMobile,
  round2,
} from "../../../utils/posBilling";

const SELLER_BILL_FIELDS = "status sellerName storeName address city mobile email taxNumber storeBanner";
const MAX_POS_LINES = 200;
const ALLOWED_PAYMENT_METHODS = ["Cash", "UPI", "Card"];
const BILL_SORT_FIELDS = ["orderDate", "createdAt", "total", "billNumber", "orderNumber"];
/** Statuses that must not count towards sales figures. */
const NON_REVENUE_STATUSES = ["Cancelled", "Rejected", "Returned"];
const NON_REVENUE_PAYMENT_STATUSES = ["Refunded", "Failed"];

class PosError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "PosError";
  }
}

/**
 * Resolve tax rate for a product from the Tax collection (inactive taxes count as 0%).
 */
async function resolveProductTaxRate(
  taxRefId: mongoose.Types.ObjectId | string | null | undefined,
  cache: Map<string, number>,
): Promise<number> {
  if (!taxRefId) return 0;
  const key = String(taxRefId);
  if (cache.has(key)) return cache.get(key)!;
  let rate = 0;
  try {
    rate = activeTaxRate(await Tax.findById(taxRefId).select("percentage rate status isActive").lean());
  } catch {
    rate = 0;
  }
  cache.set(key, rate);
  return rate;
}

/**
 * Ensure seller is approved before allowing POS operations.
 */
function ensureSellerApproved(seller: any): string | null {
  if (!seller) return "Seller account not found.";
  if (seller.status !== "Approved") {
    return "Your seller account is awaiting admin approval. POS billing is enabled once approved.";
  }
  return null;
}

function sellerBillInfo(sellerInfo: any) {
  return {
    storeName: sellerInfo?.storeName || sellerInfo?.sellerName || "Store",
    address: sellerInfo?.address || "",
    city: sellerInfo?.city || "",
    phone: sellerInfo?.mobile || "",
    email: sellerInfo?.email || "",
    gstin: sellerInfo?.taxNumber || "",
    logo: sellerInfo?.storeBanner || "",
  };
}

/**
 * One bill shape for every consumer (instant POS print, bill history, bill
 * detail). Items carry both the history field names (product/price/qty/unit)
 * and the POS names (productName/unitPrice/quantity/variantTitle).
 */
function buildBillData(order: any, sellerItems: any[], sellerInfo: any, isDirectOwner: boolean) {
  const items = sellerItems.map((it: any, index: number) => {
    const unit = it.variantTitle || "";
    return {
      srNo: index + 1,
      productId: it.product?._id ? String(it.product._id) : it.product ? String(it.product) : undefined,
      product: it.productName,
      productName: it.productName,
      unit: unit || "Standard",
      variantTitle: unit,
      price: it.unitPrice,
      unitPrice: it.unitPrice,
      qty: it.quantity,
      quantity: it.quantity,
      subtotal: it.subtotal || it.total,
      discount: it.discountAmount || 0,
      taxRate: it.taxRate || 0,
      taxAmount: it.taxAmount || 0,
      total: it.total,
    };
  });

  const date = order.orderDate || order.createdAt;
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    billNumber: order.billNumber || order.invoiceNumber || order.orderNumber,
    orderDate: date,
    date,
    billGeneratedAt: order.billGeneratedAt || order.createdAt,
    channel: order.orderChannel || "ONLINE",
    saleType: order.saleType || "ONLINE_DELIVERY",
    customer: {
      name: order.customerName || "Walk-in Customer",
      phone: order.customerPhone || "",
      email: order.customerEmail || "",
      isWalkIn: order.isWalkInCustomer || false,
    },
    seller: sellerBillInfo(sellerInfo),
    items,
    pricing: {
      subtotal: isDirectOwner
        ? order.subtotal
        : round2(sellerItems.reduce((sum, it) => sum + (it.subtotal || it.total), 0)),
      tax: isDirectOwner
        ? order.tax
        : round2(sellerItems.reduce((sum, it) => sum + (it.taxAmount || 0), 0)),
      shipping: order.shipping || 0,
      discount: order.discount || 0,
      total: isDirectOwner
        ? order.total
        : round2(sellerItems.reduce((sum, it) => sum + it.total, 0)),
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

  if (barcode && String(barcode).trim()) {
    const code = String(barcode).trim();
    filter.$or = [{ barcode: code }, { sku: code }, { "variations.sku": code }];
  } else if (query && String(query).trim()) {
    const q = escapeRegex(String(query).trim().slice(0, 100));
    filter.$or = [
      { productName: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
      { barcode: { $regex: q, $options: "i" } },
      { tags: { $regex: q, $options: "i" } },
      { "variations.sku": { $regex: q, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name")
      .populate("tax", "name percentage rate status isActive")
      .sort({ productName: 1, _id: 1 })
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
      // Same rule as billing: an inactive tax is charged at 0%.
      taxRate: activeTaxRate(p.tax),
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
 *
 * Stock reservation, bill-number allocation, order items and the order are
 * written in one transaction: either the whole sale exists or none of it does.
 */
export const createOfflineSale = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const sellerObjId = new mongoose.Types.ObjectId(sellerId);

  const sellerInfo: any = await Seller.findById(sellerId).select(SELLER_BILL_FIELDS).lean();
  const approvalError = ensureSellerApproved(sellerInfo);
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
  } = req.body || {};

  // Client-generated id of this checkout attempt; a retry with the same id
  // returns the bill already created instead of billing twice.
  const rawRef = req.body?.clientSaleId;
  const clientRef =
    typeof rawRef === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(rawRef.trim()) ? rawRef.trim() : undefined;

  const respondWithExisting = async (status: number) => {
    const existing: any = await Order.findOne({ seller: sellerObjId, posClientRef: clientRef }).populate("items");
    if (!existing) return null;
    return res.status(status).json({
      success: true,
      duplicate: true,
      message: "This sale was already billed",
      data: buildBillData(existing, existing.items as any[], sellerInfo, true),
    });
  };

  if (clientRef) {
    const replied = await respondWithExisting(200);
    if (replied) return replied;
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Sale must contain at least one item" });
  }
  if (items.length > MAX_POS_LINES) {
    return res.status(400).json({ success: false, message: `A bill can contain at most ${MAX_POS_LINES} lines` });
  }

  if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: `Invalid payment method. Allowed: ${ALLOWED_PAYMENT_METHODS.join(", ")}`,
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
  }

  const resolved: ResolvedPOSLine[] = [];
  const taxCache = new Map<string, number>();
  let subtotal = 0;

  for (const item of items) {
    const productId = item?.productId || item?.product?.id || item?.product?._id;
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

    // Server-authoritative unit price and tax rate (client prices are ignored)
    const unitPrice = effectiveUnitPrice(product as any, variation);
    const taxRate = await resolveProductTaxRate(product.tax as any, taxCache);
    const lineSubtotal = round2(unitPrice * quantity);
    subtotal = round2(subtotal + lineSubtotal);

    resolved.push({ product, quantity, selector, variation, unitPrice, lineSubtotal, taxRate });
  }

  // 2. Validate discount
  const rawDiscount = Number(discount);
  if (discount !== undefined && discount !== null && discount !== "" && (!Number.isFinite(rawDiscount) || rawDiscount < 0)) {
    return res.status(400).json({ success: false, message: "Discount must be a non-negative amount" });
  }
  const discountAmount = round2(Math.max(0, rawDiscount || 0));
  if (discountAmount > subtotal) {
    return res.status(400).json({
      success: false,
      message: `Discount (Rs.${discountAmount}) cannot exceed subtotal (Rs.${subtotal})`,
    });
  }

  const grandTotal = Math.max(0, round2(subtotal - discountAmount));

  // Prices are tax-inclusive. The discount lowers the taxable value, so GST is
  // computed per line on the discounted amount.
  const allocation = allocateDiscountAndTax(
    resolved.map((r) => ({ amount: r.lineSubtotal, taxRate: r.taxRate })),
    discountAmount,
  );
  const totalTax = allocation.totalTax;

  // 3. Validate payment received
  const rawReceived =
    offlinePaymentDetails?.receivedAmount ?? req.body?.cashReceived ?? req.body?.receivedAmount;
  let receivedAmount = grandTotal;
  let changeReturned = 0;

  if (paymentMethod === "Cash" && rawReceived !== undefined && rawReceived !== null && rawReceived !== "") {
    const received = Number(rawReceived);
    if (!Number.isFinite(received) || received < 0) {
      return res.status(400).json({ success: false, message: "Cash received must be a valid amount" });
    }
    if (round2(received) < grandTotal) {
      return res.status(400).json({
        success: false,
        message: `Cash received (Rs.${round2(received)}) is less than the bill total (Rs.${grandTotal})`,
      });
    }
    receivedAmount = round2(received);
    changeReturned = round2(received - grandTotal);
  }

  // 4. Customer details
  const walkInRequested = req.body?.isWalkIn === true || customer?.isWalkIn === true;
  const rawName = String(customer?.name ?? req.body?.customerName ?? "").trim().slice(0, 100);
  const phone = normalizeIndianMobile(customer?.phone ?? req.body?.customerPhone);
  if (phone === null) {
    return res.status(400).json({ success: false, message: "Please enter a valid 10-digit mobile number" });
  }
  const email = String(customer?.email ?? req.body?.customerEmail ?? "").trim().slice(0, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: "Please enter a valid email address" });
  }
  const namedCustomer = !!rawName && rawName.toLowerCase() !== "walk-in customer";
  const isWalkInCustomer = walkInRequested || (!namedCustomer && !phone && !email);
  const customerName = !walkInRequested && namedCustomer ? rawName : "Walk-in Customer";
  const customerPhone = walkInRequested ? "" : phone;
  const customerEmail = walkInRequested ? "" : email;

  const paymentReference = String(
    req.body?.paymentReference ?? offlinePaymentDetails?.paymentReference ?? "",
  ).trim().slice(0, 100);
  const paymentNotes = String(
    notes || req.body?.orderNotes || offlinePaymentDetails?.paymentNotes || "",
  ).trim().slice(0, 500);

  // 5. Bill serial: continuous per seller per financial year
  const billDate = new Date();
  const fy = financialYearLabel(billDate);
  const counterKey = `posBill:${sellerId}:${fy}`;
  try {
    // Create the counter outside the transaction so the upsert never races inside it.
    await BillCounter.updateOne({ _id: counterKey }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }

  // 6. Reserve stock, number the bill and persist the sale atomically
  const result: { order?: any; items?: any[] } = {};
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await reserveMany(
        resolved.map((r) => ({
          productId: String(r.product._id),
          quantity: r.quantity,
          variation: r.selector,
        })),
        session,
      );

      const counter = await BillCounter.findOneAndUpdate(
        { _id: counterKey },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, session },
      );
      const seq = counter!.seq;
      const billNumber = formatBillNumber(billDate, seq);
      const orderNumber = formatPosOrderNumber(billDate, sellerId, fy, seq);

      const newOrder = new Order({
        orderNumber,
        billNumber,
        invoiceNumber: billNumber,
        billGeneratedAt: billDate,
        orderDate: billDate,
        orderChannel: "OFFLINE",
        saleType: "COUNTER_POS",
        seller: sellerObjId,
        isWalkInCustomer,
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
          paymentReference,
          paymentNotes,
        },
        ...(clientRef ? { posClientRef: clientRef } : {}),
        items: [],
      });

      const orderItems = await OrderItem.insertMany(
        resolved.map((r, i) => ({
          order: newOrder._id,
          product: r.product._id,
          seller: sellerObjId,
          productName: r.product.productName,
          productImage: r.product.mainImage,
          sku: (r.variation as any)?.sku || r.product.sku,
          unitPrice: r.unitPrice,
          quantity: r.quantity,
          subtotal: r.lineSubtotal,
          discountAmount: allocation.lines[i].discount,
          total: r.lineSubtotal,
          taxRate: r.taxRate,
          taxAmount: allocation.lines[i].taxAmount,
          commissionRate: 0,
          commissionAmount: 0,
          variation: r.selector || undefined,
          variantTitle: variationLabel(r.variation),
          status: "Delivered",
        })),
        { session },
      );

      newOrder.items = orderItems.map((it) => it._id as mongoose.Types.ObjectId);
      await newOrder.save({ session });

      result.order = newOrder;
      result.items = orderItems;
    });
  } catch (err: any) {
    // A concurrent retry of the same checkout already created this sale.
    if (err?.code === 11000 && clientRef && JSON.stringify(err?.keyPattern || {}).includes("posClientRef")) {
      const replied = await respondWithExisting(200);
      if (replied) return replied;
    }
    if (err?.name === "StockError" || err?.name === "PosError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message || "Insufficient stock for one or more items",
      });
    }
    console.error("Error creating offline sale:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create offline sale. No stock was deducted; please try again.",
    });
  } finally {
    await session.endSession();
  }

  return res.status(201).json({
    success: true,
    message: "Offline sale created and bill generated successfully",
    data: buildBillData(result.order, result.items || [], sellerInfo, true),
  });
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
    query.paymentMethod = String(paymentMethod);
  }

  if (dateFrom || dateTo) {
    query.orderDate = {};
    if (dateFrom) {
      const start = new Date(dateFrom as string);
      if (!isNaN(start.getTime())) query.orderDate.$gte = start;
    }
    if (dateTo) {
      const end = new Date(dateTo as string);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        query.orderDate.$lte = end;
      }
    }
    if (Object.keys(query.orderDate).length === 0) delete query.orderDate;
  }

  if (search && String(search).trim()) {
    const q = escapeRegex(String(search).trim().slice(0, 100));
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

  const sortField = BILL_SORT_FIELDS.includes(String(sortBy)) ? String(sortBy) : "orderDate";
  const sort: any = { [sortField]: sortOrder === "asc" ? 1 : -1, _id: sortOrder === "asc" ? 1 : -1 };

  // Sales figures only count bills that were not cancelled/returned/refunded.
  const statsMatch = {
    ...query,
    status: { $nin: NON_REVENUE_STATUSES },
    paymentStatus: { $nin: NON_REVENUE_PAYMENT_STATUSES },
  };

  const [orders, total, statsAggregation] = await Promise.all([
    Order.find(query).sort(sort).skip(skip).limit(limitNum).populate("items").lean(),
    Order.countDocuments(query),
    Order.aggregate([
      { $match: statsMatch },
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
      totalRevenue: round2(stats.totalRevenue),
      totalBills: stats.totalBills,
      cashSales: round2(stats.cashTotal),
      upiSales: round2(stats.upiTotal),
      cardSales: round2(stats.cardTotal),
      onlineSales: round2(stats.onlineChannelTotal),
      offlineSales: round2(stats.offlineChannelTotal),
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
  const isDirectOwner = !!order.seller && order.seller.toString() === sellerId;
  const hasItems = (order.items as any[]).some(
    (item) => item.seller?.toString() === sellerId
  );

  if (!isDirectOwner && !hasItems) {
    return res.status(403).json({ success: false, message: "Unauthorized access to this bill" });
  }

  const sellerInfo: any = await Seller.findById(sellerId).select(SELLER_BILL_FIELDS).lean();

  // Filter items for this seller if multi-seller order
  const sellerItems = (order.items as any[]).filter(
    (item) => !item.seller || item.seller.toString() === sellerId
  );

  return res.status(200).json({
    success: true,
    message: "Bill details fetched successfully",
    data: buildBillData(order, sellerItems, sellerInfo, isDirectOwner),
  });
});

/**
 * Cancel Offline Sale and Restore Stock
 * POST /api/orders/offline/:id/cancel
 *
 * The status flip is conditional (`status != Cancelled`) and runs in the same
 * transaction as the stock restore, so a double click or two concurrent
 * requests can never restore stock twice.
 */
export const cancelOfflineSale = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  const reason = String(req.body?.reason || "Customer return / cancelled by seller").trim().slice(0, 500);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid Sale ID format" });
  }

  const existing = await Order.findById(id).select("orderChannel seller status").lean();
  if (!existing) {
    return res.status(404).json({ success: false, message: "Sale not found" });
  }
  if (existing.orderChannel !== "OFFLINE" || existing.seller?.toString() !== sellerId) {
    return res.status(403).json({
      success: false,
      message: "Only offline sales created by your store can be cancelled from POS",
    });
  }
  if (existing.status === "Cancelled") {
    return res.status(400).json({ success: false, message: "Sale is already cancelled" });
  }

  let cancelled: any = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      cancelled = await Order.findOneAndUpdate(
        {
          _id: id,
          seller: new mongoose.Types.ObjectId(sellerId),
          orderChannel: "OFFLINE",
          status: { $ne: "Cancelled" },
        },
        {
          $set: {
            status: "Cancelled",
            paymentStatus: "Refunded",
            cancellationReason: reason,
            cancelledAt: new Date(),
          },
        },
        { new: true, session },
      );
      if (!cancelled) throw new PosError("Sale is already cancelled", 400);

      // Restore inventory
      const orderItems = await OrderItem.find({ order: cancelled._id, status: { $ne: "Cancelled" } }).session(session);
      const reservations = await reservationsFromOrderItems(orderItems as any[], session);
      await releaseMany(reservations, session);

      // Mark all items cancelled
      await OrderItem.updateMany({ order: cancelled._id }, { $set: { status: "Cancelled" } }, { session });
    });
  } catch (err: any) {
    if (err?.name === "PosError") {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error("Error cancelling offline sale:", err);
    return res.status(500).json({ success: false, message: "Failed to cancel sale. Nothing was changed; please try again." });
  } finally {
    await session.endSession();
  }

  return res.status(200).json({
    success: true,
    message: "Sale cancelled and stock restored successfully",
    data: { id: cancelled._id, status: cancelled.status, paymentStatus: cancelled.paymentStatus },
  });
});
