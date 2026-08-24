import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getPromoStrips,
  createPromoStrip,
  updatePromoStrip,
  deletePromoStrip,
  type PromoStrip,
  type PromoStripFormData,
  type CategoryCard,
} from "../../../services/api/admin/adminPromoStripService";
import { getCategories, type Category } from "../../../services/api/categoryService";
import { getHeaderCategoriesAdmin, type HeaderCategory } from "../../../services/api/headerCategoryService";
import { getProducts as getAdminProducts, type Product } from "../../../services/api/admin/adminProductService";
import { useToast } from "../../../context/ToastContext";

export default function AdminPromoStrip() {
  const { showToast } = useToast();

  // Form state
  const [headerCategorySlug, setHeaderCategorySlug] = useState("");
  const [heading, setHeading] = useState("");
  const [saleText, setSaleText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [categoryCards, setCategoryCards] = useState<CategoryCard[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<string[]>([]);
  const [crazyDealsTitle, setCrazyDealsTitle] = useState("CRAZY DEALS");
  const [isActive, setIsActive] = useState(true);
  const [order, setOrder] = useState(0);

  // Data state
  const [promoStrips, setPromoStrips] = useState<PromoStrip[]>([]);
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingPromoStrips, setLoadingPromoStrips] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterVertical, setFilterVertical] = useState("all");

  // Deletion Modal state
  const [deleteTarget, setDeleteTarget] = useState<PromoStrip | null>(null);
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

  const fetchPromoStrips = useCallback(async () => {
    try {
      setLoadingPromoStrips(true);
      const params: any = {
        search: debouncedSearch || undefined,
        headerCategorySlug: filterVertical !== "all" ? filterVertical : undefined,
      };
      const data = await getPromoStrips(params);
      setPromoStrips(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to fetch PromoStrips:", err);
      showToast(err.response?.data?.message || "Failed to fetch promo strips", "error");
      setPromoStrips([]);
    } finally {
      setLoadingPromoStrips(false);
    }
  }, [debouncedSearch, filterVertical, showToast]);

  const fetchHeaderCategories = async () => {
    try {
      const data = await getHeaderCategoriesAdmin();
      setHeaderCategories(data || []);
    } catch (err: any) {
      console.error("Failed to fetch header categories:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await getCategories();
      if (response.success && response.data) {
        setCategories(response.data);
      } else {
        setCategories([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch categories:", err);
      setCategories([]);
    }
  };

  const fetchProducts = async (search: string) => {
    try {
      const response = await getAdminProducts({ search, limit: 20 });
      if (response.success && response.data) {
        setProducts(Array.isArray(response.data) ? response.data : []);
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch products:", err);
      setProducts([]);
    }
  };

  useEffect(() => {
    fetchPromoStrips();
  }, [fetchPromoStrips]);

  useEffect(() => {
    fetchHeaderCategories();
    fetchCategories();
  }, []);

  // Fetch products when search changes
  useEffect(() => {
    if (productSearch.length > 2) {
      const timeoutId = setTimeout(() => {
        fetchProducts(productSearch);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (productSearch.length === 0) {
      fetchProducts("");
    } else {
      setProducts([]);
    }
  }, [productSearch]);

  const resetForm = () => {
    setHeaderCategorySlug("");
    setHeading("");
    setSaleText("");
    setStartDate("");
    setEndDate("");
    setCategoryCards([]);
    setFeaturedProducts([]);
    setCrazyDealsTitle("CRAZY DEALS");
    setIsActive(true);
    setOrder(0);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!headerCategorySlug || !heading.trim() || !saleText.trim() || !startDate || !endDate) {
      showToast("Please fill in all required campaign fields", "error");
      return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
      showToast("End date must be after start date", "error");
      return;
    }

    if (featuredProducts.length < 4) {
      showToast("Please select at least 4 products for the CRAZY DEALS carousel section", "error");
      return;
    }

    const formData: PromoStripFormData = {
      headerCategorySlug,
      heading: heading.trim(),
      saleText: saleText.trim(),
      startDate,
      endDate,
      categoryCards: categoryCards.map((card) => ({
        categoryId: typeof card.categoryId === "object" ? (card.categoryId as any)._id : card.categoryId,
        title: card.title,
        badge: card.badge,
        discountPercentage: card.discountPercentage,
        order: card.order,
      })),
      featuredProducts,
      crazyDealsTitle: crazyDealsTitle.trim() || "CRAZY DEALS",
      isActive,
      order,
    };

    try {
      setLoading(true);

      if (editingId) {
        await updatePromoStrip(editingId, formData);
        showToast("PromoStrip campaign updated successfully!", "success");
        resetForm();
        fetchPromoStrips();
      } else {
        await createPromoStrip(formData);
        showToast("New PromoStrip campaign created successfully!", "success");
        resetForm();
        fetchPromoStrips();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to save PromoStrip", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (promoStrip: PromoStrip) => {
    setHeaderCategorySlug(promoStrip.headerCategorySlug);
    setHeading(promoStrip.heading);
    setSaleText(promoStrip.saleText);
    setStartDate(promoStrip.startDate ? promoStrip.startDate.split("T")[0] : "");
    setEndDate(promoStrip.endDate ? promoStrip.endDate.split("T")[0] : "");
    setCategoryCards(
      promoStrip.categoryCards.map((card) => {
        const categoryIdValue =
          typeof card.categoryId === "string"
            ? card.categoryId
            : (card.categoryId as any)?._id || card.categoryId;
        const categoryObj = typeof card.categoryId === "object" ? (card.categoryId as any) : null;
        return {
          categoryId: categoryIdValue,
          title: categoryObj?.name || card.title || "",
          badge: card.badge || "",
          discountPercentage: card.discountPercentage || 0,
          order: card.order || 0,
          _id: card._id,
        };
      })
    );
    setFeaturedProducts(
      promoStrip.featuredProducts.map((p) => {
        if (typeof p === "string") return p;
        return (p as any)?._id || p;
      })
    );
    setCrazyDealsTitle(promoStrip.crazyDealsTitle || "CRAZY DEALS");
    setIsActive(promoStrip.isActive);
    setOrder(promoStrip.order || 0);
    setEditingId(promoStrip._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStatusToggle = async (strip: PromoStrip) => {
    try {
      setTogglingId(strip._id);
      const nextActive = !strip.isActive;
      await updatePromoStrip(strip._id, { isActive: nextActive });
      setPromoStrips((prev) =>
        prev.map((s) => (s._id === strip._id ? { ...s, isActive: nextActive } : s))
      );
      showToast(
        `Campaign "${strip.heading}" is now ${nextActive ? "Active" : "Inactive"}`,
        "success"
      );
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
      await deletePromoStrip(deleteTarget._id);
      showToast("PromoStrip campaign deleted successfully!", "success");
      setPromoStrips((prev) => prev.filter((s) => s._id !== deleteTarget._id));
      if (editingId === deleteTarget._id) resetForm();
      setDeleteTarget(null);
      fetchPromoStrips();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to delete PromoStrip", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const addCategoryCard = () => {
    setCategoryCards([
      ...categoryCards,
      {
        categoryId: "",
        title: "",
        badge: "",
        discountPercentage: 0,
        order: categoryCards.length,
      },
    ]);
  };

  const updateCategoryCard = (index: number, field: keyof CategoryCard, value: any) => {
    const updated = [...categoryCards];
    if (field === "categoryId" && typeof value !== "string") {
      value = typeof value === "object" && value?._id ? value._id : String(value);
    }
    updated[index] = { ...updated[index], [field]: value };
    setCategoryCards(updated);
  };

  const removeCategoryCard = (index: number) => {
    setCategoryCards(categoryCards.filter((_, i) => i !== index));
  };

  const addFeaturedProduct = (productId: string) => {
    if (!featuredProducts.includes(productId)) {
      setFeaturedProducts([...featuredProducts, productId]);
    }
    setProductSearch("");
    setProducts([]);
  };

  const removeFeaturedProduct = (productId: string) => {
    setFeaturedProducts(featuredProducts.filter((id) => id !== productId));
  };

  const handleExport = () => {
    if (promoStrips.length === 0) {
      showToast("No promo strips available to export", "info");
      return;
    }

    const headers = [
      "ID",
      "Heading",
      "Sale Text",
      "Vertical (Slug)",
      "Start Date",
      "End Date",
      "Categories Count",
      "Featured Products Count",
      "Status",
    ];

    const csvContent = [
      headers.join(","),
      ...promoStrips.map((s) => [
        `"${s._id}"`,
        `"${s.heading.replace(/"/g, '""')}"`,
        `"${s.saleText.replace(/"/g, '""')}"`,
        `"${s.headerCategorySlug}"`,
        `"${s.startDate ? new Date(s.startDate).toLocaleDateString("en-IN") : ""}"`,
        `"${s.endDate ? new Date(s.endDate).toLocaleDateString("en-IN") : ""}"`,
        s.categoryCards ? s.categoryCards.length : 0,
        s.featuredProducts ? s.featuredProducts.length : 0,
        s.isActive ? "Active" : "Inactive",
      ].join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_promo_strips_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Promo strips exported successfully", "success");
  };

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedStrips = promoStrips.slice(startIndex, startIndex + rowsPerPage);
  const totalPages = Math.ceil(promoStrips.length / rowsPerPage) || 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Promo Strip Campaigns
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Configure high-converting sale banners with discount category tiles and featured product carousels
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
          <span className="text-neutral-700 font-medium">Promo Strips</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Campaign Composer Form */}
        <div className="lg:col-span-6 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingId ? "Edit Promo Campaign" : "Compose Promo Campaign"}
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

          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Target Header Category */}
            <div>
              <label htmlFor="promoHeaderCat" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Target Vertical Landing Page <span className="text-red-500">*</span>
              </label>
              <select
                id="promoHeaderCat"
                value={headerCategorySlug}
                onChange={(e) => setHeaderCategorySlug(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="">-- Select Target Vertical --</option>
                <option value="all">Global (Home Page - "all")</option>
                {headerCategories.map((cat) => (
                  <option key={cat._id} value={cat.slug}>
                    {cat.name} ({cat.slug})
                  </option>
                ))}
              </select>
            </div>

            {/* Heading & Sale Text */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="promoHeading" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Campaign Heading <span className="text-red-500">*</span>
                </label>
                <input
                  id="promoHeading"
                  type="text"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  placeholder="e.g. GRAND SUMMER SALE"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="promoSaleText" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Sale Tagline <span className="text-red-500">*</span>
                </label>
                <input
                  id="promoSaleText"
                  type="text"
                  value={saleText}
                  onChange={(e) => setSaleText(e.target.value)}
                  placeholder="e.g. Up to 60% OFF On Essentials"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>
            </div>

            {/* Date Schedule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="promoStartDate" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="promoStartDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="promoEndDate" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  End Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="promoEndDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>
            </div>

            {/* Category Cards Section */}
            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                  Discount Category Cards ({categoryCards.length})
                </span>
                <button
                  type="button"
                  onClick={addCategoryCard}
                  className="text-xs text-rose-700 hover:text-rose-800 font-bold flex items-center gap-1"
                >
                  + Add Category Card
                </button>
              </div>

              {categoryCards.length === 0 ? (
                <p className="text-[11px] text-neutral-400 italic">
                  No category highlight cards added yet. Click "+ Add Category Card" above.
                </p>
              ) : (
                categoryCards.map((card, index) => {
                  const cardCatId =
                    typeof card.categoryId === "object"
                      ? (card.categoryId as any)._id
                      : card.categoryId;

                  return (
                    <div
                      key={index}
                      className="p-3 bg-white rounded-lg border border-neutral-200 space-y-2 relative"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                          value={cardCatId || ""}
                          onChange={(e) => {
                            const cat = categories.find((c) => c._id === e.target.value);
                            updateCategoryCard(index, "categoryId", e.target.value);
                            if (cat && !card.title) {
                              updateCategoryCard(index, "title", cat.name);
                            }
                          }}
                          className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-rose-600 outline-none"
                        >
                          <option value="">-- Select Category --</option>
                          {categories.map((cat) => (
                            <option key={cat._id} value={cat._id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          value={card.title}
                          onChange={(e) => updateCategoryCard(index, "title", e.target.value)}
                          placeholder="Card Title (e.g. Cold Drinks)"
                          className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-rose-600 outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={card.badge}
                          onChange={(e) => updateCategoryCard(index, "badge", e.target.value)}
                          placeholder="Badge (e.g. MIN 30% OFF)"
                          className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-rose-600 outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={card.discountPercentage || ""}
                            onChange={(e) =>
                              updateCategoryCard(index, "discountPercentage", Number(e.target.value))
                            }
                            placeholder="Discount %"
                            className="w-full px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-rose-600 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeCategoryCard(index)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove Category Card"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Crazy Deals Featured Products Carousel */}
            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="promoCrazyDealsTitle" className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                    Carousel Title & Featured Products ({featuredProducts.length})
                  </label>
                  <span className="text-[11px] font-bold text-rose-700">
                    Min 4 Products Required
                  </span>
                </div>
                <input
                  id="promoCrazyDealsTitle"
                  type="text"
                  value={crazyDealsTitle}
                  onChange={(e) => setCrazyDealsTitle(e.target.value)}
                  placeholder="e.g. CRAZY DEALS / MEGA SAVINGS"
                  className="w-full mt-1.5 px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-medium bg-white focus:ring-1 focus:ring-rose-600 outline-none"
                />
              </div>

              {/* Product Search Picker */}
              <div>
                <div className="relative">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search product to add to carousel..."
                    className="w-full pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[40px]"
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
                </div>

                {products.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-lg divide-y divide-neutral-100 z-10">
                    {products.map((prod) => (
                      <div
                        key={prod._id}
                        onClick={() => addFeaturedProduct(prod._id)}
                        className="p-2 text-xs flex items-center justify-between hover:bg-rose-50 hover:text-rose-800 cursor-pointer transition-colors"
                      >
                        <span className="font-medium truncate max-w-[280px]">
                          {prod.productName}
                        </span>
                        <span className="font-mono font-bold text-neutral-600 shrink-0">
                          ₹{prod.price}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Featured Products Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {featuredProducts.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 italic">
                    No featured carousel products added yet.
                  </p>
                ) : (
                  featuredProducts.map((pId) => (
                    <span
                      key={pId}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-xs font-medium text-neutral-700 shadow-sm"
                    >
                      <span className="truncate max-w-[140px] font-mono text-[11px]">
                        {pId}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFeaturedProduct(pId)}
                        className="text-red-500 hover:text-red-700 font-bold text-xs"
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Active Status */}
            <div className="pt-1">
              <label htmlFor="promoIsActiveToggle" className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  id="promoIsActiveToggle"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-700 focus:ring-rose-600 border-neutral-300"
                />
                <span className="text-xs font-bold text-neutral-800">
                  Active (Live on consumer storefront)
                </span>
              </label>
            </div>

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
                    <span>Saving Campaign...</span>
                  </>
                ) : (
                  <span>{editingId ? "Update Campaign" : "Publish Promo Strip"}</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: Campaigns Table */}
        <div className="lg:col-span-6 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Configured Promo Campaigns ({promoStrips.length})
            </h2>
            <button
              type="button"
              onClick={handleExport}
              disabled={promoStrips.length === 0}
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

          {/* Filter Controls */}
          <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Vertical Filter */}
              <div>
                <label htmlFor="promoFilterVertical" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Filter by Vertical
                </label>
                <select
                  id="promoFilterVertical"
                  value={filterVertical}
                  onChange={(e) => {
                    setFilterVertical(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="all">All Verticals</option>
                  <option value="all">Global ("all")</option>
                  {headerCategories.map((hc) => (
                    <option key={hc._id} value={hc.slug}>
                      {hc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div>
                <label htmlFor="promoSearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Search Campaigns
                </label>
                <div className="relative">
                  <input
                    id="promoSearchInput"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search heading, tagline..."
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
            <table className="w-full text-left border-collapse min-w-[550px]">
              <thead>
                <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                  <th className="py-3 px-4">Campaign Details</th>
                  <th className="py-3 px-3 text-center">Vertical</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loadingPromoStrips ? (
                  [1, 2, 3].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-40 mb-1" /><div className="h-3 bg-neutral-200 rounded w-28" /></td>
                      <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-16 mx-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : paginatedStrips.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M3 9H21M9 3V21" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No promo campaigns found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchQuery
                          ? `No campaigns match "${searchQuery}"`
                          : "Compose your first promotional banner on the left"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedStrips.map((strip) => (
                    <tr key={strip._id} className="hover:bg-neutral-50/80 transition-colors">
                      {/* Campaign Heading & Dates */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-neutral-900">{strip.heading}</div>
                        <div className="text-[11px] text-neutral-500 italic">{strip.saleText}</div>
                        <div className="text-[10px] font-mono text-neutral-400 mt-1">
                          📅 {strip.startDate ? new Date(strip.startDate).toLocaleDateString("en-IN") : ""} –{" "}
                          {strip.endDate ? new Date(strip.endDate).toLocaleDateString("en-IN") : ""}
                        </div>
                      </td>

                      {/* Vertical Slug */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">
                          🏷️ {strip.headerCategorySlug}
                        </span>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(strip)}
                          disabled={togglingId === strip._id}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                            strip.isActive
                              ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                              : "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200"
                          }`}
                          title="Click to toggle active visibility"
                        >
                          {togglingId === strip._id ? (
                            <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                          ) : null}
                          {strip.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(strip)}
                            className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-700 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                            title="Edit Campaign"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(strip)}
                            className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                            title="Delete Campaign"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-neutral-600 font-medium">
                Showing {promoStrips.length > 0 ? startIndex + 1 : 0} to{" "}
                {Math.min(startIndex + rowsPerPage, promoStrips.length)} of {promoStrips.length} campaigns
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loadingPromoStrips}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === 1 || loadingPromoStrips
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
                  disabled={currentPage === totalPages || totalPages === 0 || loadingPromoStrips}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === totalPages || totalPages === 0 || loadingPromoStrips
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
                  Delete Promo Campaign
                </h3>
                <p className="text-xs text-neutral-500">
                  This campaign banner will be removed from consumer storefront screens.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Heading:</span> {deleteTarget.heading}
              </p>
              <p className="text-neutral-500 italic">{deleteTarget.saleText}</p>
              <p className="text-neutral-500">
                <span className="font-bold text-neutral-700">Target Vertical:</span>{" "}
                {deleteTarget.headerCategorySlug}
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
        HelloLocal Admin Panel • Promotional Campaign Engine
      </footer>
    </div>
  );
}
