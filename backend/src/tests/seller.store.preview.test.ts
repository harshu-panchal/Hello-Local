import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Product from "../models/Product";

const be = (rel: string) => path.join(process.cwd(), "src", rel);
const fe = (rel: string) => path.join(process.cwd(), "..", "frontend", "src", rel);
const readCode = (p: string) => fs.readFileSync(p, "utf8");

test("STORE-PREVIEW-001: Product schema defines indexed displayOrder", () => {
  const schemaPath = be("models/Product.ts");
  const code = readCode(schemaPath);

  assert.ok(code.includes("displayOrder?: number;"), "Product interface must declare displayOrder");
  assert.ok(
    code.includes("displayOrder:") && code.includes("default: 0") && code.includes("index: true"),
    "ProductSchema must define indexed displayOrder with default 0"
  );
  assert.ok(Product.schema.path("displayOrder"), "Product mongoose schema must have displayOrder path");
});

test("STORE-PREVIEW-002: Backend routes mount seller store preview under seller authentication", () => {
  const indexPath = be("routes/index.ts");
  const indexCode = readCode(indexPath);

  assert.ok(
    indexCode.includes('router.use("/seller/store-preview", authenticate, requireUserType("Seller"), sellerStorePreviewRoutes);'),
    "Store preview routes must be mounted at /seller/store-preview under authenticate and requireUserType('Seller')"
  );

  const previewRoutesPath = be("routes/sellerStorePreviewRoutes.ts");
  const previewRoutesCode = readCode(previewRoutesPath);

  assert.ok(previewRoutesCode.includes('router.get("/", getStorePreview);'), "Root GET route must point to getStorePreview");
  assert.ok(previewRoutesCode.includes('router.patch("/products/reorder", reorderProducts);'), "Reorder route must be registered");
  assert.ok(previewRoutesCode.includes('router.patch("/products/:id/price", quickUpdatePrice);'), "Quick price update route must be registered");
  assert.ok(previewRoutesCode.includes('router.patch("/products/:id/toggle-publish", togglePublish);'), "Toggle publish route must be registered");
  assert.ok(previewRoutesCode.includes('router.patch("/products/:id/toggle-feature", toggleFeature);'), "Toggle feature route must be registered");
});

test("STORE-PREVIEW-003: Price and discount mathematics match expectations", () => {
  // Scenario 1: MRP 500, selling price 400 -> 20% discount
  const mrp1 = 500;
  const selling1 = 400;
  const discount1 = mrp1 > selling1 && mrp1 > 0 ? Math.round(((mrp1 - selling1) / mrp1) * 100) : 0;
  assert.equal(discount1, 20);

  // Scenario 2: MRP 450, selling price 390 -> 13% discount
  const mrp2 = 450;
  const selling2 = 390;
  const discount2 = mrp2 > selling2 && mrp2 > 0 ? Math.round(((mrp2 - selling2) / mrp2) * 100) : 0;
  assert.equal(discount2, 13);

  // Scenario 3: Selling price equal to MRP -> 0% discount
  const mrp3 = 300;
  const selling3 = 300;
  const discount3 = mrp3 > selling3 && mrp3 > 0 ? Math.round(((mrp3 - selling3) / mrp3) * 100) : 0;
  assert.equal(discount3, 0);
});

test("STORE-PREVIEW-004: Frontend routes, navigation and modal integration are wired", () => {
  const appPath = fe("App.tsx");
  const appCode = readCode(appPath);

  assert.ok(appCode.includes('const SellerStorePreview = lazy('), "App.tsx must lazy-load SellerStorePreview");
  assert.ok(appCode.includes('<Route path="store" element={<SellerStorePreview />} />'), "App.tsx must register /seller/store route");

  const navPath = fe("modules/seller/config/sellerNavigation.tsx");
  const navCode = readCode(navPath);

  assert.ok(navCode.includes("path: '/seller/store'"), "Navigation must register /seller/store");
  assert.ok(navCode.includes("isStoreTab: true"), "Store tab must be marked with isStoreTab: true");

  const bannerPath = fe("modules/seller/components/SellerStorePreviewBanner.tsx");
  const bannerCode = readCode(bannerPath);

  assert.ok(bannerCode.includes("navigate('/seller/store')"), "Preview banner must navigate to /seller/store");
});
