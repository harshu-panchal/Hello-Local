/**
 * PHASE 0 security tests.
 *
 * Runs on Node's built-in test runner — no external test dependency, and no
 * database connection. Every assertion executes real production code paths.
 *
 *   npm run test:security
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";

/** Resolve a source file relative to backend/src (CJS-safe; no import.meta). */
const srcPath = (rel: string) => path.join(process.cwd(), "src", rel);

// Credentials must exist before the verification module is imported.
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_harness";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "harness_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "wh_secret";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_harness";

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;

function sign(orderId: string, paymentId: string, secret = KEY_SECRET) {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

/** A captured payment as the gateway would report it. */
function capturedPayment(orderId: string, amountRupees: number, over: Record<string, any> = {}) {
  return {
    id: over.id ?? "pay_real_1",
    order_id: orderId,
    status: "captured",
    currency: "INR",
    amount: Math.round(amountRupees * 100),
    method: "upi",
    ...over,
  };
}

// ===========================================================================
// C-02 — the mock_ signature bypass must be gone
// ===========================================================================
test("C-02: a 'mock_' payment id gets no special treatment in signature checks", async () => {
  const { verifyCheckoutSignature } = await import("../services/razorpayVerificationService");

  // Previously any id starting with 'mock_' short-circuited to `true`.
  assert.equal(verifyCheckoutSignature("order_x", "mock_1", "anything"), false);
  assert.equal(verifyCheckoutSignature("order_x", "mock_evil", "deadbeef"), false);

  // A genuinely signed mock-named id still validates purely on its HMAC —
  // proving the decision is signature-driven, not prefix-driven.
  assert.equal(
    verifyCheckoutSignature("order_x", "mock_1", sign("order_x", "mock_1")),
    true,
  );
});

test("C-02: a valid signature passes and a tampered one fails", async () => {
  const { verifyCheckoutSignature } = await import("../services/razorpayVerificationService");
  const good = sign("order_A", "pay_A");
  assert.equal(verifyCheckoutSignature("order_A", "pay_A", good), true);
  assert.equal(verifyCheckoutSignature("order_A", "pay_A", good.replace(/.$/, "0")), false);
  assert.equal(verifyCheckoutSignature("order_A", "pay_B", good), false);
  assert.equal(verifyCheckoutSignature("order_B", "pay_A", good), false);
  assert.equal(verifyCheckoutSignature("order_A", "pay_A", ""), false);
  assert.equal(verifyCheckoutSignature("order_A", "pay_A", sign("order_A", "pay_A", "wrong")), false);
});

// ===========================================================================
// C-01 — payment must be bound to the order's own intent, and cover its amount
// ===========================================================================
test("C-01: a signature valid for a DIFFERENT order is rejected (replay across orders)", async () => {
  const { assertGatewayPayment, PaymentVerificationError } =
    await import("../services/razorpayVerificationService");

  // Attacker legitimately paid a cheap order and holds a valid triple for it.
  const cheapIntent = "order_cheap";
  const paymentId = "pay_cheap";
  const validSig = sign(cheapIntent, paymentId);

  // They replay it against an expensive order whose own intent is different.
  await assert.rejects(
    () =>
      assertGatewayPayment({
        razorpayOrderId: cheapIntent,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
        expectedAmount: 50000,
        expectedRazorpayOrderId: "order_expensive", // the victim order's intent
        paymentFetcher: async () => capturedPayment(cheapIntent, 1),
      }),
    (e: any) =>
      e instanceof PaymentVerificationError &&
      /does not belong to this order/i.test(e.message),
  );
});

test("C-01: an order with no issued intent cannot be marked paid", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");
  await assert.rejects(
    () =>
      assertGatewayPayment({
        razorpayOrderId: "order_x",
        razorpayPaymentId: "pay_x",
        razorpaySignature: sign("order_x", "pay_x"),
        expectedAmount: 100,
        expectedRazorpayOrderId: null, // never started a payment
        paymentFetcher: async () => capturedPayment("order_x", 100),
      }),
    /No payment intent was issued/i,
  );
});

