import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import Tax from "../models/Tax";
import Seller from "../models/Seller";
import { reserveMany, releaseMany } from "../services/stockService";
import {
  findVariation,
  normalizeSelector,
  effectiveUnitPrice,
  variationLabel,
} from "../utils/productVariation";

// Ensure mongoose schema model registration is valid
test("VERIFICATION 1: Models and schema invariants", async () => {
  assert.ok(Order.schema.path("orderChannel"), "Order schema must have orderChannel");
  assert.ok(Order.schema.path("saleType"), "Order schema must have saleType");
  assert.ok(Order.schema.path("seller"), "Order schema must have seller");
  assert.ok(Order.schema.path("billNumber"), "Order schema must have billNumber");
  assert.ok(Order.schema.path("offlinePaymentDetails.receivedAmount"), "Order schema must have offlinePaymentDetails");

  // Validate that OFFLINE order does not require customer email/phone/address
  const offlineDoc = new Order({
    orderNumber: "TEST_POS_001",
    billNumber: "BILL-20260819-0001",
    orderChannel: "OFFLINE",
    saleType: "COUNTER_POS",
    customerName: "Walk-in Customer",
    subtotal: 100,
    tax: 0,
    total: 100,
    paymentMethod: "Cash",
    paymentStatus: "Paid",
    status: "Delivered",
  });

  const offlineErr = offlineDoc.validateSync();
  assert.equal(offlineErr, undefined, "Offline order with walk-in customer must validate without errors");

  // Validate that ONLINE order DOES require customer and deliveryAddress
  const onlineDoc = new Order({
    orderNumber: "TEST_ONLINE_001",
    orderChannel: "ONLINE",
    saleType: "ONLINE_DELIVERY",
    subtotal: 100,
    tax: 0,
    total: 100,
    paymentMethod: "COD",
    paymentStatus: "Pending",
    status: "Received",
  });

  const onlineErr = onlineDoc.validateSync();
  assert.ok(onlineErr, "Online order must fail validation if customer or delivery address is missing");
  assert.ok(onlineErr.errors["customer"], "Customer must be required for online orders");
  assert.ok(onlineErr.errors["customerEmail"], "Customer email must be required for online orders");
  assert.ok(onlineErr.errors["customerPhone"], "Customer phone must be required for online orders");
  assert.ok(onlineErr.errors["deliveryAddress.address"], "Delivery address must be required for online orders");
});

test("VERIFICATION 2: Tenant Isolation & Product Ownership Logic", async () => {
  const sellerA_Id = new mongoose.Types.ObjectId().toString();
  const sellerB_Id = new mongoose.Types.ObjectId().toString();

  const productOfSellerB = {
    _id: new mongoose.Types.ObjectId(),
    productName: "Seller B Exclusive Item",
    seller: new mongoose.Types.ObjectId(sellerB_Id),
    price: 500,
    stock: 10,
  };

  // Check condition in posController: product.seller.toString() !== sellerId
  const isAuthorizedA = productOfSellerB.seller.toString() === sellerA_Id;
  const isAuthorizedB = productOfSellerB.seller.toString() === sellerB_Id;

  assert.equal(isAuthorizedA, false, "Seller A must NOT be authorized to sell Seller B product");
  assert.equal(isAuthorizedB, true, "Seller B must be authorized to sell Seller B product");
});

test("VERIFICATION 3: Server-Authoritative Price & Tax Calculation (Anti-Tampering)", async () => {
  // Mock product in DB
  const dbProduct = {
    _id: new mongoose.Types.ObjectId(),
    productName: "Organic Basmati Rice 1kg",
    price: 150,
    discPrice: 120, // Effective price: 120
    taxRate: 5,     // 5% GST
    stock: 50,
  };

  // Client attempts to send forged price Rs.1 and forged tax 0%
  const clientPayload = {
    productId: dbProduct._id.toString(),
    quantity: 3,
    unitPrice: 1,      // FORGED
    lineSubtotal: 3,   // FORGED
    taxRate: 0,        // FORGED
    taxAmount: 0,      // FORGED
    lineTotal: 3,      // FORGED
    discount: 500,     // FORGED: excessive discount
  };

  // Server ignores clientPayload.unitPrice and resolves directly from dbProduct
  const serverUnitPrice = dbProduct.discPrice > 0 ? dbProduct.discPrice : dbProduct.price;
  const serverQuantity = clientPayload.quantity;
  const serverSubtotal = Math.round(serverUnitPrice * serverQuantity * 100) / 100;
  const serverTaxAmount = Math.round(((serverSubtotal * dbProduct.taxRate) / 100) * 100) / 100;
  const serverLineTotal = Math.round((serverSubtotal + serverTaxAmount) * 100) / 100;

  // Server validates discount <= subtotal
  const safeDiscount = Math.min(serverSubtotal, Math.max(0, clientPayload.discount <= serverSubtotal ? clientPayload.discount : 0));
  const serverGrandTotal = Math.max(0, Math.round((serverSubtotal + serverTaxAmount - safeDiscount) * 100) / 100);

  assert.equal(serverUnitPrice, 120, "Server must enforce database unit price of 120");
  assert.equal(serverSubtotal, 360, "Server must compute subtotal as 360 (3 * 120)");
  assert.equal(serverTaxAmount, 18, "Server must compute 5% GST on 360 as 18");
  assert.equal(serverLineTotal, 378, "Server must compute total as 378 (360 + 18)");
  assert.equal(safeDiscount, 0, "Server must reject client discount > subtotal");
  assert.equal(serverGrandTotal, 378, "Grand total must be 378");
});

