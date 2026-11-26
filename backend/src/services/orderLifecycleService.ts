import mongoose, { ClientSession } from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Delivery from "../models/Delivery";
import DeliveryAssignment from "../models/DeliveryAssignment";
import Commission from "../models/Commission";
import Seller from "../models/Seller";
import { calculateDistance } from "../utils/locationHelper";
import { validateTransition, OrderActor } from "./orderStatusService";
import { withOrderTransaction, orderError } from "./orderTransactionService";
import { releaseMany, reservationsFromOrderItems } from "./stockService";
import { releaseCoupon } from "./orderPricingService";
import { queueOrderEffect } from "./orderEffectService";
import { claimInHouseAssignment, ensureInHouseDeliverySettings } from "./inHouseDeliveryService";
import { orderDeliveryProvider } from "./deliveryProviderService";
import { syncOrderShipments, PREPARED_STAGES, TERMINAL_SHIPMENT_STATUSES } from "./shipmentService";
import Shipment from "../models/Shipment";
import { deferExternalCancellations } from "./adloggs/adloggsDeferredCancellation";

import { stages, sellerStage } from "./sellerFulfillmentStage";
export { sellerStage };
export const courierOfferStatuses = ["Accepted", "Processed", "Shipped"];
export function payableForDelivery(order: any) {
  return order.paymentMethod === "COD" || ["Paid", "PartiallyRefunded"].includes(order.paymentStatus);
}
async function load(id: string, session: ClientSession) {
  const order = await Order.findById(id).session(session);
  if (!order) orderError("Order not found", 404);
  return order!;
}
function checkActor(order: any, actor: OrderActor, userId?: string) {
  if (actor === "customer" && String(order.customer) !== userId) orderError("Order not found", 404);
  if (actor === "delivery" && String(order.deliveryBoy) !== userId) orderError("This order is not assigned to you", 403);
}
async function restore(items: any[], session: ClientSession) {
  const reservations = await reservationsFromOrderItems(items.map(item => ({ product: item.product, quantity: item.quantity, variation: item.variation })), session);
  await releaseMany(reservations, session);
}

/**
 * Existing refund rule for a (partial) cancellation, shared by the lifecycle and
 * by read-only previews so they can never disagree: items cancelled while other
 * items stay active refund their own totals net of their discount; cancelling
 * the last active items refunds the whole remaining refundable balance
 * (`undefined` = refundOrder refunds what is still refundable).
 */
export function sellerCancellationRefundAmount(selected: Array<{ total: number; discountAmount?: number }>, remaining: unknown[]): number | undefined {
  return remaining.length ? Math.round(selected.reduce((sum, item) => sum + Math.max(0, item.total - (item.discountAmount || 0)), 0) * 100) / 100 : undefined;
}

/**
 * Read-only preview of what cancelling one seller's active items would refund
 * under the existing rules (used before an admin confirms an RTO resolution).
 * Changes nothing.
 */
export async function previewSellerCancellationRefund(orderId: string, sellerId: string) {
  const order: any = await Order.findById(orderId).select("orderNumber paymentMethod paymentStatus total subtotal shipping platformFee discount tipAmount").lean();
  if (!order) orderError("Order not found", 404);
  const items: any[] = await OrderItem.find({ order: orderId }).select("seller productName quantity total discountAmount status").lean();
  const selected = items.filter(item => item.status !== "Cancelled" && String(item.seller) === sellerId);
  const remaining = items.filter(item => item.status !== "Cancelled" && String(item.seller) !== sellerId);
  const lines = selected.map(item => ({ productName: item.productName ?? "", quantity: item.quantity, total: item.total,
    discount: item.discountAmount || 0, net: Math.round(Math.max(0, item.total - (item.discountAmount || 0)) * 100) / 100 }));
  const prepaid = order.paymentMethod !== "COD" && ["Paid", "PartiallyRefunded"].includes(order.paymentStatus);
  if (!prepaid) return { eligible: false, basis: "NOT_PREPAID" as const, amount: 0, lines, note: "No prepaid amount to refund (existing eligibility rules)." };
  const amount = sellerCancellationRefundAmount(selected, remaining);
  if (amount !== undefined) return { eligible: amount > 0, basis: "ITEMS" as const, amount, lines,
    note: "Other items in this order stay active: only these items are refunded, net of their discounts. Delivery, platform fee and tip are not refunded." };
  const Refund = (await import("../models/Refund")).default;
  const refunded = ((await Refund.find({ order: orderId, status: "Completed" }).select("amount").lean()) as any[])
    .reduce((sum, refund) => sum + (refund.amount || 0), 0);
  return { eligible: true, basis: "REMAINING_BALANCE" as const, amount: Math.max(0, Math.round((order.total - refunded) * 100) / 100), lines,
    components: { orderTotal: order.total, alreadyRefunded: Math.round(refunded * 100) / 100, shipping: order.shipping ?? 0, platformFee: order.platformFee ?? 0, tip: order.tipAmount ?? 0 },
    note: "These are the last active items: the whole remaining refundable balance is refunded (existing rule), including delivery charge, platform fee and tip. Final amount is capped at what is still refundable." };
}

