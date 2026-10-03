import { Request, Response } from "express";
import mongoose from "mongoose";
import Seller from "../../../models/Seller";
import Product from "../../../models/Product";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Get seller store preview data (store profile + all products sorted by displayOrder)
 */
export const getStorePreview = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const sellerObjId = mongoose.Types.ObjectId.isValid(sellerId)
    ? new mongoose.Types.ObjectId(sellerId)
    : sellerId;

  const seller = await Seller.findById(sellerObjId)
    .select(
      "sellerName storeName storeBanner profile slug address city mobile isShopOpen category categories storeDescription"
    )
    .lean();

  if (!seller) {
    return res.status(404).json({
      success: false,
      message: "Seller store not found",
    });
  }

  const products = await Product.find({ seller: sellerObjId })
    .populate("category", "name icon image")
    .populate("subcategory", "name")
    .populate("brand", "name image")
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean({ virtuals: true });

  return res.status(200).json({
    success: true,
    data: {
      store: {
        id: (seller as any)._id,
        name: seller.storeName || (seller as any).sellerName || "Hello Local Vendor Store",
        storeBanner: seller.storeBanner || "",
        logo: seller.profile || "",
        address: seller.address || "",
        city: seller.city || "",
        mobile: seller.mobile || "",
        isShopOpen: seller.isShopOpen ?? true,
        category: (seller as any).category || "General Store",
        slug: (seller as any).slug || "my-store",
      },
      products: products.map((p: any) => ({
        ...p,
        price: p.price ?? 0,
        discPrice: p.discPrice ?? p.price ?? 0,
        publish: p.publish ?? true,
        popular: p.popular ?? false,
        displayOrder: p.displayOrder ?? 0,
      })),
    },
  });
});

/**
 * Direct instant price update for a product
 */
export const quickUpdatePrice = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  const { price, discPrice } = req.body;

  if (price === undefined && discPrice === undefined) {
    return res.status(400).json({
      success: false,
      message: "Price or discounted selling price is required",
    });
  }

  const product = await Product.findOne({ _id: id, seller: sellerId });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found or unauthorized",
    });
  }

  if (price !== undefined) {
    const numPrice = Number(price);
    if (!isNaN(numPrice) && numPrice >= 0) {
      product.price = numPrice;
    }
  }

  if (discPrice !== undefined) {
    const numDiscPrice = Number(discPrice);
    if (!isNaN(numDiscPrice) && numDiscPrice >= 0) {
      product.discPrice = numDiscPrice;
    }
  }

  // Update variation price if present
  if (product.variations && product.variations.length > 0) {
    product.variations[0].price = product.price;
    product.variations[0].discPrice = product.discPrice || product.price;
  }

  // Recalculate discount percentage
  if (product.price && product.discPrice && product.price > product.discPrice) {
    product.discount = Math.round(
      ((product.price - product.discPrice) / product.price) * 100
    );
  } else {
    product.discount = 0;
  }

  await product.save();

  return res.status(200).json({
    success: true,
    message: "Price updated successfully",
    data: product,
  });
});

/**
 * Toggle product publish / hide status
 */
export const togglePublish = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;

  const product = await Product.findOne({ _id: id, seller: sellerId });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found or unauthorized",
    });
  }

  product.publish = !product.publish;
  product.status = product.publish ? "Active" : "Inactive";
  await product.save();

  return res.status(200).json({
    success: true,
    message: product.publish ? "Product is now visible in store" : "Product hidden from store",
    data: {
      id: product._id,
      publish: product.publish,
      status: product.status,
    },
  });
});

/**
 * Toggle product feature / highlight status
 */
export const toggleFeature = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;

  const product = await Product.findOne({ _id: id, seller: sellerId });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found or unauthorized",
    });
  }

  product.popular = !product.popular;
  await product.save();

  return res.status(200).json({
    success: true,
    message: product.popular ? "Product marked as Featured" : "Product unfeatured",
    data: {
      id: product._id,
      popular: product.popular,
    },
  });
});

/**
 * Batch reorder products displayOrder
 */
export const reorderProducts = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { productIds } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "productIds must be a non-empty array of product IDs",
    });
  }

  const bulkOps = productIds.map((id: string, index: number) => ({
    updateOne: {
      filter: { _id: id, seller: sellerId },
      update: { $set: { displayOrder: index } },
    },
  }));

  await Product.bulkWrite(bulkOps);

  return res.status(200).json({
    success: true,
    message: "Store product order updated successfully",
  });
});
