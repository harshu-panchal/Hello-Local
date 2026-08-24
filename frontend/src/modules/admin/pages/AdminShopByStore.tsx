import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { uploadImage } from "../../../services/api/uploadService";
import { validateImageFile, createImagePreview } from "../../../utils/imageUpload";
import {
  getProducts,
  getCategories,
  getBrands,
  getSellers,
  type Product,
  type Category,
  type Brand,
  type Seller,
} from "../../../services/api/admin/adminProductService";
import {
  getShopByStores,
  createShopByStore,
  updateShopByStore,
  deleteShopByStore,
  type ShopByStore,
} from "../../../services/api/admin/adminMiscService";
import { useToast } from "../../../context/ToastContext";

export default function AdminShopByStore() {
  const { showToast } = useToast();

  // Form state
  const [storeName, setStoreName] = useState("");
  const [storeImageFile, setStoreImageFile] = useState<File | null>(null);
  const [storeImagePreview, setStoreImagePreview] = useState<string>("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Product Selection Filter States (Left Panel)
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterSubcategory, setFilterSubcategory] = useState<string>("");
  const [filterBrand, setFilterBrand] = useState<string>("");
  const [filterSeller, setFilterSeller] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("Active");
  const [filterMinPrice, setFilterMinPrice] = useState<string>("");
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>("");

  // Data State
  const [stores, setStores] = useState<ShopByStore[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);

  // Table Search & Filter State (Right Panel)
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Deletion Modal state
  const [deleteTarget, setDeleteTarget] = useState<ShopByStore | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const res = await getShopByStores({ search: debouncedSearch || undefined });
      if (res.success && Array.isArray(res.data)) {
        setStores(res.data);
      } else {
        setStores([]);
      }
    } catch (error: any) {
      console.error("Failed to fetch stores", error);
      showToast(error.response?.data?.message || "Failed to load stores", "error");
      setStores([]);
    } finally {
      setLoadingStores(false);
    }
  }, [debouncedSearch, showToast]);

  const fetchProducts = async () => {
    setLoadingData(true);
    try {
      const res = await getProducts({ limit: 10000, page: 1 });
      if (res.success && res.data) {
        const productList = Array.isArray(res.data) ? res.data : [];
        setAllProducts(productList);
      } else {
        setAllProducts([]);
      }
    } catch (error) {
      console.error("Failed to fetch products", error);
      setAllProducts([]);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await getCategories({ status: "Active" });
      if (res.success && res.data) {
        setCategories(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch categories", error);
    }
  };

  const fetchBrands = async () => {
    try {
      const res = await getBrands();
      if (res.success && res.data) {
        setBrands(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch brands", error);
    }
  };

  const fetchSellers = async () => {
    try {
      const res = await getSellers();
      if (res.success && res.data) {
        setSellers(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch sellers", error);
    }
  };

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchBrands();
    fetchSellers();
  }, []);

  // Filter products for the Multi-Product Selector (Left Panel)
  const filteredCatalogProducts = useMemo(() => {
    let filtered = [...allProducts];

    if (productSearchTerm) {
      filtered = filtered.filter((p) =>
        p.productName.toLowerCase().includes(productSearchTerm.toLowerCase())
      );
    }

    if (filterCategory) {
      filtered = filtered.filter((p) => {
        const catId = typeof p.category === "string" ? p.category : (p.category as any)?._id;
        return catId === filterCategory;
      });
    }

    if (filterSubcategory) {
      filtered = filtered.filter((p) => {
        if (!p.subcategory) return false;
        const subId = typeof p.subcategory === "string" ? p.subcategory : (p.subcategory as any)?._id;
        return subId === filterSubcategory;
      });
    }

    if (filterBrand) {
      filtered = filtered.filter((p) => {
        if (!p.brand) return false;
        const brandId = typeof p.brand === "string" ? p.brand : (p.brand as any)?._id;
        return brandId === filterBrand;
      });
    }

    if (filterSeller) {
      filtered = filtered.filter((p) => {
        const sellerId = typeof p.seller === "string" ? p.seller : (p.seller as any)?._id;
        return sellerId === filterSeller;
      });
    }

    if (filterStatus) {
      filtered = filtered.filter((p) => p.status === filterStatus);
    }

    if (filterMinPrice) {
      const minPrice = parseFloat(filterMinPrice);
      if (!isNaN(minPrice)) {
        filtered = filtered.filter((p) => (p.price || 0) >= minPrice);
      }
    }

    if (filterMaxPrice) {
      const maxPrice = parseFloat(filterMaxPrice);
      if (!isNaN(maxPrice)) {
        filtered = filtered.filter((p) => (p.price || 0) <= maxPrice);
      }
    }

    return filtered;
  }, [
    allProducts,
    productSearchTerm,
    filterCategory,
    filterSubcategory,
    filterBrand,
    filterSeller,
    filterStatus,
    filterMinPrice,
    filterMaxPrice,
  ]);

  const getSubcategoriesForCategory = () => {
    if (!filterCategory) return [];
    return categories.filter((c) => {
      const parentId = typeof c.parentId === "string" ? c.parentId : (c.parentId as any)?._id;
      return parentId === filterCategory;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast(validation.error || "Invalid image file", "error");
      return;
    }

    setStoreImageFile(file);

    try {
      const preview = await createImagePreview(file);
      setStoreImagePreview(preview);
    } catch {
      showToast("Failed to create image preview", "error");
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredCatalogProducts.map((p) => p._id);
    const newSelected = Array.from(new Set([...selectedProductIds, ...filteredIds]));
    setSelectedProductIds(newSelected);
    showToast(`Selected ${filteredIds.length} products`, "info");
  };

  const handleDeselectAllFiltered = () => {
    const filteredIds = new Set(filteredCatalogProducts.map((p) => p._id));
    setSelectedProductIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    showToast("Deselected filtered products", "info");
  };

  const handleReset = () => {
    setStoreName("");
    setStoreImageFile(null);
    setStoreImagePreview("");
    setEditingId(null);
    setSelectedProductIds([]);
    setIsActive(true);
    setProductSearchTerm("");
    setFilterCategory("");
    setFilterSubcategory("");
    setFilterBrand("");
    setFilterSeller("");
    setFilterStatus("Active");
    setFilterMinPrice("");
    setFilterMaxPrice("");
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!storeName.trim()) {
      showToast("Please enter a store name", "error");
      return;
    }

    setUploading(true);

    try {
      let imageUrl = "";

      if (storeImageFile) {
        const imageResult = await uploadImage(storeImageFile, "hellolocal/stores");
        imageUrl = imageResult.secureUrl;
      } else if (editingId && !storeImagePreview) {
        showToast("Store banner image is required", "error");
        setUploading(false);
        return;
      }

      const storeData = {
        name: storeName.trim(),
        image: imageUrl || (editingId ? stores.find((s) => s._id === editingId)?.image || "" : ""),
        description: "",
        products: selectedProductIds,
        order: stores.length,
        isActive,
      };

      if (editingId !== null) {
        const res = await updateShopByStore(editingId, storeData);
        if (res.success) {
          showToast("Virtual store updated successfully!", "success");
          handleReset();
          fetchStores();
        } else {
          showToast(res.message || "Failed to update store", "error");
        }
      } else {
        if (!imageUrl) {
          showToast("Store banner image is required", "error");
          setUploading(false);
          return;
        }
        const res = await createShopByStore(storeData);
        if (res.success) {
          showToast("New virtual store created successfully!", "success");
          handleReset();
          fetchStores();
        } else {
          showToast(res.message || "Failed to create store", "error");
        }
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to save store", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (id: string) => {
    const store = stores.find((s) => s._id === id);
    if (store) {
      setStoreName(store.name);
      setSelectedProductIds(store.products || []);
      setStoreImagePreview(store.image || "");
      setIsActive(store.isActive !== undefined ? store.isActive : true);
      setEditingId(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleStatusToggle = async (store: ShopByStore) => {
    try {
      setTogglingId(store._id);
      const nextActive = !store.isActive;
      const res = await updateShopByStore(store._id, { isActive: nextActive });
      if (res.success) {
        setStores((prev) =>
          prev.map((s) => (s._id === store._id ? { ...s, isActive: nextActive } : s))
        );
        showToast(
          `Store "${store.name}" is now ${nextActive ? "Active" : "Inactive"}`,
          "success"
        );
      } else {
        showToast(res.message || "Failed to update status", "error");
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
      const res = await deleteShopByStore(deleteTarget._id);
      if (res.success) {
        showToast("Virtual store deleted successfully!", "success");
        setStores((prev) => prev.filter((s) => s._id !== deleteTarget._id));
        if (editingId === deleteTarget._id) handleReset();
        setDeleteTarget(null);
        fetchStores();
      } else {
        showToast(res.message || "Failed to delete store", "error");
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to delete store", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sort and Paginate Stores (Right Panel)
  const sortedStores = useMemo(() => {
    const list = [...stores];
    if (!sortColumn) return list;

    return list.sort((a, b) => {
      let aValue = "";
      let bValue = "";

      switch (sortColumn) {
        case "id":
          aValue = (a.storeId || a._id).toLowerCase();
          bValue = (b.storeId || b._id).toLowerCase();
          break;
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [stores, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedStores.length / entriesPerPage) || 1;
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const displayedStores = sortedStores.slice(startIndex, endIndex);

  const handleExport = () => {
    if (stores.length === 0) {
      showToast("No stores available to export", "info");
      return;
    }

    const headers = [
      "ID",
      "Store ID / Slug",
      "Store Name",
      "Products Count",
      "Status",
      "Created Date",
    ];

    const csvContent = [
      headers.join(","),
      ...stores.map((s) => [
        `"${s._id}"`,
        `"${s.storeId || ""}"`,
        `"${s.name.replace(/"/g, '""')}"`,
        s.products ? s.products.length : 0,
        s.isActive ? "Active" : "Inactive",
        `"${s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-IN") : ""}"`,
      ].join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_shop_by_stores_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Virtual stores exported successfully", "success");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Shop by Store
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Create branded virtual store hubs and curate bundled catalog products for storefront discovery
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
          <span className="text-neutral-700 font-medium">Shop by Store</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel - Store Composer Form */}
        <div className="lg:col-span-6 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingId ? "Edit Virtual Store" : "Create Virtual Store"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-white/80 hover:text-white underline font-medium"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleAddStore} className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Store Name */}
            <div>
              <label htmlFor="storeComposerName" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Store Name <span className="text-red-500">*</span>
              </label>
              <input
                id="storeComposerName"
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Organic Farm Store / Baby Care Essentials"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Store Banner Image */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Store Banner Image <span className="text-red-500">*</span>
              </label>
              <label className="block border-2 border-dashed border-neutral-300 rounded-xl p-4 text-center cursor-pointer hover:border-rose-600 transition-colors bg-neutral-50/50">
                {storeImagePreview ? (
                  <div className="space-y-2">
                    <img
                      src={storeImagePreview}
                      alt="Store preview"
                      className="max-h-32 mx-auto rounded-lg object-cover shadow-sm"
                    />
                    <p className="text-xs text-neutral-600 truncate font-mono">
                      {storeImageFile?.name || "Uploaded Image"}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setStoreImageFile(null);
                        setStoreImagePreview("");
                      }}
                      className="text-xs text-red-600 hover:text-red-700 font-bold"
                    >
                      Remove Banner
                    </button>
                  </div>
                ) : (
                  <div>
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="mx-auto mb-1.5 text-neutral-400"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="text-xs font-bold text-neutral-700">Click to upload store banner</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">PNG, JPG, WEBP up to 5MB</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>

            {/* Product Selection Section */}
            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                  Curate Store Products ({selectedProductIds.length} Selected)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-[11px] text-rose-700 hover:text-rose-800 font-bold"
                  >
                    Select All
                  </button>
                  <span className="text-neutral-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    className="text-[11px] text-neutral-500 hover:text-neutral-700 font-bold"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Filters Box */}
              <div className="space-y-2 p-3 bg-white rounded-xl border border-neutral-200 text-xs">
                {/* Search */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search catalog products..."
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded-lg text-xs outline-none focus:border-rose-600 min-h-[38px]"
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

                {/* Category & Subcategory */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={filterCategory}
                    onChange={(e) => {
                      setFilterCategory(e.target.value);
                      setFilterSubcategory("");
                    }}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:border-rose-600 outline-none"
                  >
                    <option value="">All Categories</option>
                    {categories.filter((c) => !c.parentId).map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterSubcategory}
                    onChange={(e) => setFilterSubcategory(e.target.value)}
                    disabled={!filterCategory}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:border-rose-600 outline-none disabled:bg-neutral-100"
                  >
                    <option value="">All Subcategories</option>
                    {getSubcategoriesForCategory().map((sub) => (
                      <option key={sub._id} value={sub._id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Brand & Seller */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={filterBrand}
                    onChange={(e) => setFilterBrand(e.target.value)}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:border-rose-600 outline-none"
                  >
                    <option value="">All Brands</option>
                    {brands.map((brand) => (
                      <option key={brand._id} value={brand._id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterSeller}
                    onChange={(e) => setFilterSeller(e.target.value)}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:border-rose-600 outline-none"
                  >
                    <option value="">All Sellers</option>
                    {sellers.map((seller) => (
                      <option key={seller._id} value={seller._id}>
                        {seller.storeName || seller.sellerName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status & Price Range */}
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white focus:border-rose-600 outline-none"
                  >
                    <option value="">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>

                  <input
                    type="number"
                    placeholder="Min ₹"
                    value={filterMinPrice}
                    onChange={(e) => setFilterMinPrice(e.target.value)}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs outline-none focus:border-rose-600"
                  />

                  <input
                    type="number"
                    placeholder="Max ₹"
                    value={filterMaxPrice}
                    onChange={(e) => setFilterMaxPrice(e.target.value)}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs outline-none focus:border-rose-600"
                  />
                </div>
              </div>

              {/* Products Checklist */}
              <div className="border border-neutral-200 rounded-xl max-h-56 overflow-y-auto p-2 bg-white divide-y divide-neutral-100">
                {loadingData ? (
                  <div className="text-center text-xs text-neutral-500 py-6">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-rose-700 border-t-transparent mr-2" />
                    Loading catalog products...
                  </div>
                ) : filteredCatalogProducts.length > 0 ? (
                  filteredCatalogProducts.map((product) => {
                    const isChecked = selectedProductIds.includes(product._id);
                    return (
                      <label
                        key={product._id}
                        htmlFor={`shopProd-${product._id}`}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          isChecked ? "bg-rose-50/70" : "hover:bg-neutral-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate max-w-[280px]">
                          <input
                            type="checkbox"
                            id={`shopProd-${product._id}`}
                            checked={isChecked}
                            onChange={() => toggleProductSelection(product._id)}
                            className="h-4 w-4 text-rose-700 focus:ring-rose-600 border-neutral-300 rounded cursor-pointer"
                          />
                          <span className="text-xs font-medium text-neutral-900 truncate">
                            {product.productName}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-neutral-600 shrink-0">
                          ₹{product.price || 0}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <div className="text-center text-xs text-neutral-400 py-6 italic">
                    No products match the selected filters
                  </div>
                )}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="pt-1">
              <label htmlFor="shopIsActiveToggle" className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  id="shopIsActiveToggle"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-700 focus:ring-rose-600 border-neutral-300"
                />
                <span className="text-xs font-bold text-neutral-800">
                  Active (Live on consumer storefront rails)
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {editingId && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={uploading}
                  className="w-1/3 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={uploading}
                className={`bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-2 shadow-sm ${
                  editingId ? "w-2/3" : "w-full"
                }`}
              >
                {uploading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Store...</span>
                  </>
                ) : (
                  <span>{editingId ? "Update Virtual Store" : "Publish Virtual Store"}</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel - View Stores Table */}
        <div className="lg:col-span-6 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Virtual Storefronts ({stores.length})
            </h2>
            <button
              type="button"
              onClick={handleExport}
              disabled={stores.length === 0}
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

          {/* Table Controls */}
          <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Entries Per Page */}
              <div>
                <label htmlFor="shopEntriesPerPage" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Show Rows
                </label>
                <select
                  id="shopEntriesPerPage"
                  value={entriesPerPage}
                  onChange={(e) => {
                    setEntriesPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value={10}>10 rows</option>
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                </select>
              </div>

              {/* Search */}
              <div>
                <label htmlFor="shopSearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Search Stores
                </label>
                <div className="relative">
                  <input
                    id="shopSearchInput"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search store name, slug..."
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
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
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
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Store</span>
                      <span className="text-neutral-400 text-[10px]">
                        {sortColumn === "name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>
                  <th className="py-3 px-3 text-center">Products</th>
                  <th className="py-3 px-3 text-center">Banner</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loadingStores ? (
                  [1, 2, 3].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-36 mb-1" /><div className="h-3 bg-neutral-200 rounded w-24" /></td>
                      <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-12 mx-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-10 w-10 bg-neutral-200 rounded mx-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : displayedStores.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No virtual stores found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchTerm
                          ? `No stores match "${searchTerm}"`
                          : "Compose your first virtual store on the left"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  displayedStores.map((store) => (
                    <tr key={store._id} className="hover:bg-neutral-50/80 transition-colors">
                      {/* Name & Slug */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-neutral-900">{store.name}</div>
                        <div className="font-mono text-[10px] text-neutral-400 mt-0.5">
                          slug: {store.storeId || store._id}
                        </div>
                      </td>

                      {/* Products Count */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-neutral-100 text-neutral-700">
                          📦 {store.products?.length || 0}
                        </span>
                      </td>

                      {/* Banner Image Thumbnail */}
                      <td className="py-3 px-3 text-center">
                        <div className="w-12 h-9 bg-neutral-100 rounded-lg overflow-hidden flex items-center justify-center border border-neutral-200 mx-auto">
                          {store.image ? (
                            <img
                              src={store.image}
                              alt={store.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';
                              }}
                            />
                          ) : (
                            <span className="text-[9px] text-neutral-400 font-bold">No Img</span>
                          )}
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(store)}
                          disabled={togglingId === store._id}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                            store.isActive
                              ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                              : "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200"
                          }`}
                          title="Click to toggle active visibility"
                        >
                          {togglingId === store._id ? (
                            <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                          ) : null}
                          {store.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(store._id)}
                            className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-700 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                            title="Edit Store"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(store)}
                            className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                            title="Delete Store"
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
                Showing {stores.length > 0 ? startIndex + 1 : 0} to{" "}
                {Math.min(startIndex + entriesPerPage, stores.length)} of {stores.length} stores
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loadingStores}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === 1 || loadingStores
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
                  disabled={currentPage === totalPages || totalPages === 0 || loadingStores}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === totalPages || totalPages === 0 || loadingStores
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
                  Delete Virtual Store
                </h3>
                <p className="text-xs text-neutral-500">
                  This virtual storefront will be removed from discovery rails.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Store:</span> {deleteTarget.name}
              </p>
              <p className="text-neutral-500 font-mono text-[11px]">
                Slug: {deleteTarget.storeId || deleteTarget._id}
              </p>
              <p className="text-neutral-500">
                Curated Products: {deleteTarget.products?.length || 0}
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
        HelloLocal Admin Panel • Shop by Store Engine
      </footer>
    </div>
  );
}