export async function cancelOrderLifecycle(id: string, actor: OrderActor, options: {
  userId?: string; sellerId?: string; reason?: string; status?: "Cancelled" | "Rejected"; expiredOnly?: boolean;
  /**
   * Internal only (adloggsCancellationWorkflow): Adloggs has verifiably
   * cancelled this seller's provider order, so the deferred local cancellation
   * and refund may now be completed. Never set from a request body.
   */
  externalCancellationConfirmed?: boolean;
  /** Internal only (RTO resolution): false = do not return the items to stock. Default: restock, as before. */
  restock?: boolean;
}): Promise<{ order: any; unchanged: boolean; notifyCouriers?: boolean; deferredSellers?: string[] }> {
  return withOrderTransaction(id, async session => {
    const order = await load(id, session);
    const previousStatus = order.status;
    checkActor(order, actor, options.userId);
    if (options.expiredOnly && (order.status !== "Pending" || order.paymentStatus !== "Pending" ||
      order.createdAt > new Date(Date.now() - 1800000))) return { order, unchanged: true };
    const items = await OrderItem.find({ order: id }).session(session);
    if (options.sellerId && !items.some(item => String(item.seller) === options.sellerId)) orderError("Order not found", 404);
    if (["Cancelled", "Rejected"].includes(order.status)) {
      if (payableForDelivery(order) && order.paymentMethod !== "COD") await queueOrderEffect(order, "Refund", `${id}:cancel:remaining`, session, undefined, options.reason);
      return { order, unchanged: true };
    }
    if (actor === "customer" && (!["Pending", "Received", "Accepted", "Processed"].includes(order.status) || order.sellerPickups?.some(pickup => pickup.pickedUpAt))) orderError("This order has already been dispatched. Contact support to cancel.");
    if (options.sellerId && order.sellerPickups?.some(pickup => String(pickup.seller) === options.sellerId && pickup.pickedUpAt)) orderError("Picked-up items cannot be cancelled by the seller.");
    // External deliveries (Adloggs): the provider does not allow cancellation
    // after pickup, so customers and sellers cannot cancel (and be refunded
    // for) items whose shipment a provider rider has already collected.
    if ((actor === "customer" || actor === "seller") && order.shipmentsCreated && order.deliveryProvider && order.deliveryProvider !== "IN_HOUSE") {
      const collected = await Shipment.find({ order: id, ...(options.sellerId ? { seller: options.sellerId } : {}),
        status: { $in: ["PICKED_UP", "DELIVERED", "RETURNED_TO_ORIGIN"] } }).select("_id").session(session);
      if (collected.length) orderError("The delivery partner has already collected these items. Contact support.");
    }
    const check = validateTransition(order.status, options.status || "Cancelled", actor);
    if (!check.valid) orderError(check.message!);
    // Adloggs orders that exist (or may exist) are cancelled at the provider
    // FIRST: record the request and queue the provider cancellation; those
    // sellers' items stay active and unrefunded until Adloggs confirms.
    let deferredSellers: string[] = [];
    if (!options.externalCancellationConfirmed && order.shipmentsCreated && order.deliveryProvider === "ADDLOGS") {
      deferredSellers = await deferExternalCancellations(id, options.sellerId,
        { actor, userId: options.userId, reason: options.reason, status: options.status }, session);
    }
    const selected = items.filter(item => item.status !== "Cancelled" && (!options.sellerId || String(item.seller) === options.sellerId)
      && !deferredSellers.includes(String(item.seller)));
    if (!selected.length) return { order, unchanged: true, deferredSellers };
    if (options.restock !== false) await restore(selected, session);
    const ids = selected.map(item => item._id);
    await OrderItem.updateMany({ _id: { $in: ids }, status: { $ne: "Cancelled" } },
      { $set: { status: "Cancelled", fulfillmentStatus: "Cancelled" } }, { session });
    await Commission.updateMany({ order: id, orderItem: { $in: ids }, status: "Pending" }, { $set: { status: "Cancelled" } }, { session });
    const remaining = items.filter(item => item.status !== "Cancelled" && !ids.some(itemId => String(itemId) === String(item._id)));
    if (!remaining.length) {
      order.status = options.status || "Cancelled";
      order.cancelledAt = new Date();
      order.cancellationReason = options.reason || "Order cancelled";
      order.deliveryBoyStatus = "Failed";
      await DeliveryAssignment.updateOne({ order: id }, { $set: { status: "Cancelled", failureReason: options.reason || "Order cancelled" } }, { session });
      await releaseCoupon(order.couponCode, session);
      await queueOrderEffect(order, "Reversal", `${id}:cancel:reversal`, session);
    } else if (order.paymentMethod === "COD") {
      // No money has been collected yet. The courier must collect only active items.
      order.originalTotal = order.originalTotal ?? order.total;
      order.subtotal = remaining.reduce((sum, item) => sum + item.total, 0);
      order.tax = remaining.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
      order.discount = remaining.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
      order.total = Math.round(Math.max(0, order.subtotal + order.shipping + order.platformFee - order.discount + (order.tipAmount || 0)) * 100) / 100;
    }
    if (remaining.length && stages.includes(order.status)) {
      order.status = sellerStage(remaining, order) as any;
      const sellers = [...new Set(remaining.map(item => String(item.seller)))];
      if (sellers.every(seller => order.sellerPickups?.some(pickup => String(pickup.seller) === seller && pickup.pickedUpAt))) {
        order.status = "Out for Delivery";
        order.deliveryBoyStatus = "In Transit";
      }
    }
    if (order.paymentMethod !== "COD" && ["Paid", "PartiallyRefunded"].includes(order.paymentStatus)) {
      const amount = sellerCancellationRefundAmount(selected, remaining);
      // An order-level request with deferred sellers refunds only the sellers cancelled now (keyed by them).
      const partialKey = options.sellerId ? `${id}:cancel:seller:${options.sellerId}`
        : `${id}:cancel:sellers:${[...new Set(selected.map(item => String(item.seller)))].sort().join(",")}`;
      if (amount === undefined || amount > 0) await queueOrderEffect(order, "Refund",
        remaining.length ? partialKey : `${id}:cancel:remaining`, session, amount, options.reason || "Seller cancelled items");
    }
    await order.save({ session });
    // Seller-scoped cancellation cancels only that seller's shipment.
    await syncOrderShipments(order, session, actor === "delivery" ? "delivery" : actor);
    return { order, unchanged: false, deferredSellers, notifyCouriers: courierOfferStatuses.includes(order.status) && !courierOfferStatuses.includes(previousStatus) };
  });
}

