import test, { after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
import mongoose from 'mongoose';
import Seller from '../models/Seller';
import Product from '../models/Product';
import Category from '../models/Category';
import SubCategory from '../models/SubCategory';
import Tax from '../models/Tax';
import Inventory from '../models/Inventory';
import HeaderCategory from '../models/HeaderCategory';
import Brand from '../models/Brand';
import {
  downloadSampleTemplate,
} from '../modules/seller/controllers/sellerBulkProductController';
import {
  getMasterCatalogue,
  exportMasterCatalogueCsv,
  quickAddMasterProductToStore,
} from '../modules/seller/controllers/sellerMasterCatalogController';
import {
  createProduct,
} from '../modules/seller/controllers/productController';

function invoke(handler: any, req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    const res: any = {
      statusCode: 200,
      headers,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader(k: string, v: string) {
        headers[k.toLowerCase()] = v;
        return this;
      },
      json(data: any) {
        resolve({ statusCode: this.statusCode, headers, data });
        return this;
      },
      send(data: any) {
        resolve({ statusCode: this.statusCode, headers, data });
        return this;
      },
    };
    handler(req, res, reject);
  });
}

const restores: Array<() => void> = [];
function patch(object: any, key: string, value: any) {
  const previous = object[key];
  object[key] = value;
  restores.push(() => {
    object[key] = previous;
  });
}

after(() => {
  restores.reverse().forEach((r) => r());
});

test('Feature 1: Bulk CSV sample template supports multi-category and category filtering', async () => {
  // 1. Universal sample
  const resAll = await invoke(downloadSampleTemplate, { query: {} });
  assert.equal(resAll.statusCode, 200);
  assert.equal(resAll.headers['content-type'], 'text/csv; charset=utf-8');
  assert.ok(typeof resAll.data === 'string');
  assert.ok(resAll.data.includes('Product Name'));
  assert.ok(resAll.data.includes('Aashirvaad'));

  // 2. Electronics category filter
  const resElec = await invoke(downloadSampleTemplate, { query: { category: 'Electronics' } });
  assert.equal(resElec.statusCode, 200);
  assert.ok(resElec.data.includes('boAt'));
  assert.ok(resElec.headers['content-disposition'].includes('electronics'));

  // 3. Medical category filter
  const resMed = await invoke(downloadSampleTemplate, { query: { category: 'Medical' } });
  assert.equal(resMed.statusCode, 200);
  assert.ok(resMed.data.includes('Dettol') || resMed.data.includes('Hansaplast'));

  // 4. Fashion template has rows, and the old "Clothing" name still works
  const dataRows = (csv: string) => csv.trim().split(/\r?\n/).length - 1;
  const resFashion = await invoke(downloadSampleTemplate, { query: { category: 'Fashion' } });
  assert.equal(resFashion.statusCode, 200);
  assert.ok(dataRows(resFashion.data) > 0, 'Fashion template must not be empty');
  const resClothing = await invoke(downloadSampleTemplate, { query: { category: 'Clothing' } });
  assert.equal(dataRows(resClothing.data), dataRows(resFashion.data), 'Clothing must alias to Fashion');

  // 5. Universal sample includes fashion items
  assert.ok(resAll.data.includes('Men Pure Cotton Regular Fit Solid Crew Neck T-Shirt'));
});

test('Feature 2: Master CSV catalogue can be retrieved, filtered and exported', async () => {
  // 1. Get all catalogue products
  const resCat = await invoke(getMasterCatalogue, { query: {} });
  assert.equal(resCat.statusCode, 200);
  assert.equal(resCat.data.success, true);
  assert.ok(Array.isArray(resCat.data.data.products));
  assert.ok(resCat.data.data.total >= 20);

  // 2. Filter by category
  const resHw = await invoke(getMasterCatalogue, { query: { category: 'Hardware' } });
  assert.equal(resHw.statusCode, 200);
  assert.ok(resHw.data.data.products.length > 0);
  assert.ok(resHw.data.data.products.every((p: any) => p.headerCategory === 'Hardware'));

  // 3. Export Master CSV
  const resExp = await invoke(exportMasterCatalogueCsv, { query: { category: 'Clothing' } });
  assert.equal(resExp.statusCode, 200);
  assert.equal(resExp.headers['content-type'], 'text/csv; charset=utf-8');
  assert.ok(resExp.data.includes('Product Name'));
  assert.ok(resExp.data.includes('Men Pure Cotton Regular Fit Solid Crew Neck T-Shirt'));
});