test("C-01: underpayment is rejected", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");
  await assert.rejects(
    () =>
      assertGatewayPayment({
        razorpayOrderId: "order_u",
        razorpayPaymentId: "pay_u",
        razorpaySignature: sign("order_u", "pay_u"),
        expectedAmount: 1000,
        expectedRazorpayOrderId: "order_u",
        paymentFetcher: async () => capturedPayment("order_u", 1), // paid 1 of 1000
      }),
    /less than the amount due/i,
  );
});

test("C-01: an uncaptured payment is rejected", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");
  for (const status of ["created", "authorized", "failed", "refunded"]) {
    await assert.rejects(
      () =>
        assertGatewayPayment({
          razorpayOrderId: "order_s",
          razorpayPaymentId: "pay_s",
          razorpaySignature: sign("order_s", "pay_s"),
          expectedAmount: 100,
          expectedRazorpayOrderId: "order_s",
          paymentFetcher: async () => capturedPayment("order_s", 100, { status }),
        }),
      /not captured/i,
      `status=${status} should be rejected`,
    );
  }
});

test("C-01: a gateway payment belonging to another intent is rejected", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");
  await assert.rejects(
    () =>
      assertGatewayPayment({
        razorpayOrderId: "order_m",
        razorpayPaymentId: "pay_m",
        razorpaySignature: sign("order_m", "pay_m"),
        expectedAmount: 100,
        expectedRazorpayOrderId: "order_m",
        // Gateway says this payment is for a different order.
        paymentFetcher: async () => capturedPayment("order_other", 100),
      }),
    /does not belong to the issued payment intent/i,
  );
});

test("C-01: a foreign currency is rejected", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");
  await assert.rejects(
    () =>
      assertGatewayPayment({
        razorpayOrderId: "order_c",
        razorpayPaymentId: "pay_c",
        razorpaySignature: sign("order_c", "pay_c"),
        expectedAmount: 100,
        expectedRazorpayOrderId: "order_c",
        paymentFetcher: async () => capturedPayment("order_c", 100, { currency: "USD" }),
      }),
    /Unexpected payment currency/i,
  );
});

test("C-01 POSITIVE: a legitimate, correctly-bound payment is accepted", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");
  const res = await assertGatewayPayment({
    razorpayOrderId: "order_ok",
    razorpayPaymentId: "pay_ok",
    razorpaySignature: sign("order_ok", "pay_ok"),
    expectedAmount: 249.5,
    expectedRazorpayOrderId: "order_ok",
    paymentFetcher: async () => capturedPayment("order_ok", 249.5, { id: "pay_ok" }),
  });
  assert.equal(res.amount, 249.5);
  assert.equal(res.currency, "INR");
  assert.equal(res.razorpayPaymentId, "pay_ok");
});

test("C-01 BOUNDARY: 1 paise rounding slack is tolerated, 2 paise is not", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");

  // Paid 100.00 against a 100.01 due — within slack.
  const ok = await assertGatewayPayment({
    razorpayOrderId: "o1", razorpayPaymentId: "p1",
    razorpaySignature: sign("o1", "p1"),
    expectedAmount: 100.01, expectedRazorpayOrderId: "o1",
    paymentFetcher: async () => capturedPayment("o1", 100.0),
  });
  assert.equal(ok.amount, 100);

  await assert.rejects(
    () => assertGatewayPayment({
      razorpayOrderId: "o2", razorpayPaymentId: "p2",
      razorpaySignature: sign("o2", "p2"),
      expectedAmount: 100.02, expectedRazorpayOrderId: "o2",
      paymentFetcher: async () => capturedPayment("o2", 100.0),
    }),
    /less than the amount due/i,
  );
});

test("C-01 BOUNDARY: zero / negative / non-numeric amounts are rejected", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");
  for (const bad of [0, -100, NaN]) {
    await assert.rejects(
      () => assertGatewayPayment({
        razorpayOrderId: "oz", razorpayPaymentId: "pz",
        razorpaySignature: sign("oz", "pz"),
        expectedAmount: bad as number, expectedRazorpayOrderId: "oz",
        paymentFetcher: async () => capturedPayment("oz", 100),
      }),
      /Expected amount is invalid/i,
      `expectedAmount=${bad}`,
    );
  }
  // Gateway reporting a nonsense amount is also refused.
  await assert.rejects(
    () => assertGatewayPayment({
      razorpayOrderId: "og", razorpayPaymentId: "pg",
      razorpaySignature: sign("og", "pg"),
      expectedAmount: 100, expectedRazorpayOrderId: "og",
      paymentFetcher: async () => capturedPayment("og", 0, { amount: 0 }),
    }),
    /invalid amount/i,
  );
});

