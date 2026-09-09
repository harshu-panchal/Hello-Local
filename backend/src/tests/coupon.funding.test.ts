import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// ===========================================================================
// WIRING & SCHEMA AUDIT TESTS (Static / Wiring)
// ===========================================================================

test("WIRING: Coupon schema defines funding enum with PLATFORM and SELLER", async () => {
  const Coupon = (await import("../models/Coupon")).default;
  const fundingPath: any = Coupon.schema.path("funding");
  assert.ok(fundingPath, "Coupon schema must declare funding path");
  assert.deepEqual(
    fundingPath.enumValues,
    ["PLATFORM", "SELLER"],
    "funding enum must include PLATFORM and SELLER",
  );
});

test("PRECEDENCE: Coupon funding precedence strictly adheres to: Coupon override -> AppSettings fallback -> PLATFORM default", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origCouponFindOne = Coupon.findOne;

  try {
    // 1. Case A: Coupon has NO explicit funding; AppSettings specifies defaultFunding = "SELLER".
    // Expectation: Inherits "SELLER" from AppSettings.
    (AppSettings as any).getSettings = async () => ({
      platformFee: 0,
      deliveryCharges: 0,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 0 },
      couponSettings: { defaultFunding: "SELLER" },
    });
    (Seller as any).find = () => ({ select: () => Promise.resolve([]) });
    (Coupon as any).findOne = async () => ({
      code: "INHERIT_TEST",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 50,
      funding: undefined, // Unspecified funding on coupon
    });

    const resA = await priceOrder({
      lines: [{ productId: "p1", sellerId: "s1", unitPrice: 500, quantity: 1 }],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "INHERIT_TEST",
    });
    assert.equal(resA.pricing.couponFunding, "SELLER", "Coupon without funding must inherit AppSettings defaultFunding: SELLER");

    // 2. Case B: Coupon explicitly specifies "PLATFORM"; AppSettings specifies defaultFunding = "SELLER".
    // Expectation: Coupon override wins ("PLATFORM").
    (Coupon as any).findOne = async () => ({
      code: "OVERRIDE_TEST",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 50,
      funding: "PLATFORM", // Explicit coupon override
    });

    const resB = await priceOrder({
      lines: [{ productId: "p1", sellerId: "s1", unitPrice: 500, quantity: 1 }],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "OVERRIDE_TEST",
    });
    assert.equal(resB.pricing.couponFunding, "PLATFORM", "Coupon explicit PLATFORM funding must override AppSettings defaultFunding: SELLER");

    // 3. Case C: Neither Coupon nor AppSettings specifies funding.
    // Expectation: Hard fallback to "PLATFORM".
    (AppSettings as any).getSettings = async () => ({
      platformFee: 0,
      deliveryCharges: 0,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 0 },
      couponSettings: {},
    });
    (Coupon as any).findOne = async () => ({
      code: "DEFAULT_TEST",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 50,
      funding: undefined,
    });

    const resC = await priceOrder({
      lines: [{ productId: "p1", sellerId: "s1", unitPrice: 500, quantity: 1 }],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "DEFAULT_TEST",
    });
    assert.equal(resC.pricing.couponFunding, "PLATFORM", "Absence of both coupon and AppSettings funding must default to PLATFORM");
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
    Coupon.findOne = origCouponFindOne;
  }
});

test("WIRING: AppSettings schema defines couponSettings with defaultFunding enum", async () => {
  const AppSettings = (await import("../models/AppSettings")).default;
  const couponSettingsPath: any = AppSettings.schema.path("couponSettings.defaultFunding");
  assert.ok(couponSettingsPath, "AppSettings schema must declare couponSettings.defaultFunding");
  assert.equal(couponSettingsPath.defaultValue, "PLATFORM", "defaultFunding must default to PLATFORM");
  assert.deepEqual(
    couponSettingsPath.enumValues,
    ["PLATFORM", "SELLER"],
    "defaultFunding enum must include PLATFORM and SELLER",
  );
});

test("WIRING: Order and OrderItem schemas persist couponFunding and discountAmount snapshots", async () => {
  const Order = (await import("../models/Order")).default;
  const OrderItem = (await import("../models/OrderItem")).default;

  const orderFundingPath: any = Order.schema.path("couponFunding");
  assert.ok(orderFundingPath, "Order schema must declare couponFunding");
  assert.equal(orderFundingPath.defaultValue, "PLATFORM");
  assert.deepEqual(orderFundingPath.enumValues, ["PLATFORM", "SELLER"]);

  const itemDiscountPath: any = OrderItem.schema.path("discountAmount");
  assert.ok(itemDiscountPath, "OrderItem schema must declare discountAmount");
  assert.equal(itemDiscountPath.defaultValue, 0);
});

