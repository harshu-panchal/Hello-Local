import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getProducts,
  getCategories,
  deleteProduct,
  type Product,
  type Category,
} from "../../../services/api/admin/adminProductService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

interface ProductVariation {
  id: string;
  productId: string;
  name: string;
  seller: string;
  sellerId: string;
  image: string;
  variation: string;
  stock: number | "Unlimited";
  status: "Published" | "Unpublished";
  category: string;
  categoryId: string;
}

const STATUS_OPTIONS = ["All Products", "Published", "Unpublished"];
const STOCK_OPTIONS = ["All Products", "In Stock", "Out of Stock", "Unlimited"];

export default function AdminStockManagement() {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<"id" | "name" | "seller" | "variation" | "stock" | "status">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState("All Category");
  const [filterSeller, setFilterSeller] = useState("All Sellers");
  const [filterStatus, setFilterStatus] = useState("All Products");
  const [filterStock, setFilterStock] = useState("All Products");

  // Deletion Modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch products and categories
  const fetchData = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [categoriesResponse, productsResponse] = await Promise.all([
        getCategories(),
        getProducts({
          limit: 1000,
          search: debouncedSearch || undefined,
          category: filterCategory !== "All Category" ? filterCategory : undefined,
          publish: filterStatus !== "All Products" ? filterStatus === "Published" : undefined,
        }),
      ]);

      if (categoriesResponse.success && Array.isArray(categoriesResponse.data)) {
        setCategories(categoriesResponse.data);
      }

      if (productsResponse.success && Array.isArray(productsResponse.data)) {
        setProducts(productsResponse.data);
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      console.error("Error fetching products:", err);
      const msg = err.response?.data?.message || "Failed to load product catalogue. Please try again.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, debouncedSearch, filterCategory, filterStatus, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Safe delete handler
  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await deleteProduct(deleteTarget.id);
      if (response.success || response.message === "Product deleted successfully") {
        showToast("Product deleted successfully", "success");
        setDeleteTarget(null);
        fetchData();
      } else {
        showToast("Failed to delete product", "error");
      }
    } catch (err: any) {
      console.error("Error deleting product:", err);
      const msg = err.response?.data?.message || "An error occurred while deleting the product";
      showToast(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = (productId: string) => {
    navigate(`/admin/product/edit/${productId}`);
  };

  // Flatten products with variations into individual rows
  const productVariations = useMemo(() => {
    const variations: ProductVariation[] = [];

    products.forEach((product) => {
      let categoryName = "Unknown";
      let categoryId = "";

      if (product.category) {
        if (typeof product.category === "object" && product.category !== null) {
          categoryName = (product.category as any).name || "Unknown";
          categoryId = (product.category as any)._id || "";
        } else if (typeof product.category === "string") {
          categoryId = product.category;
          categoryName = categories.find((c) => c._id === product.category)?.name || "Unknown";
        }
      }

      const sellerName =
        typeof product.seller === "object" && product.seller !== null
          ? (product.seller as any).storeName || (product.seller as any).sellerName
          : "Admin Store";
      const sellerId = typeof product.seller === "object" ? "" : product.seller || "";

      if (product.variations && product.variations.length > 0) {
        product.variations.forEach((variation, index) => {
          variations.push({
            id: `${product._id}-${index}`,
            productId: product._id,
            name: product.productName,
            seller: sellerName,
            sellerId: sellerId,
            image: product.mainImage || product.galleryImages?.[0] || "",
            variation: `${variation.name || 'Variant'}: ${variation.value || variation.title || 'Standard'}`,
            stock:
              variation.stock !== undefined
                ? variation.stock
                : product.stock || 0,
            status: product.publish ? "Published" : "Unpublished",
            category: categoryName,
            categoryId: categoryId,
          });
        });
      } else {
        variations.push({
          id: product._id,
          productId: product._id,
          name: product.productName,
          seller: sellerName,
          sellerId: sellerId,
          image: product.mainImage || product.galleryImages?.[0] || "",
          variation: "Standard",
          stock: product.stock || 0,
          status: product.publish ? "Published" : "Unpublished",
          category: categoryName,
          categoryId: categoryId,
        });
      }
    });

    return variations;
  }, [products, categories]);

  const handleSort = (column: "id" | "name" | "seller" | "variation" | "stock" | "status") => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Unique sellers
  const sellers = useMemo(() => {
    const sellerSet = new Set<string>();
    productVariations.forEach((p) => {
      if (p.seller && p.seller !== "Unknown Seller") {
        sellerSet.add(p.seller);
      }
    });
    return ["All Sellers", ...Array.from(sellerSet).sort()];
  }, [productVariations]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return productVariations.filter((product) => {
      const matchesCategory =
        filterCategory === "All Category" ||
        product.categoryId === filterCategory;
      const matchesSeller =
        filterSeller === "All Sellers" || product.seller === filterSeller;
      const matchesStatus =
        filterStatus === "All Products" || product.status === filterStatus;
      const matchesStock =
        filterStock === "All Products" ||
        (filterStock === "Unlimited" && product.stock === "Unlimited") ||
        (filterStock === "In Stock" &&
          product.stock !== "Unlimited" &&
          typeof product.stock === "number" &&
          product.stock > 0) ||
        (filterStock === "Out of Stock" &&
          product.stock !== "Unlimited" &&
          typeof product.stock === "number" &&
          product.stock === 0);
      const matchesSearch =
        debouncedSearch.trim() === "" ||
        product.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        product.seller.toLowerCase().includes(debouncedSearch.toLowerCase());

      return (
        matchesCategory &&
        matchesSeller &&
        matchesStatus &&
        matchesStock &&
        matchesSearch
      );
    });
  }, [
    productVariations,
    filterCategory,
    filterSeller,
    filterStatus,
    filterStock,
    debouncedSearch,
  ]);

  // Sort products
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "id":
          aValue = a.id;
          bValue = b.id;
          break;
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "seller":
          aValue = a.seller.toLowerCase();
          bValue = b.seller.toLowerCase();
          break;
        case "variation":
          aValue = a.variation.toLowerCase();
          bValue = b.variation.toLowerCase();
          break;
        case "stock":
          aValue = typeof a.stock === "number" ? a.stock : 999999;
          bValue = typeof b.stock === "number" ? b.stock : 999999;
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredProducts, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedProducts = sortedProducts.slice(startIndex, endIndex);

  // CSV Export
  const handleExport = () => {
    if (sortedProducts.length === 0) {
      showToast("No products available to export", "info");
      return;
    }

    const headers = [
      "Variation Id",
      "Product Name",
      "Seller",
      "Category",
      "Variation",
      "Stock",
      "Status",
    ];
    const csvContent = [
      headers.join(","),
      ...sortedProducts.map((product) =>
        [
          `"${product.id}"`,
          `"${(product.name || "").replace(/"/g, '""')}"`,
          `"${(product.seller || "").replace(/"/g, '""')}"`,
          `"${(product.category || "").replace(/"/g, '""')}"`,
          `"${(product.variation || "").replace(/"/g, '""')}"`,
          product.stock === "Unlimited" ? "Unlimited" : product.stock,
          product.status,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_inventory_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Product catalogue exported successfully", "success");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Product Catalog & Inventory
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Manage global products, multi-variant stock levels, and store vendor cataloging
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
          <span className="text-neutral-700 font-medium">Products</span>
        </nav>
      </div>

      {/* Main Content Box */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner with Action Buttons */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Active Inventory ({sortedProducts.length} items)
          </h2>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/product/add"
              className="bg-white text-rose-700 hover:bg-rose-50 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors min-h-[36px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add New Product</span>
            </Link>
            <button
              type="button"
              onClick={handleExport}
              className="bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px]"
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
        </div>

        {/* Filters and Controls */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-4">
          {/* Filters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="filterCategorySelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Category
              </label>
              <select
                id="filterCategorySelect"
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="All Category">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filterSellerSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Seller Store
              </label>
              <select
                id="filterSellerSelect"
                value={filterSeller}
                onChange={(e) => {
                  setFilterSeller(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                {sellers.map((seller) => (
                  <option key={seller} value={seller}>
                    {seller}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filterStatusSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Visibility Status
              </label>
              <select
                id="filterStatusSelect"
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filterStockSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Stock Availability
              </label>
              <select
                id="filterStockSelect"
                value={filterStock}
                onChange={(e) => {
                  setFilterStock(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                {STOCK_OPTIONS.map((stock) => (
                  <option key={stock} value={stock}>
                    {stock}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table Search & Page Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600">Show</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-xs font-medium text-neutral-600">entries</span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products or SKUs..."
                className="pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none w-full sm:w-64 min-h-[44px]"
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24"
                  onClick={() => handleSort("id")}
                >
                  <div className="flex items-center gap-1">
                    <span>SKU / ID</span>
                    <span className="text-neutral-400">{sortColumn === "id" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>Product Name</span>
                    <span className="text-neutral-400">{sortColumn === "name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("seller")}
                >
                  <div className="flex items-center gap-1">
                    <span>Seller Store</span>
                    <span className="text-neutral-400">{sortColumn === "seller" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-3 w-20 text-center">Image</th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("variation")}
                >
                  <div className="flex items-center gap-1">
                    <span>Variation</span>
                    <span className="text-neutral-400">{sortColumn === "variation" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24 text-center"
                  onClick={() => handleSort("stock")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Stock</span>
                    <span className="text-neutral-400">{sortColumn === "stock" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-center"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status</span>
                    <span className="text-neutral-400">{sortColumn === "status" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-14" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-36" /></td>
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-24" /></td>
                    <td className="py-3.5 px-3"><div className="h-10 w-10 bg-neutral-200 rounded mx-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-16" /></td>
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-12 mx-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-20 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
                    <button
                      type="button"
                      onClick={() => fetchData()}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : displayedProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No products found</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchTerm
                        ? `No products matching "${searchTerm}"`
                        : "Add products using the 'Add New Product' button above"}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-neutral-500">
                      #{product.id.slice(-6).toUpperCase()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-neutral-900">
                      {product.name}
                    </td>
                    <td className="py-3 px-3 text-neutral-600">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
                        {product.seller}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="w-12 h-12 bg-neutral-50 border border-neutral-200 rounded-lg overflow-hidden flex items-center justify-center mx-auto p-0.5">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect width="60" height="60" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="9"%3ENo Image%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        ) : (
                          <span className="text-[9px] text-neutral-400 font-medium">No Image</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-neutral-700 font-medium">
                      {product.variation}
                    </td>
                    <td className="py-3 px-3 text-center font-bold">
                      {product.stock === "Unlimited" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          Unlimited
                        </span>
                      ) : product.stock === 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-700 border border-red-100">
                          0 (Out)
                        </span>
                      ) : (
                        <span className="text-neutral-800 font-mono">{product.stock}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          product.status === "Published"
                            ? "bg-rose-50 text-rose-700 border border-rose-100"
                            : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                        }`}
                      >
                        {product.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(product.productId)}
                          className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors touch-target-min"
                          title="Edit product"
                          aria-label={`Edit ${product.name}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ id: product.productId, name: product.name })}
                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors touch-target-min"
                          title="Delete product"
                          aria-label={`Delete ${product.name}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        <div className="px-5 py-3.5 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-neutral-600 font-medium">
            Showing {sortedProducts.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(endIndex, sortedProducts.length)} of {sortedProducts.length} entries
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                currentPage === 1
                  ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                  : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
              }`}
              aria-label="Previous page"
            >
              ‹ Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((page, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;

                  return (
                    <div key={page} className="flex items-center gap-1">
                      {showEllipsis && <span className="px-1 text-neutral-400">...</span>}
                      <button
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
                    </div>
                  );
                })}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                currentPage === totalPages || totalPages === 0
                  ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                  : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
              }`}
              aria-label="Next page"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>

      {/* Accessible Safe Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteProductModalTitle"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>

            <div className="text-center">
              <h3 id="deleteProductModalTitle" className="text-base font-bold text-neutral-900">
                Delete Product?
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Are you sure you want to delete <strong className="text-neutral-800">"{deleteTarget.name}"</strong>? This will remove all associated variations and store inventory records.
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
                onClick={confirmDelete}
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

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quick-Commerce Operations
      </footer>
    </div>
  );
}