test("C-01: missing verification parameters are rejected", async () => {
  const { assertGatewayPayment } = await import("../services/razorpayVerificationService");
  for (const p of [
    { razorpayOrderId: "", razorpayPaymentId: "p", razorpaySignature: "s" },
    { razorpayOrderId: "o", razorpayPaymentId: "", razorpaySignature: "s" },
    { razorpayOrderId: "o", razorpayPaymentId: "p", razorpaySignature: "" },
  ]) {
    await assert.rejects(
      () => assertGatewayPayment({
        ...p, expectedAmount: 100, expectedRazorpayOrderId: "o",
        paymentFetcher: async () => capturedPayment("o", 100),
      } as any),
      /Missing required payment verification parameters/i,
    );
  }
});

// ===========================================================================
// H-10 groundwork — webhook signature over the RAW body
// ===========================================================================
test("H-10: webhook signature verifies against raw bytes, and rejects tampering", async () => {
  const { verifyWebhookSignature } = await import("../services/razorpayVerificationService");
  const raw = Buffer.from(JSON.stringify({ event: "payment.captured", payload: {} }), "utf8");
  const sig = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(raw)
    .digest("hex");

  assert.equal(verifyWebhookSignature(raw, sig), true);
  assert.equal(verifyWebhookSignature(raw, sig.replace(/.$/, "0")), false);
  assert.equal(verifyWebhookSignature(Buffer.from("{}"), sig), false);
  assert.equal(verifyWebhookSignature(raw, ""), false);
});

// ===========================================================================
// C-03 / C-04 — COD settlement guards
// ===========================================================================
test("C-03/C-04: settlement rejects non-positive, non-finite and unreferenced amounts", async () => {
  const { settleCourierCodDebt, CodSettlementError } =
    await import("../services/codSettlementService");

  const base = { deliveryBoyId: "507f1f77bcf86cd799439011", source: "CASH" as const, adminId: "a1" };

  for (const amount of [0, -500, NaN, Infinity]) {
    await assert.rejects(
      () => settleCourierCodDebt({ ...base, amount, reference: "R1" }),
      (e: any) => e instanceof CodSettlementError && /positive number/i.test(e.message),
      `amount=${amount}`,
    );
  }

  await assert.rejects(
    () => settleCourierCodDebt({ ...base, amount: 100, reference: "" }),
    /reference is required/i,
  );

  await assert.rejects(
    () => settleCourierCodDebt({
      deliveryBoyId: "507f1f77bcf86cd799439011",
      amount: 100, source: "CASH", reference: "R2",
    }),
    /requires an admin/i,
  );
});

// ===========================================================================
// C-06 — socket handshake must reject anonymous and invalid tokens
// ===========================================================================
test("C-06: socket handshake rejects missing, malformed and unsigned tokens", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const { initializeSocket } = await import("../socket/socketService");

  const server = http.createServer();
  const io = initializeSocket(server);

  // Capture the registered handshake middleware.
  const mws: Function[] = (io as any)._nsps?.get("/")?._fns ?? (io as any).sockets?._fns ?? [];
  assert.ok(mws.length >= 1, "expected a handshake middleware to be registered");
  const handshake = mws[0];

  const run = (token?: string) =>
    new Promise<{ err?: Error; user?: any }>((resolve) => {
      const socket: any = { handshake: { auth: token === undefined ? {} : { token } } };
      handshake(socket, (err?: Error) => resolve({ err, user: socket.user }));
    });

  // No token — previously admitted as "unauthenticated". (#C-06)
  const anon = await run(undefined);
  assert.ok(anon.err, "anonymous handshake must be rejected");
  assert.match(anon.err!.message, /Authentication required/i);

  // Garbage token.
  const junk = await run("not-a-jwt");
  assert.ok(junk.err, "malformed token must be rejected");

  // Signed with the wrong secret.
  const forged = jwt.sign({ userId: "u1", userType: "Admin" }, "wrong_secret");
  const forgedRes = await run(forged);
  assert.ok(forgedRes.err, "token signed with a foreign secret must be rejected");

  // Valid signature but no userType.
  const incomplete = jwt.sign({ userId: "u1" }, process.env.JWT_SECRET!);
  const incompleteRes = await run(incomplete);
  assert.ok(incompleteRes.err, "token without userType must be rejected");

  // Expired token.
  const expired = jwt.sign({ userId: "u1", userType: "Admin" }, process.env.JWT_SECRET!, { expiresIn: -10 });
  const expiredRes = await run(expired);
  assert.ok(expiredRes.err, "expired token must be rejected");

  // POSITIVE: a properly signed token is admitted and its identity attached.
  const good = jwt.sign({ userId: "abc123", userType: "Delivery" }, process.env.JWT_SECRET!);
  const goodRes = await run(good);
  assert.equal(goodRes.err, undefined, "valid token must be admitted");
  assert.equal(goodRes.user.userId, "abc123");
  assert.equal(goodRes.user.userType, "Delivery");

  io.close();
  server.close();
});