export async function changeSellerStage(id: string, sellerId: string, requested: string) {
  if (["Cancelled", "Rejected"].includes(requested)) return cancelOrderLifecycle(id, "seller", { sellerId, status: requested as "Cancelled" | "Rejected", reason: "Cancelled by seller" });
  if (!["Accepted", "Processed", "Shipped"].includes(requested)) orderError("Invalid seller fulfilment stage.");
  return withOrderTransaction(id, async session => {
    const order = await load(id, session);
    if (!stages.includes(order.status) || !payableForDelivery(order)) orderError("This order cannot be prepared or shipped in its current state.");
    const items = await OrderItem.find({ order: id }).session(session);
    const own = items.filter(item => String(item.seller) === sellerId && item.status !== "Cancelled");
    if (!own.length) orderError("No active items for this seller", 404);
    const current = sellerStage(own, order);
    if (current === requested) return { order, sellerStatus: current, unchanged: true, notifyCouriers: false };
    const check = validateTransition(current, requested, "seller");
    if (!check.valid) orderError(check.message!);
    for (const item of own) {
      item.fulfillmentStatus = requested as any;
      if (requested === "Shipped") item.status = "Shipped";
      await item.save({ session });
    }
    const previous = order.status;
    order.status = sellerStage(items, order) as any;
    await order.save({ session });
    await syncOrderShipments(order, session, "seller"); // only this seller's items changed
    return { order, sellerStatus: requested, unchanged: false,
      notifyCouriers: courierOfferStatuses.includes(order.status) && !courierOfferStatuses.includes(previous) };
  });
}

