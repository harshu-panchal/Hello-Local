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

const stages = ["Received", "Accepted", "Processed", "Shipped"];
export const courierOfferStatuses = ["Accepted", "Processed", "Shipped"];
export function payableForDelivery(order: any) {
  return order.paymentMethod === "COD" || ["Paid", "PartiallyRefunded"].includes(order.paymentStatus);
}
export function sellerStage(items: any[], order: any): string {
  const active = items.filter(item => item.status !== "Cancelled");
  if (!active.length) return "Cancelled";
  if (!stages.includes(order.status) && order.status !== "Pending") return order.status;
  return stages[Math.min(...active.map(item => {
    const stage = item.fulfillmentStatus || (stages.includes(order.status) ? order.status : "Received");
    return Math.max(0, stages.indexOf(stage));
  }))];
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

export async function cancelOrderLifecycle(id: string, actor: OrderActor, options: {
  userId?: string; sellerId?: string; reason?: string; status?: "Cancelled" | "Rejected"; expiredOnly?: boolean;
}) {
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
    const check = validateTransition(order.status, options.status || "Cancelled", actor);
    if (!check.valid) orderError(check.message!);
    const selected = items.filter(item => item.status !== "Cancelled" && (!options.sellerId || String(item.seller) === options.sellerId));
    if (!selected.length) return { order, unchanged: true };
    await restore(selected, session);
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
      const amount = remaining.length ? Math.round(selected.reduce((sum, item) => sum + Math.max(0, item.total - (item.discountAmount || 0)), 0) * 100) / 100 : undefined;
      if (amount === undefined || amount > 0) await queueOrderEffect(order, "Refund",
        remaining.length ? `${id}:cancel:seller:${options.sellerId}` : `${id}:cancel:remaining`, session, amount, options.reason || "Seller cancelled items");
    }
    await order.save({ session });
    return { order, unchanged: false, notifyCouriers: courierOfferStatuses.includes(order.status) && !courierOfferStatuses.includes(previousStatus) };
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
    return { order, sellerStatus: requested, unchanged: false,
      notifyCouriers: courierOfferStatuses.includes(order.status) && !courierOfferStatuses.includes(previous) };
  });
}

export async function acceptDeliveryOrder(id: string, courierId: string, options: { allowReassignment?: boolean; assignedBy?: string } = {}) {
  return withOrderTransaction(id, async session => {
    const courier = await Delivery.findById(courierId).session(session);
    if (!courier || courier.status !== "Active") orderError("An active delivery account is required.", 403);
    const order = await load(id, session);
    const eligible = courierOfferStatuses.includes(order.status) || (options.allowReassignment && order.status === "Received");
    if (!eligible || !payableForDelivery(order)) orderError("This order is no longer available for delivery.");
    const changingCourier = order.deliveryBoy && String(order.deliveryBoy) !== courierId;
    if (changingCourier && (!options.allowReassignment || order.sellerPickups?.some(pickup => pickup.pickedUpAt))) orderError("Order already assigned to another delivery partner.", 409);
    if (!order.deliveryBoy || changingCourier) {
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
    return { order, allPickedUp, pickedUpSellers: order.sellerPickups.length, totalSellers: sellers.length };
  });
}
