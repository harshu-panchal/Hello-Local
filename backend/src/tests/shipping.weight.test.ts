import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
process.env.NODE_ENV = "test";
import mongoose from "mongoose";
import Seller from "../models/Seller";
import Product from "../models/Product";
import Category from "../models/Category";
import SubCategory from "../models/SubCategory";
import Tax from "../models/Tax";
import Inventory from "../models/Inventory";
import HeaderCategory from "../models/HeaderCategory";
import Brand from "../models/Brand";
import { normalizeShippingWeight, SHIPPING_WEIGHT_MESSAGE } from "../utils/shippingWeight";
import { normalizeShippingWeight as reExported } from "../modules/seller/controllers/productController";
import { downloadSampleTemplate, bulkUploadProducts } from "../modules/seller/controllers/sellerBulkProductController";
import { quickAddMasterProductToStore, exportMasterCatalogueCsv } from "../modules/seller/controllers/sellerMasterCatalogController";
import * as adminProducts from "../modules/admin/controllers/adminProductController";
import { parseCsv } from "../utils/csvParser";

/**
 * Shipping weight on every product entry path: seller form (required for new
 * products), bulk upload, master catalogue, admin screens. Mocked models only.
 */

const fe = (rel: string) => fs.readFileSync(path.join(process.cwd(), "..", "frontend", "src", rel), "utf8");

function invoke(handler: any, req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const res: any = {
      statusCode: 200, headers: {} as Record<string, string>,
      status(code: number) { this.statusCode = code; return this; },
      setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
      json(data: any) { resolve({ statusCode: this.statusCode, data }); return this; },
      send(data: any) { resolve({ statusCode: this.statusCode, data, headers: this.headers }); return this; },
    };
    handler(req, res, reject);
  });
}

const restores: Array<() => void> = [];
function patch(object: any, key: string, value: any) {
  const previous = object[key];
  object[key] = value;
  restores.push(() => { object[key] = previous; });
}
function restoreAll() { restores.splice(0).reverse().forEach(r => r()); }
after(restoreAll);

const approvedSeller = () => {
  const seller: any = { _id: new mongoose.Types.ObjectId(), status: "Approved",
    subscription: { status: "active", endDate: new Date(Date.now() + 86400000) } };
  seller.select = () => seller;
  return seller;
};
const chain = (value: any) => { const q: any = { select: () => q, lean: () => q, then: (r: any, j: any) => Promise.resolve(value).then(r, j) }; return q; };

test("validator: shared rule, re-exported unchanged; blank or whitespace means 'not provided'", () => {
  assert.equal(reExported, normalizeShippingWeight);
  assert.equal(normalizeShippingWeight("0.5"), 0.5);
  assert.equal(normalizeShippingWeight(" 1.2345 "), 1.235);
  for (const empty of ["", "   ", null, undefined]) assert.equal(normalizeShippingWeight(empty), null, String(empty));
  for (const bad of ["abc", 0, -1, 0.0001, 1001, {}, "1e9", "2 kg"]) assert.equal(normalizeShippingWeight(bad), "INVALID", String(bad));
});

test("bulk template and master CSV export include a 'Shipping Weight (kg)' column after 'Unit / Variation'", async () => {
  for (const handler of [downloadSampleTemplate, exportMasterCatalogueCsv]) {
    const res = await invoke(handler, { query: {} });
    const { headers, rows } = parseCsv(res.data);
    assert.equal(headers[headers.indexOf("Unit / Variation") + 1], "Shipping Weight (kg)");
    assert.ok(rows.length > 0);
    assert.equal(rows[0].data["Shipping Weight (kg)"], "", "left for the seller to fill");
  }
});

function bulkWorld() {
  const seller = approvedSeller();
  patch(Seller, "findById", () => seller);
  const categoryId = new mongoose.Types.ObjectId();
  patch(Category, "find", () => chain([{ _id: categoryId, name: "Grocery", slug: "grocery" }]));
  patch(SubCategory, "find", () => chain([]));
  patch(Brand, "find", () => chain([]));
  patch(HeaderCategory, "find", () => chain([]));
  const created: any[] = [];
  patch(Product, "create", async (data: any) => { created.push(data); return { _id: new mongoose.Types.ObjectId(), ...data }; });
  patch(Inventory, "create", async (data: any) => data);
  return { seller, created };
}

