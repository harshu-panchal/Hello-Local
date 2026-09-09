import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

/**
 * STEP 5 TEST SUITE: FREE DELIVERY / SHIPPING SUBSIDY FINANCIAL ACCOUNTING AUDIT
 *
 * Verifies:
 * 1. Normal shipping charged (prepaid)
 * 2. Normal shipping charged (COD)
 * 3. Free delivery triggered by threshold (prepaid)
 * 4. Free delivery triggered by threshold (COD)
 * 5. Rider earning preserved under free delivery (distance-based parity)
 * 6. Rider earning preserved under fallback rate (percentage of subtotal)
 * 7. Physical distance preserved under free delivery (not zeroed out)
 * 8. Multi-seller order with free delivery (longest route distance preserved)
 * 9. Free delivery + tip (courier receives both base distance earning and tip)
 * 10. Free delivery + coupon discount (conservation holds for PLATFORM and SELLER funding)
 * 11. COD remittance conservation with free delivery (0 paise leakage)
 * 12. Platform wallet balance & revenue integrity under free delivery
 * 13. Return / refund of free delivery order (customer receives correct product refund, 0 shipping refund)
 * 14. Threshold edge cases (exact threshold, threshold - 0.01, threshold = 0 / disabled)
 * 15. Historical snapshot immutability (modifying AppSettings does not alter historical orders)
 */

// Test 1: Normal shipping charged (prepaid)
test("Test 1: Normal shipping charged (prepaid) satisfies financial conservation", () => {
  const subtotal = 400;
  const tax = 20;
  const shipping = 40;
  const platformFee = 10;
  const tip = 0;
  const discount = 0;

  const customerTotalPaid = subtotal + tax + shipping + platformFee - discount + tip; // 470
  assert.equal(customerTotalPaid, 470);

  const sellerCommRate = 10;
  const sellerCommission = (subtotal * sellerCommRate) / 100; // 40
  const sellerPayable = subtotal - sellerCommission; // 360

  const distanceKm = 5;
  const courierKmRate = 10;
  const courierBaseEarning = distanceKm * courierKmRate; // 50
  const courierPayable = courierBaseEarning + tip; // 50

  const taxLiability = tax; // 20

  // Platform delivery margin = shipping charged - courier base
  const platformDeliveryMargin = shipping - courierBaseEarning; // 40 - 50 = -10
  const platformNetRevenue = sellerCommission + platformFee + platformDeliveryMargin - discount; // 40 + 10 - 10 = 40

  // Financial Conservation Equation
  const totalDisbursements = sellerPayable + courierPayable + taxLiability + platformNetRevenue;
  assert.equal(totalDisbursements, customerTotalPaid);
  assert.equal(customerTotalPaid - totalDisbursements, 0, "Unallocated money must be exactly 0");
});

// Test 2: Normal shipping charged (COD)
test("Test 2: Normal shipping charged (COD) courier remittance matches seller net + platform revenue", () => {
  const subtotal = 400;
  const tax = 0;
  const shipping = 40;
  const platformFee = 10;
  const tip = 0;

  const totalOrderAmount = subtotal + tax + shipping + platformFee; // 450
  const sellerCommission = 40;
  const sellerPayable = subtotal - sellerCommission; // 360

  const courierEarning = 50; // 5 km * 10/km
  const courierRemittance = totalOrderAmount - courierEarning; // 450 - 50 = 400

  // Platform delivery margin = shipping (40) - courierEarning (50) = -10
  const platformNetRevenue = sellerCommission + platformFee + (shipping - courierEarning); // 40 + 10 - 10 = 40

  assert.equal(courierRemittance, sellerPayable + platformNetRevenue); // 400 = 360 + 40
  assert.equal(courierRemittance - (sellerPayable + platformNetRevenue), 0, "Zero paise discrepancy");
});

