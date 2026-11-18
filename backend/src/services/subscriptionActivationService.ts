import mongoose from "mongoose";
import SubscriptionPayment from "../models/SubscriptionPayment";

/**
 * Apply a verified subscription payment to an existing seller.
 *
 * Shared by the seller renew endpoint and the Razorpay webhook fallback so a
 * renewal is credited exactly once, whichever path arrives first. The caller
 * MUST have already verified the payment with the gateway.
 *
 * The PENDING intent is claimed atomically; if another path already claimed it
 * this returns { claimed: false } and changes nothing.
 */
export async function activateSellerSubscription(params: {
  seller: any;
  plan: any;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ claimed: boolean; endDate?: Date; subscription?: any }> {
  const { seller, plan, razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;

  const now = new Date();
  let startDate = now;
  // If the seller has an active, future subscription, stack the new period onto it.
  if (seller.subscription?.endDate && new Date(seller.subscription.endDate) > now) {
    startDate = new Date(seller.subscription.endDate);
  }
  const endDate = new Date(startDate.getTime() + plan.durationInDays * 24 * 60 * 60 * 1000);

  // ATOMIC CLAIM: only one path can move the intent from PENDING to SUCCESS.
  const paymentRecord = await SubscriptionPayment.findOneAndUpdate(
    { razorpayOrderId, status: "PENDING" },
    {
      $set: {
        sellerId: seller._id,
        sellerName: seller.sellerName,
        sellerMobile: seller.mobile,
        planId: plan._id,
        planName: plan.name,
        amount: plan.price,
        durationInDays: plan.durationInDays,
        razorpayPaymentId,
        razorpaySignature,
        status: "SUCCESS",
        startDate,
        endDate,
        paymentDate: now,
      },
    },
    { new: true },
  );

  if (!paymentRecord) {
    return { claimed: false };
  }

  seller.subscription = {
    planId: plan._id as mongoose.Types.ObjectId,
    planName: plan.name,
    amount: plan.price,
    durationInDays: plan.durationInDays,
    startDate,
    endDate,
    status: "active",
    razorpayOrderId,
    razorpayPaymentId,
    paymentDate: now,
  };
  seller.commission = 0;
  seller.commissionRate = 0;
  await seller.save();

  return { claimed: true, endDate, subscription: seller.subscription };
}
