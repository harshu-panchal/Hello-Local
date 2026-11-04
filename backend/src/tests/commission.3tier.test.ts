import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Test suite for Pure Subscription Model (0% Platform Commission)
test("3-TIER COMMISSION SUITE (Pure Subscription Model)", async (t) => {
  const { getOrderItemCommissionRate, getSellerCommissionRate } = await import("../services/commissionService");

  await t.test("Platform Commission is 0% for orders", async () => {
    const dummyProdId = new mongoose.Types.ObjectId();
    const dummySellerId = new mongoose.Types.ObjectId();
    const rate = await getOrderItemCommissionRate(dummyProdId.toString(), dummySellerId.toString());
    assert.equal(rate, 0, "Platform commission on orders must be 0%");
  });

  await t.test("Platform Commission is 0% for sellers", async () => {
    const dummySellerId = new mongoose.Types.ObjectId();
    const rate = await getSellerCommissionRate(dummySellerId.toString());
    assert.equal(rate, 0, "Seller commission rate must be 0%");
  });
});