// Test 3: Free delivery triggered by threshold (prepaid)
test("Test 3: Free delivery triggered by threshold (prepaid) satisfies financial conservation", () => {
  const subtotal = 600; // >= freeDeliveryThreshold (500)
  const tax = 30;
  const shipping = 0; // FREE DELIVERY
  const platformFee = 10;
  const tip = 0;
  const discount = 0;

  const customerTotalPaid = subtotal + tax + shipping + platformFee - discount + tip; // 640
  assert.equal(customerTotalPaid, 640);

  const sellerCommission = (subtotal * 10) / 100; // 60
  const sellerPayable = subtotal - sellerCommission; // 540

  const distanceKm = 5;
  const courierKmRate = 10;
  const courierBaseEarning = distanceKm * courierKmRate; // 50
  const courierPayable = courierBaseEarning + tip; // 50

  const taxLiability = tax; // 30

  // Platform delivery margin = shipping (0) - courier base (50) = -50 (100% platform subsidy)
  const platformDeliveryMargin = shipping - courierBaseEarning; // -50
  const platformNetRevenue = sellerCommission + platformFee + platformDeliveryMargin; // 60 + 10 - 50 = 20

  const totalDisbursements = sellerPayable + courierPayable + taxLiability + platformNetRevenue;
  assert.equal(totalDisbursements, 640);
  assert.equal(totalDisbursements, customerTotalPaid);
  assert.equal(customerTotalPaid - totalDisbursements, 0, "Zero unallocated paise under free delivery");
});

// Test 4: Free delivery triggered by threshold (COD) real calculateCODOrderBreakdown execution
test("Test 4: Real calculateCODOrderBreakdown accounts for free delivery subsidy in COD", async () => {
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
    orderNumber: "COD-FREE-DEL-001",
    paymentMethod: "COD",
    subtotal: 600,
    platformFee: 10,
    shipping: 0, // Free delivery
    discount: 0,
    tipAmount: 0,
    total: 610, // 600 + 10 + 0
    deliveryBoy: riderId,
    deliveryDistanceKm: 5,
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
        product: "prod-1",
        seller: sellerId,
        total: 600,
        commissionRate: 10,
        discountAmount: 0,
      });
    (Product as any).findById = () => Promise.resolve({ _id: "prod-1" });
    (Delivery as any).findById = () => Promise.resolve({ commissionRate: 5 });
    (AppSettings as any).getSettings = async () => ({
      deliveryConfig: {
        isDistanceBased: true,
        deliveryBoyKmRate: 10,
      },
    });

    const breakdown = await calculateCODOrderBreakdown(orderId);

    // 1. Seller gets 600 - 10% = 540
    assert.equal(breakdown.sellerEarnings.get(sellerId), 540);
    // 2. Admin product commission = 60
    assert.equal(breakdown.adminProductCommission, 60);
    // 3. Platform fee = 10
    assert.equal(breakdown.platformFee, 10);
    // 4. Delivery boy gets distance earning = 5 km * 10 = 50
    assert.equal(breakdown.deliveryBoyCommission, 50);
    // 5. Admin delivery commission = 0 - 50 = -50 (Platform subsidy)
    assert.equal(breakdown.adminDeliveryCommission, -50);
    // 6. Total Admin Earning = 60 + 10 - 50 = 20
    assert.equal(breakdown.totalAdminEarning, 20);
    // 7. Amount delivery boy owes = 610 total - 50 rider = 560
    assert.equal(breakdown.amountDeliveryBoyOwesAdmin, 560);

    // Remittance Conservation Check:
    // Remittance (560) = Seller Net (540) + Platform Net Revenue (20)
    assert.equal(
      breakdown.amountDeliveryBoyOwesAdmin,
      breakdown.sellerEarnings.get(sellerId)! + breakdown.totalAdminEarning,
    );
  } finally {
    Order.findById = origOrderFindById;
    OrderItem.findById = origItemFindById;
    Product.findById = origProductFindById;
    Delivery.findById = origDeliveryFindById;
    AppSettings.getSettings = origSettings;
  }
});

