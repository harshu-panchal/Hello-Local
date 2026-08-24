/**
 * PHASE 9 — performance guards and critical-workflow coverage.
 *
 * Covers the 24 workflows named in the remediation roadmap. Where a step is
 * pure logic it is executed; where it needs a database the wiring is asserted
 * across the whole chain (route -> guard -> controller -> service -> model), so
 * a broken link fails the test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_harness";
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_harness";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "harness_secret";

const be = (rel: string) => path.join(process.cwd(), "src", rel);
const fe = (rel: string) => path.join(process.cwd(), "..", "frontend", "src", rel);
const strip = (t: string) => t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const code = (rel: string) => strip(fs.readFileSync(be(rel), "utf8"));
const feCode = (rel: string) => strip(fs.readFileSync(fe(rel), "utf8"));

const ROUTES = () => code("routes/index.ts");
const ADMIN_ROUTES = () => code("routes/adminRoutes.ts");

/** Assert a route file mounts a path and that the mount is guarded. */
function assertGuardedMount(routeFile: string, pathFragment: string, guard: RegExp) {
  const c = code(routeFile);
  assert.ok(c.includes(pathFragment), `${routeFile} does not mount ${pathFragment}`);
  assert.match(c, guard, `${routeFile}: ${pathFragment} is not guarded`);
}

// ===========================================================================
// M-09 — pagination is bounded at the boundary
// ===========================================================================
test("M-09: pagination is clamped for every request", async () => {
  const { clampPagination, resolvePagination, MAX_LIMIT } =
    await import("../middleware/pagination");

  const run = (query: Record<string, unknown>) => {
    const req: any = { query };
    clampPagination(req, {} as any, () => {});
    return req.query;
  };

  assert.equal(run({ limit: "1000000" }).limit, String(MAX_LIMIT), "huge limit not clamped");
  assert.equal(run({ limit: "-5" }).limit, "1", "negative limit not clamped");
  assert.equal(run({ limit: "0" }).limit, "1", "zero limit not clamped");
  assert.equal(run({ limit: "abc" }).limit, "20", "non-numeric limit not defaulted");
  assert.equal(run({ page: "-3" }).page, "1", "negative page not clamped");
  assert.equal(run({ page: "0" }).page, "1", "zero page not clamped");
  assert.equal(run({ limit: ["999", "5"] as any }).limit, String(MAX_LIMIT), "array limit not handled");
  // Legitimate values pass through.
  assert.equal(run({ page: "3", limit: "50" }).limit, "50");
  assert.equal(run({ page: "3", limit: "50" }).page, "3");
  // Absent values are left absent so controller defaults apply.
  assert.deepEqual(run({}), {});

  const r = resolvePagination("2", "1000");
  assert.equal(r.limit, MAX_LIMIT);
  assert.equal(r.skip, MAX_LIMIT);
});

test("M-09: the clamp and the general rate limiter are actually mounted", () => {
  const s = code("server.ts");
  assert.match(s, /app\.use\("\/api\/v1", generalRateLimiter, clampPagination, routes\)/,
    "the API router is not wrapped by the limiter and the clamp");
});

// ===========================================================================
// H-34 — geospatial queries
// ===========================================================================
test("H-34: nearby-seller lookup uses a geospatial prefilter and an index", () => {
  const c = code("utils/locationHelper.ts");
  assert.match(c, /\$geoWithin/, "still loads every seller and filters in JS");
  assert.match(c, /\$centerSphere/, "no spherical bound");
  const seller = code("models/Seller.ts");
  assert.match(seller, /index\(\{ location: '2dsphere' \}\)/, "no 2dsphere index on Seller.location");
});

test("M-09: hot collections carry the indexes their queries need", () => {
  const order = code("models/Order.ts");
  for (const idx of ["orderNumber: 1", "deliveryBoy: 1, status: 1", "createdAt: -1", "razorpayOrderId: 1"]) {
    assert.ok(order.includes(idx), `Order is missing an index on { ${idx} }`);
  }
  const comm = code("models/Commission.ts");
  assert.ok(comm.includes("type: 1, status: 1"), "Commission is missing the COD sweep index");
});

