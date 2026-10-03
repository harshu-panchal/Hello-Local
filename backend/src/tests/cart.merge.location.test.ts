import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const be = (rel: string) => path.join(process.cwd(), "src", rel);
const fe = (rel: string) => path.join(process.cwd(), "..", "frontend", "src", rel);
const readCode = (p: string) => fs.readFileSync(p, "utf8");

test("DEFECT-001: customerCartRoutes mounts POST /merge endpoint with Customer auth", () => {
  const code = readCode(be("routes/customerCartRoutes.ts"));
  assert.ok(code.includes("mergeCart"), "customerCartRoutes must import mergeCart");
  assert.ok(code.includes("router.post('/merge', mergeCart);") || code.includes('router.post("/merge", mergeCart);'), "POST /merge route must be mounted");
  assert.ok(code.includes("router.use(authenticate);"), "Cart routes must require authentication");
  assert.ok(code.includes("router.use(requireUserType('Customer'));") || code.includes('router.use(requireUserType("Customer"));'), "Cart routes must require Customer user type");
});

test("DEFECT-001: mergeCart controller supports idempotent Math.max reconciliation and robust parsing", () => {
  const code = readCode(be("modules/customer/controllers/customerCartController.ts"));
  assert.ok(code.includes("export const mergeCart = async"), "customerCartController must export mergeCart");
  assert.ok(code.includes("Math.max(existingCartItem.quantity, quantity)"), "mergeCart must use Math.max to prevent exponential item multiplication");
  assert.ok(code.includes("req.body.items || req.body.guestItems"), "mergeCart must parse both body.items and body.guestItems flexibly");
  assert.ok(code.includes("findSellersWithinRange"), "mergeCart must verify seller service range");
});

test("DEFECT-002: Location coordinate validation strictly enforced on backend addToCart and mergeCart", () => {
  const code = readCode(be("modules/customer/controllers/customerCartController.ts"));
  // addToCart validation
  assert.ok(code.includes("userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)"), "addToCart and mergeCart must strictly validate coordinates");
  assert.ok(code.includes("Location is required to add items to cart"), "addToCart must provide explicit location required message");
  assert.ok(code.includes("Location is required to sync cart items"), "mergeCart must provide explicit location required message");
});

test("DEFECT-001: Frontend customerCartService exports mergeCart API sending items and guestItems", () => {
  const code = readCode(fe("services/api/customerCartService.ts"));
  assert.ok(code.includes("export const mergeCart = async"), "customerCartService must export mergeCart");
  assert.ok(code.includes("api.post<CartResponse>('/customer/cart/merge'"), "mergeCart must call /customer/cart/merge");
  assert.ok(code.includes("guestItems") && code.includes("items"), "mergeCart must transmit payload items");
});

test("DEFECT-002: Frontend LocationContext and types define modal controls", () => {
  const typesCode = readCode(fe("context/locationContext.types.ts"));
  assert.ok(typesCode.includes("isLocationModalOpen: boolean;"), "LocationContextType must declare isLocationModalOpen");
  assert.ok(typesCode.includes("openLocationModal: () => void;"), "LocationContextType must declare openLocationModal");
  assert.ok(typesCode.includes("closeLocationModal: () => void;"), "LocationContextType must declare closeLocationModal");

  const contextCode = readCode(fe("context/LocationContext.tsx"));
  assert.ok(contextCode.includes("const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);"), "LocationContext must maintain isLocationModalOpen state");
  assert.ok(contextCode.includes("openLocationModal"), "LocationContext must provide openLocationModal callback");
  assert.ok(contextCode.includes("closeLocationModal"), "LocationContext must provide closeLocationModal callback");
});

test("DEFECT-002: Frontend AppLayout binds isLocationModalOpen to canonical LocationPermissionRequest", () => {
  const code = readCode(fe("components/AppLayout.tsx"));
  assert.ok(code.includes("isLocationModalOpen"), "AppLayout must consume isLocationModalOpen");
  assert.ok(code.includes("closeLocationModal"), "AppLayout must consume closeLocationModal");
  assert.ok(code.includes("<LocationPermissionRequest"), "AppLayout must render canonical LocationPermissionRequest modal");
});

test("DEFECT-001 & DEFECT-002: Frontend CartContext intercepts unset location and merges guest cart on login", () => {
  const code = readCode(fe("context/CartContext.tsx"));
  // Defect 2 intercept
  assert.ok(code.includes("openLocationModal();"), "CartContext must trigger openLocationModal when location is unset during authenticated add");
  assert.ok(code.includes("hasLocation"), "CartContext must verify location presence before issuing backend cart add");
  
  // Defect 1 merge
  assert.ok(code.includes("apiMergeCart"), "CartContext must call apiMergeCart on login");
  assert.ok(code.includes("mergeGuestItems"), "CartContext must define mergeGuestItems helper");
  assert.ok(code.includes("guestItemsToMergeRef"), "CartContext must track guest items during login transition");
});