test('Feature 3: Master Catalogue 1-Click quick add to seller store creates valid product and inventory', async () => {
  const mockSellerId = new mongoose.Types.ObjectId();
  const mockSeller = {
    _id: mockSellerId,
    status: 'Approved',
    subscription: {
      status: 'active',
      endDate: new Date(Date.now() + 86400000 * 30),
    },
    select: () => mockSeller,
  };

  patch(Seller, 'findById', () => mockSeller);

  // Mock models
  let createdHeaderCatData: any = null;
  patch(HeaderCategory, 'findOne', async () => null);
  patch(HeaderCategory, 'create', async (data: any) => {
    createdHeaderCatData = data;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  });

  patch(Category, 'findOne', async () => null);
  patch(Category, 'create', async (data: any) => ({ _id: new mongoose.Types.ObjectId(), ...data }));

  let createdSubCatData: any = null;
  patch(SubCategory, 'findOne', async () => null);
  patch(SubCategory, 'create', async (data: any) => {
    createdSubCatData = data;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  });

  patch(Brand, 'findOne', async () => null);
  patch(Brand, 'create', async (data: any) => ({ _id: new mongoose.Types.ObjectId(), ...data }));

  patch(Tax, 'findOne', async () => null);
  patch(Tax, 'create', async (data: any) => ({ _id: new mongoose.Types.ObjectId(), ...data }));

  patch(Product, 'findOne', async () => null);
  let savedProductData: any = null;
  patch(Product.prototype, 'save', async function (this: any) {
    savedProductData = this.toObject ? this.toObject() : { ...this };
    return this;
  });

  let savedInventoryData: any = null;
  patch(Inventory, 'create', async (inv: any) => {
    savedInventoryData = inv;
    return inv;
  });

  const req: any = {
    user: { id: mockSellerId.toString(), userType: 'Seller' },
    body: {
      masterProductId: 'groc-001',
      customPrice: 250,
      customStock: 80,
    },
  };

  const res = await invoke(quickAddMasterProductToStore, req);
  assert.equal(res.statusCode, 201);
  assert.equal(res.data.success, true);

  // Verify HeaderCategory has required schema fields
  assert.ok(createdHeaderCatData);
  // Same icon convention as seeded headers, so the customer app can render it
  assert.equal(createdHeaderCatData.iconLibrary, 'Custom');
  assert.equal(createdHeaderCatData.iconName, 'grocery');

  // Verify SubCategory uses 'name' (and NOT 'subcategoryName') per schema
  assert.ok(createdSubCatData);
  assert.equal(createdSubCatData.name, 'Flours & Atta');
  assert.equal(createdSubCatData.subcategoryName, undefined);

  // Verify Product
  assert.ok(savedProductData);
  assert.equal(savedProductData.discPrice, 250);
  assert.equal(savedProductData.stock, 80);
  assert.equal(savedProductData.status, 'Active');

  // Verify Inventory strictly matches InventorySchema: currentStock and availableStock (NOT quantity)
  assert.ok(savedInventoryData);
  assert.equal(savedInventoryData.currentStock, 80);
  assert.equal(savedInventoryData.availableStock, 80);
  assert.equal(savedInventoryData.quantity, undefined);
});