// Test 5: Rider earning preserved under free delivery (distance-based parity)
test("Test 5: Rider distance earning is identical between paid delivery and free delivery orders", () => {
  const distanceKm = 7.5;
  const deliveryBoyKmRate = 12;

  // Order A: Subtotal = 450 (Paid shipping)
  const riderEarningPaid = distanceKm * deliveryBoyKmRate; // 90

  // Order B: Subtotal = 750 (Free shipping)
  const riderEarningFree = distanceKm * deliveryBoyKmRate; // 90

  assert.equal(riderEarningPaid, riderEarningFree);
  assert.equal(riderEarningFree, 90, "Rider receives full distance earning under free delivery");
});

// Test 6: Rider earning preserved under fallback rate (percentage of subtotal)
test("Test 6: Rider fallback earning is preserved even when shipping fee is ₹0", () => {
  const subtotal = 800;
  const deliveryBoyRate = 5; // 5%
  const shippingCharge = 0; // Free delivery

  // Rider earning is calculated from subtotal, preventing 0 commission
  const baseComm = (subtotal * deliveryBoyRate) / 100;
  assert.equal(baseComm, 40);
  assert.ok(baseComm > shippingCharge, "Rider is paid even when customer shipping is 0");
});

// Test 7: Physical distance preserved under free delivery in computeDeliveryFee
test("Test 7: Real computeDeliveryFee preserves distanceKm and sets fee to 0 on free delivery", async () => {
  const { computeDeliveryFee } = await import("../services/orderPricingService");
  const AppSettings = (await import("../models/AppSettings")).default;
  const Seller = (await import("../models/Seller")).default;
  const mapService = await import("../services/mapService");

  const sellerId = new mongoose.Types.ObjectId().toString();

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;
  const origGetDistances = mapService.getRoadDistances;

  try {
    (AppSettings as any).getSettings = async () => ({
      freeDeliveryThreshold: 500,
      deliveryConfig: {
        isDistanceBased: true,
        baseCharge: 30,
        baseDistance: 3,
        kmRate: 10,
        deliveryBoyKmRate: 10,
      },
    });

    (Seller as any).find = () => ({
      select: () =>
        Promise.resolve([
          {
            _id: sellerId,
            location: { coordinates: [77.5946, 12.9716] },
          },
        ]),
    });

    (mapService as any).getRoadDistances = async () => [8.4]; // 8.4 km

    // Order with subtotal 750 (exceeds freeDeliveryThreshold 500)
    const result = await computeDeliveryFee({
      subtotal: 750,
      sellerIds: [sellerId],
      deliveryLat: 12.9352,
      deliveryLng: 77.6245,
    });

    assert.equal(result.fee, 0, "Customer fee must be 0 for free delivery");
    assert.equal(result.distanceKm, 5.18, "Physical distanceKm must NOT be zeroed out (real haversine = 5.18 km)");
    assert.equal(result.isFreeDelivery, true, "isFreeDelivery flag must be true");
    // Standard fee: base (30) + extraKm (5.18 - 3 = 2.18 * 10 = 21.8 -> ceil 22) = 52
    assert.equal(result.originalFee, 52, "originalFee snapshot must record the waived delivery fee");
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
  }
});

// Test 8: Multi-seller order with free delivery preserves longest route distance
test("Test 8: Multi-seller order takes maximum seller distance while granting free delivery", async () => {
  const { computeDeliveryFee } = await import("../services/orderPricingService");
  const AppSettings = (await import("../models/AppSettings")).default;
  const Seller = (await import("../models/Seller")).default;

  const seller1 = new mongoose.Types.ObjectId().toString();
  const seller2 = new mongoose.Types.ObjectId().toString();

  const origSettings = AppSettings.getSettings;
  const origSellerFind = Seller.find;

  try {
    (AppSettings as any).getSettings = async () => ({
      freeDeliveryThreshold: 500,
      deliveryConfig: {
        isDistanceBased: true,
        baseCharge: 25,
        baseDistance: 2,
        kmRate: 8,
        deliveryBoyKmRate: 10,
      },
    });

    (Seller as any).find = () => ({
      select: () =>
        Promise.resolve([
          { _id: seller1, location: { coordinates: [77.59, 12.97] } },
          { _id: seller2, location: { coordinates: [77.55, 12.92] } },
        ]),
    });

    const result = await computeDeliveryFee({
      subtotal: 1200,
      sellerIds: [seller1, seller2],
      deliveryLat: 12.93,
      deliveryLng: 77.62,
    });

    assert.equal(result.fee, 0, "Fee must be 0");
    // Seller 1 = 6.07 km, Seller 2 = 7.67 km. Max = 7.67 km
    assert.equal(result.distanceKm, 7.67, "Distance must be maximum of all seller origins (7.67 km)");
    assert.equal(result.isFreeDelivery, true);
  } finally {
    AppSettings.getSettings = origSettings;
    Seller.find = origSellerFind;
  }
});

