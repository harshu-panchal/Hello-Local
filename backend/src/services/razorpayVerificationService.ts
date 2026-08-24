import Razorpay from "razorpay";
import crypto from "crypto";

/**
 * Server-authoritative Razorpay verification.
 *
 * Every payment-accepting endpoint MUST go through `assertGatewayPayment`.
 * The HMAC signature alone is NOT sufficient proof of payment for a specific
 * order: it is computed over `razorpayOrderId|razorpayPaymentId` only, so a
 * signature obtained for one order validates for any other order and carries
 * no amount. (#C-01 / #C-03)
 *
 * This module therefore:
 *   1. verifies the HMAC,
 *   2. fetches the payment from Razorpay and treats the gateway as the only
 *      source of truth for status, currency and amount,
 *   3. asserts the payment belongs to the Razorpay order we issued for this
 *      record, and that it covers the amount we expect.
 *
 * There is deliberately NO bypass path. A missing credential is a hard failure,
 * never a silent "assume paid". (#C-02)
 */

export interface GatewayPaymentAssertion {
  /** Authoritative amount captured, in major units (rupees). */
  amount: number;
  /** Authoritative currency reported by the gateway. */
  currency: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  method?: string;
}

export class PaymentVerificationError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PaymentVerificationError";
    this.statusCode = statusCode;
  }
}

function getKeys(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    // Hard failure by design. Previously this fell through to a dummy order and
    // a signature bypass, which allowed free checkout. (#C-02)
    throw new PaymentVerificationError(
      "Payment gateway is not configured. Payment cannot be processed.",
      503,
    );
  }
  return { keyId, keySecret };
}

export function getRazorpayInstance(): Razorpay {
  const { keyId, keySecret } = getKeys();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * Verify the checkout signature. Timing-safe comparison.
 * This proves the (order, payment) pair came from Razorpay — nothing more.
 */
export function verifyCheckoutSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
): boolean {
  const { keySecret } = getKeys();

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(razorpaySignature), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify a webhook signature against the RAW request body.
 *
 * The raw bytes are required — re-serialising a parsed body with
 * `JSON.stringify` does not reliably reproduce what Razorpay signed. (#H-10)
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new PaymentVerificationError(
      "Razorpay webhook secret is not configured.",
      503,
    );
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Full server-side assertion that a real, captured payment exists which covers
 * `expectedAmount` for the Razorpay order we issued.
 *
 * @throws PaymentVerificationError on any mismatch.
 */
export type PaymentFetcher = (razorpayPaymentId: string) => Promise<any>;

export async function assertGatewayPayment(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  /** Amount we require to have been paid, in major units (rupees). */
  expectedAmount: number;
  /**
   * The razorpayOrderId persisted when we created the payment intent.
   * Required — without it a signature from an unrelated order would pass.
   */
  expectedRazorpayOrderId?: string | null;
  expectedCurrency?: string;
  /**
   * Seam for tests only. Production always uses the real gateway lookup.
   * Never pass this from application code.
   */
  paymentFetcher?: PaymentFetcher;
}): Promise<GatewayPaymentAssertion> {
  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    expectedAmount,
    expectedRazorpayOrderId,
    expectedCurrency = "INR",
    paymentFetcher,
  } = params;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new PaymentVerificationError(
      "Missing required payment verification parameters.",
    );
  }

  // 1. The payment intent must be the one we issued for THIS record.
  if (!expectedRazorpayOrderId) {
    throw new PaymentVerificationError(
      "No payment intent was issued for this record. Start the payment again.",
    );
  }
  if (expectedRazorpayOrderId !== razorpayOrderId) {
    throw new PaymentVerificationError(
      "This payment does not belong to this order.",
    );
  }

  // 2. Signature must be authentic.
  if (!verifyCheckoutSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    throw new PaymentVerificationError("Invalid payment signature.");
  }

  // 3. The gateway is the only source of truth for status and amount.
  const fetchPayment: PaymentFetcher =
    paymentFetcher ??
    ((pid: string) => getRazorpayInstance().payments.fetch(pid) as Promise<any>);

  let payment: any;
  try {
    payment = await fetchPayment(razorpayPaymentId);
  } catch (err: any) {
    throw new PaymentVerificationError(
      `Could not confirm the payment with the gateway: ${err?.message || "lookup failed"}`,
      502,
    );
  }

  if (!payment || typeof payment !== "object") {
    throw new PaymentVerificationError("Payment not found at the gateway.");
  }

  if (payment.order_id !== razorpayOrderId) {
    throw new PaymentVerificationError(
      "Payment does not belong to the issued payment intent.",
    );
  }

  if (payment.status !== "captured") {
    throw new PaymentVerificationError(
      `Payment is not captured (gateway status: ${payment.status}).`,
    );
  }

  const currency = String(payment.currency || "").toUpperCase();
  if (currency !== expectedCurrency.toUpperCase()) {
    throw new PaymentVerificationError(
      `Unexpected payment currency: ${currency}.`,
    );
  }

  // Razorpay reports amounts in the minor unit (paise).
  const paidMinor = Number(payment.amount);
  if (!Number.isFinite(paidMinor) || paidMinor <= 0) {
    throw new PaymentVerificationError("Gateway reported an invalid amount.");
  }

  const expectedMinor = Math.round(Number(expectedAmount) * 100);
  if (!Number.isFinite(expectedMinor) || expectedMinor <= 0) {
    throw new PaymentVerificationError("Expected amount is invalid.");
  }

  // Allow 1 paise of rounding slack, nothing more.
  if (paidMinor + 1 < expectedMinor) {
    throw new PaymentVerificationError(
      `Paid amount (${paidMinor / 100}) is less than the amount due (${expectedMinor / 100}).`,
    );
  }

  return {
    amount: paidMinor / 100,
    currency,
    razorpayPaymentId: String(payment.id),
    razorpayOrderId: String(payment.order_id),
    method: payment.method ? String(payment.method) : undefined,
  };
}
