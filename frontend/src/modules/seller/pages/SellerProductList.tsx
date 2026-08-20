import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getProducts, deleteProduct, Product } from "../../../services/api/productService";
import {
  getCategories,
  Category as apiCategory,
} from "../../../services/api/categoryService";
import { useAuth } from "../../../context/AuthContext";
import { exportToCsv } from "../../../utils/exportCsv";
import { SellerPageHeader } from "../components/common/SellerPageHeader";
import { SellerDataTable, ColumnDef } from "../components/common/SellerDataTable";
import { SellerButton } from "../components/common/SellerButton";
import { SellerModal } from "../components/common/SellerModal";

export default function SellerProductList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Products");
  const [stockFilter, setStockFilter] = useState("All Products");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalPages, setTotalPages] = useState(1);
  const [allCategories, setAllCategories] = useState<apiCategory[]>([]);
  const { user } = useAuth();

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch categories
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const response = await getCategories();
        if (response.success && response.data) {
          setAllCategories(response.data);
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      }
    };
    fetchCats();
  }, []);

  // Fetch products
  const fetchProducts = async () => {
    setLoading(true);
    setError("");
    try {
      const params: any = {
        page: currentPage,
        limit: rowsPerPage,
        sortBy: sortColumn || "createdAt",
        sortOrder: sortDirection,
      };

      if (searchTerm) {
        params.search = searchTerm;
      }
      if (categoryFilter) {
        params.category = categoryFilter;
      }
      if (statusFilter === "Published") {
        params.status = "published";
      } else if (statusFilter === "Unpublished") {
        params.status = "unpublished";
      }
      if (stockFilter === "In Stock") {
        params.stock = "inStock";
      } else if (stockFilter === "Out of Stock") {
        params.stock = "outOfStock";
      }

      const response = await getProducts(params);
      if (response.success && response.data) {
        setProducts(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.pages);
        } else {
          setTotalPages(Math.ceil(response.data.length / rowsPerPage));
        }
      } else {
        setError(response.message || "Failed to fetch products");
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to fetch products"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [
    currentPage,
    rowsPerPage,
    searchTerm,
    categoryFilter,
    statusFilter,
    stockFilter,
    sortColumn,
    sortDirection,
  ]);

  const handleDeleteClick = (productId: string) => {
    setProductToDelete(productId);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    setDeleting(true);
    try {
      const response = await deleteProduct(productToDelete);
      if (
        response.success ||
        response.message === "Product deleted successfully"
      ) {
        fetchProducts();
        setDeleteModalOpen(false);
        setProductToDelete(null);
      } else {
        alert(response.message || "Failed to delete product");
      }
    } catch (error: any) {
      alert(error.response?.data?.message || error.message || "Error deleting product");
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (productId: string) => {
    navigate(`/seller/product/edit/${productId}`);
  };

  // Flatten products with variations for display
  const allVariations = products.flatMap((product) => {
    if (!product.variations || product.variations.length === 0) {
      return [{
        variationId: `${product._id}-default`,
        productName: product.productName,
        sellerName: user?.storeName || "",
        productImage:
          product.mainImage ||
          product.mainImageUrl ||
          "/assets/product-placeholder.jpg",
        brandName: (product.brand as any)?.name || "-",
        category: (product.category as any)?.name || "-",
        subCategory: (product.subcategory as any)?.name || "-",
        price: (product as any).price || 0,
        discPrice: (product as any).discPrice || 0,
        variation: "Default",
        isPopular: product.popular,
        productId: product._id,
      }];
    }
    return product.variations.map((variation, index) => ({
      variationId: variation._id || `${product._id}-${index}`,
      productName: product.productName,
      sellerName: user?.storeName || "",
      productImage:
        product.mainImage ||
        product.mainImageUrl ||
        "/assets/product-placeholder.jpg",
      brandName: (product.brand as any)?.name || "-",
      category: (product.category as any)?.name || "-",
      subCategory: (product.subcategory as any)?.name || "-",
      price: variation.price,
      discPrice: variation.discPrice,
      variation:
        variation.title || variation.value || variation.name || "Default",
      isPopular: product.popular,
      productId: product._id,
    }));
  });

  const filteredVariations = allVariations;

  if (sortColumn) {
    filteredVariations.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof typeof a];
      let bVal: any = b[sortColumn as keyof typeof b];
      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleExport = () => {
    if (filteredVariations.length === 0) return;
    exportToCsv(
      ["Product Name", "Category", "SubCategory", "Price", "Discount Price", "Variation"],
      filteredVariations.map((v) => [
        v.productName,
        v.category,
        v.subCategory,
        v.price,
        v.discPrice,
        v.variation,
      ]),
      "products"
    );
  };

  const columns: ColumnDef<any>[] = [
    {
      key: "productImage",
      header: "Product",
      render: (v) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
            {v.productImage ? (
              <img src={v.productImage} alt={v.productName} className="w-full h-full object-contain p-1" />
            ) : (
              <span className="text-slate-400 text-xs font-bold">📦</span>
            )}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-slate-900 block text-xs sm:text-sm truncate">
              {v.productName}
            </span>
            <span className="text-[10px] text-slate-400 block truncate">
              {v.brandName !== "-" ? `Brand: ${v.brandName}` : `Var: ${v.variation}`}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (v) => (
        <div>
          <span className="text-xs font-bold text-slate-700 block">{v.category}</span>
          {v.subCategory !== "-" && (
            <span className="text-[10px] text-slate-400 block">{v.subCategory}</span>
          )}
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      sortable: true,
      sortKey: "price",
      render: (v) => (
        <div>
          <span className="font-black text-slate-900 text-xs sm:text-sm block">
            ₹{Number(v.discPrice > 0 ? v.discPrice : v.price).toFixed(2)}
          </span>
          {v.discPrice > 0 && (
            <span className="text-[10px] text-slate-400 line-through block">
              ₹{Number(v.price).toFixed(2)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "variation",
      header: "Variant",
      render: (v) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
          {v.variation}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (v) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => handleEdit(v.productId)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Edit Product"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={() => handleDeleteClick(v.productId)}
            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Delete Product"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Products Catalog"
        subtitle="Manage product listings, variations, pricing, and availability."
        breadcrumbs={[{ label: "Products List" }]}
        action={
          <div className="flex items-center gap-2">
            <SellerButton
              variant="outline"
              size="md"
              onClick={handleExport}
              disabled={filteredVariations.length === 0}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              }
            >
              Export
            </SellerButton>
            <SellerButton
              variant="primary"
              size="md"
              onClick={() => navigate("/seller/product/add")}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              }
            >
              + Add Product
            </SellerButton>
          </div>
        }
      />

      {/* Filters Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search Input */}
          <div className="sm:col-span-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search product title, SKU, or brand..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-purple-600 min-h-[40px]"
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[40px]"
            >
              <option value="">All Categories</option>
              {allCategories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Filter */}
          <div>
            <select
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[40px]"
            >
              <option value="All Products">All Stock</option>
              <option value="In Stock">In Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>
        </div>
      </div>

      {/* Products Data Table with Mobile Card View */}
      <SellerDataTable
        data={filteredVariations}
        columns={columns}
        keyExtractor={(v) => v.variationId}
        isLoading={loading}
        sortColumn={sortColumn || undefined}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        totalEntries={filteredVariations.length}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No products found"
        emptyDescription="Try adjusting your filters or click '+ Add Product' to create a new item."
        renderMobileCard={(v) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {v.productImage ? (
                    <img src={v.productImage} alt={v.productName} className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-slate-400 text-base">📦</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 text-sm truncate">{v.productName}</h4>
                  <p className="text-xs text-slate-500 truncate">{v.category}</p>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700">
                    Var: {v.variation}
                  </span>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="font-black text-slate-900 text-sm">
                  ₹{Number(v.discPrice > 0 ? v.discPrice : v.price).toFixed(2)}
                </p>
                {v.discPrice > 0 && (
                  <p className="text-[10px] text-slate-400 line-through">
                    ₹{Number(v.price).toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <SellerButton
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => handleEdit(v.productId)}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                }
              >
                Edit
              </SellerButton>
              <SellerButton
                variant="danger"
                size="sm"
                fullWidth
                onClick={() => handleDeleteClick(v.productId)}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                }
              >
                Delete
              </SellerButton>
            </div>
          </div>
        )}
      />

      {/* Delete Product Confirmation Modal */}
      <SellerModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Delete Product"
        description="Are you sure you want to delete this product? This action cannot be undone."
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <SellerButton
              variant="outline"
              size="md"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
            >
              Cancel
            </SellerButton>
            <SellerButton
              variant="danger"
              size="md"
              onClick={confirmDelete}
              isLoading={deleting}
            >
              Delete Product
            </SellerButton>
          </div>
        }
      >
        <p className="text-xs sm:text-sm text-slate-600">
          The product will be removed from your catalog and will no longer be visible to customers on HelloLocal.
        </p>
      </SellerModal>
    </div>
  );
}
