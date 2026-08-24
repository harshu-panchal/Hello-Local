import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  bulkDeleteCategories,
  type Category,
  type CreateCategoryData,
  type UpdateCategoryData,
} from "../../../services/api/admin/adminProductService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import CategoryFormModal from "../components/CategoryFormModal";
import CategoryTreeView from "../components/CategoryTreeView";
import CategoryListView from "../components/CategoryListView";
import {
  buildCategoryTree,
  searchCategories,
  filterCategoriesByStatus,
} from "../../../utils/categoryUtils";

// Flatten tree structure for filtering (works for both tree and list view)
const flattenTree = (cats: Category[]): Category[] => {
  const result: Category[] = [];
  cats.forEach((cat) => {
    const { children, ...catWithoutChildren } = cat;

    let normalizedParentId: string | null = null;
    if (catWithoutChildren.parentId) {
      if (typeof catWithoutChildren.parentId === "string") {
        normalizedParentId = catWithoutChildren.parentId;
      } else if (
        typeof catWithoutChildren.parentId === "object" &&
        catWithoutChildren.parentId !== null
      ) {
        normalizedParentId =
          (catWithoutChildren.parentId as { _id?: string })._id || null;
      }
    }

    result.push({
      ...catWithoutChildren,
      parentId: normalizedParentId,
      childrenCount:
        cat.childrenCount ||
        (children && children.length > 0 ? children.length : 0),
    } as Category);
    if (children && children.length > 0) {
      result.push(...flattenTree(children));
    }
  });
  return result;
};