test('Feature 3.1: Quick add on existing product increments stock without overwriting custom pricing or publish state', async () => {
  const mockSellerId = new mongoose.Types.ObjectId();
  const mockSeller = {
    _id: mockSellerId,
    status: 'Approved',
    subscription: {
      status: 'active',
      endDate: new Date(Date.now() + 86400000 * 30),
    },
    select: () => mockSeller,
  };
  patch(Seller, 'findById', () => mockSeller);

  patch(HeaderCategory, 'findOne', async () => ({ _id: new mongoose.Types.ObjectId(), name: 'Grocery' }));
  patch(Category, 'findOne', async () => ({ _id: new mongoose.Types.ObjectId(), name: 'Atta, Rice & Dal' }));
  patch(SubCategory, 'findOne', async () => ({ _id: new mongoose.Types.ObjectId(), name: 'Flours & Atta' }));
  patch(Brand, 'findOne', async () => ({ _id: new mongoose.Types.ObjectId(), name: 'Aashirvaad' }));
  patch(Tax, 'findOne', async () => ({ _id: new mongoose.Types.ObjectId(), percentage: 0, status: 'Active', save: async () => {} }));

  // Existing custom product that is hidden/unpublished with custom price
  const existingProduct: any = {
    _id: new mongoose.Types.ObjectId(),
    productName: 'Aashirvaad Superior MP Sharbati Whole Wheat Atta',
    price: 350,
    discPrice: 320,
    stock: 15,
    publish: false, // merchant deliberately unpublished it
    status: 'Inactive',
    variations: [
      {
        name: 'Unit',
        value: '5 kg',
        price: 350,
        discPrice: 320,
        stock: 15,
        status: 'Available',
      },
    ],
    save: async function () {
      return this;
    },
  };

  patch(Product, 'findOne', async () => existingProduct);

  let updatedInventoryQuery: any = null;
  let updatedInventoryInc: any = null;
  patch(Inventory, 'findOneAndUpdate', async (q: any, u: any) => {
    updatedInventoryQuery = q;
    updatedInventoryInc = u;
    return { ...existingProduct, ...u };
  });

  const req: any = {
    user: { id: mockSellerId.toString(), userType: 'Seller' },
    body: {
      masterProductId: 'groc-001',
      customStock: 25,
    },
  };

  const res = await invoke(quickAddMasterProductToStore, req);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.success, true);

  // Stock incremented from 15 + 25 = 40
  assert.equal(existingProduct.stock, 40);
  assert.equal(existingProduct.variations[0].stock, 40);

  // Custom price and publish status preserved!
  assert.equal(existingProduct.price, 350);
  assert.equal(existingProduct.discPrice, 320);
  assert.equal(existingProduct.publish, false);
  assert.equal(existingProduct.status, 'Inactive');

  // Inventory updated with $inc on currentStock and availableStock
  assert.ok(updatedInventoryInc);
  assert.equal(updatedInventoryInc.$inc.currentStock, 25);
  assert.equal(updatedInventoryInc.$inc.availableStock, 25);
});