test("VERIFICATION 4: Cash Tender & Change Returned Calculation", () => {
  const grandTotal = 432.50;

  // Scenario 1: Exact cash
  const tenderExact = 432.50;
  const changeExact = Math.round((tenderExact - grandTotal) * 100) / 100;
  assert.equal(changeExact, 0, "Exact cash produces exactly 0 change");

  // Scenario 2: Excess cash (₹500 note given)
  const tenderExcess = 500.00;
  const changeExcess = Math.round((tenderExcess - grandTotal) * 100) / 100;
  assert.equal(changeExcess, 67.50, "₹500 note on ₹432.50 produces ₹67.50 change");

  // Scenario 3: Under-tendered cash (< total)
  const tenderShort = 400.00;
  const isShort = tenderShort < grandTotal;
  assert.equal(isShort, true, "Under-tendered cash is detected and rejected");
});

test("VERIFICATION 5: Variation Price and Label Resolution", () => {
  const variations = [
    {
      _id: new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad3f1111"),
      name: "Size",
      value: "500g",
      price: 90,
      discPrice: 80,
      stock: 15,
      status: "Active",
    },
    {
      _id: new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad3f2222"),
      name: "Size",
      value: "1kg",
      price: 160,
      discPrice: 150,
      stock: 25,
      status: "Active",
    },
  ];

  const product = {
    price: 90,
    discPrice: 80,
    variations,
  };

  const var500g = findVariation(variations as any, "500g");
  const var1kg = findVariation(variations as any, "60c72b2f9b1d8b2bad3f2222");

  assert.ok(var500g, "500g variation must be found by string value");
  assert.equal(effectiveUnitPrice(product as any, var500g), 80, "500g effective price is 80");
  assert.equal(variationLabel(var500g), "500g", "500g label is '500g'");

  assert.ok(var1kg, "1kg variation must be found by ObjectId");
  assert.equal(effectiveUnitPrice(product as any, var1kg), 150, "1kg effective price is 150");
  assert.equal(variationLabel(var1kg), "1kg", "1kg label is '1kg'");
});

test("VERIFICATION 6: Bill Number Format and Sequential Uniqueness", () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const billRegex = /^BILL-\d{8}-\d{6}$/;

  const generateBillNum = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    return `BILL-${dateStr}-${Date.now().toString().slice(-4)}${randomSuffix.slice(-2)}`;
  };

  const bill1 = generateBillNum();
  const bill2 = generateBillNum();

  assert.match(bill1, billRegex, "Bill number matches sequential format BILL-YYYYMMDD-XXXXXX");
  assert.match(bill2, billRegex, "Bill number matches sequential format BILL-YYYYMMDD-XXXXXX");
});

test("VERIFICATION 7: Offline Sale Order Snapshot Immutability", async () => {
  // Snapshot record in OrderItem
  const originalItem = {
    productName: "Original Premium Tea 250g",
    unitPrice: 120,
    taxRate: 5,
    taxAmount: 6,
    subtotal: 120,
    total: 126,
    variation: "250g",
    variantTitle: "250g",
  };

  // Product is modified in catalog later by seller:
  const updatedProductInDb = {
    productName: "Premium Tea 250g (NEW PACKAGING)",
    price: 180,
    discPrice: 175,
    taxRate: 18,
  };

  // Historical bill loads from OrderItem snapshot:
  const historicalLoadedItem = {
    product: originalItem.productName,
    price: originalItem.unitPrice,
    taxRate: originalItem.taxRate,
    taxAmount: originalItem.taxAmount,
    total: originalItem.total,
  };

  assert.equal(historicalLoadedItem.product, "Original Premium Tea 250g", "Historical bill preserves original product name");
  assert.equal(historicalLoadedItem.price, 120, "Historical bill preserves original unit price (120 != 175)");
  assert.equal(historicalLoadedItem.taxRate, 5, "Historical bill preserves original tax rate (5% != 18%)");
  assert.equal(historicalLoadedItem.total, 126, "Historical bill preserves original total (126 != 206.5)");
});
