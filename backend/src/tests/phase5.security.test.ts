/**
 * PHASE 5 — missing implementations.
 * Each feature is asserted end to end: model -> service -> controller -> route
 * -> frontend service -> UI.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_harness";

const srcPath = (rel: string) => path.join(process.cwd(), "src", rel);
const fePath = (rel: string) => path.join(process.cwd(), "..", "frontend", "src", rel);
const strip = (t: string) => t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const code = (rel: string) => strip(fs.readFileSync(srcPath(rel), "utf8"));
const feCode = (rel: string) => strip(fs.readFileSync(fePath(rel), "utf8"));
const exists = (p: string) => fs.existsSync(p);

// ===========================================================================
// H-20 — returns, end to end
// ===========================================================================
test("H-20: a Return can actually be created", () => {
  assert.ok(exists(srcPath("services/returnService.ts")), "returnService missing");
  const svc = code("services/returnService.ts");
  assert.match(svc, /Return\.create\(/, "nothing creates a Return");
  assert.match(svc, /export async function requestReturn/, "no requestReturn entry point");
});

test("H-20: the return chain is complete from route to UI", () => {
  // Controller + route
  assert.ok(exists(srcPath("modules/customer/controllers/customerReturnController.ts")));
  assert.ok(exists(srcPath("routes/customerReturnRoutes.ts")));
  assert.match(code("routes/index.ts"), /customer\/returns/, "route not mounted");
  assert.match(code("routes/customerReturnRoutes.ts"), /requireUserType\("Customer"\)/,
    "return routes are not scoped to customers");

  // Frontend service + UI
  assert.ok(exists(fePath("services/api/customerReturnService.ts")), "no frontend return service");
  assert.match(feCode("services/api/customerReturnService.ts"), /\/customer\/returns/,
    "frontend service points at the wrong endpoint");
  const ui = feCode("modules/user/OrderDetail.tsx");
  assert.match(ui, /createReturnRequest\(/, "no UI calls the return endpoint");
  assert.match(ui, /Request return/, "no return submit control rendered");
});

test("H-20: returns are validated — ownership, delivery, window, quantity", () => {
  const svc = code("services/returnService.ts");
  assert.match(svc, /Order\.findOne\(\{ _id: orderId, customer: customerId \}\)/,
    "return does not verify the customer owns the order");
  assert.match(svc, /status !== "Delivered"/, "return does not require a delivered order");
  assert.match(svc, /return window/i, "no return window enforced");
  assert.match(svc, /quantity > orderItem\.quantity/, "quantity is not bounded by what was ordered");
  assert.match(svc, /already in progress/i, "duplicate returns are not prevented");
});

test("H-20: completing a return restocks, refunds and reverses commission", () => {
  const svc = code("services/returnService.ts");
  const done = svc.slice(svc.indexOf('if (status !== "Completed") return ret;'));
  assert.match(done, /releaseOne\(/, "completion does not restock");
  assert.match(done, /refundOrder\(/, "completion does not refund");
  assert.match(done, /reverseCommissions\(/, "completion does not reverse commission");
  assert.match(done, /status: "Returned"/, "order/item status is not updated");
});

test("H-20: return status changes follow a transition table", async () => {
  const { validateReturnTransition } = await import("../services/returnService");
  assert.equal(validateReturnTransition("Pending", "Approved").valid, true);
  assert.equal(validateReturnTransition("Approved", "Completed").valid, false);
  assert.equal(validateReturnTransition("Completed", "Pending").valid, false);
  assert.equal(validateReturnTransition("Rejected", "Approved").valid, false);
  assert.equal(validateReturnTransition("Approved", "Processing").valid, true);
  assert.equal(validateReturnTransition("Processing", "Completed").valid, true);
});

// ===========================================================================
// H-21 — reviews
// ===========================================================================
test("H-21: the purchase check no longer uses the impossible items.product query", () => {
  const c = code("modules/customer/controllers/productReviewController.ts");
  assert.ok(!/'items\.product'|"items\.product"/.test(c),
    "still querying Order.items.product, which can never match");
  assert.match(c, /OrderItem\.findOne\(\{ order: orderId, product: productId \}\)/,
    "purchase is not verified against OrderItem");
});

test("H-21: the ratings aggregate casts the product id", () => {
  const c = code("modules/customer/controllers/productReviewController.ts");
  assert.match(c, /new mongoose\.Types\.ObjectId\(productId\)/,
    "product id is not cast for $match");
  assert.match(c, /\$match: \{ product: productObjectId/,
    "aggregate still matches on a raw string");
});

test("H-21: reviews become visible and the product rating is recomputed", () => {
  const c = code("modules/customer/controllers/productReviewController.ts");
  assert.match(c, /status: 'Approved'/, "verified reviews are still created Pending with no way to publish");
  assert.match(c, /export async function recalculateProductRating/, "no rating recomputation");
  assert.match(c, /Product\.updateOne\(\{ _id \}, \{ \$set: \{ rating, reviewsCount \} \}\)/,
    "Product.rating / reviewsCount are still never written");
});

test("H-21: admin moderation exists and is wired", () => {
  assert.ok(exists(srcPath("modules/admin/controllers/adminReviewController.ts")));
  const admin = code("routes/adminRoutes.ts");
  assert.match(admin, /\/reviews/, "moderation routes not mounted");
  assert.match(admin, /reviewController\.moderateReview/, "moderate endpoint missing");
  const ctrl = code("modules/admin/controllers/adminReviewController.ts");
  assert.match(ctrl, /recalculateProductRating\(/, "moderation does not refresh the rating");
  assert.ok(exists(fePath("services/api/admin/adminReviewService.ts")), "no frontend moderation service");
});

// ===========================================================================
// H-06 — refunds
// ===========================================================================
test("H-06: refunds are reachable from the admin surface", () => {
  const admin = code("routes/adminRoutes.ts");
  assert.match(admin, /\/refunds/, "refund listing not mounted");
  assert.match(admin, /orders\/:id\/refund/, "manual refund endpoint not mounted");
  assert.ok(exists(fePath("services/api/admin/adminRefundService.ts")), "no frontend refund service");
});

test("H-06: refund amounts are bounded and idempotent", () => {
  const c = code("services/refundService.ts");
  assert.match(c, /requested > payment\.amount/, "refund can exceed the captured amount");
  assert.match(c, /status === "Completed"/, "refund is not idempotent");
  assert.match(c, /RefundError/, "no typed failure");
});

// ===========================================================================
// H-24 — notifications actually send
// ===========================================================================
test("H-24: sending a notification reaches a delivery channel", () => {
  const c = code("modules/admin/controllers/adminNotificationController.ts");
  const fn = c.slice(c.indexOf("export const sendNotification"), c.indexOf("export const markMultipleAsRead"));
  assert.match(fn, /sendNotificationToUser\(/, "no push dispatch");
  assert.match(fn, /io\.to\(/, "no socket broadcast");
  assert.match(fn, /delivered/, "delivery is not reported back");
  assert.ok(!/Logic to send push notification would go here/.test(c),
    "the placeholder comment is still there");
  assert.match(fn, /already been sent/, "a notification can be sent repeatedly");
});

// ===========================================================================
// H-25 — the SMS gateway screen is connected
// ===========================================================================
test("H-25: OTP sending consults the admin SMS gateway settings", () => {
  const c = code("services/otpService.ts");
  assert.match(c, /resolveSmsCredentials/, "no settings resolution");
  assert.match(c, /AppSettings/, "otpService never reads AppSettings");
  assert.match(c, /smsGateway/, "otpService never reads the smsGateway settings");
  // The old module-level env constants are gone.
  assert.ok(!/^const SMS_INDIA_HUB_API_KEY = process\.env/m.test(c),
    "still pinned to a module-level env constant");
});

test("H-25: mock OTP mode cannot switch itself on in production", () => {
  const c = code("services/otpService.ts");
  const fn = c.slice(c.indexOf("async function isMockMode"), c.indexOf("// =========================================="));
  assert.match(fn, /NODE_ENV === 'production'/, "production is not guarded");
  assert.match(fn, /throw new Error/, "production silently falls back to mock mode");
});

// ===========================================================================
// H-10 — webhook
// ===========================================================================
test("H-10: the webhook verifies the raw body and handles refund events", () => {
  const routes = code("routes/paymentRoutes.ts");
  assert.match(routes, /express\.raw\(/, "webhook does not receive the raw body");

  const svc = code("services/paymentService.ts");
  assert.match(svc, /verifyWebhookSignature\(rawBody, signature\)/,
    "signature is not verified against the raw bytes");
  assert.ok(!/JSON\.stringify\(body\)/.test(svc),
    "signature still computed over a re-serialised body");
  assert.match(svc, /payload\?\.refund\?\.entity/,
    "refund events still read payload.payment and throw");
});

test("H-29: coupon applicability and per-user limits are considered", () => {
  const p = code("services/orderPricingService.ts");
  assert.match(p, /usageLimit && coupon\.usageCount >= coupon\.usageLimit/,
    "total usage limit is not enforced");
  assert.match(p, /minimumPurchase/, "minimum purchase is not enforced");
  assert.match(p, /maximumDiscount/, "maximum discount cap is not enforced");
  assert.match(p, /Math\.min\(Math\.max\(discount, 0\), eligibleAmount\)/,
    "discount is not clamped");
});
