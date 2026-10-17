import crypto from "crypto";
import Order from "../models/Order";
import Customer from "../models/Customer";
import OrderItem from "../models/OrderItem";
import { orderError, withOrderTransaction } from "./orderTransactionService";
import { payableForDelivery } from "./orderLifecycleService";
import { queueOrderEffect } from "./orderEffectService";

export async function generateDeliveryOtp(orderId: string, options: { refresh?: boolean; courierId?: string } = {}): Promise<{ success: boolean; message: string }> {
  const order = await withOrderTransaction(orderId, async session => {
    const order = await Order.findById(orderId).session(session);
    if (!order) orderError("Order not found", 404);
    if (options.courierId && String(order!.deliveryBoy) !== options.courierId) orderError("This order is not assigned to you", 403);
    if (["Delivered", "Cancelled", "Rejected", "Returned"].includes(order!.status)) orderError("This order cannot receive a delivery OTP.");
    if (!options.refresh && order!.status !== "Out for Delivery") orderError("Complete all seller pickups before requesting delivery OTP.");
    if (!options.refresh && (order!.deliveryOtpAttempts || 0) >= 5) orderError("Ask the customer to refresh their delivery OTP.");
    if (options.refresh || !order!.deliveryOtp || !order!.deliveryOtpExpiresAt || order!.deliveryOtpExpiresAt <= new Date()) {
      order!.deliveryOtp = crypto.randomInt(1000, 10000).toString();
      order!.deliveryOtpExpiresAt = new Date(Date.now() + 86400000);
      // Only the customer refresh path can unlock a failed-attempt lock.
      if (options.refresh) order!.deliveryOtpAttempts = 0;
      await order!.save({ session });
    }
    return order!;
  });
  const { sendNotificationToUser } = await import("./firebaseAdmin");
  void sendNotificationToUser(String(order.customer), "Customer", { title: "Delivery OTP",
    body: `Your delivery OTP for order #${order.orderNumber} is ${order.deliveryOtp}. Share it only when you receive the order.`,
    data: { type: "DELIVERY_OTP", orderId } }).catch(error => console.error("Delivery OTP push failed", error));
  return { success: true, message: "Your order delivery OTP is ready. The customer can view it in order details." };
}

export async function verifyDeliveryOtp(orderId: string, otp: string, courierId?: string): Promise<{ success: boolean; message: string }> {
  const submitted = String(otp).trim();
  if (!/^[0-9]{4}$/.test(submitted)) orderError("Invalid OTP. Please check and try again.");
  const result = await withOrderTransaction(orderId, async session => {
    const order = await Order.findById(orderId).session(session);
    if (!order) orderError("Order not found", 404);
    if (courierId && String(order!.deliveryBoy) !== courierId) orderError("This order is not assigned to you", 403);
    if (!order!.deliveryBoy) orderError("A delivery partner must be assigned.");
    if (order!.status === "Delivered") return { invalid: false, alreadyDelivered: true };
    if (order!.status !== "Out for Delivery" || !payableForDelivery(order)) orderError("Only a paid or COD order that is Out for Delivery can be completed.");
    if ((order!.deliveryOtpAttempts || 0) >= 5) orderError("Too many incorrect attempts. Ask the customer to refresh their delivery OTP.");
    let expected = order!.deliveryOtp;
    if (expected && (!order!.deliveryOtpExpiresAt || order!.deliveryOtpExpiresAt <= new Date())) orderError("Delivery OTP expired. Ask the customer to refresh it.");
    if (!expected) { // Compatibility for orders placed before order-specific OTPs.
      const customer = await Customer.findById(order!.customer).session(session);
      expected = customer?.deliveryOtp;
    }
    if (!expected) orderError("Ask the customer to refresh their delivery OTP.");
    const a = Buffer.from(String(expected));
    const b = Buffer.from(submitted);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      order!.deliveryOtpAttempts = (order!.deliveryOtpAttempts || 0) + 1;
      await order!.save({ session });
      return { invalid: true, alreadyDelivered: false }; // Commit the attempt before returning an error.
    }
    order!.deliveryOtpVerified = true;
    order!.deliveryOtpAttempts = 0;
    order!.status = "Delivered";
    order!.deliveryBoyStatus = "Delivered";
    if (order!.paymentMethod === "COD") order!.paymentStatus = "Paid";
    order!.deliveredAt = new Date();
    order!.invoiceEnabled = true;
    order!.settlementStatus = "Pending";
    await OrderItem.updateMany({ order: orderId, status: { $ne: "Cancelled" } }, { $set: { status: "Delivered" } }, { session });
    await queueOrderEffect(order!, "Settlement", `${orderId}:settlement`, session);
    await order!.save({ session });
    return { invalid: false, alreadyDelivered: false };
  });
  if (result.invalid) orderError("Invalid OTP. Please check and try again.");
  return { success: true, message: result.alreadyDelivered ? "Order was already delivered." : "OTP verified successfully. Order marked as delivered." };
}
