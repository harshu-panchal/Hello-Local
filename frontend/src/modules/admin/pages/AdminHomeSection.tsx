import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getHomeSections,
  createHomeSection,
  updateHomeSection,
  deleteHomeSection,
  reorderHomeSections,
  type HomeSection,
  type HomeSectionFormData,
} from "../../../services/api/admin/adminHomeSectionService";
import {
  getCategories,
  getSubcategories,
  type Category,
  type SubCategory,
} from "../../../services/api/categoryService";
import {
  getHeaderCategoriesAdmin,
  type HeaderCategory,
} from "../../../services/api/headerCategoryService";
import { useToast } from "../../../context/ToastContext";

const DISPLAY_TYPE_OPTIONS = [
  { value: "subcategories", label: "Subcategories Grid" },
  { value: "products", label: "Products Carousel / Grid" },
  { value: "categories", label: "Categories Rail" },
];

const COLUMNS_OPTIONS = [2, 3, 4, 6, 8];

export default function AdminHomeSection() {
  const { showToast } = useToast();

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedHeaderCategory, setSelectedHeaderCategory] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>([]);
  const [displayType, setDisplayType] = useState<"subcategories" | "products" | "categories">("subcategories");
  const [columns, setColumns] = useState(4);
  const [limit, setLimit] = useState(8);
  const [isActive, setIsActive] = useState(true);
  const [pageLocation, setPageLocation] = useState<"Home Page" | "Header Category Page">("Home Page");
  const [targetPageHeaderCategory, setTargetPageHeaderCategory] = useState<string>("");

  // Data state
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingSections, setLoadingSections] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState("all");

  // Deletion Modal state
  const [deleteTarget, setDeleteTarget] = useState<HomeSection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch initial data
  const fetchSections = useCallback(async () => {
    try {
      setLoadingSections(true);
      const params: any = {
        search: debouncedSearch || undefined,
        pageLocation: filterLocation !== "all" ? filterLocation : undefined,
      };
      const response = await getHomeSections(params);
      if (response.success && Array.isArray(response.data)) {
        setSections(response.data);
      } else {
        setSections([]);
      }
    } catch (err: any) {
      console.error("Error fetching sections:", err);
      showToast(err.response?.data?.message || "Failed to load sections", "error");
      setSections([]);
    } finally {
      setLoadingSections(false);
    }
  }, [debouncedSearch, filterLocation, showToast]);

  const fetchHeaderCategories = async () => {
    try {
      const data = await getHeaderCategoriesAdmin();
      setHeaderCategories(data || []);
    } catch (err) {
      console.error("Error fetching header categories:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await getCategories();
      if (response.success && Array.isArray(response.data)) {
        setCategories(response.data);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  useEffect(() => {
    fetchHeaderCategories();
    fetchCategories();
  }, []);

  // Filter categories by header category when header category or display type changes
  useEffect(() => {
    if (displayType === "categories" && selectedHeaderCategory) {
      const filtered = categories.filter((cat) => {
        const headerId =
          typeof cat.headerCategoryId === "string"
            ? cat.headerCategoryId
            : cat.headerCategoryId?._id || cat.headerCategoryId;
        return headerId === selectedHeaderCategory && !cat.parentId;
      });
      setFilteredCategories(filtered);
      setSelectedCategories((prev) =>
        prev.filter((id) => filtered.some((cat) => cat._id === id))
      );
    } else {
      setFilteredCategories(categories.filter((cat) => !cat.parentId));
    }
  }, [selectedHeaderCategory, displayType, categories]);

  // Fetch subcategories when selected categories change
  useEffect(() => {
    if (displayType === "subcategories" && selectedCategories.length > 0) {
      const fetchSubs = async () => {
        try {
          const promises = selectedCategories.map((id) => getSubcategories(id));
          const results = await Promise.all(promises);
          const allSubs: SubCategory[] = [];

          results.forEach((response) => {
            if (response.success && response.data) {
              allSubs.push(...response.data);
            }
          });

          const uniqueSubs = Array.from(
            new Map(allSubs.map((item) => [item._id || item.id, item])).values()
          );
          setSubCategories(uniqueSubs as SubCategory[]);
        } catch (err) {
          console.error("Error fetching subcategories:", err);
          setSubCategories([]);
        }
      };
      fetchSubs();
    } else {
      setSubCategories([]);
      setSelectedSubCategories([]);
    }
  }, [selectedCategories, displayType]);

  // Auto-generate slug from title
  useEffect(() => {
    if (title && !editingId) {
      const generatedSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      setSlug(generatedSlug);
    }
  }, [title, editingId]);

  const resetForm = () => {
    setTitle("");
    setSlug("");
    setSelectedHeaderCategory("");
    setSelectedCategories([]);
    setSelectedSubCategories([]);
    setDisplayType("subcategories");
    setColumns(4);
    setLimit(8);
    setIsActive(true);
    setPageLocation("Home Page");
    setTargetPageHeaderCategory("");
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      showToast("Please enter a section title", "error");
      return;
    }
    if (!slug.trim()) {
      showToast("Please enter a section slug", "error");
      return;
    }
    if (displayType === "categories") {
      if (!selectedHeaderCategory) {
        showToast("Please select a header category", "error");
        return;
      }
      if (selectedCategories.length === 0) {
        showToast("Please select at least one category", "error");
        return;
      }
    }
    if (pageLocation === "Header Category Page" && !targetPageHeaderCategory) {
      showToast("Please select a target header category landing page", "error");
      return;
    }

    const formData: HomeSectionFormData = {
      title: title.trim(),
      slug: slug.trim(),
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      subCategories:
        displayType !== "categories" && selectedSubCategories.length > 0
          ? selectedSubCategories
          : undefined,
      displayType,
      columns,
      limit,
      isActive,
      pageLocation,
      targetHeaderCategory:
        pageLocation === "Header Category Page" ? targetPageHeaderCategory : undefined,
    };

    try {
      setLoading(true);

      if (editingId) {
        const response = await updateHomeSection(editingId, formData);
        if (response.success) {
          showToast("Home section updated successfully!", "success");
          resetForm();
          fetchSections();
        } else {
          showToast(response.message || "Failed to update section", "error");
        }
      } else {
        const response = await createHomeSection(formData);
        if (response.success) {
          showToast("New home section created successfully!", "success");
          resetForm();
          fetchSections();
        } else {
          showToast(response.message || "Failed to create section", "error");
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to save section", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (section: HomeSection) => {
    setTitle(section.title);
    setSlug(section.slug);
    setDisplayType(section.displayType);

    if (section.displayType === "categories") {
      const firstCategory = section.categories?.[0];
      if (firstCategory) {
        const category = categories.find((c) => c._id === firstCategory._id);
        if (category) {
          const headerId =
            typeof category.headerCategoryId === "string"
              ? category.headerCategoryId
              : category.headerCategoryId?._id || category.headerCategoryId;
          if (headerId) setSelectedHeaderCategory(headerId);
        }
      }
    } else {
      setSelectedHeaderCategory("");
    }

    setSelectedCategories(section.categories?.map((c) => c._id) || []);
    setSelectedSubCategories(section.subCategories?.map((s) => s._id) || []);
    setColumns(section.columns);
    setLimit(section.limit);
    setIsActive(section.isActive);
    setPageLocation(section.pageLocation || "Home Page");
    setTargetPageHeaderCategory(
      typeof section.targetHeaderCategory === "object"
        ? section.targetHeaderCategory?._id || ""
        : section.targetHeaderCategory || ""
    );
    setEditingId(section._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStatusToggle = async (section: HomeSection) => {
    try {
      setTogglingId(section._id);
      const nextActive = !section.isActive;
      const response = await updateHomeSection(section._id, { isActive: nextActive });
      if (response.success) {
        setSections((prev) =>
          prev.map((s) => (s._id === section._id ? { ...s, isActive: nextActive } : s))
        );
        showToast(
          `Section "${section.title}" is now ${nextActive ? "Active" : "Inactive"}`,
          "success"
        );
      } else {
        showToast(response.message || "Failed to update status", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error updating status", "error");
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      const response = await deleteHomeSection(deleteTarget._id);
      if (response.success) {
        showToast("Home section deleted successfully!", "success");
        setSections((prev) => prev.filter((s) => s._id !== deleteTarget._id));
        if (editingId === deleteTarget._id) resetForm();
        setDeleteTarget(null);
        fetchSections();
      } else {
        showToast(response.message || "Failed to delete section", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error deleting section", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === sections.length - 1)
    ) {
      return;
    }

    const newSections = [...sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    setSections(newSections);

    try {
      const orderPayload = newSections.map((sec, idx) => ({
        id: sec._id,
        order: idx,
      }));
      await reorderHomeSections(orderPayload);
      showToast("Section display sequence updated!", "success");
    } catch (err: any) {
      showToast("Failed to save reordered sequence", "error");
      fetchSections();
    }
  };

  const handleExport = () => {
    if (sections.length === 0) {
      showToast("No home sections available to export", "info");
      return;
    }

    const headers = [
      "ID",
      "Title",
      "Slug",
      "Display Type",
      "Columns",
      "Item Limit",
      "Page Placement",
      "Target Header Category",
      "Status",
    ];

    const csvContent = [
      headers.join(","),
      ...sections.map((s) => {
        const headerCat =
          typeof s.targetHeaderCategory === "object" && s.targetHeaderCategory
            ? s.targetHeaderCategory.name
            : "";
        return [
          `"${s._id}"`,
          `"${s.title.replace(/"/g, '""')}"`,
          `"${s.slug}"`,
          `"${s.displayType}"`,
          s.columns,
          s.limit,
          `"${s.pageLocation || "Home Page"}"`,
          `"${headerCat}"`,
          s.isActive ? "Active" : "Inactive",
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_home_sections_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Home sections exported successfully", "success");
  };

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedSections = sections.slice(startIndex, startIndex + rowsPerPage);
  const totalPages = Math.ceil(sections.length / rowsPerPage) || 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Home Section & Merchandising Rails
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Design dynamic storefront carousels, subcategory grids, and header category hubs
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
          <span className="text-neutral-700 font-medium">Home Section</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Create / Edit Section */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingId ? "Edit Merchandising Section" : "Compose New Section"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-white/80 hover:text-white underline font-medium"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="homeSectionTitle" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Section Title <span className="text-red-500">*</span>
              </label>
              <input
                id="homeSectionTitle"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Trending Evening Snacks, Dairy Essentials"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Slug */}
            <div>
              <label htmlFor="homeSectionSlug" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Slug <span className="text-red-500">*</span>
              </label>
              <input
                id="homeSectionSlug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. trending-evening-snacks"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-mono bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Page Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="homeSectionLocation" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Page Placement
                </label>
                <select
                  id="homeSectionLocation"
                  value={pageLocation}
                  onChange={(e: any) => setPageLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="Home Page">Main Home Page</option>
                  <option value="Header Category Page">Header Category Page</option>
                </select>
              </div>

              {/* Display Type */}
              <div>
                <label htmlFor="homeSectionDisplayType" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Display Type
                </label>
                <select
                  id="homeSectionDisplayType"
                  value={displayType}
                  onChange={(e: any) => setDisplayType(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  {DISPLAY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Header Category if Header Category Page */}
            {pageLocation === "Header Category Page" && (
              <div>
                <label htmlFor="homeSectionTargetHeaderCat" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Target Landing Header Category <span className="text-red-500">*</span>
                </label>
                <select
                  id="homeSectionTargetHeaderCat"
                  value={targetPageHeaderCategory}
                  onChange={(e) => setTargetPageHeaderCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="">-- Select Header Category Landing Page --</option>
                  {headerCategories.map((hc) => (
                    <option key={hc._id} value={hc._id}>
                      {hc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Columns & Limit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="homeSectionColumns" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Grid Columns
                </label>
                <select
                  id="homeSectionColumns"
                  value={columns}
                  onChange={(e) => setColumns(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  {COLUMNS_OPTIONS.map((col) => (
                    <option key={col} value={col}>
                      {col} Columns
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="homeSectionLimit" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Max Items Limit
                </label>
                <input
                  id="homeSectionLimit"
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>
            </div>

            {/* Category Selects */}
            {displayType === "categories" && (
              <div>
                <label htmlFor="homeSectionHeaderCatSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Parent Header Category <span className="text-red-500">*</span>
                </label>
                <select
                  id="homeSectionHeaderCatSelect"
                  value={selectedHeaderCategory}
                  onChange={(e) => setSelectedHeaderCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="">-- Select Header Category --</option>
                  {headerCategories.map((hc) => (
                    <option key={hc._id} value={hc._id}>
                      {hc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={loading}
                  className="w-1/3 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className={`bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-2 shadow-sm ${
                  editingId ? "w-2/3" : "w-full"
                }`}
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Section...</span>
                  </>
                ) : (
                  <span>{editingId ? "Update Section" : "Publish Section"}</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: Home Sections Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Configured Storefront Rails ({sections.length})
            </h2>
            <button
              type="button"
              onClick={handleExport}
              disabled={sections.length === 0}
              className="bg-white/15 hover:bg-white/25 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px] disabled:opacity-50"
              title="Export CSV"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>

          {/* Filter Bar */}
          <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Placement Filter */}
              <div>
                <label htmlFor="homeSectionFilterLocation" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Filter by Placement
                </label>
                <select
                  id="homeSectionFilterLocation"
                  value={filterLocation}
                  onChange={(e) => {
                    setFilterLocation(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="all">All Placements</option>
                  <option value="Home Page">Home Page Only</option>
                  <option value="Header Category Page">Header Category Pages</option>
                </select>
              </div>

              {/* Search */}
              <div>
                <label htmlFor="homeSectionSearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Search Rails
                </label>
                <div className="relative">
                  <input
                    id="homeSectionSearchInput"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search title, slug..."
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                  <th className="py-3 px-2 w-16 text-center">Order</th>
                  <th className="py-3 px-4">Section Details</th>
                  <th className="py-3 px-3 text-center">Grid Setup</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loadingSections ? (
                  [1, 2, 3, 4].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-2"><div className="h-6 bg-neutral-200 rounded w-10 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-48 mb-1" /><div className="h-3 bg-neutral-200 rounded w-32" /></td>
                      <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-16 mx-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : paginatedSections.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M3 9H21M9 3V21" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No home sections found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchQuery
                          ? `No sections matching "${searchQuery}"`
                          : "Compose your first storefront section on the left"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedSections.map((section, index) => {
                    const globalIdx = startIndex + index;
                    const headerCat =
                      typeof section.targetHeaderCategory === "object" && section.targetHeaderCategory
                        ? section.targetHeaderCategory.name
                        : null;

                    return (
                      <tr key={section._id} className="hover:bg-neutral-50/80 transition-colors">
                        {/* Move Up/Down Controls */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(globalIdx, "up")}
                              disabled={globalIdx === 0}
                              className="w-6 h-5 rounded hover:bg-neutral-200 disabled:opacity-20 text-neutral-600 inline-flex items-center justify-center"
                              title="Move Up"
                            >
                              ▲
                            </button>
                            <span className="font-mono text-[11px] font-bold text-neutral-500">
                              {section.order !== undefined ? section.order : globalIdx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(globalIdx, "down")}
                              disabled={globalIdx === sections.length - 1}
                              className="w-6 h-5 rounded hover:bg-neutral-200 disabled:opacity-20 text-neutral-600 inline-flex items-center justify-center"
                              title="Move Down"
                            >
                              ▼
                            </button>
                          </div>
                        </td>

                        {/* Title & Placement Details */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-neutral-900">{section.title}</div>
                          <div className="font-mono text-[11px] text-neutral-400">/{section.slug}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                              📍 {section.pageLocation || "Home Page"}
                            </span>
                            {headerCat && (
                              <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                🏷️ {headerCat}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Grid Setup */}
                        <td className="py-3 px-3 text-center">
                          <div className="font-bold text-neutral-800 capitalize text-xs">
                            {section.displayType}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-mono">
                            {section.columns} cols • max {section.limit}
                          </div>
                        </td>

                        {/* Status Toggle */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(section)}
                            disabled={togglingId === section._id}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                              section.isActive
                                ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                                : "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200"
                            }`}
                            title="Click to toggle active visibility"
                          >
                            {togglingId === section._id ? (
                              <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                            ) : null}
                            {section.isActive ? "Active" : "Inactive"}
                          </button>
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEdit(section)}
                              className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-700 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title="Edit Section"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(section)}
                              className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title="Delete Section"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-neutral-600 font-medium">
                Showing {sections.length > 0 ? startIndex + 1 : 0} to{" "}
                {Math.min(startIndex + rowsPerPage, sections.length)} of {sections.length} sections
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loadingSections}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === 1 || loadingSections
                      ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                      : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
                  }`}
                >
                  ‹ Prev
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 rounded-lg font-bold min-h-[36px] transition-colors ${
                        currentPage === page
                          ? "bg-rose-700 text-white"
                          : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0 || loadingSections}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === totalPages || totalPages === 0 || loadingSections
                      ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                      : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
                  }`}
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-base">
                  Delete Merchandising Section
                </h3>
                <p className="text-xs text-neutral-500">
                  This will remove the dynamic section from consumer storefront screens.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Title:</span> {deleteTarget.title}
              </p>
              <p className="font-mono text-[11px] text-neutral-500">
                <span className="font-bold text-neutral-700">Slug:</span> /{deleteTarget.slug}
              </p>
              <p className="text-neutral-500">
                <span className="font-bold text-neutral-700">Placement:</span> {deleteTarget.pageLocation || "Home Page"}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Storefront Merchandising Engine
      </footer>
    </div>
  );
}