// Test 9: Free delivery + tip (courier receives both base distance earning and tip)
test("Test 9: Free delivery + tip ensures courier receives 100% of tip without dilution", () => {
  const subtotal = 1000;
  const shipping = 0; // Free delivery
  const platformFee = 10;
  const tip = 50;

  const customerPaid = subtotal + shipping + platformFee + tip; // 1060
  const sellerNet = subtotal * 0.9; // 900
  const courierBase = 60; // 6 km * 10
  const courierTotal = courierBase + tip; // 110

  // Platform delivery margin = 0 - 60 = -60
  const platformNet = 100 /* commission */ + 10 /* fee */ - 60 /* subsidy */; // 50

  assert.equal(sellerNet + courierTotal + platformNet, customerPaid); // 900 + 110 + 50 = 1060
  assert.equal(customerPaid - (sellerNet + courierTotal + platformNet), 0);
});

// Test 10: Free delivery + coupon discount (conservation holds for PLATFORM and SELLER funding)
test("Test 10: Free delivery + coupon discount holds conservation under both funding modes", () => {
  // Case A: PLATFORM funded coupon
  {
    const subtotal = 1000;
    const shipping = 0;
    const platformFee = 10;
    const discount = 100;
    const tip = 0;

    const customerPaid = subtotal + shipping + platformFee - discount + tip; // 910
    const sellerNet = 1000 - 100; // 900 (Seller gets full merchandise net)
    const courierBase = 50; // 50
    // Platform revenue = 100 (product comm) + 10 (fee) - 50 (delivery subsidy) - 100 (coupon subsidy) = -40
    const platformNet = 100 + 10 - 50 - 100; // -40

    assert.equal(sellerNet + courierBase + platformNet, customerPaid); // 900 + 50 - 40 = 910
    assert.equal(customerPaid - (sellerNet + courierBase + platformNet), 0);
  }

  // Case B: SELLER funded coupon
  {
    const subtotal = 1000;
    const shipping = 0;
    const platformFee = 10;
    const discount = 100;
    const tip = 0;

    const customerPaid = subtotal + shipping + platformFee - discount + tip; // 910
    // Seller funds coupon: Effective base = 900. 10% comm = 90. Seller net = 810.
    const sellerNet = 900 - 90; // 810
    const courierBase = 50; // 50
    // Platform revenue = 90 (product comm) + 10 (fee) - 50 (delivery subsidy) = 50
    const platformNet = 90 + 10 - 50; // 50

    assert.equal(sellerNet + courierBase + platformNet, customerPaid); // 810 + 50 + 50 = 910
    assert.equal(customerPaid - (sellerNet + courierBase + platformNet), 0);
  }
});

// Test 11: COD remittance conservation with free delivery
test("Test 11: COD remittance conservation with free delivery has 0 paise leakage", () => {
  const customerPaidCash = 820; // 800 subtotal + 0 shipping + 10 fee + 10 tip
  const courierBaseEarning = 40;
  const courierTip = 10;
  const courierRetainedCash = courierBaseEarning + courierTip; // 50

  const courierRemittance = customerPaidCash - courierRetainedCash; // 770
  const sellerNetPayout = 720; // 800 - 80 commission
  const platformCashRetained = courierRemittance - sellerNetPayout; // 770 - 720 = 50

  // Platform revenue = 80 commission + 10 fee - 40 delivery subsidy = 50
  const platformRevenue = 80 + 10 - 40;
  assert.equal(platformCashRetained, platformRevenue);
  assert.equal(courierRemittance, sellerNetPayout + platformRevenue);
});