/**
 * Seller's explicit "ready for pickup" confirmation for their own shipment
 * (Phase 4). Persists a readiness fact on the shipment; it never assigns a
 * courier, never changes item stages and never contacts a provider. For
 * in-house orders it is informational: the existing pickup gate
 * (Processed/Shipped) is unchanged. Idempotent; serialized with cancellation,
 * pickup and other sellers' actions by the per-order transaction lock.
 */
export async function markSellerReadyForPickup(id: string, sellerId: string) {
  return withOrderTransaction(id, async session => {
    const order = await load(id, session);
    const items = await OrderItem.find({ order: id }).session(session);
    const mine = items.filter(item => String(item.seller) === sellerId);
    if (!mine.length) orderError("Order not found", 404); // not this seller's order
    const own = mine.filter(item => item.status !== "Cancelled");
    if (!own.length) orderError("Your items in this order are cancelled; the shipment cannot be marked ready.", 409);
    if (!order.shipmentsCreated) orderError("Ready-for-pickup confirmation is not available for orders placed before shipments were introduced.", 409);
    const shipment = await Shipment.findOne({ order: id, seller: sellerId }).session(session);
    if (!shipment) orderError("No shipment exists for your items in this order.", 409);
    if (shipment!.readyForPickupAt) return { order, shipment: shipment!, unchanged: true };
    if (TERMINAL_SHIPMENT_STATUSES.includes(shipment!.status) || ["PICKED_UP", "DELIVERED"].includes(shipment!.status)) {
      orderError("This shipment has already been collected or closed and cannot be marked ready.", 409);
    }
    if (["Cancelled", "Rejected", "Returned", "Delivered"].includes(order.status)) orderError("This order is closed.", 409);
    if (!payableForDelivery(order)) orderError("Online payment has not been confirmed.");
    const stage = sellerStage(own, order);
    if (!PREPARED_STAGES.includes(stage)) {
      orderError(stage === "Received"
        ? "Accept the order before marking it ready for pickup."
        : "Mark your items as Processed (prepared) before confirming they are ready for pickup.");
    }
    const now = new Date();
    const written = await Shipment.updateOne(
      { _id: shipment!._id, readyForPickupAt: null },
      { $set: { readyForPickupAt: now, readyBy: new mongoose.Types.ObjectId(sellerId) } },
      { session },
    );
    if (!written.modifiedCount) return { order, shipment: shipment!, unchanged: true };
    await syncOrderShipments(order, session, "seller");
    return { order, shipment: shipment!, unchanged: false };
  });
}

export async function acceptDeliveryOrder(id: string, courierId: string, options: { allowReassignment?: boolean; assignedBy?: string } = {}) {
  // The assignment gate writes the settings singleton, so it must exist
  // before the transaction (creating it inside would not serialize).
  await ensureInHouseDeliverySettings();
  return withOrderTransaction(id, async session => {
    const courier = await Delivery.findById(courierId).session(session);
    if (!courier || courier.status !== "Active") orderError("An active delivery account is required.", 403);
    const order = await load(id, session);
    // A courier can only be put on an order committed to the in-house fleet;
    // orders committed to another provider are never rerouted here.
    if (orderDeliveryProvider(order) !== "IN_HOUSE") orderError("This order is handled by another delivery provider.", 409);
    const eligible = courierOfferStatuses.includes(order.status) || (options.allowReassignment && order.status === "Received");
    if (!eligible || !payableForDelivery(order)) orderError("This order is no longer available for delivery.");
    const changingCourier = order.deliveryBoy && String(order.deliveryBoy) !== courierId;
    if (changingCourier && (!options.allowReassignment || order.sellerPickups?.some(pickup => pickup.pickedUpAt))) orderError("Order already assigned to another delivery partner.", 409);
    if (!order.deliveryBoy || changingCourier) {
      // Creating or moving an in-house assignment is new work. The claim is a
      // conditional write on the settings document inside this transaction, so
      // it serializes against the admin toggle: no assignment can commit after
      // in-house delivery has been switched off (strict OFF, no exceptions).
      await claimInHouseAssignment(session);
      order.deliveryBoy = new mongoose.Types.ObjectId(courierId);
      order.deliveryBoyStatus = "Assigned";
      order.assignedAt = new Date();
      await order.save({ session });
      await DeliveryAssignment.findOneAndUpdate({ order: id }, { $set: { order: id, deliveryBoy: courierId, status: "Assigned", assignedAt: new Date(), ...(options.assignedBy ? { assignedBy: options.assignedBy } : {}) } }, { upsert: true, session });
    }
    return order;
  });
}

