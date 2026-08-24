/**
 * PHASE 6 — storefront correctness.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_harness";

const srcPath = (rel: string) => path.join(process.cwd(), "src", rel);
const strip = (t: string) => t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const code = (rel: string) => strip(fs.readFileSync(srcPath(rel), "utf8"));

// ===========================================================================
// H-14 — only approved sellers are sellable from
// ===========================================================================
test("H-14: the storefront seller lookup filters on Approved", () => {
  const c = code("utils/locationHelper.ts");
  assert.match(c, /status:\s*"Approved"/, "the approval filter is still disabled");
  assert.ok(!/\/\/\s*status:\s*"Approved"/.test(fs.readFileSync(srcPath("utils/locationHelper.ts"), "utf8")),
    "the approval filter is still commented out");
});

test("H-14: checkout independently refuses non-approved sellers", () => {
  const c = code("modules/customer/controllers/customerOrderController.ts");
  assert.match(c, /seller\.status !== "Approved"/,
    "checkout does not verify seller approval");
  assert.match(c, /is not currently accepting orders/,
    "no rejection message for unapproved sellers");
  // The old silent-skip shape is gone.
  assert.ok(!/status: "Approved",\s*\n\s*location: \{ \$exists: true, \$ne: null \}/.test(c),
    "checkout still filters sellers out of the result set instead of rejecting");
});

// ===========================================================================
// H-22 — product mass assignment
// ===========================================================================
test("H-22: sellers cannot set rating, review counts or approval fields", () => {
  const c = code("modules/seller/controllers/productController.ts");
  assert.match(c, /SELLER_WRITABLE_FIELDS/, "no allow-list on product creation");

  const listMatch = c.match(/SELLER_WRITABLE_FIELDS = \[([\s\S]*?)\]/);
  assert.ok(listMatch, "allow-list not found");
  const list = listMatch![1];
  for (const forbidden of ["rating", "reviewsCount", "approvedBy", "approvedAt", "commission", "seller", "status"]) {
    assert.ok(
      !new RegExp(`["']${forbidden}["']`).test(list),
      `"${forbidden}" must not be seller-writable`,
    );
  }
  // Legitimate fields survive.
  for (const allowed of ["productName", "price", "stock", "variations"]) {
    assert.ok(new RegExp(`["']${allowed}["']`).test(list), `"${allowed}" should be writable`);
  }
  // The wholesale spread is gone.
  assert.ok(!/\.\.\.productData,\s*\n\s*seller: sellerId/.test(c),
    "the request body is still spread into the model");
});

// ===========================================================================
// H-32 — suspension works and is enforced
// ===========================================================================
test("H-32: Suspended is a real status the API accepts", () => {
  const model = code("models/Customer.ts");
  assert.match(model, /enum: \['Active', 'Inactive', 'Suspended'\]/,
    "Customer.status does not allow Suspended");

  const ctrl = code("modules/admin/controllers/adminCustomerController.ts");
  assert.match(ctrl, /"Suspended"/, "the admin endpoint still rejects Suspended");
});

test("H-32: a suspended customer cannot log in", () => {
  const c = code("modules/customer/controllers/customerAuthController.ts");
  // The gate is `!== "Active"`, which covers Inactive and Suspended alike.
  assert.match(c, /customer\.status !== "Active"/,
    "login does not reject non-active customers");
});

// ===========================================================================
// H-11 / M-15 — upload hardening
// ===========================================================================
test("H-11: uploads verify real file bytes, not the declared MIME type", async () => {
  const { assertRealFileType } = await import("../middleware/upload");

  const png = Buffer.from("89504E470D0A1A0A0000000D49484452", "hex");
  const jpeg = Buffer.concat([Buffer.from("FFD8FF", "hex"), Buffer.alloc(16)]);
  const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(16)]);
  const webp = Buffer.concat([
    Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), Buffer.alloc(8),
  ]);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7", "ascii"), Buffer.alloc(16)]);

  // Real files pass.
  assert.equal(assertRealFileType(png, ["image"]), null);
  assert.equal(assertRealFileType(jpeg, ["image"]), null);
  assert.equal(assertRealFileType(gif, ["image"]), null);
  assert.equal(assertRealFileType(webp, ["image"]), null);
  assert.equal(assertRealFileType(pdf, ["image", "pdf"]), null);

  // An executable relabelled as an image does not.
  const exe = Buffer.concat([Buffer.from("MZ", "ascii"), Buffer.alloc(32)]);
  assert.ok(assertRealFileType(exe, ["image"]), "an EXE was accepted as an image");
  assert.ok(assertRealFileType(exe, ["image", "pdf"]), "an EXE was accepted as a document");

  // A PDF is not an image.
  assert.ok(assertRealFileType(pdf, ["image"]), "a PDF was accepted where only images are allowed");

  // Empty / truncated.
  assert.ok(assertRealFileType(Buffer.alloc(0), ["image"]));
  assert.ok(assertRealFileType(Buffer.alloc(4), ["image"]));
});

test("H-11: onboarding uploads are rate limited", () => {
  const c = code("routes/uploadRoutes.ts");
  assert.match(c, /onboardingUploadLimiter/, "no rate limiter on public uploads");
  for (const route of ['"/document"', '"/documents"']) {
    const i = c.indexOf(route);
    assert.ok(i > 0, `${route} not found`);
    const block = c.slice(i, i + 200);
    assert.match(block, /onboardingUploadLimiter/, `${route} is not rate limited`);
  }
});

test("M-15: the upload folder comes from an allow-list", () => {
  const c = code("routes/uploadRoutes.ts");
  assert.match(c, /ALLOWED_FOLDERS/, "no folder allow-list");
  assert.match(c, /resolveFolder\(/, "folder is not resolved through the allow-list");
  assert.ok(!/req\.body\.folder as string\) \|\|/.test(c),
    "folder is still taken raw from the request body");
});

// ===========================================================================
// H-12 — asset deletion ownership
// ===========================================================================
test("H-12: a seller can only delete assets attached to their own listings", () => {
  const c = code("routes/uploadRoutes.ts");
  const del = c.slice(c.indexOf('router.delete('));
  assert.match(del, /userType === "Seller"/, "no seller-specific ownership branch");
  assert.match(del, /Product\.exists\(\{\s*seller: sellerId/, "ownership is not verified against the seller's products");
  assert.match(del, /You can only delete images attached to your own listings/,
    "no rejection for a foreign asset");
  // And the route must be able to match nested public ids.
  assert.match(c, /router\.delete\(\s*\n?\s*"\/\*"/, "the route still cannot match ids containing slashes");
});

test("Cloudinary namespace matches the product", () => {
  const c = code("config/cloudinary.ts");
  assert.ok(!/dhakadsnazzy/.test(c), "folders still use another project's namespace");
  assert.match(c, /hellolocal\//, "folders are not namespaced to hellolocal");
  assert.match(c, /ONBOARDING_DOCUMENTS/, "onboarding folder is not a named constant");
});

// ===========================================================================
// H-30 — delivery assignment
// ===========================================================================
test("H-30: assignment notifies the courier and refuses finished orders", () => {
  const c = code("modules/admin/controllers/adminOrderController.ts");
  const fn = c.slice(c.indexOf("export const assignDeliveryBoy"), c.indexOf("export const getOrdersByStatus"));
  assert.match(fn, /order-assigned/, "no socket event on assignment");
  assert.match(fn, /sendNotificationToUser\(/, "no push notification on assignment");
  assert.match(fn, /cannot be assigned/, "a finished order can still be assigned");
  assert.match(fn, /deliveryBoy\.status !== "Active"/, "an inactive courier can still be assigned");
});

// ===========================================================================
// H-28 — Admin Payments
// ===========================================================================
test("H-28: the commission report endpoint the UI calls now exists", () => {
  const c = code("routes/adminRoutes.ts");
  assert.match(c, /"\/wallet\/commissions"/, "the endpoint is still missing");
  // And it returns the shape AdminPayments.tsx reads.
  const block = c.slice(c.indexOf('"/wallet/commissions"'));
  assert.match(block, /commissions/, "response has no commissions array");
  assert.match(block, /totalCommissions/, "response has no summary.totalCommissions");
  assert.match(block, /pendingCommissions/, "response has no summary.pendingCommissions");
});

// ===========================================================================
// H-26 — no debug push on login (verified again after the session refactor)
// ===========================================================================
test("H-26: the login test-notification call is gone", () => {
  const p = path.join(process.cwd(), "..", "frontend", "src", "context", "AuthContext.tsx");
  const c = strip(fs.readFileSync(p, "utf8"));
  assert.ok(!/fcm-tokens\/test/.test(c), "login still fires a test push");
});