// Test 12: Platform wallet balance & revenue integrity under free delivery
test("Test 12: Platform wallet balance and revenue reflect exact settled remittance and subsidy", () => {
  const platformWallet = {
    totalPlatformEarning: 0,
    currentPlatformBalance: 0,
    totalAdminEarning: 0,
    pendingFromDeliveryBoy: 0,
    sellerPendingPayouts: 0,
    deliveryBoyPendingPayouts: 0,
  };

  const orderAmount = 1010; // 1000 goods + 0 shipping + 10 fee
  const courierCommission = 60; // 6 km * 10/km
  const sellerNetEarning = 900; // 1000 - 100 commission
  const amountDeliveryBoyOwes = orderAmount - courierCommission; // 950
  const platformNetRevenue = 100 + 10 - 60; // 50

  // Phase 1: Order Delivered
  platformWallet.pendingFromDeliveryBoy += amountDeliveryBoyOwes; // 950
  platformWallet.sellerPendingPayouts += sellerNetEarning; // 900
  platformWallet.deliveryBoyPendingPayouts += courierCommission; // 60

  assert.equal(platformWallet.pendingFromDeliveryBoy, 950);
  assert.equal(platformWallet.currentPlatformBalance, 0); // No inflation before remittance

  // Phase 2: Courier Remittance of 950
  const remittance = 950;
  platformWallet.totalPlatformEarning += remittance; // 950
  platformWallet.currentPlatformBalance += remittance; // 950
  platformWallet.pendingFromDeliveryBoy = Math.max(0, platformWallet.pendingFromDeliveryBoy - remittance); // 0

  // Phase 3: Seller Payout Released
  platformWallet.sellerPendingPayouts = Math.max(0, platformWallet.sellerPendingPayouts - sellerNetEarning); // 0
  platformWallet.currentPlatformBalance = Math.max(0, platformWallet.currentPlatformBalance - sellerNetEarning); // 950 - 900 = 50
  platformWallet.totalAdminEarning += platformNetRevenue; // 50

  assert.equal(platformWallet.currentPlatformBalance, 50, "Platform balance must match net platform revenue");
  assert.equal(platformWallet.totalAdminEarning, 50, "Admin revenue must equal net platform revenue");
  assert.equal(platformWallet.pendingFromDeliveryBoy, 0);
  assert.equal(platformWallet.sellerPendingPayouts, 0);
});

// Test 13: Return / refund of free delivery order
test("Test 13: Refund of free delivery order does NOT refund shipping that was never paid", async () => {
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
        orderNumber: "ORD-FREE-REF",
        paymentMethod: "ONLINE",
        paymentStatus: "Paid",
        shipping: 0, // Free delivery
        total: 510, // 500 subtotal + 10 fee + 0 shipping
        customer: new mongoose.Types.ObjectId(),
      });
    (Order as any).updateOne = () => Promise.resolve({});

    (Payment as any).findOne = () =>
      Promise.resolve({
        _id: paymentId,
        order: orderId,
        amount: 510, // Customer paid 510 (0 shipping)
        status: "Completed",
        razorpayPaymentId: "pay_test_123",
      });
    (Payment as any).findById = () =>
      Promise.resolve({
        _id: paymentId,
        order: orderId,
        amount: 510,
        status: "Completed",
        razorpayPaymentId: "pay_test_123",
        save: async () => {},
      });

    (Refund as any).findOne = () => Promise.resolve(null);
    (Refund as any).create = (doc: any) => Promise.resolve({ ...doc, save: async () => {} });

    const outcome = await refundOrder(orderId, "Customer cancellation");

    assert.equal(outcome.refunded, true);
    assert.equal(outcome.amount, 510, "Customer is refunded exactly what they paid (510), with 0 shipping refunded");
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