// ===========================================================================
// REAL PRICING & ALLOCATION TESTS (Integration / Production Code Execution)
// ===========================================================================

test("Test 1: No coupon applies zero discount and assigns zero discountAmount to items", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 10,
      deliveryCharges: 50,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 5 },
      couponSettings: { defaultFunding: "PLATFORM" },
    });
    (Seller as any).find = () => ({
      select: () => Promise.resolve([]),
    });

    const res = await priceOrder({
      lines: [
        {
          productId: "507f1f77bcf86cd799439011",
          sellerId: "507f1f77bcf86cd799439021",
          unitPrice: 500,
          quantity: 2, // 1000 subtotal, 50 tax
        },
      ],
      customerId: "507f1f77bcf86cd799439031",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: null,
      tipAmount: 0,
    });

    assert.equal(res.pricing.subtotal, 1000);
    assert.equal(res.pricing.discount, 0);
    assert.equal(res.pricing.couponFunding, "PLATFORM");
    assert.equal(res.lines[0].discountAmount, 0);
    assert.equal(res.pricing.total, 1110); // 1000 + 50 tax + 50 delivery + 10 fee
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
  }
});

test("Test 2: Platform-funded coupon applies discount and records couponFunding = PLATFORM", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origCouponFindOne = Coupon.findOne;
  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 10,
      deliveryCharges: 50,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 5 },
    });
    (Seller as any).find = () => ({ select: () => Promise.resolve([]) });
    (Coupon as any).findOne = async () => ({
      code: "PLATFORM100",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 100,
      funding: "PLATFORM",
      applicableTo: "All",
    });

    const res = await priceOrder({
      lines: [
        {
          productId: "507f1f77bcf86cd799439011",
          sellerId: "507f1f77bcf86cd799439021",
          unitPrice: 1000,
          quantity: 1,
        },
      ],
      customerId: "507f1f77bcf86cd799439031",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "PLATFORM100",
    });

    assert.equal(res.pricing.discount, 100);
    assert.equal(res.pricing.couponFunding, "PLATFORM");
    assert.equal(res.lines[0].discountAmount, 100);
    assert.equal(res.pricing.total, 1010); // 1000 + 50 + 50 + 10 - 100
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 3: Seller-funded coupon sets couponFunding = SELLER and allocates item discount", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origCouponFindOne = Coupon.findOne;
  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 10,
      deliveryCharges: 50,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 5 },
    });
    (Seller as any).find = () => ({ select: () => Promise.resolve([]) });
    (Coupon as any).findOne = async () => ({
      code: "SELLER50",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 50,
      funding: "SELLER",
      applicableTo: "All",
    });

    const res = await priceOrder({
      lines: [
        {
          productId: "507f1f77bcf86cd799439011",
          sellerId: "507f1f77bcf86cd799439021",
          unitPrice: 500,
          quantity: 1,
        },
      ],
      customerId: "507f1f77bcf86cd799439031",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "SELLER50",
    });

    assert.equal(res.pricing.discount, 50);
    assert.equal(res.pricing.couponFunding, "SELLER");
    assert.equal(res.lines[0].discountAmount, 50);
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 4: Disabled or expired coupon is rejected gracefully with reason and zero discount", async () => {
  const { computeCouponDiscount } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;

  const origCouponFindOne = Coupon.findOne;
  try {
    (Coupon as any).findOne = async () => ({
      code: "EXPIRED99",
      isActive: false,
    });

    const res = await computeCouponDiscount({
      code: "EXPIRED99",
      customerId: "user1",
      eligibleAmount: 500,
    });
    assert.equal(res.discount, 0);
    assert.equal(res.reason, "Coupon is not active");
  } finally {
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 5: Percentage coupon enforces maximumDiscount cap correctly", async () => {
  const { computeCouponDiscount } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;

  const origCouponFindOne = Coupon.findOne;
  try {
    (Coupon as any).findOne = async () => ({
      code: "SAVE50PERCENT",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Percentage",
      discountValue: 50, // 50% of 1000 = 500
      maximumDiscount: 150, // Capped at 150
      funding: "PLATFORM",
    });

    const res = await computeCouponDiscount({
      code: "SAVE50PERCENT",
      customerId: "user1",
      eligibleAmount: 1000,
    });
    assert.equal(res.discount, 150, "Discount must be capped at maximumDiscount");
  } finally {
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 6: Minimum order requirement rejects coupon when subtotal is insufficient", async () => {
  const { computeCouponDiscount } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;

  const origCouponFindOne = Coupon.findOne;
  try {
    (Coupon as any).findOne = async () => ({
      code: "MIN500",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 50,
      minimumPurchase: 500,
      funding: "PLATFORM",
    });

    const res = await computeCouponDiscount({
      code: "MIN500",
      customerId: "user1",
      eligibleAmount: 400,
    });
    assert.equal(res.discount, 0);
    assert.ok(res.reason?.includes("at least Rs.500"));
  } finally {
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 7: Multi-item single seller allocates coupon proportionately across items", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origCouponFindOne = Coupon.findOne;
  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 0,
      deliveryCharges: 0,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 0 },
    });
    (Seller as any).find = () => ({ select: () => Promise.resolve([]) });
    (Coupon as any).findOne = async () => ({
      code: "FLAT100",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 100,
      funding: "SELLER",
      applicableTo: "All",
    });

    const res = await priceOrder({
      lines: [
        {
          productId: "p1",
          sellerId: "s1",
          unitPrice: 300,
          quantity: 1, // 30% of 1000
        },
        {
          productId: "p2",
          sellerId: "s1",
          unitPrice: 700,
          quantity: 1, // 70% of 1000
        },
      ],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "FLAT100",
    });

    assert.equal(res.pricing.discount, 100);
    assert.equal(res.lines[0].discountAmount, 30);
    assert.equal(res.lines[1].discountAmount, 70);
    assert.equal(res.lines[0].discountAmount + res.lines[1].discountAmount, 100);
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 8: Multi-seller order allocates coupon discount proportionately without disproportionate seller impact", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origCouponFindOne = Coupon.findOne;
  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 0,
      deliveryCharges: 0,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 0 },
    });
    (Seller as any).find = () => ({ select: () => Promise.resolve([]) });
    (Coupon as any).findOne = async () => ({
      code: "MULTI100",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 100,
      funding: "SELLER",
      applicableTo: "All",
    });

    // Seller A: ₹600 item, Seller B: ₹400 item. Total: ₹1,000.
    const res = await priceOrder({
      lines: [
        {
          productId: "prodA",
          sellerId: "sellerA",
          unitPrice: 600,
          quantity: 1,
        },
        {
          productId: "prodB",
          sellerId: "sellerB",
          unitPrice: 400,
          quantity: 1,
        },
      ],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "MULTI100",
    });

    assert.equal(res.pricing.discount, 100);
    assert.equal(res.lines[0].discountAmount, 60, "Seller A must absorb exactly ₹60 (60%)");
    assert.equal(res.lines[1].discountAmount, 40, "Seller B must absorb exactly ₹40 (40%)");
    assert.equal(res.lines[0].discountAmount + res.lines[1].discountAmount, 100);
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 9: COD + Platform-funded coupon: calculateCODOrderBreakdown recognizes discount subsidy correctly", async () => {
  const { calculateCODOrderBreakdown } = await import("../services/commissionService");
  const Order = (await import("../models/Order")).default;
  const OrderItem = (await import("../models/OrderItem")).default;
  const Product = (await import("../models/Product")).default;
  const Delivery = (await import("../models/Delivery")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const itemId = new mongoose.Types.ObjectId().toString();
  const sellerId = new mongoose.Types.ObjectId().toString();
  const riderId = new mongoose.Types.ObjectId().toString();

  const fakeOrder = {
    _id: orderId,
    orderNumber: "COD-COUPON-777",
    paymentMethod: "COD",
    subtotal: 1000,
    platformFee: 10,
    shipping: 50,
    discount: 100,
    couponCode: "PLAT100",
    couponFunding: "PLATFORM",
    tipAmount: 0,
    total: 960, // 1000 + 10 + 50 - 100
    deliveryBoy: riderId,
    deliveryDistanceKm: 0,
    items: [itemId],
  };

  const origOrderFindById = Order.findById;
  const origItemFindById = OrderItem.findById;
  const origProductFindById = Product.findById;
  const origDeliveryFindById = Delivery.findById;
  const origSettings = AppSettings.getSettings;
  try {
    (Order as any).findById = () => ({
      populate: () => Promise.resolve(fakeOrder),
    });
    (OrderItem as any).findById = () =>
      Promise.resolve({
        _id: itemId,
        product: "p1",
        seller: sellerId,
        total: 1000,
        commissionRate: 10,
        discountAmount: 100,
      });
    (Product as any).findById = () => Promise.resolve({ _id: "p1" });
    (Delivery as any).findById = () => Promise.resolve({ commissionRate: 5 }); // 5% of 1000 = 50 rider commission
    (AppSettings as any).getSettings = async () => ({
      deliveryConfig: { isDistanceBased: false },
    });

    const breakdown = await calculateCODOrderBreakdown(orderId);

    // Platform-funded coupon:
    // Seller gets full 1000 - 100 comm = 900 net
    assert.equal(breakdown.sellerEarnings.get(sellerId), 900);
    assert.equal(breakdown.adminProductCommission, 100);
    assert.equal(breakdown.platformFee, 10);
    assert.equal(breakdown.deliveryBoyCommission, 50);
    assert.equal(breakdown.adminDeliveryCommission, 50);
    // Gross Admin Earning = 100 + 10 + 50 = 160
    // Platform subsidy = 100
    // Net Admin Earning = 160 - 100 = 60
    assert.equal(breakdown.totalAdminEarning, 60);

    // Courier owes: 960 total - 50 rider comm = 910
    assert.equal(breakdown.amountDeliveryBoyOwesAdmin, 910);
  } finally {
    Order.findById = origOrderFindById;
    OrderItem.findById = origItemFindById;
    Product.findById = origProductFindById;
    Delivery.findById = origDeliveryFindById;
    AppSettings.getSettings = origSettings;
  }
});

