import { Request, Response } from "express";
import mongoose from "mongoose";
import Category from "../../../models/Category";
import SubCategory from "../../../models/SubCategory";
import Product from "../../../models/Product";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Get all categories (parent categories only by default)
 */
export const getCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const { includeSubcategories, search } = req.query;

    // Build query - by default, get only parent categories (no parentId)
    const query: any = { parentId: null, status: "Active" };

    // If includeSubcategories is true, get all categories (still only Active)
    if (includeSubcategories === "true") {
      delete query.parentId;
    }

    // Search filter
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Fetch categories + both count aggregations in parallel (3 queries total, not N*2)
    const [categories, subcountAgg, productCountAgg] = await Promise.all([
      Category.find(query)
        .populate("headerCategoryId", "name slug theme")
        .sort({ name: 1 })
        .lean(),
      SubCategory.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Product.aggregate([
        { $match: { status: "Active", publish: true } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    // Build O(1) lookup maps
    const subCountMap = new Map<string, number>(
      subcountAgg.map((r: any) => [r._id?.toString(), r.count])
    );
    const productCountMap = new Map<string, number>(
      productCountAgg.map((r: any) => [r._id?.toString(), r.count])
    );

    const categoriesWithCounts = categories.map((category: any) => {
      const id = category._id.toString();
      return {
        ...category,
        totalSubcategory: subCountMap.get(id) ?? 0,
        totalProduct: productCountMap.get(id) ?? 0,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      data: categoriesWithCounts,
    });
  }
);

/**
 * Get category by ID
 */
export const getCategoryById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Get counts
    const subcategoryCount = await Category.countDocuments({
      parentId: category._id,
    });

    const productCount = await Product.countDocuments({
      categoryId: category._id,
    });

    const categoryWithCounts = {
      ...category.toObject(),
      totalSubcategory: subcategoryCount,
      totalProduct: productCount,
    };

    return res.status(200).json({
      success: true,
      message: "Category fetched successfully",
      data: categoryWithCounts,
    });
  }
);

/**
 * Get subcategories by parent category ID
 * Supports both old SubCategory model and new Category model (with parentId)
 */
export const getSubcategories = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      search,
      page = "1",
      limit = "10",
      sortBy = "name",
      sortOrder = "asc",
    } = req.query;

    // Accept both ObjectId and slug in route param for frontend compatibility.
    const parentCategoryQuery = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { slug: id }] }
      : { slug: id };

    // Verify parent category exists
    const parentCategory = await Category.findOne(parentCategoryQuery);
    if (!parentCategory) {
      return res.status(200).json({
        success: true,
        message: "Parent category not found; returning empty subcategories",
        data: [],
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: 0,
          pages: 0,
        },
      });
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort: any = {};
    const sortField =
      sortBy === "subcategoryName" ? "name" : (sortBy as string);
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    // Build search query
    const searchQuery = search
      ? { $regex: search as string, $options: "i" }
      : undefined;

    // 1. Get subcategories from new Category model (where parentId = category id)
    const categorySubcategoriesQuery: any = {
      parentId: parentCategory._id,
      status: "Active", // Only active subcategories
    };
    if (searchQuery) {
      categorySubcategoriesQuery.name = searchQuery;
    }

    const categorySubcategories = await Category.find(
      categorySubcategoriesQuery
    )
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // 2. Get subcategories from old SubCategory model (for backward compatibility)
    const oldSubcategoryQuery: any = { category: parentCategory._id };
    if (searchQuery) {
      oldSubcategoryQuery.name = searchQuery;
    }

    const oldSubcategories = await SubCategory.find(oldSubcategoryQuery)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Combine both results
    const allSubcategories = [
      ...categorySubcategories.map((cat) => ({
        _id: cat._id,
        name: cat.name,
        subcategoryName: cat.name, // Map name to subcategoryName for frontend compatibility
        categoryName: parentCategory.name,
        image: cat.image,
        subcategoryImage: cat.image,
        order: cat.order || 0,
        totalProduct: 0, // Will be calculated below
        isNewModel: true, // Flag to identify new model
      })),
      ...oldSubcategories.map((sub) => ({
        _id: sub._id,
        name: sub.name,
        subcategoryName: sub.name,
        categoryName: parentCategory.name,
        image: sub.image,
        subcategoryImage: sub.image,
        order: sub.order || 0,
        totalProduct: 0, // Will be calculated below
        isNewModel: false, // Flag to identify old model
      })),
    ];

    // Remove duplicates (in case same subcategory exists in both models)
    const uniqueSubcategories = Array.from(
      new Map(
        allSubcategories.map((item: any) => [item._id.toString(), item])
      ).values()
    );

    // Sort combined results
    uniqueSubcategories.sort((a, b) => {
      const aValue = (a as any)[sortField] || "";
      const bValue = (b as any)[sortField] || "";
      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Apply pagination to combined results
    const paginatedSubcategories = uniqueSubcategories.slice(
      skip,
      skip + limitNum
    );

    // Get product counts for each subcategory
    const subcategoriesWithCounts = await Promise.all(
      paginatedSubcategories.map(async (subcategory) => {
        // Count products - check both old and new models
        const productCountOld = await Product.countDocuments({
          subcategory: subcategory._id,
        });

        // For new model, products might reference category directly
        const productCountNew = await Product.countDocuments({
          category: subcategory._id,
        });

        const totalProduct = productCountOld + productCountNew;

        return {
          ...subcategory,
          totalProduct,
        };
      })
    );

    // Get total count for pagination
    const totalCategorySubs = await Category.countDocuments(
      categorySubcategoriesQuery
    );
    const totalOldSubs = await SubCategory.countDocuments(oldSubcategoryQuery);
    const total = totalCategorySubs + totalOldSubs;

    return res.status(200).json({
      success: true,
      message: "Subcategories fetched successfully",
      data: subcategoriesWithCounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  }
);

/**
 * Get all categories with their subcategories nested
 */
export const getAllCategoriesWithSubcategories = asyncHandler(
  async (_req: Request, res: Response) => {
    // Fetch everything in parallel — 4 queries total instead of N*M
    const [parentCategories, allSubcategories, productByCatAgg, productBySubAgg] =
      await Promise.all([
        Category.find({ parentId: null }).sort({ name: 1 }).lean(),
        SubCategory.find({}).sort({ name: 1 }).lean(),
        Product.aggregate([
          { $match: { status: "Active", publish: true } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ]),
        Product.aggregate([
          { $match: { status: "Active", publish: true } },
          { $group: { _id: "$subcategory", count: { $sum: 1 } } },
        ]),
      ]);

    // O(1) lookup maps
    const productByCatMap = new Map<string, number>(
      productByCatAgg.map((r: any) => [r._id?.toString(), r.count])
    );
    const productBySubMap = new Map<string, number>(
      productBySubAgg.map((r: any) => [r._id?.toString(), r.count])
    );

    // Group subcategories by parent category id
    const subsByParent = new Map<string, any[]>();
    for (const sub of allSubcategories) {
      const key = (sub as any).category?.toString();
      if (!key) continue;
      if (!subsByParent.has(key)) subsByParent.set(key, []);
      subsByParent.get(key)!.push(sub);
    }

    const categoriesWithSubcategories = parentCategories.map((category: any) => {
      const id = category._id.toString();
      const subcategories = (subsByParent.get(id) || []).map((sub: any) => ({
        ...sub,
        totalProduct: productBySubMap.get(sub._id.toString()) ?? 0,
      }));

      return {
        ...category,
        totalSubcategory: subcategories.length,
        totalProduct: productByCatMap.get(id) ?? 0,
        subcategories,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Categories with subcategories fetched successfully",
      data: categoriesWithSubcategories,
    });
  }
);

/**
 * Get all subcategories (across all categories)
 */
export const getAllSubcategories = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      search,
      page = "1",
      limit = "10",
      sortBy = "name",
      sortOrder = "asc",
    } = req.query;

    const query: any = {};

    // Search filter
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort: any = {};
    const sortField =
      sortBy === "subcategoryName" ? "name" : (sortBy as string);
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    // Fetch subcategories from the SubCategory model instead of Category model
    // This fixes the issue where subcategories created by Admin (in SubCategory collection)
    // were not visible to Sellers because this controller was looking in Category collection
    const subcategories = await SubCategory.find(query)
      .populate("category", "name image")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get all product counts for these subcategories in one aggregation
    const subIds = subcategories.map((s) => s._id);
    const [productCountAgg, total] = await Promise.all([
      Product.aggregate([
        { $match: { subcategory: { $in: subIds } } },
        { $group: { _id: "$subcategory", count: { $sum: 1 } } },
      ]),
      SubCategory.countDocuments(query),
    ]);
    const productCountMap = new Map<string, number>(
      productCountAgg.map((r: any) => [r._id?.toString(), r.count])
    );

    const subcategoriesWithCounts = subcategories.map((subcategory) => {
      const parentCategory = subcategory.category as any;
      return {
        id: subcategory._id,
        categoryName: parentCategory?.name || "Unknown",
        subcategoryName: subcategory.name,
        subcategoryImage: subcategory.image || "",
        totalProduct: productCountMap.get(subcategory._id.toString()) ?? 0,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Subcategories fetched successfully",
      data: subcategoriesWithCounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  }
);

/**
 * Get sub-subcategories by subcategory ID
 */
export const getSubSubCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const { subCategoryId } = req.params;
    const { search, isActive } = req.query;

    // Query Category model where parentId is the subcategory ID
    const query: any = { parentId: subCategoryId };

    if (isActive === "true") {
      query.status = "Active";
    }

    if (search) {
      query.name = { $regex: search as string, $options: "i" };
    }

    const subSubCategories = await Category.find(query)
      .sort({ order: 1, name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Sub-subcategories fetched successfully",
      data: subSubCategories,
    });
  }
);