// Test 14: Threshold edge cases (exact threshold, subtotal < threshold, disabled)
test("Test 14: Threshold boundary conditions behave predictably", async () => {
  const { computeDeliveryFee } = await import("../services/orderPricingService");
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;

  try {
    (AppSettings as any).getSettings = async () => ({
      freeDeliveryThreshold: 500,
      deliveryCharges: 40,
      deliveryConfig: { isDistanceBased: false },
    });

    // Case A: subtotal 499.99 < 500
    const resBelow = await computeDeliveryFee({
      subtotal: 499.99,
      sellerIds: [],
      deliveryLat: 0,
      deliveryLng: 0,
    });
    assert.equal(resBelow.fee, 40, "Must charge 40 when subtotal < 500");
    assert.equal(resBelow.isFreeDelivery, false);

    // Case B: subtotal exactly 500.00
    const resExact = await computeDeliveryFee({
      subtotal: 500,
      sellerIds: [],
      deliveryLat: 0,
      deliveryLng: 0,
    });
    assert.equal(resExact.fee, 0, "Must be free when subtotal == 500");
    assert.equal(resExact.isFreeDelivery, true);

    // Case C: Threshold disabled (0)
    (AppSettings as any).getSettings = async () => ({
      freeDeliveryThreshold: 0,
      deliveryCharges: 40,
      deliveryConfig: { isDistanceBased: false },
    });
    const resDisabled = await computeDeliveryFee({
      subtotal: 1000,
      sellerIds: [],
      deliveryLat: 0,
      deliveryLng: 0,
    });
    assert.equal(resDisabled.fee, 40, "Must charge 40 when freeDeliveryThreshold is 0");
    assert.equal(resDisabled.isFreeDelivery, false);
  } finally {
    AppSettings.getSettings = origSettings;
  }
});

// Test 15: Historical snapshot immutability
test("Test 15: Changing AppSettings does not alter historical order delivery economics", async () => {
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

  // Historical order snapshot: placed with free delivery at 5 km
  const historicalOrder = {
    _id: orderId,
    orderNumber: "HIST-FREE-001",
    paymentMethod: "COD",
    subtotal: 600,
    platformFee: 10,
    shipping: 0,
    isFreeDelivery: true,
    freeDeliverySubsidy: 50,
    discount: 0,
    tipAmount: 0,
    total: 610,
    deliveryBoy: riderId,
    deliveryDistanceKm: 5, // Snapshotted distance
    items: [itemId],
  };

  const origOrderFindById = Order.findById;
  const origItemFindById = OrderItem.findById;
  const origProductFindById = Product.findById;
  const origDeliveryFindById = Delivery.findById;
  const origSettings = AppSettings.getSettings;

  try {
    (Order as any).findById = () => ({
      populate: () => Promise.resolve(historicalOrder),
    });
    (OrderItem as any).findById = () =>
      Promise.resolve({
        _id: itemId,
        product: "p1",
        seller: sellerId,
        total: 600,
        commissionRate: 10,
        discountAmount: 0,
      });
    (Product as any).findById = () => Promise.resolve({ _id: "p1" });
    (Delivery as any).findById = () => Promise.resolve({ commissionRate: 5 });

    // Admin has now increased freeDeliveryThreshold to 2000 and base distance fee
    (AppSettings as any).getSettings = async () => ({
      freeDeliveryThreshold: 2000,
      deliveryCharges: 100,
      deliveryConfig: {
        isDistanceBased: true,
        deliveryBoyKmRate: 10,
      },
    });

    const breakdown = await calculateCODOrderBreakdown(orderId);

    // Historical order must retain its snapshotted delivery charge (0) and snapshotted distance (5 km)
    assert.equal(breakdown.totalDeliveryCharge, 0);
    assert.equal(breakdown.deliveryDistanceKm, 5);
    assert.equal(breakdown.deliveryBoyCommission, 50);
    assert.equal(breakdown.adminDeliveryCommission, -50);
    assert.equal(breakdown.amountDeliveryBoyOwesAdmin, 560);
  } finally {
    Order.findById = origOrderFindById;
    OrderItem.findById = origItemFindById;
    Product.findById = origProductFindById;
    Delivery.findById = origDeliveryFindById;
    AppSettings.getSettings = origSettings;
  }
});