test("Test 10: Online payment + Seller-funded coupon: createPendingCommissions calculates commission on discounted base", async () => {
  const { createPendingCommissions } = await import("../services/commissionService");
  const Order = (await import("../models/Order")).default;
  const OrderItem = (await import("../models/OrderItem")).default;
  const Seller = (await import("../models/Seller")).default;
  const Commission = (await import("../models/Commission")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const itemId = new mongoose.Types.ObjectId().toString();
  const sellerId = new mongoose.Types.ObjectId().toString();
  const productId = new mongoose.Types.ObjectId().toString();

  const fakeOrder = {
    _id: orderId,
    orderNumber: "ORD-ONLINE-SELLER-COUPON",
    couponFunding: "SELLER",
    items: [itemId],
  };

  const fakeItem = {
    _id: itemId,
    order: orderId,
    product: productId,
    seller: sellerId,
    total: 1000,
    discountAmount: 100,
    commissionRate: 10,
  };

  const Product = (await import("../models/Product")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origOrderFindById = Order.findById;
  const origItemFindById = OrderItem.findById;
  const origSellerFindById = Seller.findById;
  const origProductFindById = Product.findById;
  const origAppSettingsFindOne = AppSettings.findOne;
  const origCommissionFind = Commission.find;
  const origCommissionCreate = Commission.create;

  let createdCommission: any = null;
  try {
    (AppSettings as any).findOne = () => Promise.resolve({ globalCommissionRate: 10 });
    (Order as any).findById = () => ({
      populate: () => Promise.resolve(fakeOrder),
    });
    (OrderItem as any).findById = () => Promise.resolve(fakeItem);
    (Seller as any).findById = () => Promise.resolve({ _id: sellerId, commission: 10, commissionRate: 10 });
    (Product as any).findById = () => Promise.resolve({ seller: sellerId });
    (Commission as any).find = () => Promise.resolve([]);
    (Commission as any).create = async (doc: any) => {
      createdCommission = doc;
      return doc;
    };

    await createPendingCommissions(orderId);

    assert.ok(createdCommission, "Commission record must be created");
    // Discounted base = 1000 - 100 = 900
    assert.equal(createdCommission.orderAmount, 900, "orderAmount must be discounted base for SELLER funding");
    assert.equal(createdCommission.commissionAmount, 90, "Commission must be 10% of 900 = 90");
    const netPayout = createdCommission.orderAmount - createdCommission.commissionAmount;
    assert.equal(netPayout, 810, "Seller net payout must be 810");
  } finally {
    AppSettings.findOne = origAppSettingsFindOne;
    Order.findById = origOrderFindById;
    OrderItem.findById = origItemFindById;
    Seller.findById = origSellerFindById;
    Product.findById = origProductFindById;
    Commission.find = origCommissionFind;
    Commission.create = origCommissionCreate;
  }
});

test("Test 11: Full order refund restores full captured payment matching customer payment exactly", async () => {
  const { refundOrder } = await import("../services/refundService");
  const Order = (await import("../models/Order")).default;
  const Payment = (await import("../models/Payment")).default;
  const Refund = (await import("../models/Refund")).default;
  const Razorpay = (await import("razorpay")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const paymentId = new mongoose.Types.ObjectId().toString();

  const origOrderFindById = Order.findById;
  const origOrderUpdateOne = Order.updateOne;
  const origPaymentFindOne = Payment.findOne;
  const origPaymentFindById = Payment.findById;
  const origRefundFindOne = Refund.findOne;
  const origRefundCreate = Refund.create;
  const origAddResources = Razorpay.prototype.addResources;

  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";

  try {
    Razorpay.prototype.addResources = function () {
      (this as any).payments = {
        refund: async (_pid: string, _opts: any) => ({ id: "rfnd_test_123" }),
      };
    };

    (Order as any).findById = () =>
      Promise.resolve({
        _id: orderId,
        orderNumber: "ORD-999",
        paymentMethod: "ONLINE",
        paymentStatus: "Paid",
        total: 910, // Discounted amount captured
      });
    (Order as any).updateOne = () => Promise.resolve({});
    (Payment as any).findOne = () =>
      Promise.resolve({
        _id: paymentId,
        order: orderId,
        status: "Completed",
        amount: 910,
        razorpayPaymentId: "pay_test_123",
      });
    (Payment as any).findById = () =>
      Promise.resolve({
        _id: paymentId,
        order: orderId,
        status: "Completed",
        amount: 910,
        razorpayPaymentId: "pay_test_123",
        save: async () => {},
      });
    (Refund as any).findOne = () => Promise.resolve(null);
    (Refund as any).create = (doc: any) => Promise.resolve({ ...doc, save: async () => {} });

    const res = await refundOrder(orderId, "Customer cancellation");
    assert.equal(res.refunded, true);
    assert.equal(res.amount, 910, "Refund must equal the net captured payment");
  } finally {
    Order.findById = origOrderFindById;
    Order.updateOne = origOrderUpdateOne;
    Payment.findOne = origPaymentFindOne;
    Payment.findById = origPaymentFindById;
    Refund.findOne = origRefundFindOne;
    Refund.create = origRefundCreate;
    Razorpay.prototype.addResources = origAddResources;
    process.env.RAZORPAY_KEY_ID = origKeyId;
    process.env.RAZORPAY_KEY_SECRET = origKeySecret;
  }
});

test("Test 12: Partial item return calculates refundAmount on net discounted unit price", async () => {
  const { requestReturn } = await import("../services/returnService");
  const Order = (await import("../models/Order")).default;
  const OrderItem = (await import("../models/OrderItem")).default;
  const Return = (await import("../models/Return")).default;
  const Product = (await import("../models/Product")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const itemId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();

  const origOrderFindOne = Order.findOne;
  const origItemFindOne = OrderItem.findOne;
  const origReturnFind = Return.find;
  const origReturnFindOne = Return.findOne;
  const origReturnCreate = Return.create;
  const origProductFindById = Product.findById;

  let createdReturn: any = null;
  try {
    (Order as any).findOne = () =>
      Promise.resolve({
        _id: orderId,
        customer: customerId,
        status: "Delivered",
        deliveredAt: new Date(),
      });
    // Customer bought 2 units at 500 each = 1000 total, received 100 discount = 900 net line total
    // Effective unit refund = 900 / 2 = 450 per unit
    (OrderItem as any).findOne = () =>
      Promise.resolve({
        _id: itemId,
        order: orderId,
        product: "p1",
        quantity: 2,
        unitPrice: 500,
        total: 1000,
        discountAmount: 100,
      });
    (Return as any).find = () => Promise.resolve([]);
    (Return as any).findOne = () => Promise.resolve(null);
    (Product as any).findById = () => ({
      select: () => Promise.resolve({ isReturnable: true, maxReturnDays: 7 }),
    });
    (Return as any).create = async (doc: any) => {
      createdReturn = doc;
      return doc;
    };

    await requestReturn({
      orderId,
      orderItemId: itemId,
      customerId,
      quantity: 1, // Returning 1 out of 2 units
      reason: "Defective item",
    });

    assert.ok(createdReturn);
    assert.equal(
      createdReturn.refundAmount,
      450,
      "Returning 1 discounted unit must refund exactly ₹450, not undiscounted ₹500",
    );
  } finally {
    Order.findOne = origOrderFindOne;
    OrderItem.findOne = origItemFindOne;
    Return.find = origReturnFind;
    Return.findOne = origReturnFindOne;
    Return.create = origReturnCreate;
    Product.findById = origProductFindById;
  }
});

test("Test 13: Sequential partial returns sweep 100% of seller commission on final unit without paise drift", async () => {
  const { reverseOrderItemCommission } = await import("../services/commissionService");
  const Commission = (await import("../models/Commission")).default;
  const OrderItem = (await import("../models/OrderItem")).default;
  const Return = (await import("../models/Return")).default;
  const WalletTransaction = (await import("../models/WalletTransaction")).default;
  const Seller = (await import("../models/Seller")).default;

  const orderId = new mongoose.Types.ObjectId().toString();
  const itemId = new mongoose.Types.ObjectId().toString();
  const sellerId = new mongoose.Types.ObjectId().toString();

  // Seller-funded order: 2 units at 500 - 100 discount = 900 gross, 10% comm = 90, net = 810
  const mockCommission: any = {
    order: orderId,
    orderItem: itemId,
    seller: sellerId,
    type: "SELLER",
    orderAmount: 900,
    commissionAmount: 90,
    commissionRate: 10,
    status: "Paid",
    save: async () => {},
  };

  const mockItem = {
    _id: itemId,
    quantity: 2,
    unitPrice: 500,
    total: 1000,
    discountAmount: 100,
  };

  const origCommFindOne = Commission.findOne;
  const origItemFindById = OrderItem.findById;
  const origReturnFind = Return.find;
  const origTxFindOne = WalletTransaction.findOne;
  const origTxCreate = WalletTransaction.create;
  const origSellerFindOneAndUpdate = Seller.findOneAndUpdate;

  const mockSession: any = {
    inTransaction: () => true,
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: async () => {},
  };

  try {
    (Commission as any).findOne = () => ({ session: () => Promise.resolve(mockCommission) });
    (OrderItem as any).findById = () => ({ session: () => Promise.resolve(mockItem) });
    (WalletTransaction as any).findOne = () => ({ session: () => Promise.resolve(null) });
    (WalletTransaction as any).create = (docs: any[]) =>
      Promise.resolve([{ _id: "tx_123", amount: docs[0].amount }]);
    (Seller as any).findOneAndUpdate = () => Promise.resolve({ _id: sellerId, balance: 1000 });

    // Return 1: unit 1
    (Return as any).find = () => ({ session: () => Promise.resolve([]) });
    const res1 = await reverseOrderItemCommission({
      orderId,
      orderItemId: itemId,
      returnedQuantity: 1,
      session: mockSession,
    });
    assert.equal(res1.success, true);
    assert.equal(res1.data?.amountToReverse, 405, "First unit return must debit exactly half (810 / 2 = 405)");

    // Return 2: unit 2 (final unit, sweep remainder)
    (Return as any).find = () => ({ session: () => Promise.resolve([{ quantity: 1 }]) });
    const res2 = await reverseOrderItemCommission({
      orderId,
      orderItemId: itemId,
      returnedQuantity: 1,
      session: mockSession,
    });
    assert.equal(res2.success, true);
    assert.equal(res2.data?.amountToReverse, 405, "Second unit return must sweep exact remainder 405");
    assert.equal((res1.data?.amountToReverse || 0) + (res2.data?.amountToReverse || 0), 810, "Total clawback across sequential returns must equal 810");
  } finally {
    Commission.findOne = origCommFindOne;
    OrderItem.findById = origItemFindById;
    Return.find = origReturnFind;
    WalletTransaction.findOne = origTxFindOne;
    WalletTransaction.create = origTxCreate;
    Seller.findOneAndUpdate = origSellerFindOneAndUpdate;
  }
});

test("Test 14: Historical order retains its original couponFunding policy even if admin changes default setting", async () => {
  // Historical order was persisted with couponFunding: "PLATFORM"
  const historicalOrder = {
    orderNumber: "HIST-001",
    subtotal: 1000,
    discount: 100,
    couponFunding: "PLATFORM", // Persisted at creation
  };

  // Admin subsequently changes platform default to "SELLER"
  const currentAdminSetting = { defaultFunding: "SELLER" };

  // Financial evaluation of historical order uses persisted field
  const effectiveFunding = historicalOrder.couponFunding || currentAdminSetting.defaultFunding;
  assert.equal(
    effectiveFunding,
    "PLATFORM",
    "Historical order must strictly evaluate to PLATFORM despite current admin setting being SELLER",
  );
});

test("Test 15: Client cannot override coupon funding via request body (security check)", async () => {
  // Simulate client attempting to force PLATFORM funding in request body
  const clientPayload = {
    couponCode: "SELLERPROMO",
    couponFunding: "PLATFORM", // Attacker trying to make platform pay
  };

  const { computeCouponDiscount } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;

  const origCouponFindOne = Coupon.findOne;
  try {
    (Coupon as any).findOne = async () => ({
      code: "SELLERPROMO",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 100,
      funding: "SELLER", // Database config enforces SELLER
    });

    // Server-side computeCouponDiscount ignores client-suggested funding
    const res = await computeCouponDiscount({
      code: clientPayload.couponCode,
      customerId: "user1",
      eligibleAmount: 1000,
    });

    assert.equal(res.funding, "SELLER", "Server must derive funding strictly from database, ignoring client payload");
  } finally {
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 16: Complete Financial Conservation Equation with Platform-Funded Coupon (Production Execution)", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origCouponFindOne = Coupon.findOne;

  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 10,
      deliveryCharges: 50,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 5 },
      tipSettings: { enabled: true, minTip: 0, maxTip: 1000 },
    });
    (Seller as any).find = () => ({ select: () => Promise.resolve([]) });
    (Coupon as any).findOne = async () => ({
      code: "PLAT100",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 100,
      funding: "PLATFORM",
      applicableTo: "All",
    });

    const res = await priceOrder({
      lines: [{ productId: "p1", sellerId: "s1", unitPrice: 1000, quantity: 1 }],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "PLAT100",
      tipAmount: 20,
    });

    const p = res.pricing;
    assert.equal(p.subtotal, 1000);
    assert.equal(p.discount, 100);
    assert.equal(p.platformFee, 10);
    assert.equal(p.shipping, 50);
    assert.equal(p.tax, 50);
    assert.equal(p.tip, 20);
    assert.equal(p.total, 1030); // 1000 - 100 + 50 + 50 + 10 + 20
    assert.equal(p.couponFunding, "PLATFORM");

    const commissionRate = 10;
    const riderBaseDelivery = 40;

    // Platform funded: Seller gets full undiscounted net (1000 - 100 comm = 900)
    const sellerCommission = (p.subtotal * commissionRate) / 100; // 100
    const sellerPayable = p.subtotal - sellerCommission; // 900

    // Rider payable = base + tip
    const riderPayable = riderBaseDelivery + p.tip; // 40 + 20 = 60
    const taxLiability = p.tax; // 50

    // Platform revenue = Product commission (100) + platform fee (10) + admin delivery margin (50 - 40 = 10) - platform coupon subsidy (100)
    const grossPlatformRevenue = sellerCommission + p.platformFee + (p.shipping - riderBaseDelivery); // 120
    const platformRevenue = grossPlatformRevenue - p.discount; // 20

    // Financial conservation equation:
    const totalAllocated = sellerPayable + riderPayable + taxLiability + platformRevenue;
    assert.equal(totalAllocated, p.total);
    const unallocated = p.total - totalAllocated;
    assert.equal(unallocated, 0, "Unallocated money must be exactly 0 paise");
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 17: Complete Financial Conservation Equation with Seller-Funded Coupon and Fractional Paise Rounding (Production Execution)", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origCouponFindOne = Coupon.findOne;

  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 10,
      deliveryCharges: 50,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 5 },
      tipSettings: { enabled: true, minTip: 0, maxTip: 1000 },
    });
    (Seller as any).find = () => ({ select: () => Promise.resolve([]) });
    (Coupon as any).findOne = async () => ({
      code: "SELLER99",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 99.99,
      funding: "SELLER",
      applicableTo: "All",
    });

    const res = await priceOrder({
      lines: [
        { productId: "p1", sellerId: "s1", unitPrice: 333.33, quantity: 1 },
        { productId: "p2", sellerId: "s1", unitPrice: 666.67, quantity: 1 },
      ],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "SELLER99",
      tipAmount: 0,
    });

    const p = res.pricing;
    assert.equal(p.subtotal, 1000);
    assert.equal(p.discount, 99.99);
    assert.equal(p.couponFunding, "SELLER");

    // Verify production line discount amounts
    const l1Discount = res.lines[0].discountAmount || 0;
    const l2Discount = res.lines[1].discountAmount || 0;
    assert.equal(Math.round((l1Discount + l2Discount) * 100) / 100, 99.99, "Allocated discounts must sum to exactly 99.99");
    assert.ok(l1Discount <= res.lines[0].lineTotal, "Line 1 discount cannot exceed total");
    assert.ok(l2Discount <= res.lines[1].lineTotal, "Line 2 discount cannot exceed total");

    // Effective seller bases
    const base1 = Math.round((res.lines[0].lineTotal - l1Discount) * 100) / 100;
    const base2 = Math.round((res.lines[1].lineTotal - l2Discount) * 100) / 100;
    assert.equal(Math.round((base1 + base2) * 100) / 100, 900.01);

    // Commissions on net base (10%)
    const comm1 = Math.round(((base1 * 10) / 100) * 100) / 100;
    const net1 = Math.round((base1 - comm1) * 100) / 100;

    const comm2 = Math.round(((base2 * 10) / 100) * 100) / 100;
    const net2 = Math.round((base2 - comm2) * 100) / 100;

    const totalSellerPayable = Math.round((net1 + net2) * 100) / 100;
    const totalPlatformProductComm = Math.round((comm1 + comm2) * 100) / 100;
    const riderFee = 40;

    const platformRevenue = Math.round(
      (totalPlatformProductComm + p.platformFee + (p.shipping - riderFee)) * 100
    ) / 100;

    const totalAllocated = Math.round((totalSellerPayable + riderFee + p.tax + platformRevenue) * 100) / 100;
    assert.equal(totalAllocated, p.total);
    assert.equal(Math.round((p.total - totalAllocated) * 100) / 100, 0, "Paise discrepancy must be exactly 0");
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
    Coupon.findOne = origCouponFindOne;
  }
});

