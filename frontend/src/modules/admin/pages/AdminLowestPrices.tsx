import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getLowestPricesProducts,
  createLowestPricesProduct,
  updateLowestPricesProduct,
  deleteLowestPricesProduct,
  reorderLowestPricesProducts,
  type LowestPricesProduct,
  type LowestPricesProductFormData,
} from "../../../services/api/admin/adminLowestPricesService";
import { getProducts, type Product } from "../../../services/api/admin/adminProductService";
import { useToast } from "../../../context/ToastContext";

export default function AdminLowestPrices() {
  const { showToast } = useToast();

  // Form state
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [order, setOrder] = useState<number | undefined>(undefined);
  const [isActive, setIsActive] = useState(true);

  // Data state
  const [lowestPricesProducts, setLowestPricesProducts] = useState<LowestPricesProduct[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [productPickerSearch, setProductPickerSearch] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Table Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterActive, setFilterActive] = useState<string>("all");

  // Deletion Modal state
  const [deleteTarget, setDeleteTarget] = useState<LowestPricesProduct | null>(null);
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

  const fetchLowestPricesProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const params: any = {
        search: debouncedSearch || undefined,
        isActive:
          filterActive === "active"
            ? true
            : filterActive === "inactive"
            ? false
            : undefined,
      };
      const response = await getLowestPricesProducts(params);
      if (response.success && Array.isArray(response.data)) {
        setLowestPricesProducts(response.data);
      } else {
        setLowestPricesProducts([]);
      }
    } catch (err: any) {
      console.error("Error fetching lowest prices products:", err);
      showToast(err.response?.data?.message || "Failed to load lowest prices products", "error");
      setLowestPricesProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [debouncedSearch, filterActive, showToast]);

  const fetchAvailableProducts = async () => {
    try {
      const response = await getProducts({ limit: 1000, status: "Active" });
      if (response.success && response.data) {
        const productList = Array.isArray(response.data) ? response.data : [];
        setAvailableProducts(productList);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  useEffect(() => {
    fetchLowestPricesProducts();
  }, [fetchLowestPricesProducts]);

  useEffect(() => {
    fetchAvailableProducts();
  }, []);

  // Filter products for the Left-Side Picker (excluding already spotlighted items)
  const filteredAvailableProducts = availableProducts.filter((product) => {
    const existingProductIds = lowestPricesProducts.map((lp) =>
      typeof lp.product === "string" ? lp.product : lp.product?._id
    );

    if (existingProductIds.includes(product._id)) {
      return false;
    }

    if (productPickerSearch) {
      const searchLower = productPickerSearch.toLowerCase();
      return (
        product.productName?.toLowerCase().includes(searchLower) ||
        product._id.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  const resetForm = () => {
    setSelectedProduct("");
    setOrder(undefined);
    setIsActive(true);
    setEditingId(null);
    setProductPickerSearch("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProduct) {
      showToast("Please select a catalog product", "error");
      return;
    }

    const formData: LowestPricesProductFormData = {
      product: selectedProduct,
      order: order !== undefined ? order : undefined,
      isActive,
    };

    try {
      setLoading(true);

      if (editingId) {
        const response = await updateLowestPricesProduct(editingId, formData);
        if (response.success) {
          showToast("Deal product updated successfully!", "success");
          resetForm();
          fetchLowestPricesProducts();
        } else {
          showToast(response.message || "Failed to update deal product", "error");
        }
      } else {
        const response = await createLowestPricesProduct(formData);
        if (response.success) {
          showToast("Product spotlighted in Lowest Prices section!", "success");
          resetForm();
          fetchLowestPricesProducts();
          fetchAvailableProducts();
        } else {
          showToast(response.message || "Failed to add product to deals", "error");
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to save deal product", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (lowestPricesProduct: LowestPricesProduct) => {
    const productId =
      typeof lowestPricesProduct.product === "string"
        ? lowestPricesProduct.product
        : lowestPricesProduct.product._id;
    setSelectedProduct(productId);
    setOrder(lowestPricesProduct.order);
    setIsActive(lowestPricesProduct.isActive);
    setEditingId(lowestPricesProduct._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStatusToggle = async (item: LowestPricesProduct) => {
    try {
      setTogglingId(item._id);
      const nextActive = !item.isActive;
      const response = await updateLowestPricesProduct(item._id, { isActive: nextActive });
      if (response.success) {
        setLowestPricesProducts((prev) =>
          prev.map((p) => (p._id === item._id ? { ...p, isActive: nextActive } : p))
        );
        const prodName =
          typeof item.product === "string"
            ? "Product"
            : item.product?.productName || "Product";
        showToast(
          `Deal "${prodName}" is now ${nextActive ? "Active" : "Inactive"}`,
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
      const response = await deleteLowestPricesProduct(deleteTarget._id);
      if (response.success) {
        showToast("Product removed from Lowest Prices section!", "success");
        setLowestPricesProducts((prev) =>
          prev.filter((p) => p._id !== deleteTarget._id)
        );
        if (editingId === deleteTarget._id) resetForm();
        setDeleteTarget(null);
        fetchLowestPricesProducts();
        fetchAvailableProducts();
      } else {
        showToast(response.message || "Failed to remove product", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error removing product", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === lowestPricesProducts.length - 1)
    ) {
      return;
    }

    const newItems = [...lowestPricesProducts];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    setLowestPricesProducts(newItems);

    try {
      const orderPayload = newItems.map((item, idx) => ({
        id: item._id,
        order: idx,
      }));
      await reorderLowestPricesProducts(orderPayload);
      showToast("Deal display sequence updated!", "success");
    } catch (err: any) {
      showToast("Failed to save reordered sequence", "error");
      fetchLowestPricesProducts();
    }
  };

  const handleExport = () => {
    if (lowestPricesProducts.length === 0) {
      showToast("No deal products available to export", "info");
      return;
    }

    const headers = [
      "ID",
      "Product Name",
      "Selling Price (₹)",
      "MRP (₹)",
      "Display Order",
      "Status",
    ];

    const csvContent = [
      headers.join(","),
      ...lowestPricesProducts.map((item) => {
        const prod = typeof item.product === "object" && item.product ? item.product : null;
        const prodName = prod?.productName || "Product";
        const price = prod?.price || 0;
        const mrp = prod?.mrp || 0;

        return [
          `"${item._id}"`,
          `"${prodName.replace(/"/g, '""')}"`,
          price.toFixed(2),
          mrp.toFixed(2),
          item.order !== undefined ? item.order : "",
          item.isActive ? "Active" : "Inactive",
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_lowest_prices_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Lowest prices products exported successfully", "success");
  };

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedProducts = lowestPricesProducts.slice(startIndex, startIndex + rowsPerPage);
  const totalPages = Math.ceil(lowestPricesProducts.length / rowsPerPage) || 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Lowest Prices Ever Deals
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Spotlight high-discount flash sale products on the consumer storefront highlight rail
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
          <span className="text-neutral-700 font-medium">Lowest Prices</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Add / Edit Product */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingId ? "Edit Deal Product" : "Spotlight Catalog Product"}
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
            {/* Product Selector */}
            <div>
              <label htmlFor="dealProductPickerSearch" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Select Active Product <span className="text-red-500">*</span>
              </label>

              {!editingId ? (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      id="dealProductPickerSearch"
                      type="text"
                      placeholder="Search active catalog..."
                      value={productPickerSearch}
                      onChange={(e) => setProductPickerSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[40px]"
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

                  <div className="border border-neutral-200 rounded-xl max-h-48 overflow-y-auto bg-neutral-50/50 divide-y divide-neutral-100">
                    {filteredAvailableProducts.length === 0 ? (
                      <p className="text-xs text-neutral-400 p-4 text-center italic">
                        {productPickerSearch
                          ? "No matching un-spotlighted products found"
                          : "No available products in catalog"}
                      </p>
                    ) : (
                      filteredAvailableProducts.slice(0, 30).map((prod) => {
                        const prodPrice = prod.price ?? 0;
                        const comparePrice = prod.compareAtPrice;

                        return (
                          <button
                            key={prod._id}
                            type="button"
                            onClick={() => {
                              setSelectedProduct(prod._id);
                              setProductPickerSearch("");
                            }}
                            className={`w-full text-left p-2.5 hover:bg-rose-50 transition-colors flex items-center justify-between ${
                              selectedProduct === prod._id
                                ? "bg-rose-100/70 border-l-4 border-rose-700"
                                : "bg-white"
                            }`}
                          >
                            <div className="truncate max-w-[240px]">
                              <div className="text-xs font-bold text-neutral-900 truncate">
                                {prod.productName}
                              </div>
                              <div className="text-[10px] text-neutral-400 font-mono">
                                ID: {prod._id.slice(-6)}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-rose-700 text-xs">
                                ₹{prodPrice}
                              </span>
                              {comparePrice && comparePrice > prodPrice && (
                                <span className="block text-[10px] text-neutral-400 line-through">
                                  ₹{comparePrice}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {selectedProduct && (
                    <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-xs font-bold text-rose-900 flex items-center justify-between">
                      <span className="truncate">
                        ✅ Selected:{" "}
                        {availableProducts.find((p) => p._id === selectedProduct)?.productName}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedProduct("")}
                        className="text-rose-700 hover:text-rose-900 font-bold ml-2"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 border border-neutral-300 rounded-xl bg-neutral-50 text-xs font-bold text-neutral-900">
                  {availableProducts.find((p) => p._id === selectedProduct)?.productName ||
                    lowestPricesProducts.find((lp) => lp._id === editingId)?.product?.productName ||
                    "Product Selected"}
                </div>
              )}
            </div>

            {/* Display Order */}
            <div>
              <label htmlFor="dealProductOrder" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Display Sequence Order (Optional)
              </label>
              <input
                id="dealProductOrder"
                type="number"
                min={0}
                value={order !== undefined ? order : ""}
                onChange={(e) => setOrder(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Auto-assigned to end if blank"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Active Toggle */}
            <div className="pt-1">
              <label htmlFor="dealProductIsActive" className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  id="dealProductIsActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-700 focus:ring-rose-600 border-neutral-300"
                />
                <span className="text-xs font-bold text-neutral-800">
                  Active (Spotlight on consumer storefront)
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
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{editingId ? "Update Deal" : "Spotlight Deal Product"}</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: View Products Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Spotlighted Deal Products ({lowestPricesProducts.length})
            </h2>
            <button
              type="button"
              onClick={handleExport}
              disabled={lowestPricesProducts.length === 0}
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
              {/* Status Filter */}
              <div>
                <label htmlFor="dealFilterStatus" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Filter by Status
                </label>
                <select
                  id="dealFilterStatus"
                  value={filterActive}
                  onChange={(e) => {
                    setFilterActive(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="all">All Deal Products</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>

              {/* Search */}
              <div>
                <label htmlFor="dealTableSearch" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Search Deal Products
                </label>
                <div className="relative">
                  <input
                    id="dealTableSearch"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search product name..."
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
                  <th className="py-3 px-2 w-16 text-center">Order</th>
                  <th className="py-3 px-4">Product Details</th>
                  <th className="py-3 px-3 text-right">Deal Price</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loadingProducts ? (
                  [1, 2, 3].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-2"><div className="h-6 bg-neutral-200 rounded w-10 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-44" /></td>
                      <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : paginatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                          <path d="M2 17L12 22L22 17" />
                          <path d="M2 12L12 17L22 12" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No lowest price deals found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchQuery
                          ? `No deal products match "${searchQuery}"`
                          : "Spotlight your first deal product on the left"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((item, index) => {
                    const globalIdx = startIndex + index;
                    const prod = typeof item.product === "object" && item.product ? item.product : null;
                    const prodName = prod?.productName || "Product not found";

                    return (
                      <tr key={item._id} className="hover:bg-neutral-50/80 transition-colors">
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
                              {item.order !== undefined ? item.order : globalIdx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(globalIdx, "down")}
                              disabled={globalIdx === lowestPricesProducts.length - 1}
                              className="w-6 h-5 rounded hover:bg-neutral-200 disabled:opacity-20 text-neutral-600 inline-flex items-center justify-center"
                              title="Move Down"
                            >
                              ▼
                            </button>
                          </div>
                        </td>

                        {/* Product Details */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-neutral-900">{prodName}</div>
                          {prod?.mrp && prod?.price && prod.mrp > prod.price && (
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold mt-0.5 inline-block">
                              {Math.round(((prod.mrp - prod.price) / prod.mrp) * 100)}% OFF
                            </span>
                          )}
                        </td>

                        {/* Deal Price */}
                        <td className="py-3 px-3 text-right">
                          <div className="font-mono font-bold text-rose-700">
                            ₹{(prod?.price || 0).toLocaleString("en-IN")}
                          </div>
                          {prod?.mrp && prod.mrp > (prod.price || 0) && (
                            <div className="font-mono text-[10px] text-neutral-400 line-through">
                              ₹{prod.mrp.toLocaleString("en-IN")}
                            </div>
                          )}
                        </td>

                        {/* Status Toggle */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(item)}
                            disabled={togglingId === item._id}
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                              item.isActive
                                ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                                : "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200"
                            }`}
                            title="Click to toggle active visibility"
                          >
                            {togglingId === item._id ? (
                              <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                            ) : null}
                            {item.isActive ? "Active" : "Inactive"}
                          </button>
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEdit(item)}
                              className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-700 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title="Edit Deal"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title="Remove Deal"
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
                Showing {lowestPricesProducts.length > 0 ? startIndex + 1 : 0} to{" "}
                {Math.min(startIndex + rowsPerPage, lowestPricesProducts.length)} of{" "}
                {lowestPricesProducts.length} deal products
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loadingProducts}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === 1 || loadingProducts
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
                  disabled={currentPage === totalPages || totalPages === 0 || loadingProducts}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === totalPages || totalPages === 0 || loadingProducts
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
                  Remove from Lowest Prices Rail
                </h3>
                <p className="text-xs text-neutral-500">
                  This product will no longer appear in the flash deal showcase rail.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Product:</span>{" "}
                {typeof deleteTarget.product === "object"
                  ? deleteTarget.product?.productName
                  : "Product"}
              </p>
              {typeof deleteTarget.product === "object" && deleteTarget.product?.price && (
                <p className="text-rose-700 font-mono font-bold">
                  Price: ₹{deleteTarget.product.price}
                </p>
              )}
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
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Yes, Remove</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Lowest Prices Flash Deal Rail
      </footer>
    </div>
  );
}
