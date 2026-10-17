import mongoose, { ClientSession } from "mongoose";
import crypto from "crypto";
import Customer from "../models/Customer";
import Product from "../models/Product";
import Seller from "../models/Seller";
import { effectiveUnitPrice, findVariation, normalizeSelector } from "../utils/productVariation";
import { calculateDistance } from "../utils/locationHelper";
import { orderError } from "./orderTransactionService";
import { priceOrder } from "./orderPricingService";

async function read(query: any, session?: ClientSession) { return session ? query.session(session) : query; }

export function checkoutIdentity(body: any) {
  const lines = (body.items || []).map((item: any) => ({
    product: String(item?.product?.id || item?.product?._id || item?.productId || ""),
    variant: normalizeSelector(item.variant ?? item.variation), quantity: Number(item.quantity),
  })).sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return crypto.createHash("sha256").update(JSON.stringify({ lines, address: body.address,
    paymentMethod: body.paymentMethod || "COD", coupon: body.couponCode || "", tip: Number(body.tipAmount) || 0, gstin: body.gstin || "" })).digest("hex");
}

export async function prepareCheckout(userId: string, body: any, session?: ClientSession) {
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) orderError("Your cart must contain between 1 and 100 items.");
  if (!body.address || typeof body.address !== "object") orderError("A delivery address is required.");
  const latitude = Number(body.address.latitude);
  const longitude = Number(body.address.longitude);
  if (body.address.latitude == null || body.address.longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) orderError("Valid delivery coordinates are required.");
  const paymentMethod = body.paymentMethod || "COD";
  if (!["COD", "Online"].includes(paymentMethod)) orderError("Unsupported payment method.");
  const customer = await read(Customer.findById(userId), session);
  if (!customer || customer.status !== "Active") orderError("An active customer account is required.", 403);
  const gstin = String(body.gstin || "").trim().toUpperCase();
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) orderError("Invalid GSTIN format.");
  const resolved: any[] = [];
  const quantities = new Map<string, number>();
  const sellerIds = new Set<string>();
  for (const item of body.items) {
    const productId = String(item?.product?.id || item?.product?._id || item?.productId || "");
    if (!mongoose.Types.ObjectId.isValid(productId)) orderError("Invalid product in cart.");
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) orderError("Invalid item quantity.");
    const product = await read(Product.findById(productId), session);
    if (!product || product.status !== "Active" || !product.publish) orderError("A product in your cart is no longer available.");
    const totalQuantity = (quantities.get(productId) || 0) + quantity;
    quantities.set(productId, totalQuantity);
    if (product.totalAllowedQuantity && totalQuantity > product.totalAllowedQuantity) orderError(`You can order at most ${product.totalAllowedQuantity} of "${product.productName}".`);
    const selector = normalizeSelector(item.variant ?? item.variation);
    const hasVariations = product.variations?.length > 0;
    const variation = hasVariations ? findVariation(product.variations, selector) : null;
    if (hasVariations && !variation) orderError(`Please choose a valid option for "${product.productName}".`);
    if (!hasVariations && selector) orderError("This product has no selectable variants.");
    if (variation?.status === "Sold out") orderError(`"${product.productName}" is sold out.`);
    if (variation && Number(variation.price) < 0) orderError("This product is not priced correctly.");
    const unitPrice = effectiveUnitPrice(product, variation);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) orderError("This product is not priced correctly.");
    resolved.push({ product, quantity, selector, variation, unitPrice });
    sellerIds.add(String(product.seller));
  }
  for (const sellerId of sellerIds) {
    const seller = await read(Seller.findById(sellerId), session);
    if (!seller || seller.status !== "Approved") orderError("A seller is not currently accepting orders.", 403);
    const lat = seller.location?.coordinates?.[1] ?? Number(seller.latitude);
    const lng = seller.location?.coordinates?.[0] ?? Number(seller.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || calculateDistance(latitude, longitude, lat, lng) > (seller.serviceRadiusKm || 10)) orderError(`${seller.storeName} cannot deliver to this address.`, 403);
  }
  const quote = await priceOrder({
    lines: resolved.map(line => ({ productId: String(line.product._id), sellerId: String(line.product.seller), unitPrice: line.unitPrice,
      quantity: line.quantity, taxRefId: line.product.tax,
      categoryIds: [line.product.category, line.product.subcategory, line.product.subSubCategory].filter(Boolean).map(String) })),
    customerId: userId, deliveryLat: latitude, deliveryLng: longitude, couponCode: body.couponCode, tipAmount: body.tipAmount, session,
  });
  return { customer, resolved, latitude, longitude, paymentMethod, gstin, ...quote };
}
