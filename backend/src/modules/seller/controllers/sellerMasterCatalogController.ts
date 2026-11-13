import { Request, Response } from "express";
import mongoose from "mongoose";
import Product from "../../../models/Product";
import Category from "../../../models/Category";
import SubCategory from "../../../models/SubCategory";
import Brand from "../../../models/Brand";
import HeaderCategory from "../../../models/HeaderCategory";
import Tax from "../../../models/Tax";
import Seller from "../../../models/Seller";
import Inventory from "../../../models/Inventory";
import { asyncHandler } from "../../../utils/asyncHandler";
import { buildCsv } from "../../../utils/csvParser";
import {
  MASTER_CATALOG_PRODUCTS,
  MASTER_CATALOG_CATEGORIES,
} from "../../../data/masterCatalogData";
import { generateAutoSku } from "./sellerBulkProductController";

/**
 * Ensure seller is approved and has active subscription
 */
async function ensureSellerApproved(sellerId: string): Promise<string | null> {
  const seller = await Seller.findById(sellerId).select("status subscription");
  if (!seller) return "Seller account not found.";
  if (seller.status !== "Approved") {
    return "Your seller account is awaiting admin approval. You can add products once approved.";
  }
  const sub = seller.subscription;
  const hasActiveSub =
    sub && sub.status === "active" && sub.endDate && new Date(sub.endDate) >= new Date();
  if (!hasActiveSub && (sub || process.env.NODE_ENV !== "test")) {
    return "Your store does not have an active subscription. Please subscribe to continue managing products.";
  }
  return null;
}

function toSlug(str: string): string {
  return (
    str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /products/master-catalogue
 * Retrieve master catalogue items with search and category filtering
 */
export const getMasterCatalogue = asyncHandler(async (req: Request, res: Response) => {
  const categoryFilter = String(req.query.category || "All").trim();
  const search = String(req.query.search || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || "50"), 10)));

  let filtered = MASTER_CATALOG_PRODUCTS;

  if (categoryFilter && categoryFilter !== "All") {
    const norm = categoryFilter.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.headerCategory.toLowerCase() === norm ||
        (norm === "clothing" && p.headerCategory.toLowerCase() === "fashion") ||
        (norm === "fashion" && p.headerCategory.toLowerCase() === "clothing") ||
        p.category.toLowerCase().includes(norm)
    );
  }

  if (search) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search) ||
        p.subcategory.toLowerCase().includes(search) ||
        p.brand.toLowerCase().includes(search) ||
        p.barcode.toLowerCase().includes(search)
    );
  }

  const total = filtered.length;
  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  return res.status(200).json({
    success: true,
    data: {
      products: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      categories: MASTER_CATALOG_CATEGORIES,
    },
  });
});

/**
 * GET /products/master-catalogue/export
 * Export master catalogue products as a ready-to-import CSV file
 */
