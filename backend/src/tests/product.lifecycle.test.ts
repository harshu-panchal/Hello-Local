import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import Product from "../models/Product";

const be = (rel: string) => path.join(process.cwd(), "src", rel);
const fe = (rel: string) => path.join(process.cwd(), "..", "frontend", "src", rel);
const readCode = (p: string) => fs.readFileSync(p, "utf8");

test("PRODUCT LIFECYCLE #1: ProductSchema pre-save computes compareAtPrice, discount, and mrp virtual correctly", () => {
  const prodDoc = new Product({
    productName: "Test Himalayan Salt",
    seller: new mongoose.Types.ObjectId(),
    category: new mongoose.Types.ObjectId(),
    variations: [
      {
        name: "Weight",
        value: "1 kg",
        title: "1 kg Pack",
        price: 500, // MRP
        discPrice: 400, // Selling price
        stock: 25,
      },
    ],
  });

  // Trigger pre-save hook manually
  const schema = (Product as any).schema;
  const preSaveFns = schema.s.hooks._pres.get("save");
  assert.ok(preSaveFns && preSaveFns.length > 0, "Product schema must have pre-save hook");

  for (const hook of preSaveFns) {
    hook.fn.call(prodDoc, () => {});
  }

  assert.equal(prodDoc.price, 500, "Top-level price must sync from variations[0].price");
  assert.equal(prodDoc.discPrice, 400, "Top-level discPrice must sync from variations[0].discPrice");
  assert.equal(prodDoc.compareAtPrice, 500, "compareAtPrice must be populated from variations[0].price (MRP)");
  assert.equal(prodDoc.discount, 20, "Discount must be calculated as 20% ((500-400)/500 * 100)");
  assert.equal(prodDoc.mrp, 500, "Virtual mrp must return compareAtPrice or price");
  assert.equal(prodDoc.stock, 25, "Top-level stock must sum variations stock");
});

test("PRODUCT LIFECYCLE #2: ProductSchema mrp virtual safely falls back to price when compareAtPrice is unset", () => {
  const prodDoc = new Product({
    productName: "Non-discounted Product",
    price: 350,
    seller: new mongoose.Types.ObjectId(),
    category: new mongoose.Types.ObjectId(),
  });

  assert.equal(prodDoc.mrp, 350, "Virtual mrp must fall back to price when compareAtPrice is unset");
});

test("PRODUCT LIFECYCLE #3: Seller productController guards against missing variations and empty strings", () => {
  const code = readCode(be("modules/seller/controllers/productController.ts"));

  // Check variation price validation loop is guarded
  assert.ok(
    /if\s*\(\s*productData\.variations\s*&&\s*Array\.isArray\(productData\.variations\)\s*\)/.test(code),
    "productController createProduct must guard the variation price loop with Array.isArray check",
  );

  // Check compareAtPrice & discount calculation in createProduct
  assert.ok(
    /newProductData\.compareAtPrice\s*=\s*newProductData\.variations\[0\]\.price/.test(code),
    "productController createProduct must set compareAtPrice from variations[0].price",
  );

  // Check cleanup of optional empty ObjectId/string fields
  assert.ok(
    /delete newProductData\.subSubCategory/.test(code),
    "productController createProduct must delete falsy subSubCategory to avoid CastError",
  );
  assert.ok(
    /delete newProductData\.tax/.test(code),
    "productController createProduct must delete falsy tax to avoid CastError",
  );
  assert.ok(
    /delete newProductData\.shopId/.test(code),
    "productController createProduct must delete falsy shopId",
  );

  // Check updateProduct empty string cleanups
  assert.ok(
    /updateData\.subSubCategory\s*===\s*""\s*\)\s*updateData\.subSubCategory\s*=\s*null/.test(code),
    "productController updateProduct must normalize empty subSubCategory to null",
  );
  assert.ok(
    /updateData\.tax\s*===\s*""\s*\)\s*updateData\.tax\s*=\s*null/.test(code),
    "productController updateProduct must normalize empty tax to null",
  );
});

test("PRODUCT LIFECYCLE #4: Frontend SellerAddProduct preserves existing galleryImages on edit and displays variation titles", () => {
  const code = readCode(fe("modules/seller/pages/SellerAddProduct.tsx"));

  // Must read galleryImages from backend model
  assert.ok(
    /galleryImageUrls:\s*product\.galleryImageUrls\s*\|\|\s*product\.galleryImages\s*\|\|\s*\[\]/.test(code),
    "SellerAddProduct must load product.galleryImages into formData.galleryImageUrls",
  );

  // Must populate previews from product.galleryImages
  assert.ok(
    /product\.galleryImageUrls\s*\|\|\s*product\.galleryImages/.test(code),
    "SellerAddProduct must initialize gallery image previews using galleryImages",
  );

  // Must append new uploads instead of replacing
  assert.ok(
    /galleryImageUrls\s*=\s*\[\.\.\.galleryImageUrls,\s*\.\.\.uploadedGalleryUrls\]/.test(code),
    "SellerAddProduct must append newly uploaded gallery images to existing galleryImageUrls",
  );

  // Must remove from formData.galleryImageUrls when user removes a preview
  assert.ok(
    /galleryImageUrls:\s*prev\.galleryImageUrls\.filter/.test(code),
    "SellerAddProduct removeGalleryImage must update formData.galleryImageUrls",
  );

  // Variant title must fall back to value
  assert.ok(
    /v\.title\s*\|\|\s*\(v as any\)\.value/.test(code),
    "SellerAddProduct must fallback to v.value for variant title in table display",
  );

  // Tags must be safely guarded with Array.isArray
  assert.ok(
    /Array\.isArray\(product\.tags\)/.test(code),
    "SellerAddProduct must guard product.tags with Array.isArray",
  );
});

test("PRODUCT LIFECYCLE #5: Frontend AdminAddProduct preserves gallery images and appends uploads", () => {
  const code = readCode(fe("modules/admin/pages/AdminAddProduct.tsx"));

  assert.ok(
    /galleryImageUrls:\s*prev\.galleryImageUrls\.filter/.test(code),
    "AdminAddProduct removeGalleryImage must update formData.galleryImageUrls",
  );

  assert.ok(
    /galleryImageUrls\s*=\s*\[\.\.\.galleryImageUrls,\s*\.\.\.uploadedGalleryUrls\]/.test(code),
    "AdminAddProduct must append newly uploaded gallery images to existing galleryImageUrls",
  );
});