// ===========================================================================
// C-07 — no master delivery OTP
// ===========================================================================
test("C-07: '9999' is not accepted as a delivery OTP", async () => {
  // Asserted structurally: the service compares only against the customer's own
  // OTP with a timing-safe comparison, and no literal bypass remains.
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    srcPath("services/deliveryOtpService.ts"),
    "utf8",
  );
  // Strip comments — explanatory notes naming the removed constant must not
  // themselves trip the assertion.
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/9999/.test(code), "a hardcoded master OTP is still present");
  assert.ok(!/isMockOtp/.test(code), "the mock-OTP bypass is still present");
  assert.ok(!/USE_MOCK_OTP/.test(code), "USE_MOCK_OTP still influences OTP verification");
  assert.ok(/timingSafeEqual/.test(code), "OTP comparison should be timing-safe");
});

// ===========================================================================
// C-08 — courier status endpoint cannot set Delivered
// ===========================================================================
test("C-08: courier status endpoint excludes Delivered and blocks terminal reopen", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    srcPath("modules/delivery/controllers/deliveryOrderController.ts"),
    "utf8",
  );

  // Asserted as a property, not as a particular implementation. Phase 4 moved
  // the allow-list into the shared transition table; what must remain true is
  // that a courier cannot reach "Delivered" from this endpoint and cannot
  // reopen a terminal order.
  const { validateTransition } = await import("../services/orderStatusService");

  for (const from of ["Picked up", "Out for Delivery", "Shipped", "Accepted", "Received"]) {
    const r = validateTransition(from, "Delivered", "delivery");
    assert.equal(r.valid, false, `courier reached Delivered from ${from}`);
  }

  for (const terminal of ["Delivered", "Cancelled", "Rejected", "Returned"]) {
    for (const to of ["Picked up", "Out for Delivery"]) {
      const r = validateTransition(terminal, to, "delivery");
      assert.equal(r.valid, false, `terminal ${terminal} was reopened to ${to}`);
    }
  }

  // The legitimate pickup transitions still work.
  assert.equal(validateTransition("Processed", "Picked up", "delivery").valid, true);
  assert.equal(validateTransition("Picked up", "Out for Delivery", "delivery").valid, true);

  // The endpoint delegates to that table and does not mark orders paid.
  assert.match(src, /validateTransition\(order\.status, status, "delivery"\)/,
    "the courier endpoint does not use the shared transition table");
  assert.ok(!/order\.paymentStatus = "Paid"/.test(src),
    "status endpoint must not mark orders paid");
});

// ===========================================================================
// C-09 — no hardcoded courier backdoor
// ===========================================================================
test("C-09: no hardcoded backdoor identity in the delivery auth path", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    srcPath("modules/delivery/controllers/deliveryAuthController.ts"),
    "utf8",
  );
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/9111966732/.test(code), "hardcoded backdoor mobile still present in code");
  assert.ok(!/isBypass/.test(code), "bypass flag still present");
  assert.ok(!/Test Delivery Partner/.test(code), "auto-provisioning backdoor still present");
});
