import { Request, Response } from "express";
import HeaderCategory from "../../../models/HeaderCategory";

// @desc    Get all header categories (Admin)
// @route   GET /api/v1/header-categories/admin
// @access  Private/Admin
export const getAdminHeaderCategories = async (
  _req: Request,
  res: Response
) => {
  try {
    const categories = await HeaderCategory.find().sort({
      order: 1,
      createdAt: -1,
    });
    return res.json(categories);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error });
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
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error });
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
      theme,    // New: color theme key (e.g. 'grocery', 'beauty')
      slug: sentSlug, // Deprecated: old clients may send slug=theme, we ignore it now
      relatedCategory,
      status,
      order,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Header category name is required" });
    }

    // Generate unique slug from the category name
    let baseSlug = generateSlug(name);
    let slug = baseSlug;
    let suffix = 1;
    while (await HeaderCategory.findOne({ slug })) {
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    const category = await HeaderCategory.create({
      name,
      iconLibrary,
      iconName,
      slug,
      theme: theme || sentSlug || 'all', // store color theme separately; fall back to sent slug for old clients
      relatedCategory,
      status,
      order,
    });

    return res.status(201).json(category);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error });
  }
};

// @desc    Update a header category
// @route   PUT /api/v1/header-categories/:id
// @access  Private/Admin
// @desc    Update a header category
// @route   PUT /api/v1/header-categories/:id
// @access  Private/Admin
export const updateHeaderCategory = async (req: Request, res: Response) => {
  try {
    const {
      name,
      iconLibrary,
      iconName,
      theme,     // New: color theme key
      slug: sentSlug, // Old clients may send slug=theme — ignored for slug updates
      relatedCategory,
      status,
      order,
    } = req.body;
    const category = await HeaderCategory.findById(req.params.id);

    if (category) {
      // If name changed, regenerate the slug
      if (name && name !== category.name) {
        let baseSlug = generateSlug(name);
        let newSlug = baseSlug;
        let suffix = 1;
        while (await HeaderCategory.findOne({ slug: newSlug, _id: { $ne: category._id } })) {
          newSlug = `${baseSlug}-${suffix}`;
          suffix++;
        }
        category.slug = newSlug;
      }

      category.name = name || category.name;
      category.iconLibrary = iconLibrary || category.iconLibrary;
      category.iconName = iconName || category.iconName;
      // Update theme (color) — allow multiple categories to share the same color
      if (theme !== undefined) {
        (category as any).theme = theme;
      } else if (sentSlug !== undefined) {
        // Old client compatibility: sent slug was actually the theme
        (category as any).theme = sentSlug;
      }
      category.relatedCategory = relatedCategory; // Allow clearing it
      category.status = status || category.status;
      category.order = order !== undefined ? order : category.order;

      const updatedCategory = await category.save();
      return res.json(updatedCategory);
    } else {
      return res.status(404).json({ message: "Header category not found" });
    }
  } catch (error: any) {
    console.error("Update Header Category Error:", error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "A header category with this name already exists. Please use a different name." });
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

    if (category) {
      await category.deleteOne();
      return res.json({ message: "Header category removed" });
    } else {
      return res.status(404).json({ message: "Header category not found" });
    }
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error });
  }
};
