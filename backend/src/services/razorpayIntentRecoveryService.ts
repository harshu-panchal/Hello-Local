import Seller from "../models/Seller";
import Delivery from "../models/Delivery";
import SubscriptionPlan from "../models/SubscriptionPlan";
import SubscriptionPayment from "../models/SubscriptionPayment";
import {
  assertGatewayWebhookPayment,
  type PaymentFetcher,
} from "./razorpayVerificationService";
import { activateSellerSubscription } from "./subscriptionActivationService";
import { settleCourierCodDebt, CodSettlementError } from "./codSettlementService";

/**
 * Webhook / reconciliation fallback for Razorpay intents that are not customer
 * orders or ad requests: seller subscription payments and courier COD
 * deposits. Used when the browser never reached the /verify endpoint (app
 * closed, network drop), so the captured money is still credited.
 *
 * Every path re-verifies the payment with the gateway and is idempotent with
 * its normal /verify counterpart.
 *
 * @returns true when the Razorpay order belonged to one of these intents.
 */
export async function recoverNonOrderIntent(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  options?: { paymentFetcher?: PaymentFetcher },
): Promise<boolean> {
  if (await recoverSubscriptionPayment(razorpayOrderId, razorpayPaymentId, options)) return true;
  if (await recoverCourierPayout(razorpayOrderId, razorpayPaymentId, options)) return true;
  return false;
}

async function recoverSubscriptionPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  options?: { paymentFetcher?: PaymentFetcher },
): Promise<boolean> {
  const intent = await SubscriptionPayment.findOne({ razorpayOrderId });
  if (!intent) return false;
  if (intent.status !== "PENDING") {
    console.log(`[Razorpay recovery] Subscription intent ${razorpayOrderId} already ${intent.status}.`);
    return true;
  }

  await assertGatewayWebhookPayment({
    razorpayOrderId,
    razorpayPaymentId,
    expectedAmount: intent.amount,
    expectedRazorpayOrderId: intent.razorpayOrderId,
    expectedCurrency: "INR",
    paymentFetcher: options?.paymentFetcher,
  });

  const seller = intent.sellerMobile ? await Seller.findOne({ mobile: intent.sellerMobile }) : null;
  const plan = intent.planId ? await SubscriptionPlan.findById(intent.planId) : null;

  if (!seller || !plan) {
    // Paid during signup but the account was never created (or the plan was
    // removed). Record the captured payment on the intent so it is visible to
    // admins and the signup can still be completed with this payment.
    await SubscriptionPayment.updateOne(
      { _id: intent._id, status: "PENDING", razorpayPaymentId: { $exists: false } },
      { $set: { razorpayPaymentId } },
    );
    console.warn(
      `[Razorpay recovery] Subscription payment ${razorpayPaymentId} captured for intent ${razorpayOrderId}, ` +
        `but ${!seller ? "no seller account exists yet" : "the plan no longer exists"}. Needs admin follow-up.`,
    );
    return true;
  }

  // Paid signup creates the seller with this subscription already applied and
  // marks the intent SUCCESS a moment later. Never apply the same payment twice.
  if (
    seller.subscription?.razorpayOrderId === razorpayOrderId ||
    seller.subscription?.razorpayPaymentId === razorpayPaymentId
  ) {
    console.log(`[Razorpay recovery] Payment ${razorpayPaymentId} is already applied to seller ${seller._id}.`);
    return true;
  }

  const result = await activateSellerSubscription({
    seller,
    plan,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature: "WEBHOOK_VERIFIED",
  });
  console.log(
    result.claimed
      ? `[Razorpay recovery] Subscription for seller ${seller._id} activated from payment ${razorpayPaymentId}.`
      : `[Razorpay recovery] Subscription intent ${razorpayOrderId} was already claimed.`,
  );
  return true;
}

async function recoverCourierPayout(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  options?: { paymentFetcher?: PaymentFetcher },
): Promise<boolean> {
  const courier: any = await Delivery.findOne({ "codPayoutIntent.razorpayOrderId": razorpayOrderId });
  if (!courier) return false;

  const assertion = await assertGatewayWebhookPayment({
    razorpayOrderId,
    razorpayPaymentId,
    expectedAmount: Number(courier.codPayoutIntent.amount),
    expectedRazorpayOrderId: courier.codPayoutIntent.razorpayOrderId,
    expectedCurrency: "INR",
    paymentFetcher: options?.paymentFetcher,
  });

  try {
    // Same reference as the /verify path, so it can only ever settle once.
    await settleCourierCodDebt({
      deliveryBoyId: String(courier._id),
      amount: assertion.amount,
      source: "RAZORPAY",
      reference: `PAYOUT-${assertion.razorpayPaymentId}`,
    });
    console.log(`[Razorpay recovery] Courier ${courier._id} COD deposit ${razorpayPaymentId} settled.`);
  } catch (error) {
    if (!(error instanceof CodSettlementError && error.statusCode === 409)) throw error;
    console.log(`[Razorpay recovery] Courier deposit ${razorpayPaymentId} was already settled.`);
  }

  await Delivery.updateOne(
    { _id: courier._id, "codPayoutIntent.razorpayOrderId": razorpayOrderId },
    { $unset: { codPayoutIntent: "" } },
  );
  return true;
}
