import { Request, Response } from "express";
import HeaderCategory from "../../../models/HeaderCategory";
import Category from "../../../models/Category";
import Product from "../../../models/Product";

// @desc    Get all header categories (Admin)
// @route   GET /api/v1/header-categories/admin
// @access  Private/Admin
export const getAdminHeaderCategories = async (
  req: Request,
  res: Response
) => {
  try {
    const { search, page, limit, sortBy = "order", sortOrder = "asc", pagination } = req.query;

    const query: any = {};
    if (search && typeof search === "string" && search.trim()) {
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { slug: { $regex: escapedSearch, $options: "i" } },
        { theme: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "desc" ? -1 : 1;
    if (sortBy !== "createdAt") {
      sort.createdAt = -1;
    }

    const isPaginated = pagination !== "false" && (page !== undefined || limit !== undefined);

    if (isPaginated) {
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit as string, 10) || 10);
      const skip = (pageNum - 1) * limitNum;

      const total = await HeaderCategory.countDocuments(query);
      const categories = await HeaderCategory.find(query).sort(sort).skip(skip).limit(limitNum);

      return res.status(200).json({
        success: true,
        data: categories,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    }

    const categories = await HeaderCategory.find(query).sort(sort);
    return res.json(categories);
  } catch (error: any) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get published header categories (Public)
// @route   GET /api/v1/header-categories
// @access  Public
export const getHeaderCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await HeaderCategory.find({ status: "Published" }).sort({
      order: 1,
      createdAt: -1,
    });
    return res.json(categories);
  } catch (error: any) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Helper: generate a URL-safe slug from a name string
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// @desc    Create a header category
// @route   POST /api/v1/header-categories
// @access  Private/Admin
export const createHeaderCategory = async (req: Request, res: Response) => {
  try {
    const {
      name,
      iconLibrary,
      iconName,
      theme,
      slug: sentSlug,
      image,
      status,
      order,
    } = req.body;

    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      return res.status(400).json({ message: "Header category name is required" });
    }
    if (trimmedName.length < 2) {
      return res.status(400).json({ message: "Header category name must be at least 2 characters" });
    }
    if (trimmedName.length > 60) {
      return res.status(400).json({ message: "Header category name must be under 60 characters" });
    }

    // Check for duplicate name (case-insensitive)
    const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingName = await HeaderCategory.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    });
    if (existingName) {
      return res.status(400).json({ message: "A header category with this name already exists" });
    }

    // Generate unique slug from the category name
    let baseSlug = generateSlug(trimmedName);
    let slug = baseSlug;
    let suffix = 1;
    while (await HeaderCategory.findOne({ slug })) {
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    // Auto-calculate next order if not explicitly specified
    let finalOrder = order !== undefined && order !== null && !isNaN(Number(order)) ? Number(order) : undefined;
    if (finalOrder === undefined) {
      const highestCat = await HeaderCategory.findOne().sort({ order: -1 }).select("order").lean();
      finalOrder = highestCat && highestCat.order !== undefined ? highestCat.order + 1 : 0;
    }

    const category = await HeaderCategory.create({
      name: trimmedName,
      iconLibrary: iconLibrary || "Custom",
      iconName: iconName || "grid",
      slug,
      theme: theme || sentSlug || "all",
      image: image || undefined,
      status: status || "Published",
      order: finalOrder,
    });

    return res.status(201).json(category);
  } catch (error: any) {
    console.error("Create Header Category Error:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update a header category
// @route   PUT /api/v1/header-categories/:id
// @access  Private/Admin
export const updateHeaderCategory = async (req: Request, res: Response) => {
  try {
    const {
      name,
      iconLibrary,
      iconName,
      theme,
      slug: sentSlug,
      image,
      status,
      order,
    } = req.body;

    const category = await HeaderCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Header category not found" });
    }

    if (name) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2) {
        return res.status(400).json({ message: "Header category name must be at least 2 characters" });
      }
      if (trimmedName.length > 60) {
        return res.status(400).json({ message: "Header category name must be under 60 characters" });
      }

      // Check if duplicate name on another document
      const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const duplicate = await HeaderCategory.findOne({
        _id: { $ne: category._id },
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      });
      if (duplicate) {
        return res.status(400).json({ message: "A header category with this name already exists" });
      }

      // If name changed, regenerate the slug
      if (trimmedName !== category.name) {
        let baseSlug = generateSlug(trimmedName);
        let newSlug = baseSlug;
        let suffix = 1;
        while (await HeaderCategory.findOne({ slug: newSlug, _id: { $ne: category._id } })) {
          newSlug = `${baseSlug}-${suffix}`;
          suffix++;
        }
        category.slug = newSlug;
      }
      category.name = trimmedName;
    }

    if (iconLibrary !== undefined) category.iconLibrary = iconLibrary;
    if (iconName !== undefined) category.iconName = iconName;
    if (theme !== undefined) {
      (category as any).theme = theme;
    } else if (sentSlug !== undefined) {
      (category as any).theme = sentSlug;
    }
    if (image !== undefined) category.image = image || undefined;
    if (status !== undefined) category.status = status;
    if (order !== undefined && !isNaN(Number(order))) category.order = Number(order);

    const updatedCategory = await category.save();
    return res.json(updatedCategory);
  } catch (error: any) {
    console.error("Update Header Category Error:", error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "A header category with this name or slug already exists." });
    }
    return res
      .status(500)
      .json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete a header category
// @route   DELETE /api/v1/header-categories/:id
// @access  Private/Admin
export const deleteHeaderCategory = async (req: Request, res: Response) => {
  try {
    const category = await HeaderCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Header category not found" });
    }

    // Referential integrity: Check if any Category or Product uses this HeaderCategory
    const linkedCategoryCount = await Category.countDocuments({ headerCategoryId: req.params.id });
    if (linkedCategoryCount > 0) {
      return res.status(400).json({
        message: `Cannot delete header category because ${linkedCategoryCount} product categories are linked to it.`,
      });
    }

    const linkedProductCount = await Product.countDocuments({ headerCategoryId: req.params.id });
    if (linkedProductCount > 0) {
      return res.status(400).json({
        message: `Cannot delete header category because ${linkedProductCount} products are linked to it.`,
      });
    }

    await category.deleteOne();
    return res.json({ message: "Header category deleted successfully" });
  } catch (error: any) {
    console.error("Delete Header Category Error:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};