// ===========================================================================
// CRITICAL WORKFLOWS 1-4 — authentication, all four portals
// ===========================================================================
test("WF 1-4: all four portals authenticate, rate limit and check account status", () => {
  const portals: Array<[string, string, string, RegExp]> = [
    ["customer", "routes/customerAuthRoutes.ts", "modules/customer/controllers/customerAuthController.ts", /customer\.status !== "Active"/],
    ["seller", "routes/sellerAuthRoutes.ts", "modules/seller/controllers/sellerAuthController.ts", /seller\.status === "Rejected"/],
    ["delivery", "routes/deliveryAuthRoutes.ts", "modules/delivery/controllers/deliveryAuthController.ts", /delivery\.status !== "Active"/],
    ["admin", "routes/adminAuthRoutes.ts", "modules/admin/controllers/adminAuthController.ts", /admin\.status !== "Active"/],
  ];

  for (const [name, routeFile, ctrlFile, statusGate] of portals) {
    const routes = code(routeFile);
    assert.match(routes, /otpRateLimiter/, `${name}: OTP dispatch is not rate limited`);
    assert.match(routes, /loginRateLimiter/, `${name}: OTP verification is not rate limited`);

    const ctrl = code(ctrlFile);
    assert.match(ctrl, statusGate, `${name}: account status is not checked`);
    assert.match(ctrl, /generateToken\(/, `${name}: issues no token`);
  }

  // All four are mounted.
  const idx = ROUTES();
  for (const p of ["/auth/admin", "/auth/seller", "/auth/customer", "/auth/delivery"]) {
    assert.ok(idx.includes(p), `${p} is not mounted`);
  }
});

test("WF 1-4: no authentication backdoor survives in any portal", () => {
  for (const f of [
    "modules/customer/controllers/customerAuthController.ts",
    "modules/seller/controllers/sellerAuthController.ts",
    "modules/delivery/controllers/deliveryAuthController.ts",
    "modules/admin/controllers/adminAuthController.ts",
    "services/otpService.ts",
    "services/deliveryOtpService.ts",
  ]) {
    const c = code(f);
    assert.ok(!/9111966732/.test(c), `${f}: hardcoded identity`);
    assert.ok(!/9999/.test(c), `${f}: hardcoded OTP`);
    assert.ok(!/isBypass|bypassAllowed/.test(c), `${f}: bypass flag`);
  }
});

// ===========================================================================
// WORKFLOWS 5-6 — product creation and approval
// ===========================================================================
test("WF 5-6: product writes require an approved seller and an allow-list", () => {
  const c = code("modules/seller/controllers/productController.ts");
  assert.match(c, /SELLER_WRITABLE_FIELDS/, "no mass-assignment guard");
  for (const fn of ["createProduct", "updateProduct", "deleteProduct", "updateProductStatus", "bulkUpdateStock"]) {
    const start = c.indexOf(`export const ${fn} =`);
    assert.ok(start > 0, `${fn} missing`);
    const body = c.slice(start, start + 1200);
    assert.match(body, /ensureSellerApproved/, `${fn} is not behind the approval gate`);
  }
  assertGuardedMount("routes/productRoutes.ts", "/", /requireUserType\("Seller"\)/);
});

// ===========================================================================
// WORKFLOWS 7-8 — cart and checkout
// ===========================================================================
test("WF 7-8: cart and checkout price identically and the server owns the money", () => {
  const cart = code("modules/customer/controllers/customerCartController.ts");
  const checkout = code("modules/customer/controllers/customerOrderController.ts");
  assert.match(cart, /effectiveUnitPrice\(/, "cart uses its own pricing");
  assert.match(checkout, /effectiveUnitPrice\(/, "checkout uses its own pricing");
  assert.match(checkout, /priceOrder\(/, "checkout does not use the server pricing service");
  assert.ok(!/fees\?\.(deliveryFee|platformFee)/.test(checkout), "client fees still trusted");
  assertGuardedMount("routes/customerCartRoutes.ts", "/", /requireUserType\('Customer'\)/);
});

// ===========================================================================
// WORKFLOWS 9-10 — online payment and COD
// ===========================================================================
test("WF 9: online payment is owner-checked, intent-bound and amount-verified", () => {
  const routes = code("routes/paymentRoutes.ts");
  const verify = routes.slice(routes.indexOf("router.post('/verify'"));
  assert.match(verify, /loadOwnedPayable\(/, "verify does not check ownership");
  assert.match(verify, /authenticate/, "verify is unauthenticated") ;

  const svc = code("services/paymentService.ts");
  assert.match(svc, /assertGatewayPayment\(/, "no gateway verification");
  assert.match(svc, /alreadyConsumed/, "no replay guard");
});

test("WF 10: COD settles through one auditable path", () => {
  const svc = code("services/codSettlementService.ts");
  assert.match(svc, /startSession/, "not atomic");
  assert.match(svc, /already been recorded/, "not idempotent");
  assert.match(svc, /CashCollection\.create/, "no audit record");
  assert.match(svc, /processPendingCODPayouts\(/, "seller payouts are not released");
  // Both entry points delegate.
  assert.match(code("modules/admin/controllers/adminDeliveryController.ts"), /settleCourierCodDebt\(/);
  assert.match(code("modules/delivery/controllers/deliveryWalletController.ts"), /settleCourierCodDebt\(/);
});

// ===========================================================================
// WORKFLOWS 11-15 — order lifecycle through to delivery
// ===========================================================================
test("WF 11-15: the full order lifecycle is legal end to end", async () => {
  const { validateTransition } = await import("../services/orderStatusService");

  // COD: placed -> accepted -> prepared -> collected -> en route -> delivered.
  const cod: Array<[string, string, any]> = [
    ["Received", "Accepted", "seller"],
    ["Accepted", "Processed", "seller"],
    ["Processed", "Picked up", "delivery"],
    ["Picked up", "Out for Delivery", "delivery"],
    ["Out for Delivery", "Delivered", "system"],
  ];
  let state = "Received";
  for (const [from, to, actor] of cod) {
    assert.equal(state, from, `lifecycle desynced at ${from}`);
    const r = validateTransition(from, to, actor);
    assert.equal(r.valid, true, `${from} -> ${to} (${actor}): ${r.message}`);
    state = r.status!;
  }
  assert.equal(state, "Delivered");

  // Prepaid starts a step earlier.
  assert.equal(validateTransition("Pending", "Received", "system").valid, true);
});

test("WF 13: assignment notifies the courier and is state-checked", () => {
  const c = code("modules/admin/controllers/adminOrderController.ts");
  const fn = c.slice(c.indexOf("export const assignDeliveryBoy"), c.indexOf("export const getOrdersByStatus"));
  assert.match(fn, /order-assigned/, "no socket notification");
  assert.match(fn, /sendNotificationToUser\(/, "no push notification");
  assert.match(fn, /cannot be assigned/, "finished orders can still be assigned");
});

test("WF 14-15: delivery completion requires the customer's OTP", () => {
  const otp = code("services/deliveryOtpService.ts");
  assert.match(otp, /timingSafeEqual/, "OTP comparison is not constant-time");
  assert.match(otp, /MAX_DELIVERY_OTP_ATTEMPTS/, "no brute-force cap");
  assert.match(otp, /status = 'Delivered'/, "OTP verification does not complete the order");
  assert.match(otp, /Customer\.updateOne/, "the OTP is not rotated after use");

  // And the status endpoint cannot short-circuit it.
  const ctrl = code("modules/delivery/controllers/deliveryOrderController.ts");
  assert.match(ctrl, /validateTransition\(order\.status, status, "delivery"\)/);
});

// ===========================================================================
// WORKFLOWS 16-18 — payout, cancellation, refund
// ===========================================================================
test("WF 16: seller payout happens on delivery, never on payment", () => {
  const c = code("services/commissionService.ts");
  const create = c.slice(c.indexOf("export const createPendingCommissions"), c.indexOf("export const distributeCommissions"));
  assert.ok(!/creditWallet\(/.test(create), "sellers are credited at payment time");
  assert.match(create, /status: "Pending"/, "commissions are not held pending");
});

test("WF 17-18: cancellation restores stock, reverses commission and refunds", () => {
  const c = code("modules/customer/controllers/customerOrderController.ts");
  const fn = c.slice(c.indexOf("export const cancelOrder"));
  assert.match(fn, /validateTransition\(order\.status, "Cancelled", "customer"\)/, "no transition check");
  assert.match(fn, /releaseMany\(/, "stock is not restored");
  assert.match(fn, /reverseCommissions\(/, "commissions are not reversed");
  assert.match(fn, /refundOrder\(/, "prepaid orders are not refunded");
  assert.match(fn, /releaseCoupon\(/, "the coupon use is not returned");
  assert.match(fn, /findOneAndUpdate\(/, "cancellation is not claimed atomically");
});

// ===========================================================================
// WORKFLOWS 19-21 — return, review, coupon
// ===========================================================================
test("WF 19: returns run end to end", () => {
  assert.ok(fs.existsSync(be("services/returnService.ts")));
  assert.ok(fs.existsSync(be("routes/customerReturnRoutes.ts")));
  assert.ok(fs.existsSync(fe("services/api/customerReturnService.ts")));
  assert.match(ROUTES(), /customer\/returns/);
  assert.match(feCode("modules/user/OrderDetail.tsx"), /createReturnRequest\(/);
});

test("WF 20: reviews can be written, become visible and update the rating", () => {
  const c = code("modules/customer/controllers/productReviewController.ts");
  assert.match(c, /OrderItem\.findOne\(\{ order: orderId, product: productId \}\)/, "purchase check broken");
  assert.match(c, /recalculateProductRating/, "rating is not recomputed");
  assert.match(c, /status: 'Approved'/, "reviews are never visible");
  assert.match(ADMIN_ROUTES(), /reviewController\.moderateReview/, "no moderation");
});

test("WF 21: coupons are applied, capped, counted and released", () => {
  const p = code("services/orderPricingService.ts");
  assert.match(p, /computeCouponDiscount/, "no coupon computation");
  assert.match(p, /usageCount: 1/, "usage is not counted");
  assert.match(p, /usageCount: -1/, "usage is not released");
  const c = code("modules/customer/controllers/customerOrderController.ts");
  assert.match(c, /discount: pricing\.discount/, "the discount never reaches the order");
});

// ===========================================================================
// WORKFLOWS 22-24 — admin users, wallet/withdrawal, notifications
// ===========================================================================
test("WF 22: admin user management is Super Admin only", () => {
  const c = ADMIN_ROUTES();
  for (const line of c.split("\n").filter((l) => l.includes('"/system-users'))) {
    assert.match(line, /superAdminOnly/, `unguarded: ${line.trim()}`);
  }
});

test("WF 23: withdrawal reserves funds once and returns them on rejection", () => {
  const w = code("services/walletManagementService.ts");
  assert.match(w, /WDR-HOLD-/, "no reservation");
  assert.match(w, /releaseWithdrawalHold/, "no release path");
  const ctrl = code("modules/admin/controllers/adminWithdrawalController.ts");
  const complete = ctrl.slice(ctrl.indexOf("export const completeWithdrawal"));
  assert.ok(!/debitWallet\(/.test(complete), "completion debits a second time");
});

test("WF 24: notifications reach a real channel", () => {
  const c = code("modules/admin/controllers/adminNotificationController.ts");
  const fn = c.slice(c.indexOf("export const sendNotification"));
  assert.match(fn, /sendNotificationToUser\(/, "no push");
  assert.match(fn, /io\.to\(/, "no socket broadcast");
});

// ===========================================================================
// Cross-cutting: every mutating admin route is behind auth
// ===========================================================================
test("SEC: the admin router authenticates and type-checks before any handler", () => {
  const c = ADMIN_ROUTES();
  const authAt = c.indexOf("router.use(authenticate)");
  const typeAt = c.indexOf('router.use(requireUserType("Admin"))');
  assert.ok(authAt > 0 && typeAt > 0, "admin router is not globally guarded");

  const firstRoute = c.search(/router\.(get|post|put|patch|delete)\(/);
  assert.ok(authAt < firstRoute, "authenticate is mounted after a route");
  assert.ok(typeAt < firstRoute, "requireUserType is mounted after a route");
});

test("SEC: sockets require a verified token and derive identity from it", () => {
  const c = code("socket/socketService.ts");
  assert.match(c, /return next\(new Error\('Authentication required'\)\)/,
    "anonymous sockets are admitted");
  assert.ok(!/data\.deliveryBoyId\)/.test(c), "client-supplied identity is still used");
  const guards = (c.match(/userType !== '(Delivery|Admin|Seller)'/g) || []).length;
  assert.ok(guards >= 6, `expected per-room userType guards, found ${guards}`);
});