export async function changeCourierStage(id: string, courierId: string, requested: string) {
  return withOrderTransaction(id, async session => {
    const order = await load(id, session);
    checkActor(order, "delivery", courierId);
    if (!payableForDelivery(order)) orderError("Online payment has not been confirmed.");
    const check = validateTransition(order.status, requested, "delivery");
    if (!check.valid) orderError(check.message!);
    const items = await OrderItem.find({ order: id, status: { $ne: "Cancelled" } }).session(session);
    const sellers = [...new Set(items.map(item => String(item.seller)))];
    if (!sellers.length || !sellers.every(seller => order.sellerPickups?.some(pickup => String(pickup.seller) === seller && pickup.pickedUpAt))) {
      orderError("Confirm pickup from every active seller first.");
    }
    order.status = check.status!;
    order.deliveryBoyStatus = requested === "Out for Delivery" ? "In Transit" : "Picked Up";
    await order.save({ session });
    return order;
  });
}

export async function confirmOrderPickup(id: string, courierId: string, sellerId: string, latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) orderError("Valid pickup coordinates are required.");
  return withOrderTransaction(id, async session => {
    const order = await load(id, session);
    checkActor(order, "delivery", courierId);
    if (order.status === "Out for Delivery" && order.sellerPickups?.some(pickup => String(pickup.seller) === sellerId && pickup.pickedUpAt)) {
      const items = await OrderItem.find({ order: id, status: { $ne: "Cancelled" } }).session(session);
      return { order, allPickedUp: true, pickedUpSellers: order.sellerPickups.length, totalSellers: new Set(items.map(item => String(item.seller))).size };
    }
    if (!courierOfferStatuses.includes(order.status) || !payableForDelivery(order)) orderError("This order is not awaiting pickup.");
    const items = await OrderItem.find({ order: id, status: { $ne: "Cancelled" } }).session(session);
    const own = items.filter(item => String(item.seller) === sellerId);
    if (!own.length) orderError("This seller has no active items in the order.");
    const stage = sellerStage(own, order);
    if (!["Processed", "Shipped"].includes(stage)) orderError("This seller must prepare the items before pickup.");
    const seller = await Seller.findById(sellerId).session(session);
    if (!seller) orderError("Seller not found", 404);
    const lat = seller!.location?.coordinates?.[1] ?? Number(seller!.latitude);
    const lng = seller!.location?.coordinates?.[0] ?? Number(seller!.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || calculateDistance(latitude, longitude, lat, lng) > 0.5) orderError("You must be within 500 metres of the seller to confirm pickup.");
    order.sellerPickups = order.sellerPickups || [];
    if (!order.sellerPickups.some(pickup => String(pickup.seller) === sellerId && pickup.pickedUpAt)) {
      order.sellerPickups.push({ seller: new mongoose.Types.ObjectId(sellerId), pickedUpBy: new mongoose.Types.ObjectId(courierId), pickedUpAt: new Date(), latitude, longitude });
      await OrderItem.updateMany({ order: id, seller: sellerId, status: { $ne: "Cancelled" } }, { $set: { status: "Shipped", fulfillmentStatus: "Shipped" } }, { session });
    }
    const sellers = [...new Set(items.map(item => String(item.seller)))];
    const allPickedUp = sellers.length > 0 && sellers.every(seller => order.sellerPickups!.some(pickup => String(pickup.seller) === seller && pickup.pickedUpAt));
    if (allPickedUp) {
      order.status = "Out for Delivery";
      order.deliveryBoyStatus = "In Transit";
    }
    await order.save({ session });
    await syncOrderShipments(order, session, "delivery"); // marks this seller's shipment picked up
    return { order, allPickedUp, pickedUpSellers: order.sellerPickups.length, totalSellers: sellers.length };
  });
}
