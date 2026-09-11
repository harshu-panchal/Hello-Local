import { Category } from "../services/api/admin/adminProductService";

/**
 * Build hierarchical tree structure from flat category array
 */
export function buildCategoryTree(
  categories: Category[],
  parentId: string | null = null
): Category[] {
  return categories
    .filter((cat) => {
      // Normalize parentId - handle both string and object (populated) cases
      let catParentId: string | null = null;
      if (cat.parentId) {
        if (typeof cat.parentId === "string") {
          catParentId = cat.parentId;
        } else if (typeof cat.parentId === "object" && cat.parentId !== null) {
          // It's populated, extract the _id
          catParentId = (cat.parentId as { _id?: string })._id || null;
        }
      }

      // Compare normalized parentId with the target parentId
      const parentIdStr = parentId ? parentId.toString() : null;
      const catParentIdStr = catParentId ? catParentId.toString() : null;
      return catParentIdStr === parentIdStr;
    })
    .map((category) => ({
      ...category,
      children: buildCategoryTree(categories, category._id),
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Get all root categories (categories with no parent)
 */
export function getRootCategories(categories: Category[]): Category[] {
  return categories
    .filter((cat) => !cat.parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Get direct children of a category
 */
export function getCategoryChildren(
  categoryId: string,
  categories: Category[]
): Category[] {
  return categories
    .filter((cat) => cat.parentId === categoryId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Get all descendants of a category (recursive)
 */
export function getAllDescendants(
  categoryId: string,
  categories: Category[]
): Category[] {
  const descendants: Category[] = [];
  const children = getCategoryChildren(categoryId, categories);

  for (const child of children) {
    descendants.push(child);
    descendants.push(...getAllDescendants(child._id, categories));
  }

  return descendants;
}

/**
 * Validate parent change to prevent circular references
 */
export function validateParentChange(
  categoryId: string,
  newParentId: string | null,
  categories: Category[]
): { valid: boolean; error?: string } {
  // Can always set to null (root category)
  if (!newParentId) {
    return { valid: true };
  }

  // Cannot set parent to self
  if (categoryId === newParentId) {
    return {
      valid: false,
      error: "Cannot set category as its own parent",
    };
  }

  // Check if new parent exists
  const newParent = categories.find((cat) => cat._id === newParentId);
  if (!newParent) {
    return {
      valid: false,
      error: "Parent category not found",
    };
  }

  // Check if new parent is active
  if (newParent.status !== "Active") {
    return {
      valid: false,
      error: "Parent category must be active",
    };
  }

  // Check for circular reference: new parent cannot be a descendant
  const descendants = getAllDescendants(categoryId, categories);
  const isDescendant = descendants.some((desc) => desc._id === newParentId);
  if (isDescendant) {
    return {
      valid: false,
      error: "Cannot create circular reference: parent cannot be a descendant",
    };
  }

  // Enforce maximum 3-level depth limit
  const parentDepth = getCategoryPath(newParentId, categories).length;
  if (parentDepth >= 3) {
    return {
      valid: false,
      error:
        "Maximum category depth is 3 levels. Cannot select a Level 3 category as parent.",
    };
  }

  const hasChildren = categories.some((c) => c.parentId === categoryId);
  if (hasChildren && parentDepth >= 2) {
    return {
      valid: false,
      error:
        "Cannot move this category under a subcategory because its existing child categories would exceed the 3-level limit.",
    };
  }

  return { valid: true };
}

/**
 * Flatten category tree to list
 */
export function flattenCategoryTree(tree: Category[]): Category[] {
  const result: Category[] = [];

  function traverse(categories: Category[]) {
    for (const category of categories) {
      result.push(category);
      if (category.children && category.children.length > 0) {
        traverse(category.children);
      }
    }
  }

  traverse(tree);
  return result;
}

/**
 * Get path from root to category
 */
export function getCategoryPath(
  categoryId: string,
  categories: Category[]
): Category[] {
  const path: Category[] = [];
  let currentId: string | null | undefined = categoryId;

  while (currentId) {
    const category = categories.find((cat) => cat._id === currentId);
    if (!category) break;

    path.unshift(category);
    currentId = category.parentId || null;
  }

  return path;
}

/**
 * Get all active categories (for dropdowns, etc.)
 */
export function getActiveCategories(categories: Category[]): Category[] {
  return categories.filter((cat) => cat.status === "Active");
}

/**
 * Get categories available as parents (excludes self and descendants, and caps depth to max 3 levels)
 */
export function getAvailableParents(
  categoryId: string | null,
  categories: Category[]
): Category[] {
  // Helper to get depth of a candidate parent (Level 1: depth 1, Level 2: depth 2)
  const getDepth = (id: string) => getCategoryPath(id, categories).length;

  if (!categoryId) {
    // For new categories, return active categories with depth < 3 (Level 1 and Level 2)
    return getActiveCategories(categories).filter((cat) => getDepth(cat._id) < 3);
  }

  // For existing categories, exclude self and all descendants
  const descendants = getAllDescendants(categoryId, categories);
  const excludeIds = new Set([categoryId, ...descendants.map((d) => d._id)]);

  // If this category already has child subcategories, it cannot be placed under a Level 2 parent
  const hasDirectChildren = categories.some((c) => c.parentId === categoryId);

  return getActiveCategories(categories).filter((cat) => {
    if (excludeIds.has(cat._id)) return false;
    const parentDepth = getDepth(cat._id);
    if (parentDepth >= 3) return false;
    if (hasDirectChildren && parentDepth >= 2) return false;
    return true;
  });
}

/**
 * Search categories by name (case-insensitive)
 */
export function searchCategories(
  categories: Category[],
  searchQuery: string
): Category[] {
  if (!searchQuery.trim()) {
    return categories;
  }

  const query = searchQuery.toLowerCase();
  return categories.filter((cat) => cat.name.toLowerCase().includes(query));
}

/**
 * Filter categories by status
 */
export function filterCategoriesByStatus(
  categories: Category[],
  status: "All" | "Active" | "Inactive"
): Category[] {
  if (status === "All") {
    return categories;
  }
  return categories.filter((cat) => cat.status === status);
}

/**
 * Get all categories under a specific header category
 */
export function getCategoriesByHeaderCategory(
  headerCategoryId: string,
  categories: Category[]
): Category[] {
  const result: Category[] = [];

  function collectCategories(cats: Category[]) {
    for (const cat of cats) {
      if (cat.headerCategoryId === headerCategoryId) {
        result.push(cat);
      }
      if (cat.children && cat.children.length > 0) {
        collectCategories(cat.children);
      }
    }
  }

  collectCategories(categories);
  return result;
}

/**
 * Get header category ID for a category (including inherited from parent)
 */
export function getHeaderCategoryForCategory(
  categoryId: string,
  categories: Category[]
): string | null {
  const category = categories.find((cat) => cat._id === categoryId);
  if (!category) {
    return null;
  }

  // If category has headerCategoryId, return it
  if (category.headerCategoryId) {
    return category.headerCategoryId;
  }

  // If category has parent, get header category from parent recursively
  if (category.parentId) {
    const parent = categories.find((cat) => cat._id === category.parentId);
    if (parent) {
      return getHeaderCategoryForCategory(parent._id, categories);
    }
  }

  return null;
}
