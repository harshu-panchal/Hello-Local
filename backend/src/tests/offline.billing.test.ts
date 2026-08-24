import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BE = path.join(process.cwd(), "src");

function code(rel: string): string {
  return fs.readFileSync(path.join(BE, rel), "utf8");
}

test("POS & OFFLINE: POS routes are mounted and protected with Seller role", () => {
  const routes = code("routes/orderRoutes.ts");
  assert.match(routes, /router\.get\("\/pos\/products",\s*getPOSProducts\)/, "POS products route missing");
  assert.match(routes, /router\.post\("\/offline",\s*createOfflineSale\)/, "Offline sale creation route missing");
  assert.match(routes, /router\.post\("\/offline\/:id\/cancel",\s*cancelOfflineSale\)/, "Offline sale cancel route missing");
  assert.match(routes, /router\.get\("\/bills",\s*getSellerBills\)/, "Seller bills route missing");
  assert.match(routes, /router\.get\("\/bills\/:id",\s*getBillById\)/, "Bill detail route missing");
  assert.match(routes, /requireUserType\("Seller"\)/, "Seller role check missing on order routes");
});

test("POS & OFFLINE: posController enforces seller approval and tenant isolation", () => {
  const posCtrl = code("modules/seller/controllers/posController.ts");
  assert.match(posCtrl, /ensureSellerApproved/, "Approval check missing");
  assert.match(posCtrl, /product\.seller\.toString\(\)\s*!==\s*sellerId/, "Cross-seller product guard missing");
  assert.match(posCtrl, /reserveMany/, "Atomic stock reservation missing");
  assert.match(posCtrl, /releaseMany/, "Compensating stock rollback missing");
});

test("POS & OFFLINE: server authoritatively resolves price and calculates tax/discount", () => {
  const posCtrl = code("modules/seller/controllers/posController.ts");
  assert.match(posCtrl, /effectiveUnitPrice/, "Price resolution from DB missing");
  assert.match(posCtrl, /resolveProductTaxRate/, "Tax resolution from DB missing");
  assert.match(posCtrl, /discountAmount\s*>\s*subtotal/, "Discount cap guard missing");
  assert.match(posCtrl, /orderChannel:\s*"OFFLINE"/, "Offline orderChannel tag missing");
  assert.match(posCtrl, /saleType:\s*"COUNTER_POS"/, "COUNTER_POS saleType missing");
  assert.match(posCtrl, /status:\s*"Delivered"/, "Delivered status for offline sales missing");
  assert.match(posCtrl, /paymentStatus:\s*"Paid"/, "Paid paymentStatus for offline sales missing");
});

test("POS & OFFLINE: Order model supports offline fields without breaking online requirements", () => {
  const orderModel = code("models/Order.ts");
  assert.match(orderModel, /orderChannel:\s*\{\s*type:\s*String/, "orderChannel missing in Order schema");
  assert.match(orderModel, /saleType:\s*\{\s*type:\s*String/, "saleType missing in Order schema");
  assert.match(orderModel, /billNumber:\s*\{\s*type:\s*String/, "billNumber missing in Order schema");
  assert.match(orderModel, /offlinePaymentDetails:/, "offlinePaymentDetails missing in Order schema");
  assert.match(orderModel, /this\.orderChannel\s*!==\s*"OFFLINE"/, "Conditional online required validator missing");
});