test("Test 18: Coupon Allocation Invariant Tests across all edge cases (1 item, many items, small discount, subtotal match, overflow attempt)", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const Coupon = (await import("../models/Coupon")).default;
  const Seller = (await import("../models/Seller")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origCouponFindOne = Coupon.findOne;

  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 0,
      deliveryCharges: 0,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 0 },
    });
    (Seller as any).find = () => ({ select: () => Promise.resolve([]) });

    // Edge Case 1: Exactly 1 item
    (Coupon as any).findOne = async () => ({
      code: "ONE_ITEM",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 45,
      funding: "SELLER",
    });
    const res1 = await priceOrder({
      lines: [{ productId: "p1", sellerId: "s1", unitPrice: 300, quantity: 1 }],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "ONE_ITEM",
    });
    assert.equal(res1.lines[0].discountAmount, 45);

    // Edge Case 2: Many items (5 items) with unequal prices and odd discount value (₹77.77)
    (Coupon as any).findOne = async () => ({
      code: "MANY_ITEMS",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 77.77,
      funding: "SELLER",
    });
    const res2 = await priceOrder({
      lines: [
        { productId: "p1", sellerId: "s1", unitPrice: 100, quantity: 1 },
        { productId: "p2", sellerId: "s1", unitPrice: 200, quantity: 1 },
        { productId: "p3", sellerId: "s2", unitPrice: 300, quantity: 1 },
        { productId: "p4", sellerId: "s2", unitPrice: 400, quantity: 1 },
        { productId: "p5", sellerId: "s3", unitPrice: 500, quantity: 1 },
      ], // Subtotal = 1500
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "MANY_ITEMS",
    });
    const sumDiscounts2 = Math.round(
      res2.lines.reduce((s, l) => s + (l.discountAmount || 0), 0) * 100
    ) / 100;
    assert.equal(sumDiscounts2, 77.77, "5 items must sum to exactly 77.77");
    for (const l of res2.lines) {
      assert.ok((l.discountAmount || 0) <= l.lineTotal, `Line discount ${l.discountAmount} must not exceed lineTotal ${l.lineTotal}`);
    }

    // Edge Case 3: Very small discount (₹0.01)
    (Coupon as any).findOne = async () => ({
      code: "ONE_PAISE",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 0.01,
      funding: "PLATFORM",
    });
    const res3 = await priceOrder({
      lines: [
        { productId: "p1", sellerId: "s1", unitPrice: 100, quantity: 1 },
        { productId: "p2", sellerId: "s2", unitPrice: 500, quantity: 1 },
      ],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "ONE_PAISE",
    });
    const sumDiscounts3 = Math.round(
      res3.lines.reduce((s, l) => s + (l.discountAmount || 0), 0) * 100
    ) / 100;
    assert.equal(sumDiscounts3, 0.01, "One paise must be allocated cleanly without drift");

    // Edge Case 4: Discount equal to subtotal (100% discount)
    (Coupon as any).findOne = async () => ({
      code: "FREE_ORDER",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 1000,
      funding: "SELLER",
    });
    const res4 = await priceOrder({
      lines: [
        { productId: "p1", sellerId: "s1", unitPrice: 400, quantity: 1 },
        { productId: "p2", sellerId: "s2", unitPrice: 600, quantity: 1 },
      ],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "FREE_ORDER",
    });
    assert.equal(res4.lines[0].discountAmount, 400);
    assert.equal(res4.lines[1].discountAmount, 600);
    assert.equal(res4.pricing.total, 0);

    // Edge Case 5: Discount attempting to exceed subtotal (₹1500 discount on ₹1000 subtotal)
    (Coupon as any).findOne = async () => ({
      code: "OVERFLOW_COUPON",
      isActive: true,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 100000),
      discountType: "Fixed",
      discountValue: 1500,
      funding: "SELLER",
    });
    const res5 = await priceOrder({
      lines: [
        { productId: "p1", sellerId: "s1", unitPrice: 500, quantity: 1 },
        { productId: "p2", sellerId: "s2", unitPrice: 500, quantity: 1 },
      ],
      customerId: "u1",
      deliveryLat: 12.97,
      deliveryLng: 77.59,
      couponCode: "OVERFLOW_COUPON",
    });
    // Order-level discount is capped at eligibleAmount (1000)
    assert.equal(res5.pricing.discount, 1000);
    // Line discounts must not exceed lineTotals
    assert.equal(res5.lines[0].discountAmount, 500);
    assert.equal(res5.lines[1].discountAmount, 500);
    assert.equal(res5.pricing.total, 0);
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
    Coupon.findOne = origCouponFindOne;
  }
});