test('Feature 4: Dynamic resolution of "Other" category, subcategory and GST rate', async () => {
  const mockSellerId = new mongoose.Types.ObjectId();
  const mockSeller = {
    _id: mockSellerId,
    status: 'Approved',
    subscription: {
      status: 'active',
      endDate: new Date(Date.now() + 86400000 * 30),
    },
    select: () => mockSeller,
  };
  patch(Seller, 'findById', () => mockSeller);

  let createdCategoryName = '';
  const mockCreatedCatId = new mongoose.Types.ObjectId();
  patch(Category, 'findOne', async () => null);
  patch(Category, 'create', async (data: any) => {
    createdCategoryName = data.name;
    return { _id: mockCreatedCatId, ...data };
  });

  let createdSubCatData: any = null;
  const mockCreatedSubId = new mongoose.Types.ObjectId();
  patch(SubCategory, 'findOne', async () => null);
  patch(SubCategory, 'create', async (data: any) => {
    createdSubCatData = data;
    return { _id: mockCreatedSubId, ...data };
  });

  let createdTaxRate = 0;
  const mockCreatedTaxId = new mongoose.Types.ObjectId();
  patch(Tax, 'findOne', async () => null);
  patch(Tax, 'create', async (data: any) => {
    createdTaxRate = data.percentage;
    return { _id: mockCreatedTaxId, ...data };
  });

  let createdProductDoc: any = null;
  patch(Product, 'create', async (data: any) => {
    createdProductDoc = data;
    return {
      _id: new mongoose.Types.ObjectId(),
      ...data,
      toObject: () => data,
    };
  });
  patch(Inventory, 'create', async (inv: any) => inv);

  // 1. Create with custom category, subcategory, and tax rate
  const reqCreate: any = {
    user: { id: mockSellerId.toString(), userId: mockSellerId.toString(), userType: 'Seller' },
    body: {
      productName: 'Handcrafted Terracotta Clay Water Pot (Special Edition)',
      category: '__other__',
      customCategory: 'Handicrafts & Pottery (Arts)',
      subcategory: '__other__',
      customSubcategory: 'Clay Kitchenware (Earthenware)',
      tax: '__other__',
      customTaxRate: '12',
      publish: true,
      variations: [
        {
          title: '5 Litre Pot',
          price: 499,
          discPrice: 399,
          stock: 20,
        },
      ],
    },
  };

  const resCreate = await invoke(createProduct, reqCreate);
  assert.equal(resCreate.statusCode, 201);
  assert.equal(resCreate.data.success, true);

  assert.equal(createdCategoryName, 'Handicrafts & Pottery (Arts)');
  // Strict schema assertion: SubCategory uses 'name', not 'subcategoryName'
  assert.ok(createdSubCatData);
  assert.equal(createdSubCatData.name, 'Clay Kitchenware (Earthenware)');
  assert.equal(createdSubCatData.subcategoryName, undefined);
  assert.equal(createdTaxRate, 12);

  // Product document contains valid ObjectIds, not "__other__" strings!
  assert.equal(createdProductDoc.category.toString(), mockCreatedCatId.toString());
  assert.equal(createdProductDoc.subcategory.toString(), mockCreatedSubId.toString());
  assert.equal(createdProductDoc.tax.toString(), mockCreatedTaxId.toString());
  assert.equal(createdProductDoc.customCategory, undefined);
  assert.equal(createdProductDoc.customSubcategory, undefined);
  assert.equal(createdProductDoc.customTaxRate, undefined);
});

test('Feature 5: seedStandardTaxes automatically creates 0%, 5%, 12%, 18%, 28% GST slabs', async () => {
  const { seedStandardTaxes, STANDARD_GST_SLABS } = await import('../utils/seedStandardTaxes');

  assert.equal(STANDARD_GST_SLABS.length, 5);
  assert.deepEqual(
    STANDARD_GST_SLABS.map((s) => s.percentage),
    [0, 5, 12, 18, 28]
  );

  const createdTaxes: any[] = [];
  patch(Tax, 'findOne', async (query: any) => {
    // Simulate GST 18% already exists
    const queryRate = query.$or?.[0]?.percentage;
    if (queryRate === 18) {
      return { _id: new mongoose.Types.ObjectId(), name: 'GST 18%', percentage: 18, status: 'Active' };
    }
    return null;
  });

  patch(Tax, 'create', async (data: any) => {
    createdTaxes.push(data);
    return { _id: new mongoose.Types.ObjectId(), ...data };
  });

  await seedStandardTaxes();

  // 4 missing slabs (0, 5, 12, 28) should be created; 18 should be skipped
  assert.equal(createdTaxes.length, 4);
  assert.ok(createdTaxes.some((t) => t.percentage === 0 && t.name === 'GST 0%'));
  assert.ok(createdTaxes.some((t) => t.percentage === 5 && t.name === 'GST 5%'));
  assert.ok(createdTaxes.some((t) => t.percentage === 12 && t.name === 'GST 12%'));
  assert.ok(createdTaxes.some((t) => t.percentage === 28 && t.name === 'GST 28%'));
  assert.ok(!createdTaxes.some((t) => t.percentage === 18));
});
