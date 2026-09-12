import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Test suite for 3-Tier Commission Resolution
test("3-TIER COMMISSION SUITE", async (t) => {
  const { getOrderItemCommissionRate } = await import("../services/commissionService");
  const Category = (await import("../models/Category")).default;
  const Seller = (await import("../models/Seller")).default;
  const Product = (await import("../models/Product")).default;
  const AppSettings = (await import("../models/AppSettings")).default;

  await t.test("Tier 1 (Category Rate): Category commission overrides Seller and Global", async () => {
    const dummyCatId = new mongoose.Types.ObjectId();
    const dummySellerId = new mongoose.Types.ObjectId();
    const dummyProdId = new mongoose.Types.ObjectId();

    const origCatFind = Category.findById;
    const origSellerFind = Seller.findById;
    const origProdFind = Product.findById;
    const origSettingsFind = AppSettings.findOne;

    Category.findById = (async (id: any) => {
      if (id.toString() === dummyCatId.toString()) {
        return { _id: dummyCatId, commissionRate: 8 }; // Category = 8%
      }
      return null;
    }) as any;

    Seller.findById = (async (id: any) => {
      return { _id: dummySellerId, commission: 15, commissionRate: 15 }; // Seller = 15%
    }) as any;

    Product.findById = (async (id: any) => {
      return {
        _id: dummyProdId,
        category: dummyCatId,
        seller: dummySellerId,
      };
    }) as any;

    AppSettings.findOne = (async () => {
      return { globalCommissionRate: 10 }; // Global = 10%
    }) as any;

    try {
      const rate = await getOrderItemCommissionRate(dummyProdId.toString(), dummySellerId.toString());
      assert.equal(rate, 8, "Category rate (8%) must win over Seller (15%) and Global (10%)");
    } finally {
      Category.findById = origCatFind;
      Seller.findById = origSellerFind;
      Product.findById = origProdFind;
      AppSettings.findOne = origSettingsFind;
    }
  });

  await t.test("Tier 2 (Seller Rate): Seller commission overrides Global when Category has 0% or no rate", async () => {
    const dummyCatId = new mongoose.Types.ObjectId();
    const dummySellerId = new mongoose.Types.ObjectId();
    const dummyProdId = new mongoose.Types.ObjectId();

    const origCatFind = Category.findById;
    const origSellerFind = Seller.findById;
    const origProdFind = Product.findById;
    const origSettingsFind = AppSettings.findOne;

    Category.findById = (async (id: any) => {
      return { _id: dummyCatId, commissionRate: 0 }; // Category = 0% (unspecified)
    }) as any;

    Seller.findById = (async (id: any) => {
      return { _id: dummySellerId, commission: 12, commissionRate: 12 }; // Seller = 12%
    }) as any;

    Product.findById = (async (id: any) => {
      return {
        _id: dummyProdId,
        category: dummyCatId,
        seller: dummySellerId,
      };
    }) as any;

    AppSettings.findOne = (async () => {
      return { globalCommissionRate: 10 }; // Global = 10%
    }) as any;

    try {
      const rate = await getOrderItemCommissionRate(dummyProdId.toString(), dummySellerId.toString());
      assert.equal(rate, 12, "Seller rate (12%) must win when Category rate is 0");
    } finally {
      Category.findById = origCatFind;
      Seller.findById = origSellerFind;
      Product.findById = origProdFind;
      AppSettings.findOne = origSettingsFind;
    }
  });

  await t.test("Tier 3 (Global Rate): Global default is used when Category and Seller have no custom rates", async () => {
    const dummyCatId = new mongoose.Types.ObjectId();
    const dummySellerId = new mongoose.Types.ObjectId();
    const dummyProdId = new mongoose.Types.ObjectId();

    const origCatFind = Category.findById;
    const origSellerFind = Seller.findById;
    const origProdFind = Product.findById;
    const origSettingsFind = AppSettings.findOne;

    Category.findById = (async (id: any) => {
      return { _id: dummyCatId, commissionRate: 0 };
    }) as any;

    Seller.findById = (async (id: any) => {
      return { _id: dummySellerId, commission: 0, commissionRate: 0 };
    }) as any;

    Product.findById = (async (id: any) => {
      return {
        _id: dummyProdId,
        category: dummyCatId,
        seller: dummySellerId,
      };
    }) as any;

    AppSettings.findOne = (async () => {
      return { globalCommissionRate: 10 };
    }) as any;

    try {
      const rate = await getOrderItemCommissionRate(dummyProdId.toString(), dummySellerId.toString());
      assert.equal(rate, 10, "Global rate (10%) must be used when both Category and Seller rates are 0");
    } finally {
      Category.findById = origCatFind;
      Seller.findById = origSellerFind;
      Product.findById = origProdFind;
      AppSettings.findOne = origSettingsFind;
    }
  });

  await t.test("Tier 1 (Inherited Category Rate): Subcategory inherits parent category commission rate", async () => {
    const rootCatId = new mongoose.Types.ObjectId();
    const subCatId = new mongoose.Types.ObjectId();
    const dummySellerId = new mongoose.Types.ObjectId();
    const dummyProdId = new mongoose.Types.ObjectId();

    const origCatFind = Category.findById;
    const origSellerFind = Seller.findById;
    const origProdFind = Product.findById;
    const origSettingsFind = AppSettings.findOne;

    Category.findById = (async (id: any) => {
      if (id.toString() === subCatId.toString()) {
        return { _id: subCatId, parentId: rootCatId, commissionRate: 0 };
      }
      if (id.toString() === rootCatId.toString()) {
        return { _id: rootCatId, commissionRate: 6.5 };
      }
      return null;
    }) as any;

    Seller.findById = (async (id: any) => {
      return { _id: dummySellerId, commission: 14 };
    }) as any;

    Product.findById = (async (id: any) => {
      return {
        _id: dummyProdId,
        category: subCatId,
        seller: dummySellerId,
      };
    }) as any;

    AppSettings.findOne = (async () => {
      return { globalCommissionRate: 10 };
    }) as any;

    try {
      const rate = await getOrderItemCommissionRate(dummyProdId.toString(), dummySellerId.toString());
      assert.equal(rate, 6.5, "Subcategory must inherit parent category rate (6.5%)");
    } finally {
      Category.findById = origCatFind;
      Seller.findById = origSellerFind;
      Product.findById = origProdFind;
      AppSettings.findOne = origSettingsFind;
    }
  });
});
