import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

function createMockQuery(resolveValue: any) {
  const query: any = {
    _resolveValue: resolveValue,
    populate: () => query,
    select: () => query,
    sort: () => query,
    skip: () => query,
    limit: () => query,
    lean: () => query,
    then: (resolve: any, reject: any) => Promise.resolve(resolveValue).then(resolve, reject),
    catch: (reject: any) => Promise.resolve(resolveValue).catch(reject),
    finally: (fn: any) => Promise.resolve(resolveValue).finally(fn),
    [Symbol.asyncIterator]: async function* () {
      if (Array.isArray(resolveValue)) {
        for (const item of resolveValue) yield item;
      } else {
        yield resolveValue;
      }
    },
  };
  return query;
}

test("HOMEMADE DYNAMIC END-TO-END SUITE", async (t) => {
  const Product = (await import("../models/Product")).default;
  const Seller = (await import("../models/Seller")).default;
  const { getHomemadeHub } = await import("../modules/customer/controllers/customerHomemadeController");
  const { getProducts } = await import("../modules/customer/controllers/customerProductController");
  const { createProduct } = await import("../modules/seller/controllers/productController");

  await t.test("1. Seller/Admin Product Creation: accepts and sanitizes isHomemade, homemadeCategory, homemadeSubcategory", async () => {
    const dummySellerId = new mongoose.Types.ObjectId();
    let savedProductData: any = null;

    const origCreate = Product.create;
    const origSellerFindById = Seller.findById;

    Product.create = (async (data: any) => {
      savedProductData = data;
      return { ...data, _id: new mongoose.Types.ObjectId() };
    }) as any;

    Seller.findById = (() => createMockQuery({ _id: dummySellerId, status: "Approved" })) as any;

    const req: any = {
      user: { userId: dummySellerId.toString() },
      body: {
        productName: "Aai Special Handmade Pickle",
        price: 250,
        discPrice: 220,
        stock: 50,
        isHomemade: "Yes",
        homemadeCategory: "food",
        homemadeSubcategory: "pickles-chutneys",
        publish: true,
        variations: [{ title: "250g", price: 250, discPrice: 220, stock: 50 }],
      },
    };

    let statusCode = 200;
    let jsonResult: any = null;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
    };

    try {
      await new Promise<void>((resolve, reject) => {
        res.json = (data: any) => {
          jsonResult = data;
          resolve();
          return res;
        };
        createProduct(req, res, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      assert.ok(statusCode === 200 || statusCode === 201, "Product creation must succeed with 200 or 201");
      assert.ok(savedProductData, "Product must be saved");
      assert.equal(savedProductData.isHomemade, true, "isHomemade must be boolean true");
      assert.equal(savedProductData.homemadeCategory, "food", "homemadeCategory must match");
      assert.equal(savedProductData.homemadeSubcategory, "pickles-chutneys", "homemadeSubcategory must match");
    } finally {
      Product.create = origCreate;
      Seller.findById = origSellerFindById;
    }
  });

  await t.test("2. Customer Products API: filters by isHomemade, category, and subcategory", async () => {
    const origFind = Product.find;
    const origCount = Product.countDocuments;
    const origSellerFind = Seller.find;
    const dummySellerId = new mongoose.Types.ObjectId();
    let capturedQuery: any = null;

    Seller.find = (() => createMockQuery([{ _id: dummySellerId, status: "Approved" }])) as any;

    Product.find = ((query: any) => {
      capturedQuery = query;
      return createMockQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          productName: "Test Homemade Cake",
          isHomemade: true,
          homemadeCategory: "bakery",
          homemadeSubcategory: "cakes-pastries",
          seller: { storeName: "Bakers Kitchen" },
        },
      ]);
    }) as any;

    Product.countDocuments = (async () => 1) as any;

    const req: any = {
      query: {
        isHomemade: "true",
        homemadeCategory: "bakery",
        homemadeSubcategory: "cakes-pastries",
      },
    };

    let resData: any = null;
    const res: any = {
      status: () => res,
      json: (data: any) => {
        resData = data;
        return res;
      },
    };

    try {
      await getProducts(req, res);

      assert.ok(capturedQuery, "Query must be captured");
      assert.equal(capturedQuery.isHomemade, true, "Query must include isHomemade: true");
      assert.ok(capturedQuery.homemadeCategory, "Query must filter by homemadeCategory");
      assert.ok(capturedQuery.homemadeSubcategory, "Query must filter by homemadeSubcategory");
      assert.equal(resData.success, true, "Response must be success");
      assert.equal(resData.data.length, 1, "Should return 1 product");
    } finally {
      Product.find = origFind;
      Product.countDocuments = origCount;
      Seller.find = origSellerFind;
    }
  });

  const Category = (await import("../models/Category")).default;

  await t.test("3. Homemade Hub API: returns categories, trending products, and nearby sellers", async () => {
    const origProdFind = Product.find;
    const origProdDistinct = Product.distinct;
    const origProdAggregate = Product.aggregate;
    const origProdCount = Product.countDocuments;
    const origSellerFind = Seller.find;
    const origCatFind = Category.find;

    const dummySellerId = new mongoose.Types.ObjectId();
    const dummyCatId = new mongoose.Types.ObjectId();
    const dummySubcatId = new mongoose.Types.ObjectId();

    Category.find = (() => createMockQuery([
      {
        _id: dummyCatId,
        name: "Homemade Food",
        slug: "food",
        image: "https://example.com/cat.jpg",
        icon: "🍲",
        description: "Fresh homemade food",
      },
    ])) as any;

    Product.countDocuments = (async () => 5) as any;

    Product.aggregate = (async () => [
      { _id: "food", count: 5 },
      { _id: "bakery", count: 3 },
    ]) as any;

    Product.find = ((query: any) => {
      if (query && query.seller && !Array.isArray(query.seller) && !(query.seller.$in)) {
        // Query for sample preview images
        return createMockQuery([{ mainImage: "https://example.com/sample.jpg" }]);
      }
      return createMockQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          productName: "Fresh Thecha",
          price: 150,
          discPrice: 130,
          stock: 20,
          isHomemade: true,
          category: { _id: dummyCatId, name: "Homemade Food", slug: "food" },
          seller: {
            _id: dummySellerId,
            storeName: "Sneha's Kitchen",
            rating: 4.9,
            reviewsCount: 120,
            location: { coordinates: [75.8577, 22.7196] },
          },
        },
      ]);
    }) as any;

    Product.distinct = ((field: string) => {
      if (field === "category") return Promise.resolve([dummyCatId]);
      if (field === "subcategory") return Promise.resolve([dummySubcatId]);
      return Promise.resolve([dummySellerId]);
    }) as any;

    Seller.find = ((query: any) => {
      return createMockQuery([
        {
          _id: dummySellerId,
          storeName: "Sneha's Kitchen",
          category: "Homemade Food",
          rating: 4.9,
          reviewsCount: 120,
          location: { coordinates: [75.8577, 22.7196] },
          serviceRadiusKm: 15,
          status: "Approved",
        },
      ]);
    }) as any;

    const req: any = {
      query: {
        latitude: "22.7196",
        longitude: "75.8577",
      },
    };

    let hubResult: any = null;
    const res: any = {
      status: () => res,
      json: (data: any) => {
        hubResult = data;
        return res;
      },
    };

    try {
      await getHomemadeHub(req, res);

      assert.equal(hubResult.success, true, "Hub response must be success");
      assert.ok(hubResult.data.categories.length >= 1, "Must return categories");
      
      const foodCat = hubResult.data.categories.find((c: any) => c.slug === "food");
      assert.ok(foodCat, "Food category must be returned");
      assert.equal(foodCat.productCount, 5, "Food category count must match 5");
      assert.ok(foodCat.subcategories.length >= 1, "Must include subcategories");

      assert.equal(hubResult.data.trendingProducts.length, 1, "Must return trending products");
      assert.ok(hubResult.data.trendingProducts[0].distance, "Must calculate distance");

      assert.equal(hubResult.data.nearbySellers.length, 1, "Must return nearby sellers");
      assert.equal(hubResult.data.nearbySellers[0].name, "Sneha's Kitchen", "Seller name must match");
    } finally {
      Product.find = origProdFind;
      Product.distinct = origProdDistinct;
      Product.aggregate = origProdAggregate;
      Product.countDocuments = origProdCount;
      Seller.find = origSellerFind;
      Category.find = origCatFind;
    }
  });
});
