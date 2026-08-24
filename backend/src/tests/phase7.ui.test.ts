/**
 * PHASE 7 — UI/UX.
 * Asserts that controls the user can see are actually connected to something.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const fePath = (rel: string) => path.join(process.cwd(), "..", "frontend", "src", rel);
const strip = (t: string) => t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const feCode = (rel: string) => strip(fs.readFileSync(fePath(rel), "utf8"));
const bePath = (rel: string) => path.join(process.cwd(), "src", rel);
const beCode = (rel: string) => strip(fs.readFileSync(bePath(rel), "utf8"));

/** A handler referenced only once is defined but never bound to anything. */
function referenceCount(src: string, ident: string): number {
  return (src.match(new RegExp(`\\b${ident}\\b`, "g")) || []).length;
}

// ===========================================================================
// M-08 — customer pages that need a session are gated
// ===========================================================================
test("M-08: session-only customer routes are protected", () => {
  const app = feCode("App.tsx");
  assert.ok(fs.existsSync(fePath("components/RequireCustomer.tsx")), "no guard component");

  for (const route of [
    "orders", "orders/:id", "order-again", "account",
    "wishlist", "address-book", "addresses", "checkout", "checkout/address", "invoice/:id",
  ]) {
    const re = new RegExp(`path="${route.replace(/[:/]/g, "\\$&")}"[^\\n]*`);
    const line = app.match(re);
    assert.ok(line, `route ${route} not found`);
    assert.match(line![0], /RequireCustomer/, `route "${route}" is not gated`);
  }

  // Public browsing must stay public.
  for (const pub of ["search", "cart", "categories"]) {
    const line = app.match(new RegExp(`path="${pub}"[^\\n]*`));
    if (line) {
      assert.ok(!/RequireCustomer/.test(line[0]), `"${pub}" should stay public`);
    }
  }
});

test("M-08: the guard sends users to login and remembers the destination", () => {
  const c = feCode("components/RequireCustomer.tsx");
  assert.match(c, /Navigate to="\/login"/, "guard does not redirect to login");
  assert.match(c, /state=\{\{ from: location \}\}/, "guard forgets where the user was going");
});

// ===========================================================================
// Courier signup document loss
// ===========================================================================
test("UI: courier ID documents are actually submitted with registration", () => {
  const ui = feCode("modules/delivery/pages/DeliverySignUp.tsx");
  assert.match(ui, /drivingLicense: drivingLicenseUrl/,
    "the uploaded driving licence URL is still dropped");
  assert.match(ui, /nationalIdentityCard: nationalIdentityCardUrl/,
    "the uploaded ID card URL is still dropped");

  const svc = feCode("services/api/auth/deliveryAuthService.ts");
  assert.match(svc, /drivingLicense\?:/, "the register type has no document fields");

  const be = beCode("modules/delivery/controllers/deliveryAuthController.ts");
  assert.match(be, /drivingLicense,/, "the server does not read the documents");
  const create = be.slice(be.indexOf("await Delivery.create"));
  assert.match(create, /drivingLicense/, "the server does not persist the documents");
});

// ===========================================================================
// Dead controls are now either wired or gone
// ===========================================================================
test("UI: AdminUsers search, status filter and export are rendered", () => {
  const c = feCode("modules/admin/pages/AdminUsers.tsx");
  assert.ok(referenceCount(c, "setSearchTerm") > 1, "search input is still not rendered");
  assert.ok(referenceCount(c, "setStatusFilter") > 1, "status filter is still not rendered");
  assert.ok(referenceCount(c, "handleExport") > 1, "export button is still not rendered");
  assert.match(c, /id="user-search"/, "no search control");
  assert.match(c, /Export CSV/, "no export control");
  // The filter must offer the status the model now supports.
  assert.match(c, /value="Suspended"/, "Suspended is not filterable");
});

test("UI: the customer can refresh a stale delivery OTP", () => {
  const c = feCode("modules/user/OrderDetail.tsx");
  assert.ok(referenceCount(c, "handleRefreshOtp") > 1,
    "the refresh-OTP handler is still unreachable");
  assert.match(c, /Refresh delivery OTP/, "no refresh control rendered");
});

test("UI: the dead cross-portal login handlers are gone", () => {
  for (const [file, names] of [
    ["modules/admin/pages/AdminLogin.tsx", ["handleHelloLocalLogin", "handleSellerLogin"]],
    ["modules/seller/pages/SellerLogin.tsx", ["handleHelloLocalLogin", "handleAdminLogin"]],
  ] as Array<[string, string[]]>) {
    const c = feCode(file);
    for (const n of names) {
      assert.equal(referenceCount(c, n), 0, `${file}: ${n} is still present but unused`);
    }
  }
});

// ===========================================================================
// The cash-collection screen was a mock
// ===========================================================================
test("UI: recording a cash collection calls the real settlement endpoint", () => {
  const c = feCode("modules/admin/pages/AdminCashCollection.tsx");
  assert.ok(!/would be implemented here/.test(c),
    "the placeholder alert is still there");
  assert.match(c, /collectCashFromCourier\(/, "the handler does not call the API");
  assert.ok(referenceCount(c, "handleAddCollection") > 1,
    "the handler is still not bound to a control");
  assert.match(c, /Record cash collection/, "no trigger rendered");
  assert.match(c, /role="dialog"/, "no modal rendered");

  const svc = feCode("services/api/admin/adminDeliveryService.ts");
  assert.match(svc, /collect-cash/, "the service does not target the settlement route");
});

test("UI: the settlement endpoint the screen calls exists and is guarded", () => {
  const routes = beCode("routes/adminRoutes.ts");
  assert.match(routes, /delivery\/:id\/collect-cash/, "settlement route missing");
  // adminRoutes mounts authenticate + requireUserType("Admin") for everything.
  assert.match(routes, /router\.use\(authenticate\)/, "admin routes are unauthenticated");
  assert.match(routes, /requireUserType\("Admin"\)/, "admin routes are not type-scoped");
});
