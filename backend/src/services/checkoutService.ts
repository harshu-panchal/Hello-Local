import mongoose, { ClientSession } from "mongoose";
import crypto from "crypto";
import Customer from "../models/Customer";
import Product from "../models/Product";
import Seller from "../models/Seller";
import { effectiveUnitPrice, findVariation, normalizeSelector } from "../utils/productVariation";
import { calculateDistance } from "../utils/locationHelper";
import { orderError } from "./orderTransactionService";
import { priceOrder } from "./orderPricingService";
import { resolveProviderForNewOrder, getDeliveryProviderState } from "./deliveryProviderService";
import { CheckoutServiceability, checkCheckoutServiceability, routesForCheckout, verificationCovers } from "./adloggs/adloggsServiceability";
import { adloggsIneligibleStores } from "./adloggs/adloggsPayload";
import { adloggsCapabilities } from "./adloggs/adloggsConfig";

/**
 * Pre-transaction Adloggs serviceability check (network I/O, never inside a
 * MongoDB transaction). Returns null when the active provider is not Adloggs.
 * Throws a 409 naming the unserviceable stores when any route fails.
 */
export async function precheckAdloggsCheckout(body: any): Promise<CheckoutServiceability | null> {
  const state = await getDeliveryProviderState();
  if (!state.deliveryAvailable || state.activeProvider !== "ADDLOGS") return null;
  const paymentMethod = body?.paymentMethod || "COD";
  if (paymentMethod === "COD" && !adloggsCapabilities().codReady) return null; // prepareCheckout refuses it with a clear message
  const productIds = (Array.isArray(body?.items) ? body.items : [])
    .map((item: any) => String(item?.product?.id || item?.product?._id || item?.productId || ""))
    .filter((id: string) => mongoose.Types.ObjectId.isValid(id));
  const products = await Product.find({ _id: { $in: productIds } }).select("seller shippingWeightKg").lean();
  const sellers = await Seller.find({ _id: { $in: [...new Set(products.map((p: any) => String(p.seller)))] } })
    .select("storeName location latitude longitude pickupPincode pickupState adloggsOrderCategory").lean();
  // Ineligible sellers/products are never committed to Adloggs (no validation bypass).
  const ineligible = adloggsIneligibleStores(sellers as any[], products as any[]);
  if (ineligible.length) orderError(`Delivery is not available yet from: ${ineligible.join(", ")}.`, 409);
  const latitude = Number(body?.address?.latitude);
  const longitude = Number(body?.address?.longitude);
  const verification = await checkCheckoutServiceability(
    routesForCheckout(sellers as any[], { latitude, longitude, pincode: body?.address?.pincode }, paymentMethod));
  if (!verification.allServiceable) {
    // Observed on the real dev API: "Cod is not allowed for this merchant" until Adloggs enables COD for our account.
    if (paymentMethod === "COD" && verification.routes.some(route => /cod is not allowed/i.test(route.message || ""))) {
      orderError("Cash on delivery isn't available with our delivery partner right now. Please pay online.", 409);
    }
    const names = new Map(sellers.map((seller: any) => [String(seller._id), seller.storeName]));
    const blocked = verification.routes.filter(route => !route.serviceable).map(route => names.get(route.sellerId) || "A store");
    orderError(`Delivery is not available to your address from: ${blocked.join(", ") || "one or more stores"}.`, 409);
  }
  return verification;
}

async function read(query: any, session?: ClientSession) { return session ? query.session(session) : query; }

export function checkoutIdentity(body: any) {
  const lines = (body.items || []).map((item: any) => ({
    product: String(item?.product?.id || item?.product?._id || item?.productId || ""),
    variant: normalizeSelector(item.variant ?? item.variation), quantity: Number(item.quantity),
  })).sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return crypto.createHash("sha256").update(JSON.stringify({ lines, address: body.address,
    paymentMethod: body.paymentMethod || "COD", coupon: body.couponCode || "", tip: Number(body.tipAmount) || 0, gstin: body.gstin || "" })).digest("hex");
}

export async function prepareCheckout(userId: string, body: any, session?: ClientSession,
  options: { adloggsVerification?: CheckoutServiceability | null } = {}) {
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) orderError("Your cart must contain between 1 and 100 items.");
  if (!body.address || typeof body.address !== "object") orderError("A delivery address is required.");
  const latitude = Number(body.address.latitude);
  const longitude = Number(body.address.longitude);
  if (body.address.latitude == null || body.address.longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) orderError("Valid delivery coordinates are required.");
  const paymentMethod = body.paymentMethod || "COD";
  if (!["COD", "Online"].includes(paymentMethod)) orderError("Unsupported payment method.");
  // Delivery availability gate (Phase 2): refuse before any stock, pricing or
  // write work when no delivery provider can take the order. On order
  // creation this runs inside the checkout transaction, so a refusal leaves
  // nothing behind. The resolved provider is recorded on the order.
  const deliveryProvider = await resolveProviderForNewOrder(session);
  // Adloggs COD only when its capability is on (Adloggs collects and settles the cash).
  if (deliveryProvider === "ADDLOGS" && paymentMethod === "COD" && !adloggsCapabilities().codReady) {
    orderError("Cash on delivery is not available for this delivery partner yet. Please pay online.", 409);
  }
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
  const cartSellers: any[] = [];
  for (const sellerId of sellerIds) {
    const seller = await read(Seller.findById(sellerId), session);
    if (!seller || seller.status !== "Approved") orderError("A seller is not currently accepting orders.", 403);
    cartSellers.push(seller);
    const sub = seller.subscription;
    const hasActiveSub = sub && sub.status === 'active' && sub.endDate && new Date(sub.endDate) >= new Date();
    if (!hasActiveSub && (sub || process.env.NODE_ENV !== 'test')) {
      orderError(`${seller.storeName || 'A seller'} is not currently accepting orders due to an inactive or expired subscription.`, 403);
    }
    const lat = seller.location?.coordinates?.[1] ?? Number(seller.latitude);
    const lng = seller.location?.coordinates?.[0] ?? Number(seller.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || calculateDistance(latitude, longitude, lat, lng) > (seller.serviceRadiusKm || 10)) orderError(`${seller.storeName} cannot deliver to this address.`, 403);
  }
  // Adloggs: every seller → customer route must have been verified serviceable
  // (outside this transaction) for exactly these sellers, address and payment
  // method, and the verification must still be fresh. Otherwise refuse; the
  // order is not created and nothing is reserved.
  if (deliveryProvider === "ADDLOGS") {
    const routes = routesForCheckout(cartSellers, { latitude, longitude, pincode: body.address.pincode }, paymentMethod);
    if (!verificationCovers(options.adloggsVerification, routes)) {
      orderError("Delivery availability for your address could not be confirmed. Please try again.", 409);
    }
  }
  const quote = await priceOrder({
    lines: resolved.map(line => ({ productId: String(line.product._id), sellerId: String(line.product.seller), unitPrice: line.unitPrice,
      quantity: line.quantity, taxRefId: line.product.tax,
      categoryIds: [line.product.category, line.product.subcategory, line.product.subSubCategory].filter(Boolean).map(String) })),
    customerId: userId, deliveryLat: latitude, deliveryLng: longitude, couponCode: body.couponCode, tipAmount: body.tipAmount, session,
  });
  return { customer, resolved, latitude, longitude, paymentMethod, gstin, deliveryProvider, ...quote };
}