export default function AdminCategory() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Form Modal States
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "create-subcategory">("create");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [parentCategory, setParentCategory] = useState<Category | null>(null);

  // Deletion Modal States
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setListPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch categories
  const fetchCategories = useCallback(async (preserveExpandedIds?: Set<string>) => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getCategories({
        includeChildren: true,
      });
      if (response.success && Array.isArray(response.data)) {
        setCategories(response.data);
        if (preserveExpandedIds && preserveExpandedIds.size > 0) {
          setExpandedIds(preserveExpandedIds);
        } else {
          const allIds = new Set<string>();
          const collectIds = (cats: Category[]) => {
            cats.forEach((cat) => {
              allIds.add(cat._id);
              if (cat.children && cat.children.length > 0) {
                collectIds(cat.children);
              }
            });
          };
          collectIds(response.data);
          setExpandedIds(allIds);
        }
      }
    } catch (err: unknown) {
      console.error("Error fetching categories:", err);
      const errorMessage =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : "Failed to load categories. Please try again.";
      setError(errorMessage || "Failed to load categories. Please try again.");
      showToast(errorMessage || "Failed to load categories", "error");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, showToast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Filter and search categories
  const filteredCategories = useMemo(() => {
    const flatCategories = flattenTree(categories);
    let filtered = [...flatCategories];

    if (debouncedSearch.trim()) {
      filtered = searchCategories(filtered, debouncedSearch);
      const matchingParentIds = new Set(filtered.map((cat) => cat._id));
      const childrenOfMatches = flatCategories.filter(
        (cat) => cat.parentId && matchingParentIds.has(cat.parentId)
      );
      const allFiltered = [...filtered, ...childrenOfMatches];
      filtered = Array.from(
        new Map(allFiltered.map((cat) => [cat._id, cat])).values()
      );
    }

    filtered = filterCategoriesByStatus(filtered, statusFilter);
    return filtered;
  }, [categories, debouncedSearch, statusFilter]);

  // Build tree for tree view
  const categoryTree = useMemo(() => {
    if (viewMode === "tree") {
      return buildCategoryTree(filteredCategories);
    }
    return [];
  }, [filteredCategories, viewMode]);

  // Modal Triggers
  const handleCreateCategory = () => {
    setModalMode("create");
    setEditingCategory(null);
    setParentCategory(null);
    setModalOpen(true);
  };

  const handleCreateSubcategory = (parent: Category) => {
    setModalMode("create-subcategory");
    setEditingCategory(null);
    setParentCategory(parent);
    setModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setModalMode("edit");
    setEditingCategory(category);
    setParentCategory(null);
    setModalOpen(true);
  };

  // Safe Single Delete Confirmation
  const confirmSingleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await deleteCategory(deleteTarget._id);
      if (response.success) {
        showToast("Category deleted successfully!", "success");
        setDeleteTarget(null);
        fetchCategories();
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || "Failed to delete category.";
      showToast(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Safe Bulk Delete Confirmation
  const confirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsBulkDeleting(true);
    try {
      const response = await bulkDeleteCategories(Array.from(selectedIds));
      if (response.success) {
        const deletedCount = response.data.deleted.length;
        const failedCount = response.data.failed.length;
        if (failedCount > 0) {
          showToast(`Deleted ${deletedCount} categories. ${failedCount} failed (contain products or subcategories).`, "info");
        } else {
          showToast(`Successfully deleted ${deletedCount} category(ies).`, "success");
        }
        setSelectedIds(new Set());
        setBulkDeleteModalOpen(false);
        fetchCategories();
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || "Failed to delete selected categories.";
      showToast(msg, "error");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Toggle status
  const handleToggleStatus = async (category: Category) => {
    const newStatus = category.status === "Active" ? "Inactive" : "Active";
    const cascade = Boolean(category.childrenCount && category.childrenCount > 0);

    try {
      const response = await toggleCategoryStatus(
        category._id,
        newStatus,
        cascade
      );
      if (response.success) {
        showToast(`Category status updated to ${newStatus}`, "success");
        fetchCategories();
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || "Failed to update category status.";
      showToast(msg, "error");
    }
  };

  // Form submit
  const handleFormSubmit = async (
    data: CreateCategoryData | UpdateCategoryData
  ) => {
    if (modalMode === "edit" && editingCategory) {
      const response = await updateCategory(editingCategory._id, data);
      if (response.success) {
        showToast("Category updated successfully!", "success");
        setModalOpen(false);
        fetchCategories();
      }
    } else {
      const response = await createCategory(data as CreateCategoryData);
      if (response.success) {
        showToast("Category created successfully!", "success");
        setModalOpen(false);
        if (modalMode === "create-subcategory" && parentCategory) {
          const newExpandedIds = new Set(expandedIds);
          newExpandedIds.add(parentCategory._id);
          fetchCategories(newExpandedIds);
        } else {
          fetchCategories();
        }
      }
    }
  };

  // Export CSV
  const handleExport = () => {
    if (filteredCategories.length === 0) {
      showToast("No categories available to export", "info");
      return;
    }

    const headers = [
      "ID",
      "Name",
      "Parent",
      "Status",
      "Order",
      "Image",
      "Created At",
    ];
    const csvContent = [
      headers.join(","),
      ...filteredCategories.map((category) =>
        [
          category._id,
          `"${(category.name || "").replace(/"/g, '""')}"`,
          category.parent
            ? typeof category.parent === "string"
              ? category.parent
              : `"${(category.parent.name || "").replace(/"/g, '""')}"`
            : category.parentId || "Root",
          category.status,
          category.order || 0,
          `"${(category.image || "").replace(/"/g, '""')}"`,
          category.createdAt ? new Date(category.createdAt).toLocaleDateString("en-IN") : "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_categories_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Category catalogue exported successfully", "success");
  };

  // Selection
  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredCategories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCategories.map((cat) => cat._id)));
    }
  };

  // Expand / Collapse
  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleExpandAll = () => {
    const allIds = new Set<string>();
    const collectIds = (cats: Category[]) => {
      cats.forEach((cat) => {
        allIds.add(cat._id);
        if (cat.children && cat.children.length > 0) {
          collectIds(cat.children);
        }
      });
    };
    collectIds(categoryTree);
    setExpandedIds(allIds);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Manage Categories
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Organize root departments, child subcategories, and merchandising hierarchy
          </p>
        </div>

        <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500">
          <Link
            to="/admin/dashboard"
            className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
          >
            Dashboard
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <span className="text-neutral-700 font-medium">Categories</span>
        </nav>
      </div>

      {/* Main Content Box */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Category Catalog ({filteredCategories.length})
          </h2>
          <button
            type="button"
            onClick={handleExport}
            className="bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors touch-target-min"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>

        {/* Filter and Action Bar */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 flex flex-col lg:flex-row flex-wrap items-stretch lg:items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Add Category Button */}
            <button
              type="button"
              onClick={handleCreateCategory}
              className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-sm shadow-rose-700/20 flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Root Category</span>
            </button>

            {/* View Mode Toggle */}
            <div className="inline-flex bg-white border border-neutral-300 rounded-xl p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("tree")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors min-h-[36px] ${
                  viewMode === "tree"
                    ? "bg-rose-700 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Tree View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors min-h-[36px] ${
                  viewMode === "list"
                    ? "bg-rose-700 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                List View
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "All" | "Active" | "Inactive")}
                className="px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="All">All Status</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories..."
                className="w-full pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Bulk Delete Button */}
            {viewMode === "list" && selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[44px]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Delete Selected ({selectedIds.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* Tree View Controls */}
        {viewMode === "tree" && (
          <div className="px-5 py-2.5 bg-neutral-100/60 border-b border-neutral-200/70 flex items-center gap-2">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-3 py-1 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-3 py-1 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Collapse All
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-12 text-neutral-400">
              <div className="w-8 h-8 border-2 border-rose-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-neutral-600">Loading categories...</p>
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
              <button
                type="button"
                onClick={() => fetchCategories()}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold"
              >
                Retry Loading
              </button>
            </div>
          ) : viewMode === "tree" ? (
            <CategoryTreeView
              categories={categoryTree}
              onAddSubcategory={handleCreateSubcategory}
              onEdit={handleEdit}
              onDelete={(cat) => setDeleteTarget(cat)}
              onToggleStatus={handleToggleStatus}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
            />
          ) : (
            <CategoryListView
              categories={filteredCategories}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onSelectAll={handleSelectAll}
              onEdit={handleEdit}
              onDelete={(cat) => setDeleteTarget(cat)}
              currentPage={listPage}
              itemsPerPage={itemsPerPage}
              onPageChange={setListPage}
            />
          )}
        </div>
      </div>

      {/* Accessible Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteCategoryModalTitle"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>

            <div className="text-center">
              <h3 id="deleteCategoryModalTitle" className="text-base font-bold text-neutral-900">
                Delete Category?
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Are you sure you want to delete <strong className="text-neutral-800">"{deleteTarget.name}"</strong>? Categories containing child subcategories or products cannot be deleted.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSingleDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 transition-colors min-h-[44px] flex items-center justify-center gap-1.5 shadow-sm shadow-rose-700/20"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  "Yes, Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accessible Bulk Delete Confirmation Modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto text-red-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-neutral-900">
                Delete {selectedIds.size} Selected Categories?
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Categories linked to active products or child subcategories will be skipped automatically.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(false)}
                disabled={isBulkDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkDelete}
                disabled={isBulkDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors min-h-[44px] flex items-center justify-center gap-1.5"
              >
                {isBulkDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  "Yes, Delete All"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {isModalOpen && (
        <CategoryFormModal
          isOpen={isModalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingCategory(null);
            setParentCategory(null);
          }}
          onSubmit={handleFormSubmit}
          category={editingCategory || undefined}
          parentCategory={parentCategory || undefined}
          mode={modalMode}
          allCategories={categories}
        />
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quick-Commerce Operations
      </footer>
    </div>
  );
}
