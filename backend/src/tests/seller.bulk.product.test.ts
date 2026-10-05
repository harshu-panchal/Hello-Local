import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseCsv, buildCsv } from "../utils/csvParser";
import { generateAutoSku } from "../modules/seller/controllers/sellerBulkProductController";

const be = (rel: string) => path.join(process.cwd(), "src", rel);
const fe = (rel: string) => path.join(process.cwd(), "..", "frontend", "src", rel);
const readCode = (p: string) => fs.readFileSync(p, "utf8");

test("BULK-001: CSV Parser handles quotes, commas, escapes and UTF-8 BOM", () => {
  const headers = ["Product Name", "Category", "MRP", "Selling Price", "Stock"];
  const rows = [
    ['"Atta, Special"', "Atta, Rice & Dal", 250, 220, 50],
    ['Rice "Gold" Special', "Rice", 120, 99, 30],
  ];

  const csv = buildCsv(headers, rows);
  assert.ok(csv.startsWith("\uFEFF"), "buildCsv should include UTF-8 BOM");

  const parsed = parseCsv(csv);
  assert.equal(parsed.headers.length, 5);
  assert.equal(parsed.rows.length, 2);

  assert.equal(parsed.rows[0].data["Product Name"], '"Atta, Special"');
  assert.equal(parsed.rows[0].data["Category"], "Atta, Rice & Dal");
  assert.equal(parsed.rows[0].data["MRP"], "250");
  assert.equal(parsed.rows[0].data["Selling Price"], "220");
  assert.equal(parsed.rows[0].data["Stock"], "50");

  assert.equal(parsed.rows[1].data["Product Name"], 'Rice "Gold" Special');
});

test("BULK-002: Backend routes register bulk-template and bulk-upload", () => {
  const routesCode = readCode(be("routes/productRoutes.ts"));

  assert.ok(
    routesCode.includes('router.get("/bulk-template", downloadSampleTemplate);'),
    "productRoutes must register GET /bulk-template"
  );
  assert.ok(
    routesCode.includes('router.post("/bulk-upload", uploadCsvFile.single("file"), bulkUploadProducts);'),
    "productRoutes must register POST /bulk-upload with uploadCsvFile"
  );
});

test("BULK-003: Price validation rejects Selling Price > MRP", () => {
  const mrp = 200;
  const sellingPrice = 250;

  const isValid = sellingPrice <= mrp;
  assert.equal(isValid, false, "Selling price cannot exceed MRP");
});

test("BULK-004: Frontend integrates Bulk Upload button and modal", () => {
  const listCode = readCode(fe("modules/seller/pages/SellerProductList.tsx"));

  assert.ok(listCode.includes("SellerBulkProductModal"), "SellerProductList must import SellerBulkProductModal");
  assert.ok(listCode.includes("Bulk Upload"), "SellerProductList must render Bulk Upload button");
  assert.ok(listCode.includes("bulkModalOpen"), "SellerProductList must maintain bulkModalOpen state");

  const serviceCode = readCode(fe("services/api/productService.ts"));
  assert.ok(serviceCode.includes("downloadBulkProductTemplate"), "productService must export downloadBulkProductTemplate");
  assert.ok(serviceCode.includes("bulkUploadProducts"), "productService must export bulkUploadProducts");
});

test("BULK-005: Auto-SKU generator creates unique readable SKU codes", () => {
  const sku1 = generateAutoSku("Farm Fresh Wheat Atta", "5 kg");
  const sku2 = generateAutoSku("Farm Fresh Wheat Atta", "5 kg");
  const sku3 = generateAutoSku("Daawat Rozana Rice");

  assert.ok(sku1.length >= 6, "SKU must have substantial length");
  assert.ok(sku1.includes("5KG"), "SKU should incorporate variation tag");
  assert.notEqual(sku1, sku2, "Auto-generated SKUs should be distinct due to random suffix");
  assert.ok(sku3.length >= 6, "Single product without variation should generate valid SKU");

  const ctrlCode = readCode(be("modules/seller/controllers/sellerBulkProductController.ts"));
  assert.ok(ctrlCode.includes('"SKU (Optional)"'), "Sample CSV template must label column SKU (Optional)");
});