test("bulk upload: weight column is read and validated per row; old CSVs without it keep working", async () => {
  try {
    const { seller, created } = bulkWorld();
    const csv = [
      "Product Name,Category,MRP,Selling Price,Stock,Unit / Variation,Shipping Weight (kg)",
      "Atta,Grocery,250,220,10,5 kg,5.2",
      "Rice,Grocery,120,99,5,1 kg,heavy",
      "Dal,Grocery,90,80,5,500 g,",
    ].join("\n");
    const res = await invoke(bulkUploadProducts, { user: { userId: String(seller._id) }, body: { csv } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(created.map(p => [p.productName, p.shippingWeightKg]), [["Atta", 5.2], ["Dal", undefined]]);
    assert.deepEqual(res.data.data.errors.map((e: any) => [e.productName, e.error]), [["Rice", SHIPPING_WEIGHT_MESSAGE]]);
    assert.equal(res.data.data.missingShippingWeightCount, 1);
    assert.match(res.data.message, /1 product\(s\) have no shipping weight yet/);
    // The variation column named "Weight" is NOT taken as shipping weight.
    created.length = 0;
    const legacy = ["Product Name,Category,MRP,Selling Price,Stock,Weight", "Sugar,Grocery,60,55,5,1 kg"].join("\n");
    const legacyRes = await invoke(bulkUploadProducts, { user: { userId: String(seller._id) }, body: { csv: legacy } });
    assert.equal(legacyRes.data.data.successCount, 1);
    assert.equal(created[0].shippingWeightKg, undefined);
    assert.equal(created[0].variations[0].value, "1 kg");
  } finally { restoreAll(); }
});

function masterWorld(existing: any = null) {
  const seller = approvedSeller();
  patch(Seller, "findById", () => seller);
  patch(HeaderCategory, "findOne", async () => ({ _id: new mongoose.Types.ObjectId() }));
  patch(Category, "findOne", async () => ({ _id: new mongoose.Types.ObjectId() }));
  patch(SubCategory, "findOne", async () => ({ _id: new mongoose.Types.ObjectId() }));
  patch(Brand, "findOne", async () => ({ _id: new mongoose.Types.ObjectId() }));
  patch(Tax, "findOne", async () => ({ _id: new mongoose.Types.ObjectId() }));
  patch(Product, "findOne", async () => existing);
  patch(Inventory, "findOneAndUpdate", async () => ({}));
  patch(Inventory, "create", async (data: any) => data);
  const saved: any[] = [];
  patch(Product.prototype, "save", async function (this: any) { saved.push(this.toObject ? this.toObject() : { ...this }); return this; });
  return { seller, saved };
}

test("master catalogue: weight is validated, stored on new products, and only fills a MISSING weight on existing ones", async () => {
  try {
    const { seller, saved } = masterWorld();
    const req = (body: any) => ({ user: { userId: String(seller._id) }, body: { masterProductId: "groc-001", ...body } });
    const bad = await invoke(quickAddMasterProductToStore, req({ shippingWeightKg: -2 }));
    assert.deepEqual([bad.statusCode, bad.data.message], [400, SHIPPING_WEIGHT_MESSAGE]);
    assert.equal(saved.length, 0, "nothing saved for an invalid weight");
    const ok = await invoke(quickAddMasterProductToStore, req({ shippingWeightKg: 5 }));
    assert.equal(ok.statusCode, 201);
    assert.equal(saved[0].shippingWeightKg, 5);
    const none = await invoke(quickAddMasterProductToStore, req({}));
    assert.equal(none.statusCode, 201, "still optional for API compatibility");
    assert.equal(saved[1].shippingWeightKg, undefined);
  } finally { restoreAll(); }

  for (const [current, expected] of [[undefined, 2.5], [1.1, 1.1]] as const) {
    try {
      const existing: any = { stock: 1, variations: [{ stock: 1 }], shippingWeightKg: current, save: async () => existing };
      const { seller } = masterWorld(existing);
      const res = await invoke(quickAddMasterProductToStore, { user: { userId: String(seller._id) }, body: { masterProductId: "groc-001", shippingWeightKg: 2.5 } });
      assert.equal(res.statusCode, 200);
      assert.equal(existing.shippingWeightKg, expected, current === undefined ? "missing weight filled" : "seller's weight never overwritten");
    } finally { restoreAll(); }
  }
});

test("admin product create / update / bulk import validate the weight the same way", async () => {
  try {
    const sellerId = new mongoose.Types.ObjectId();
    let sellerLookups = 0;
    patch(Seller, "findById", async () => { sellerLookups++; return { _id: sellerId }; });
    const created: any[] = [];
    patch(Product, "create", async (data: any) => { created.push(data); return { _id: new mongoose.Types.ObjectId(), ...data }; });
    patch(Inventory, "create", async (data: any) => data);
    const base = { productName: "Item", category: String(new mongoose.Types.ObjectId()), price: 100, seller: String(sellerId) };

    const bad = await invoke(adminProducts.createProduct, { body: { ...base, shippingWeightKg: "abc" }, user: {} });
    assert.deepEqual([bad.statusCode, bad.data.message, sellerLookups], [400, SHIPPING_WEIGHT_MESSAGE, 0]);
    const ok = await invoke(adminProducts.createProduct, { body: { ...base, shippingWeightKg: "0.75" }, user: {} });
    assert.equal(ok.statusCode, 201);
    assert.equal(created.at(-1).shippingWeightKg, 0.75);
    const blank = await invoke(adminProducts.createProduct, { body: { ...base, shippingWeightKg: "" }, user: {} });
    assert.equal(blank.statusCode, 201);
    assert.equal("shippingWeightKg" in created.at(-1), false, "blank is simply not stored");

    let productReads = 0;
    patch(Product, "findById", async () => { productReads++; return null; });
    const badUpdate = await invoke(adminProducts.updateProduct, { params: { id: String(new mongoose.Types.ObjectId()) }, body: { shippingWeightKg: 5000 } });
    assert.deepEqual([badUpdate.statusCode, productReads], [400, 0]);

    const bulk = await invoke(adminProducts.bulkImportProducts, { body: { products: [{ ...base, shippingWeightKg: 0 }, { ...base, shippingWeightKg: 3 }] } });
    assert.equal(bulk.statusCode, 200);
    const results = bulk.data.data ?? bulk.data;
    assert.equal(results.failed, 1);
    assert.equal(results.errors[0].error, SHIPPING_WEIGHT_MESSAGE);
    assert.equal(created.at(-1).shippingWeightKg, 3);
  } finally { restoreAll(); }
});

test("UI: weight is required for NEW seller products, optional-but-validated elsewhere, and sent by every screen", () => {
  const sellerForm = fe("modules/seller/pages/SellerAddProduct.tsx");
  assert.match(sellerForm, /if \(!id && !weightText\)/, "required when creating");
  assert.match(sellerForm, /label="Shipping weight per unit \(kg\)" required=\{!id\}/);
  assert.match(sellerForm, /weight < 0\.001 \|\| weight > 1000/, "validated on edit too");
  const adminForm = fe("modules/admin/pages/AdminAddProduct.tsx");
  assert.match(adminForm, /name="shippingWeightKg"/);
  assert.match(adminForm, /shippingWeightKg: formData\.shippingWeightKg\.trim\(\) === "" \? null : Number\(formData\.shippingWeightKg\)/);
  const master = fe("modules/seller/components/MasterCatalogueModal.tsx");
  assert.match(master, /\.\.\.\(weightText \? \{ shippingWeightKg: weight \} : \{\}\)/);
  const bulk = fe("modules/seller/components/SellerBulkProductModal.tsx");
  assert.match(bulk, /missingShippingWeightCount/);
});