export const exportMasterCatalogueCsv = asyncHandler(async (req: Request, res: Response) => {
  const categoryFilter = String(req.query.category || "All").trim();

  let filtered = MASTER_CATALOG_PRODUCTS;
  if (categoryFilter && categoryFilter !== "All") {
    const norm = categoryFilter.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.headerCategory.toLowerCase() === norm ||
        (norm === "clothing" && p.headerCategory.toLowerCase() === "fashion") ||
        (norm === "fashion" && p.headerCategory.toLowerCase() === "clothing") ||
        p.category.toLowerCase().includes(norm)
    );
  }

  const headers = [
    "Product Name",
    "Category",
    "SubCategory",
    "Brand",
    "MRP",
    "Selling Price",
    "Stock",
    "Unit / Variation",
    "SKU (Optional)",
    "Food Type",
    "Image URL",
    "Description",
  ];

  const rows: (string | number)[][] = filtered.map((p) => [
    p.name,
    p.category,
    p.subcategory,
    p.brand,
    p.mrp,
    p.suggestedPrice,
    p.defaultStock,
    p.unit,
    "", // Leave blank for auto SKU generation
    p.foodType,
    p.imageUrl,
    p.description,
  ]);

  const csvContent = buildCsv(headers, rows);
  const safeCatName = toSlug(categoryFilter);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="hello_local_master_catalogue_${safeCatName}.csv"`
  );
  return res.status(200).send(csvContent);
});

/**
 * POST /products/master-catalogue/add-to-store
 * Quick-add a master catalog item directly to the seller's inventory
 */
export const quickAddMasterProductToStore = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
  if (!sellerId) {
    return res.status(401).json({ success: false, message: "Unauthorized seller" });
  }

  const approvalErr = await ensureSellerApproved(sellerId);
  if (approvalErr) {
    return res.status(403).json({ success: false, message: approvalErr });
  }

  const { masterProductId, customPrice, customStock, customMrp } = req.body;
  if (!masterProductId) {
    return res.status(400).json({ success: false, message: "Master Product ID is required" });
  }

  const master = MASTER_CATALOG_PRODUCTS.find((p) => p.id === masterProductId);
  if (!master) {
    return res.status(404).json({ success: false, message: "Master product not found" });
  }

  const finalMrp = typeof customMrp === "number" && customMrp > 0 ? customMrp : master.mrp;
  const finalPrice =
    typeof customPrice === "number" && customPrice > 0 ? customPrice : master.suggestedPrice;
  const finalStock =
    typeof customStock === "number" && customStock >= 0 ? customStock : master.defaultStock;

  if (finalPrice > finalMrp) {
    return res.status(400).json({
      success: false,
      message: "Selling price cannot exceed Maximum Retail Price (MRP).",
    });
  }

  // 1. Resolve or create HeaderCategory
  const rawHeader = master.headerCategory.trim();
  const canonicalHeader = rawHeader.toLowerCase() === "clothing" ? "Fashion" : rawHeader;
  let headerCat = await HeaderCategory.findOne({
    $or: [
      { name: { $regex: new RegExp(`^${escapeRegExp(canonicalHeader)}$`, "i") } },
      { name: { $regex: new RegExp(`^${escapeRegExp(rawHeader)}$`, "i") } },
    ],
  });
  if (!headerCat) {
    headerCat = await HeaderCategory.create({
      name: canonicalHeader,
      // Same convention as the seeded headers; the customer app resolves
      // the icon from this name (grocery, fashion, medical, hardware, ...).
      iconLibrary: "Custom",
      iconName: toSlug(canonicalHeader),
      slug: toSlug(canonicalHeader) + "-" + Date.now().toString(36),
      status: "Published",
    });
  }

  // 2. Resolve or create Category
  let categoryDoc = await Category.findOne({
    name: { $regex: new RegExp(`^${escapeRegExp(master.category.trim())}$`, "i") },
  });
  if (!categoryDoc) {
    categoryDoc = await Category.create({
      name: master.category.trim(),
      slug: toSlug(master.category) + "-" + Date.now().toString(36),
      headerCategoryId: headerCat._id,
      status: "Active",
    });
  }

  // 3. Resolve or create SubCategory
  let subCategoryDoc = await SubCategory.findOne({
    category: categoryDoc._id,
    name: { $regex: new RegExp(`^${escapeRegExp(master.subcategory.trim())}$`, "i") },
  });
  if (!subCategoryDoc) {
    subCategoryDoc = await SubCategory.create({
      name: master.subcategory.trim(),
      category: categoryDoc._id,
    });
  }

  // 4. Resolve or create Brand
  let brandDoc = null;
  if (master.brand) {
    brandDoc = await Brand.findOne({
      name: { $regex: new RegExp(`^${escapeRegExp(master.brand.trim())}$`, "i") },
    });
    if (!brandDoc) {
      brandDoc = await Brand.create({
        name: master.brand.trim(),
        slug: toSlug(master.brand) + "-" + Date.now().toString(36),
        status: "Active",
      });
    }
  }

  // 5. Resolve or create Tax (reuse existing tax ID without mutating global admin status)
  let taxDoc = null;
  if (master.taxPercent !== undefined) {
    taxDoc = await Tax.findOne({
      $or: [
        { percentage: master.taxPercent },
        { name: { $regex: new RegExp(`^GST ${master.taxPercent}%$`, "i") } },
      ],
    });
    if (!taxDoc) {
      taxDoc = await Tax.create({
        name: `GST ${master.taxPercent}%`,
        percentage: master.taxPercent,
        status: "Active",
      });
    }
  }

  // 6. Check if this seller already has this product by name
  const existingProduct = await Product.findOne({
    seller: sellerId,
    productName: { $regex: new RegExp(`^${escapeRegExp(master.name.trim())}$`, "i") },
  });

  const generatedSku = generateAutoSku(master.name, master.unit);

  if (existingProduct) {
    // Increment stock only: do NOT overwrite custom prices, discounts or unpublish status (#306)
    existingProduct.stock = (existingProduct.stock || 0) + finalStock;

    if (existingProduct.variations && existingProduct.variations.length > 0) {
      existingProduct.variations[0].stock =
        (existingProduct.variations[0].stock || 0) + finalStock;
      if (existingProduct.variations[0].stock > 0) {
        existingProduct.variations[0].status = "Available";
      }
    }

    await existingProduct.save();

    await Inventory.findOneAndUpdate(
      { product: existingProduct._id, seller: sellerId },
      {
        $inc: { currentStock: finalStock, availableStock: finalStock },
      },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: `Added ${finalStock} units of stock to existing product "${master.name}".`,
      data: existingProduct,
    });
  }

  // 7. Create brand new Product
  const variationId = new mongoose.Types.ObjectId();
  const newProduct = new Product({
    productName: master.name,
    headerCategoryId: headerCat._id,
    category: categoryDoc._id,
    subcategory: subCategoryDoc._id,
    brand: brandDoc ? brandDoc._id : null,
    seller: sellerId,
    mainImage: master.imageUrl,
    galleryImages: [master.imageUrl],
    price: finalMrp,
    discPrice: finalPrice,
    compareAtPrice: finalMrp,
    discount: finalMrp > finalPrice ? Math.round(((finalMrp - finalPrice) / finalMrp) * 100) : 0,
    stock: finalStock,
    sku: generatedSku,
    barcode: master.barcode,
    foodType: master.foodType,
    variationType: "Unit",
    variations: [
      {
        _id: variationId,
        name: "Unit",
        value: master.unit,
        price: finalMrp,
        discPrice: finalPrice,
        stock: finalStock,
        sku: generatedSku,
        status: finalStock > 0 ? "Available" : "Sold out",
      },
    ],
    tax: taxDoc ? taxDoc._id : null,
    smallDescription: master.description,
    description: master.description,
    publish: true,
    popular: false,
    dealOfDay: false,
    status: "Active",
    rating: 0,
    reviewsCount: 0,
  });

  await newProduct.save();

  // Create Inventory document strictly matching InventorySchema
  await Inventory.create({
    product: newProduct._id,
    seller: sellerId,
    currentStock: finalStock,
    availableStock: finalStock,
    reservedStock: 0,
    lowStockThreshold: 5,
    reorderLevel: 10,
  });

  return res.status(201).json({
    success: true,
    message: `"${master.name}" added to your store catalog successfully!`,
    data: newProduct,
  });
});
