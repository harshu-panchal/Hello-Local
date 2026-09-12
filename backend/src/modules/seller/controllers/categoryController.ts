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

    // Fetch categories + count aggregations in parallel
    const [categories, subcountAgg, catSubcountAgg, productCountAgg] = await Promise.all([
      Category.find(query)
        .populate("headerCategoryId", "name slug theme")
        .sort({ name: 1 })
        .lean(),
      SubCategory.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Category.aggregate([
        { $match: { parentId: { $ne: null } } },
        { $group: { _id: "$parentId", count: { $sum: 1 } } },
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
    const catSubCountMap = new Map<string, number>(
      catSubcountAgg.map((r: any) => [r._id?.toString(), r.count])
    );
    const productCountMap = new Map<string, number>(
      productCountAgg.map((r: any) => [r._id?.toString(), r.count])
    );

    const categoriesWithCounts = categories.map((category: any) => {
      const id = category._id.toString();
      const totalSub = (subCountMap.get(id) ?? 0) + (catSubCountMap.get(id) ?? 0);
      return {
        ...category,
        totalSubcategory: totalSub,
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

    // Get subcategory count from both models and product count
    const [subCount, catSubCount, productCount] = await Promise.all([
      SubCategory.countDocuments({ category: id }),
      Category.countDocuments({ parentId: id }),
      Product.countDocuments({
        category: id,
        status: "Active",
        publish: true,
      }),
    ]);

    const categoryWithCounts = {
      ...category.toObject(),
      totalSubcategory: subCount + catSubCount,
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
        id: cat._id,
        name: cat.name,
        subcategoryName: cat.name, // Map name to subcategoryName for frontend compatibility
        categoryName: parentCategory.name,
        image: cat.image,
        subcategoryImage: cat.image,
        order: cat.order || 0,
        isBestseller: cat.isBestseller || false,
        hasWarning: cat.hasWarning || false,
        totalProduct: 0, // Will be calculated below
        isNewModel: true, // Flag to identify new model
      })),
      ...oldSubcategories.map((sub) => ({
        _id: sub._id,
        id: sub._id,
        name: sub.name,
        subcategoryName: sub.name,
        categoryName: parentCategory.name,
        image: sub.image,
        subcategoryImage: sub.image,
        order: sub.order || 0,
        isBestseller: false,
        hasWarning: false,
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

    return res.status(200).json({
      success: true,
      message: "Subcategories fetched successfully",
      data: subcategoriesWithCounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: uniqueSubcategories.length,
        pages: Math.ceil(uniqueSubcategories.length / limitNum),
      },
    });
  }
);

/**
 * Get all categories with their subcategories nested
 */
export const getAllCategoriesWithSubcategories = asyncHandler(
  async (_req: Request, res: Response) => {
    // Fetch everything in parallel
    const [parentCategories, allSubcategories, allCategorySubs, productByCatAgg, productBySubAgg] =
      await Promise.all([
        Category.find({ parentId: null }).sort({ name: 1 }).lean(),
        SubCategory.find({}).sort({ name: 1 }).lean(),
        Category.find({ parentId: { $ne: null } }).sort({ name: 1 }).lean(),
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
      subsByParent.get(key)!.push({
        ...sub,
        id: sub._id,
        subcategoryName: sub.name,
        subcategoryImage: sub.image,
      });
    }

    for (const catSub of allCategorySubs) {
      const key = catSub.parentId?.toString();
      if (!key) continue;
      if (!subsByParent.has(key)) subsByParent.set(key, []);
      subsByParent.get(key)!.push({
        _id: catSub._id,
        id: catSub._id,
        name: catSub.name,
        subcategoryName: catSub.name,
        category: catSub.parentId,
        image: catSub.image,
        subcategoryImage: catSub.image,
        order: catSub.order,
        status: catSub.status,
      });
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
 * Supports both new Category model (parentId != null) and SubCategory model
 */
export const getAllSubcategories = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      category,
      search,
      page,
      limit,
      sortBy = "name",
      sortOrder = "asc",
    } = req.query;

    const searchQuery = search
      ? { $regex: search as string, $options: "i" }
      : undefined;

    // 1. Fetch root categories to resolve parent category names and identify level 2 subcategories
    const rootCategories = await Category.find({ parentId: null })
      .select("_id name slug image")
      .lean();
    const rootCategoryMap = new Map<string, any>(
      rootCategories.map((c: any) => [c._id.toString(), c])
    );
    const rootCategoryIds = rootCategories.map((c: any) => c._id);

    // 2. Query Subcategories from Category model
    const catQuery: any = {};
    if (category) {
      catQuery.parentId = mongoose.Types.ObjectId.isValid(category as string)
        ? new mongoose.Types.ObjectId(category as string)
        : category;
    } else {
      catQuery.parentId = { $in: rootCategoryIds };
    }
    if (searchQuery) {
      catQuery.name = searchQuery;
    }

    // 3. Query Subcategories from SubCategory model (backward compatibility)
    const standaloneQuery: any = {};
    if (category) {
      standaloneQuery.category = mongoose.Types.ObjectId.isValid(category as string)
        ? new mongoose.Types.ObjectId(category as string)
        : category;
    }
    if (searchQuery) {
      standaloneQuery.name = searchQuery;
    }

    const [categorySubs, standaloneSubs] = await Promise.all([
      Category.find(catQuery)
        .populate("parentId", "name slug image")
        .populate("headerCategoryId", "name slug")
        .lean(),
      SubCategory.find(standaloneQuery)
        .populate("category", "name slug image")
        .lean(),
    ]);

    // Map Category model subcategories
    const mappedCategorySubs = categorySubs.map((cat: any) => {
      const parent = cat.parentId || rootCategoryMap.get(cat.parentId?.toString());
      const parentIdStr = parent?._id?.toString() || cat.parentId?.toString() || "";
      const parentName = parent?.name || "Unknown";
      return {
        _id: cat._id.toString(),
        id: cat._id.toString(),
        name: cat.name,
        subcategoryName: cat.name,
        categoryName: parentName,
        categoryId: parentIdStr,
        image: cat.image || "",
        subcategoryImage: cat.image || "",
        order: cat.order || 0,
        isBestseller: cat.isBestseller || false,
        hasWarning: cat.hasWarning || false,
        status: cat.status || "Active",
        parentId: parentIdStr,
        headerCategoryId: cat.headerCategoryId?._id?.toString() || cat.headerCategoryId?.toString() || "",
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
      };
    });

    // Map standalone SubCategory model subcategories
    const mappedStandaloneSubs = standaloneSubs.map((sub: any) => {
      const parent = sub.category as any;
      const parentIdStr = parent?._id?.toString() || sub.category?.toString() || "";
      const parentName = parent?.name || rootCategoryMap.get(parentIdStr)?.name || "Unknown";
      return {
        _id: sub._id.toString(),
        id: sub._id.toString(),
        name: sub.name,
        subcategoryName: sub.name,
        categoryName: parentName,
        categoryId: parentIdStr,
        image: sub.image || "",
        subcategoryImage: sub.image || "",
        order: sub.order || 0,
        isBestseller: false,
        hasWarning: false,
        status: "Active",
        parentId: parentIdStr,
        headerCategoryId: "",
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      };
    });

    // Combine and deduplicate
    const subMap = new Map<string, any>();
    for (const item of mappedStandaloneSubs) {
      subMap.set(item._id, item);
    }
    for (const item of mappedCategorySubs) {
      subMap.set(item._id, item);
    }
    const combined = Array.from(subMap.values());

    // Product counts
    const allIds = combined.map((s) => s._id);
    const objectIds = allIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const productCountAgg = await Product.aggregate([
      {
        $match: {
          $or: [
            { subcategory: { $in: objectIds } },
            { category: { $in: objectIds } },
          ],
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$subcategory", "$category"] },
          count: { $sum: 1 },
        },
      },
    ]);

    const productCountMap = new Map<string, number>(
      productCountAgg.map((r: any) => [r._id?.toString(), r.count])
    );

    combined.forEach((sub) => {
      sub.totalProduct = productCountMap.get(sub._id) ?? 0;
    });

    // Sort
    const sortField =
      sortBy === "subcategoryName" ? "name" : (sortBy as string);
    const sortDir = sortOrder === "desc" ? -1 : 1;

    combined.sort((a, b) => {
      const aVal = a[sortField] ?? a.name ?? "";
      const bVal = b[sortField] ?? b.name ?? "";
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal) * sortDir;
      }
      return (aVal > bVal ? 1 : aVal < bVal ? -1 : 0) * sortDir;
    });

    // Pagination - if neither page nor limit specified, return all items
    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = isPaginated
      ? Math.max(1, parseInt(limit as string, 10) || 10)
      : Math.max(1, combined.length);
    const total = combined.length;
    const data = isPaginated
      ? combined.slice((pageNum - 1) * limitNum, pageNum * limitNum)
      : combined;

    return res.status(200).json({
      success: true,
      message: "Subcategories fetched successfully",
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / (limitNum || 1)),
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
