import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import {
  findVariation,
  findVariationIndex,
  normalizeSelector,
  effectiveUnitPrice,
  variationLabel,
  VariationLike,
} from "../utils/productVariation";

const be = (rel: string) => path.join(process.cwd(), "src", rel);
const fe = (rel: string) => path.join(process.cwd(), "..", "frontend", "src", rel);
const readCode = (p: string) => fs.readFileSync(p, "utf8");

test("DEFECT-003: normalizeSelector resolves IDs, titles, values and objects consistently", () => {
  assert.equal(normalizeSelector(null), null);
  assert.equal(normalizeSelector(undefined), null);
  assert.equal(normalizeSelector(""), null);
  assert.equal(normalizeSelector("   "), null);
  assert.equal(normalizeSelector("500g"), "500g");
  assert.equal(normalizeSelector({ value: "1 kg" }), "1 kg");
  assert.equal(normalizeSelector({ title: "Family Pack" }), "Family Pack");
  assert.equal(normalizeSelector({ pack: "Combo" }), "Combo");

  const oid = new mongoose.Types.ObjectId();
  assert.equal(normalizeSelector({ _id: oid }), oid.toString());
});

test("DEFECT-003: findVariation resolves variations correctly and rejects ambiguous options", () => {
  const oid1 = new mongoose.Types.ObjectId();
  const oid2 = new mongoose.Types.ObjectId();

  const variations: VariationLike[] = [
    {
      _id: oid1,
      title: "Small (500g)",
      value: "500g",
      price: 250,
      discPrice: 220,
      stock: 10,
    },
    {
      _id: oid2,
      title: "Large (1kg)",
      value: "1kg",
      price: 450,
      discPrice: 400,
      stock: 5,
    },
  ];

  // Lookup by ObjectId string
  const vById = findVariation(variations, oid1.toString());
  assert.ok(vById, "Variation must be found by ObjectId string");
  assert.equal(vById?._id?.toString(), oid1.toString());
  assert.equal(vById?.price, 250);

  // Lookup by human-readable value (case-insensitive)
  const vByValue = findVariation(variations, "500G");
  assert.ok(vByValue, "Variation must be found by case-insensitive value");
  assert.equal(vByValue?._id?.toString(), oid1.toString());

  // Lookup by title
  const vByTitle = findVariation(variations, "Large (1kg)");
  assert.ok(vByTitle, "Variation must be found by title");
  assert.equal(vByTitle?._id?.toString(), oid2.toString());

  // Distinct variants are distinguished
  assert.notEqual(findVariationIndex(variations, "500g"), findVariationIndex(variations, "1kg"));

  // Non-matching variant returns null
  assert.equal(findVariation(variations, "unknown-option"), null);
  assert.equal(findVariation(variations, null), null);
  assert.equal(findVariation(variations, undefined), null);
});

test("DEFECT-003: authoritative variation pricing and label resolution", () => {
  const dummyProduct = {
    price: 300,
    discPrice: 0,
    variations: [
      { value: "500g", price: 250, discPrice: 200 },
      { value: "1kg", price: 450, discPrice: 0 },
    ],
  };

  const v1 = findVariation(dummyProduct.variations, "500g");
  const p1 = effectiveUnitPrice(dummyProduct as any, v1);
  assert.equal(p1, 200, "Should use variation discPrice when set");
  assert.equal(variationLabel(v1), "500g");

  const v2 = findVariation(dummyProduct.variations, "1kg");
  const p2 = effectiveUnitPrice(dummyProduct as any, v2);
  assert.equal(p2, 450, "Should use variation base price when discPrice is 0");
  assert.equal(variationLabel(v2), "1kg");
});

test("DEFECT-003: Backend customerOrderController rejects missing and invalid variants", () => {
  const controllerCode = readCode(be("modules/customer/controllers/customerOrderController.ts"));

  // Must verify selector normalization
  assert.match(controllerCode, /normalizeSelector\(/, "Controller must normalize variation selector");

  // Must check if variations exist and reject missing variant
  assert.match(controllerCode, /hasVariations\s*&&\s*!variation/, "Controller must reject missing variation");
  assert.match(controllerCode, /Please choose an option for/, "Controller must return 'Please choose an option' message");
  assert.match(controllerCode, /is not a valid option for/, "Controller must reject invalid option");
});

test("DEFECT-003: Frontend ProductCard enforces explicit variant selection for multi-variant products", () => {
  const cardCode = readCode(fe("modules/user/components/ProductCard.tsx"));

  // Must have multiple variations check
  assert.match(cardCode, /hasMultipleVariations/, "ProductCard must detect multiple variations");
  assert.match(cardCode, /setIsVariantModalOpen\(true\)/, "ProductCard must open modal when multi-variant product is clicked");
  assert.match(cardCode, /UserModal/, "ProductCard must render UserModal for option selection");
  assert.match(cardCode, /handleAddSelectedVariant/, "ProductCard must require explicit confirmation of chosen variant");

  // Must show options indicator on button
  assert.match(cardCode, /\+options/, "ProductCard button must show options indicator for multi-variant items");
});

test("DEFECT-003: Frontend CartContext preserves variant identity and prevents ambiguous additions", () => {
  const cartCode = readCode(fe("context/CartContext.tsx"));

  // CartContext must store variant on cart item
  assert.match(cartCode, /variant:\s*resolvedVariant/, "CartContext must attach resolvedVariant to CartItem");
  assert.match(cartCode, /itemVar === resolvedVariant/, "CartContext must match existing items by variant identity");
  assert.match(cartCode, /Cannot add multi-variant product without explicit variant selection/, "CartContext must guard against ambiguous multi-variant adds");
});

test("DEFECT-003: Frontend OrdersContext transmits selected variant in order payload", () => {
  const ordersCode = readCode(fe("context/OrdersContext.tsx"));

  assert.match(ordersCode, /variant:\s*[\s\S]*item\.variant/, "OrdersContext must map variant into createOrder payload");
});
