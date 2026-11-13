import { Request, Response } from "express";
import mongoose from "mongoose";
import Product from "../../../models/Product";
import Category from "../../../models/Category";
import SubCategory from "../../../models/SubCategory";
import Brand from "../../../models/Brand";
import HeaderCategory from "../../../models/HeaderCategory";
import Seller from "../../../models/Seller";
import Inventory from "../../../models/Inventory";
import { asyncHandler } from "../../../utils/asyncHandler";
import { parseCsv, buildCsv } from "../../../utils/csvParser";

import {
  MASTER_CATALOG_PRODUCTS,
} from "../../../data/masterCatalogData";

/**
 * Ensure seller is approved and has active subscription before allowing bulk product uploads
 */
async function ensureSellerApproved(sellerId: string): Promise<string | null> {
  const seller = await Seller.findById(sellerId).select("status subscription");
  if (!seller) return "Seller account not found.";
  if (seller.status !== "Approved") {
    return "Your seller account is awaiting admin approval. You can add products once approved.";
  }
  const sub = seller.subscription;
  const hasActiveSub = sub && sub.status === "active" && sub.endDate && new Date(sub.endDate) >= new Date();
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

/**
 * Clean numeric string from currency symbols, commas, spaces
 */
function parseNumericValue(val: unknown, fallback: number = 0): number {
  if (val === null || val === undefined) return fallback;
  const str = String(val).replace(/[^0-9.]/g, "").trim();
  const num = parseFloat(str);
  return isNaN(num) ? fallback : num;
}

/**
 * Find field value by checking multiple alias headers (case-insensitive)
 */
function getRowField(data: Record<string, string>, aliases: string[]): string {
  const normalizedKeys = Object.keys(data).map((k) => ({
    original: k,
    normalized: k.toLowerCase().replace(/[^a-z0-9]/g, ""),
  }));

  for (const alias of aliases) {
    const normAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = normalizedKeys.find((k) => k.normalized === normAlias);
    if (match && data[match.original] !== undefined) {
      return data[match.original].trim();
    }
  }

  return "";
}

/**
 * Generate readable, unique SKU if not provided by seller
 */
export function generateAutoSku(productName: string, variationTitle?: string): string {
  const words = productName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const prefix = words.slice(0, 3).map((w) => w.slice(0, 3)).join("");
  const cleanPrefix = prefix.length >= 3 ? prefix : "HLP";
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const varTag =
    variationTitle && variationTitle.toLowerCase() !== "default"
      ? `-${variationTitle.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5)}`
      : "";

  return `${cleanPrefix}${varTag}-${randomSuffix}`;
}

/**
 * GET /products/bulk-template
 * Download ready-to-use Sample CSV Template with active categories
 */
export const downloadSampleTemplate = asyncHandler(async (req: Request, res: Response) => {
  const categoryFilter = String(req.query.category || "").trim().toLowerCase();

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

  let targetProducts = MASTER_CATALOG_PRODUCTS;
  if (categoryFilter && categoryFilter !== "all") {
    // "Clothing" is the older name of the "Fashion" header; accept both.
    const headerFilter = categoryFilter === "clothing" ? "fashion" : categoryFilter;
    targetProducts = MASTER_CATALOG_PRODUCTS.filter(
      (p) =>
        p.headerCategory.toLowerCase().includes(headerFilter) ||
        p.category.toLowerCase().includes(categoryFilter)
    );
  }

  // If specific category was requested, take all items (or up to 10). If "all", take 1-2 from each category.
  const sampleItems =
    categoryFilter && categoryFilter !== "all"
      ? targetProducts.slice(0, 15)
      : [
          ...MASTER_CATALOG_PRODUCTS.filter((p) => p.headerCategory === "Grocery").slice(0, 2),
          ...MASTER_CATALOG_PRODUCTS.filter((p) => p.headerCategory === "Electronics").slice(0, 2),
          ...MASTER_CATALOG_PRODUCTS.filter((p) => p.headerCategory === "Medical").slice(0, 2),
          ...MASTER_CATALOG_PRODUCTS.filter((p) => p.headerCategory === "Fashion").slice(0, 2),
          ...MASTER_CATALOG_PRODUCTS.filter((p) => p.headerCategory === "Hardware").slice(0, 2),
          ...MASTER_CATALOG_PRODUCTS.filter((p) => p.headerCategory === "Stationery").slice(0, 2),
        ];

  const sampleRows: (string | number)[][] = sampleItems.map((p) => [
    p.name,
    p.category,
    p.subcategory,
    p.brand,
    p.mrp,
    p.suggestedPrice,
    p.defaultStock,
    p.unit,
    "", // Left blank: automatically generated by system!
    p.foodType,
    p.imageUrl,
    p.description,
  ]);

  const csvContent = buildCsv(headers, sampleRows);
  const filename = categoryFilter
    ? `hello_local_${toSlug(categoryFilter)}_sample_import.csv`
    : "hello_local_sample_product_import.csv";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  return res.status(200).send(csvContent);
});

/**
 * POST /products/bulk-upload
 * Process bulk CSV product upload
 */
export const bulkUploadProducts = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;

  // 1. Verify seller approval
  const approvalError = await ensureSellerApproved(sellerId);
  if (approvalError) {
    return res.status(403).json({ success: false, message: approvalError });
  }

  // 2. Extract file content
  let csvText = "";
  if (req.file && req.file.buffer) {
    csvText = req.file.buffer.toString("utf-8");
  } else if (req.body.csv && typeof req.body.csv === "string") {
    csvText = req.body.csv;
  } else {
    return res.status(400).json({
      success: false,
      message: "Please upload a CSV file or provide CSV text.",
    });
  }

  // 3. Parse CSV
  const { rows } = parseCsv(csvText);

  if (rows.length === 0) {
    return res.status(400).json({
      success: false,
      message: "The uploaded file is empty or does not contain valid data rows.",
    });
  }

  if (rows.length > 1000) {
    return res.status(400).json({
      success: false,
      message: `Batch limit exceeded. Maximum 1,000 products per upload (found ${rows.length} rows).`,
    });
  }

  const updateExisting =
    req.body.updateExisting === true ||
    req.body.updateExisting === "true" ||
    req.body.updateExisting === "1";

  // 4. Load Lookups into fast memory maps
  const [categoriesList, subCategoriesList, brandsList, headerCategoriesList] = await Promise.all([
    Category.find().select("name headerCategoryId slug").lean(),
    SubCategory.find().select("name category slug").lean(),
    Brand.find().select("name").lean(),
    HeaderCategory.find().select("name slug").lean(),
  ]);

  const categoryMap = new Map<string, any>();
  categoriesList.forEach((cat) => {
    categoryMap.set(cat.name.trim().toLowerCase(), cat);
    if (cat.slug) categoryMap.set(cat.slug.trim().toLowerCase(), cat);
  });

  const headerCategoryMap = new Map<string, any>();
  headerCategoriesList.forEach((hc) => {
    headerCategoryMap.set(hc.name.trim().toLowerCase(), hc);
    if (hc.slug) headerCategoryMap.set(hc.slug.trim().toLowerCase(), hc);
  });

  const subCategoryMap = new Map<string, any>();
  subCategoriesList.forEach((sub) => {
    const key = `${sub.name.trim().toLowerCase()}__${sub.category?.toString()}`;
    subCategoryMap.set(key, sub);
    // Also store by name only as fallback
    if (!subCategoryMap.has(sub.name.trim().toLowerCase())) {
      subCategoryMap.set(sub.name.trim().toLowerCase(), sub);
    }
  });

  const brandMap = new Map<string, any>();
  brandsList.forEach((b) => {
    brandMap.set(b.name.trim().toLowerCase(), b);
  });

  // 5. Row-by-Row Validation and Grouping
  const validationErrors: Array<{ rowNumber: number; productName: string; error: string }> = [];
  const validProductsToProcess: any[] = [];

  for (const row of rows) {
    const data = row.data;

    const productName = getRowField(data, ["Product Name", "ProductName", "Name", "Title"]);
    const categoryName = getRowField(data, ["Category", "Category Name"]);
    const subCategoryName = getRowField(data, ["SubCategory", "Sub Category", "SubCategory Name"]);
    const brandName = getRowField(data, ["Brand", "Brand Name"]);
    const mrpStr = getRowField(data, ["MRP", "Compare At Price", "Original Price"]);
    const sellingPriceStr = getRowField(data, ["Selling Price", "Price", "Discount Price", "Disc Price"]);
    const stockStr = getRowField(data, ["Stock", "Quantity", "Qty", "Inventory"]);
    const variationTitle = getRowField(data, ["Unit / Variation", "Variation", "Unit", "Pack", "Weight", "Size"]);
    const sku = getRowField(data, [
      "SKU (Optional)",
      "SKU",
      "Product Code",
      "Item Code",
      "Barcode",
    ]);
    const foodType = getRowField(data, ["Food Type", "FoodType", "Type"]);
    const imageUrl = getRowField(data, ["Image URL", "Main Image", "Image", "ImageURL"]);
    const description = getRowField(data, ["Description", "Small Description", "Details"]);

    // Validation 1: Product Name is required
    if (!productName) {
      validationErrors.push({
        rowNumber: row.rowNumber,
        productName: "Unknown",
        error: "Product Name is required",
      });
      continue;
    }

    // Validation 2: Category is required and resolved intelligently
    if (!categoryName) {
      validationErrors.push({
        rowNumber: row.rowNumber,
        productName,
        error: "Category is required",
      });
      continue;
    }

    let matchedCategory = categoryMap.get(categoryName.toLowerCase());
    if (!matchedCategory) {
      // 1. Check if categoryName matches a HeaderCategory (e.g. Grocery, Electronics, Medical, Clothing, Hardware)
      const matchedHeader = headerCategoryMap.get(categoryName.toLowerCase());
      if (matchedHeader) {
        // Look up by category name first before attempting to create
        matchedCategory = categoryMap.get(categoryName.toLowerCase());
        if (!matchedCategory) {
          try {
            const newSlug = toSlug(categoryName);
            const createdCat = await Category.create({
              name: categoryName,
              slug: newSlug,
              headerCategoryId: matchedHeader._id,
              status: "Active",
            });
            matchedCategory = createdCat;
            categoryMap.set(categoryName.toLowerCase(), createdCat);
          } catch (catErr: any) {
            // If slug collision, append random digits
            const fallbackSlug = `${toSlug(categoryName)}-${Math.floor(100 + Math.random() * 900)}`;
            const createdCat = await Category.create({
              name: categoryName,
              slug: fallbackSlug,
              headerCategoryId: matchedHeader._id,
              status: "Active",
            });
            matchedCategory = createdCat;
            categoryMap.set(categoryName.toLowerCase(), createdCat);
          }
        }
      } else {
        // 2. Auto-create new category under active status so seller CSV is never rejected!
        try {
          const newSlug = toSlug(categoryName);
          const createdCat = await Category.create({
            name: categoryName,
            slug: newSlug,
            status: "Active",
          });
          matchedCategory = createdCat;
          categoryMap.set(categoryName.toLowerCase(), createdCat);
        } catch (catErr: any) {
          const fallbackSlug = `${toSlug(categoryName)}-${Math.floor(100 + Math.random() * 900)}`;
          const createdCat = await Category.create({
            name: categoryName,
            slug: fallbackSlug,
            status: "Active",
          });
          matchedCategory = createdCat;
          categoryMap.set(categoryName.toLowerCase(), createdCat);
        }
      }
    }

    // Validation 3: Pricing
    const mrp = parseNumericValue(mrpStr, 0);
    const sellingPrice = parseNumericValue(sellingPriceStr, mrp);

    if (mrp <= 0 && sellingPrice <= 0) {
      validationErrors.push({
        rowNumber: row.rowNumber,
        productName,
        error: "Price must be greater than 0",
      });
      continue;
    }

    const effectiveMrp = mrp > 0 ? mrp : sellingPrice;
    const effectiveSellingPrice = sellingPrice > 0 ? sellingPrice : effectiveMrp;

    if (effectiveSellingPrice > effectiveMrp) {
      validationErrors.push({
        rowNumber: row.rowNumber,
        productName,
        error: `Selling Price (₹${effectiveSellingPrice}) cannot be greater than MRP (₹${effectiveMrp})`,
      });
      continue;
    }

    // Validation 4: Stock
    const stock = Math.max(0, Math.floor(parseNumericValue(stockStr, 0)));

    // Resolve optional subcategory (auto-create if missing)
    let subcategoryId: mongoose.Types.ObjectId | null = null;
    if (subCategoryName) {
      const specificSub = subCategoryMap.get(
        `${subCategoryName.toLowerCase()}__${matchedCategory._id.toString()}`
      );
      if (specificSub) {
        subcategoryId = specificSub._id;
      } else {
        const generalSub = subCategoryMap.get(subCategoryName.toLowerCase());
        if (generalSub) {
          subcategoryId = generalSub._id;
        } else {
          try {
            const createdSub = await SubCategory.create({
              name: subCategoryName,
              category: matchedCategory._id,
            });
            subcategoryId = createdSub._id;
            subCategoryMap.set(`${subCategoryName.toLowerCase()}__${matchedCategory._id.toString()}`, createdSub);
            subCategoryMap.set(subCategoryName.toLowerCase(), createdSub);
          } catch (subErr) {
            // Non-fatal if subcategory creation fails
          }
        }
      }
    }

    // Resolve optional brand (auto-create if missing)
    let brandId: mongoose.Types.ObjectId | null = null;
    if (brandName) {
      let matchedBrand = brandMap.get(brandName.toLowerCase());
      if (matchedBrand) {
        brandId = matchedBrand._id;
      } else {
        try {
          const createdBrand = await Brand.create({
            name: brandName,
            status: "Active",
          });
          brandId = createdBrand._id;
          brandMap.set(brandName.toLowerCase(), createdBrand);
        } catch (brandErr) {
          // Non-fatal if brand creation fails
        }
      }
    }

    // Calculate discount percentage
    const discount =
      effectiveMrp > effectiveSellingPrice
        ? Math.round(((effectiveMrp - effectiveSellingPrice) / effectiveMrp) * 100)
        : 0;

    // Food Type
    let normalizedFoodType: "Veg" | "Non-Veg" | "None" = "Veg";
    if (foodType.toLowerCase().includes("non")) {
      normalizedFoodType = "Non-Veg";
    } else if (foodType.toLowerCase() === "none") {
      normalizedFoodType = "None";
    }

    const effectiveSku =
      sku && sku.trim().length > 0
        ? sku.trim()
        : generateAutoSku(productName, variationTitle);

    const variationItem = {
      title: variationTitle || "Default",
      name: "Variation",
      value: variationTitle || "Default",
      price: effectiveMrp,
      discPrice: effectiveSellingPrice,
      stock,
      sku: effectiveSku,
      status: stock > 0 ? "Available" : "Sold out",
    };

    validProductsToProcess.push({
      rowNumber: row.rowNumber,
      productName,
      category: matchedCategory._id,
      headerCategoryId: matchedCategory.headerCategoryId || undefined,
      subcategory: subcategoryId || undefined,
      brand: brandId || undefined,
      price: effectiveMrp,
      discPrice: effectiveSellingPrice,
      compareAtPrice: effectiveMrp,
      stock,
      discount,
      sku: effectiveSku,
      foodType: normalizedFoodType,
      mainImage: imageUrl || undefined,
      smallDescription: description || undefined,
      description: description || undefined,
      variations: [variationItem],
      publish: true,
      status: "Active",
      requiresApproval: false,
    });
  }

  // 6. Group consecutive rows with same Product Name as multi-variant products
  const groupedProducts: any[] = [];
  const productGroupMap = new Map<string, any>();

  for (const item of validProductsToProcess) {
    const groupKey = `${item.productName.trim().toLowerCase()}__${item.category.toString()}`;

    if (productGroupMap.has(groupKey)) {
      const existing = productGroupMap.get(groupKey);
      // Append variation
      existing.variations.push(item.variations[0]);
      // Accumulate stock
      existing.stock += item.stock;
    } else {
      productGroupMap.set(groupKey, item);
      groupedProducts.push(item);
    }
  }

  // 7. Insert or Upsert into MongoDB
  let successCount = 0;
  const sellerObjId = new mongoose.Types.ObjectId(sellerId);

  for (const p of groupedProducts) {
    try {
      if (updateExisting && p.sku) {
        // Try finding existing product by SKU for this seller
        const existingProduct = await Product.findOne({ sku: p.sku, seller: sellerObjId });
        if (existingProduct) {
          existingProduct.productName = p.productName;
          existingProduct.price = p.price;
          existingProduct.discPrice = p.discPrice;
          existingProduct.compareAtPrice = p.compareAtPrice;
          existingProduct.stock = p.stock;
          existingProduct.discount = p.discount;
          existingProduct.variations = p.variations;
          if (p.mainImage) existingProduct.mainImage = p.mainImage;
          if (p.category) existingProduct.category = p.category;
          if (p.subcategory) existingProduct.subcategory = p.subcategory;
          await existingProduct.save();

          await Inventory.findOneAndUpdate(
            { product: existingProduct._id, seller: sellerObjId },
            {
              $set: {
                currentStock: p.stock,
                availableStock: p.stock,
              },
            },
            { upsert: true }
          );

          successCount++;
          continue;
        }
      }

      // Create new product
      const createdProduct = await Product.create({
        ...p,
        seller: sellerObjId,
      });

      // Create inventory record
      await Inventory.create({
        product: createdProduct._id,
        seller: sellerObjId,
        currentStock: p.stock,
        availableStock: p.stock,
        reservedStock: 0,
        lowStockThreshold: 5,
        reorderLevel: 10,
      });

      successCount++;
    } catch (err: any) {
      validationErrors.push({
        rowNumber: p.rowNumber,
        productName: p.productName,
        error: err.code === 11000 ? `Duplicate SKU '${p.sku}' already exists` : err.message,
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: `Bulk import completed: ${successCount} succeeded, ${validationErrors.length} failed.`,
    data: {
      totalRows: rows.length,
      successCount,
      failedCount: validationErrors.length,
      errors: validationErrors,
    },
  });
});