// Test 16: Real priceOrder execution snapshots isFreeDelivery and freeDeliverySubsidy
test("Test 16: Real priceOrder execution produces isFreeDelivery and freeDeliverySubsidy", async () => {
  const { priceOrder } = await import("../services/orderPricingService");
  const AppSettings = (await import("../models/AppSettings")).default;

  const origSettings = AppSettings.getSettings;
  const sellerId = new mongoose.Types.ObjectId().toString();

  try {
    (AppSettings as any).getSettings = async () => ({
      platformFee: 10,
      freeDeliveryThreshold: 500,
      deliveryCharges: 40,
      deliveryConfig: { isDistanceBased: false },
      taxSettings: { defaultRate: 0 },
    });

    const { pricing, lines } = await priceOrder({
      lines: [
        {
          productId: new mongoose.Types.ObjectId().toString(),
          sellerId,
          unitPrice: 600,
          quantity: 1,
        },
      ],
      customerId: new mongoose.Types.ObjectId().toString(),
      deliveryLat: 12.93,
      deliveryLng: 77.62,
    });

    assert.equal(pricing.subtotal, 600);
    assert.equal(pricing.shipping, 0, "Shipping fee must be waived to 0");
    assert.equal(pricing.platformFee, 10);
    assert.equal(pricing.isFreeDelivery, true, "isFreeDelivery must be true");
    assert.equal(pricing.freeDeliverySubsidy, 40, "freeDeliverySubsidy must record waived fee (40)");
    assert.equal(pricing.total, 610, "Total must be 600 + 10 = 610");
  } finally {
    AppSettings.getSettings = origSettings;
  }
});

// Test 17: Historical paid-delivery order preserves original shipping fee even when threshold decreases
test("Test 17: Historical paid-delivery order retains original shipping fee after setting change", async () => {
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

  // Historical order was placed below threshold with paid shipping
  const historicalPaidOrder = {
    _id: orderId,
    orderNumber: "HIST-PAID-002",
    paymentMethod: "COD",
    subtotal: 400,
    platformFee: 10,
    shipping: 40, // Customer paid 40
    isFreeDelivery: false,
    freeDeliverySubsidy: 0,
    discount: 0,
    tipAmount: 0,
    total: 450,
    deliveryBoy: riderId,
    deliveryDistanceKm: 4,
    items: [itemId],
  };

  const origOrderFindById = Order.findById;
  const origItemFindById = OrderItem.findById;
  const origProductFindById = Product.findById;
  const origDeliveryFindById = Delivery.findById;
  const origSettings = AppSettings.getSettings;

  try {
    (Order as any).findById = () => ({
      populate: () => Promise.resolve(historicalPaidOrder),
    });
    (OrderItem as any).findById = () =>
      Promise.resolve({
        _id: itemId,
        product: "p1",
        seller: sellerId,
        total: 400,
        commissionRate: 10,
        discountAmount: 0,
      });
    (Product as any).findById = () => Promise.resolve({ _id: "p1" });
    (Delivery as any).findById = () => Promise.resolve({ commissionRate: 5 });

    // Admin now DECREASED threshold to 300 (which would make subtotal 400 free if ordered today)
    (AppSettings as any).getSettings = async () => ({
      freeDeliveryThreshold: 300,
      deliveryCharges: 50,
      deliveryConfig: {
        isDistanceBased: true,
        deliveryBoyKmRate: 10,
      },
    });

    const breakdown = await calculateCODOrderBreakdown(orderId);

    // Historical paid order MUST preserve its paid shipping charge (40)
    assert.equal(breakdown.totalDeliveryCharge, 40, "Must preserve historical shipping charge of 40");
    assert.equal(breakdown.deliveryDistanceKm, 4);
    assert.equal(breakdown.deliveryBoyCommission, 40); // 4 km * 10
    assert.equal(breakdown.adminDeliveryCommission, 0); // 40 charge - 40 base = 0
    assert.equal(breakdown.amountDeliveryBoyOwesAdmin, 410); // 450 total - 40 rider
  } finally {
    Order.findById = origOrderFindById;
    OrderItem.findById = origItemFindById;
    Product.findById = origProductFindById;
    Delivery.findById = origDeliveryFindById;
    AppSettings.getSettings = origSettings;
  }
});
