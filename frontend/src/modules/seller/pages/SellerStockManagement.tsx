import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProducts, updateStock, Product } from '../../../services/api/productService';
import { getCategories } from '../../../services/api/categoryService';
import { useAuth } from '../../../context/AuthContext';
import { exportToCsv } from '../../../utils/exportCsv';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';
import { SellerButton } from '../components/common/SellerButton';
import { useToast } from '../../../context/ToastContext';

interface StockItem {
  variationId: string;
  productId: string;
  name: string;
  seller: string;
  image: string;
  variation: string;
  stock: number | 'Unlimited';
  status: 'Published' | 'Unpublished';
  category: string;
}

export default function SellerStockManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [updatingStock, setUpdatingStock] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Category');
  const [statusFilter, setStatusFilter] = useState('All Products');
  const [stockFilter, setStockFilter] = useState('All Products');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [categories, setCategories] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  // 300ms Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch categories for filter
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await getCategories();
        if (res.success && res.data) {
          setCategories(res.data.map(cat => cat.name));
        }
      } catch (err) {
        console.error("Error fetching categories:", err);
      }
    };
    fetchCats();
  }, []);

  const resolveImageUrl = (url: string | undefined) => {
    if (!url) return '/assets/product-placeholder.jpg';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;

    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
    try {
      const urlObj = new URL(apiBase);
      const origin = urlObj.origin;
      const cleanUrl = url.replace(/\\/g, '/');
      return `${origin}/${cleanUrl.startsWith('/') ? cleanUrl.slice(1) : cleanUrl}`;
    } catch {
      return url;
    }
  };

  // Fetch products and convert to stock items
  const fetchStockItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {
        page: currentPage,
        limit: rowsPerPage,
      };

      if (categoryFilter !== 'All Category') {
        params.category = categoryFilter;
      }
      if (statusFilter === 'Published') {
        params.status = 'published';
      } else if (statusFilter === 'Unpublished') {
        params.status = 'unpublished';
      }

      const response = await getProducts(params);
      if (response.success && response.data) {
        const items: StockItem[] = [];
        response.data.forEach((product: Product) => {
          if (!product.variations || product.variations.length === 0) {
            items.push({
              variationId: `${product._id}-default`,
              productId: product._id,
              name: product.productName,
              seller: user?.storeName || '',
              image: resolveImageUrl(product.mainImage || product.mainImageUrl),
              variation: 'Default',
              stock: (product as any).stock || 0,
              status: product.publish ? 'Published' : 'Unpublished',
              category: (product.category as any)?.name || 'Uncategorized',
            });
          } else {
            product.variations.forEach((variation, index) => {
              items.push({
                variationId: variation._id || `${product._id}-${index}`,
                productId: product._id,
                name: product.productName,
                seller: user?.storeName || '',
                image: resolveImageUrl(product.mainImage || product.mainImageUrl),
                variation: variation.title || variation.value || variation.name || 'Default',
                stock: variation.stock,
                status: product.publish ? 'Published' : 'Unpublished',
                category: (product.category as any)?.name || 'Uncategorized',
              });
            });
          }
        });
        setStockItems(items);
        if ((response as any).pagination) {
          setTotalPages((response as any).pagination.pages);
        } else {
          setTotalPages(Math.ceil(response.data.length / rowsPerPage));
        }
      } else {
        const msg = response.message || 'Failed to fetch stock items';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to fetch stock items';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentPage, rowsPerPage, categoryFilter, statusFilter, user?.storeName, showToast]);

  useEffect(() => {
    fetchStockItems();
  }, [fetchStockItems]);

  const handleStockUpdate = async (productId: string, variationId: string, newStock: number) => {
    setUpdatingStock(variationId);
    try {
      const response = await updateStock(productId, variationId, newStock);
      if (response.success) {
        setStockItems(prev => prev.map(item =>
          item.variationId === variationId
            ? { ...item, stock: newStock }
            : item
        ));
        showToast(`Stock updated to ${newStock} units`, 'success');
      } else {
        const msg = response.message || 'Failed to update stock';
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to update stock';
      showToast(msg, 'error');
    } finally {
      setUpdatingStock(null);
    }
  };

  const filteredItems = useMemo(() => {
    const list = stockItems.filter(item => {
      const matchesSearch = !debouncedSearch ||
        item.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        item.variation.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        item.category.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesCategory = categoryFilter === 'All Category' || item.category === categoryFilter;
      const matchesStatus = statusFilter === 'All Products' ||
        (statusFilter === 'Published' && item.status === 'Published') ||
        (statusFilter === 'Unpublished' && item.status === 'Unpublished');
      const matchesStock = stockFilter === 'All Products' ||
        (stockFilter === 'In Stock' && (typeof item.stock === 'number' && item.stock > 0)) ||
        (stockFilter === 'Out of Stock' && item.stock === 0);
      return matchesSearch && matchesCategory && matchesStatus && matchesStock;
    });

    if (sortColumn) {
      list.sort((a, b) => {
        let aVal: any = a[sortColumn as keyof typeof a];
        let bVal: any = b[sortColumn as keyof typeof b];
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        if (sortColumn === 'stock') {
          aVal = Number(aVal);
          bVal = Number(bVal);
        }
        if (sortDirection === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }

    return list;
  }, [stockItems, debouncedSearch, categoryFilter, statusFilter, stockFilter, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    if (filteredItems.length === 0) {
      showToast('No inventory items available to export', 'info');
      return;
    }
    exportToCsv(
      ['Product Name', 'Variant', 'Category', 'Available Stock', 'Stock Status', 'Visibility'],
      filteredItems.map(item => [
        item.name,
        item.variation,
        item.category,
        item.stock,
        typeof item.stock === 'number' && item.stock <= 0 ? 'Out of Stock' : typeof item.stock === 'number' && item.stock < 5 ? 'Low Stock' : 'In Stock',
        item.status,
      ]),
      'inventory_stock_report'
    );
    showToast('Inventory report exported successfully!', 'success');
  };

  const hasActiveFilters = Boolean(
    searchTerm || categoryFilter !== 'All Category' || statusFilter !== 'All Products' || stockFilter !== 'All Products'
  );

  const handleClearFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setCategoryFilter('All Category');
    setStatusFilter('All Products');
    setStockFilter('All Products');
    setCurrentPage(1);
  };

  const columns: ColumnDef<StockItem>[] = [
    {
      key: 'image',
      header: 'Product',
      render: (item) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
            {item.image ? (
              <img src={item.image} alt={item.name} className="w-full h-full object-contain p-1" />
            ) : (
              <span className="text-slate-400 text-xs font-bold">📦</span>
            )}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-slate-900 block text-xs sm:text-sm truncate">
              {item.name}
            </span>
            <span className="text-[10px] text-slate-400 block truncate">
              Var: {item.variation} • {item.category}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <SellerStatusBadge status={item.status} size="sm" />,
    },
    {
      key: 'stock',
      header: 'Available Stock (Units)',
      sortable: true,
      sortKey: 'stock',
      render: (item) => {
        const currentStock = typeof item.stock === 'number' ? item.stock : 0;
        const isUpdating = updatingStock === item.variationId;

        return (
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
              <button
                disabled={isUpdating || currentStock <= 0}
                onClick={() => handleStockUpdate(item.productId, item.variationId, Math.max(0, currentStock - 1))}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold disabled:opacity-40 transition-colors min-h-[40px] min-w-[36px] flex items-center justify-center"
                title="Decrease stock"
              >
                -
              </button>
              <input
                type="number"
                min="0"
                value={currentStock}
                onChange={(e) => handleStockUpdate(item.productId, item.variationId, Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 text-center text-xs font-bold text-slate-900 outline-none border-none py-1.5 min-h-[40px]"
              />
              <button
                disabled={isUpdating}
                onClick={() => handleStockUpdate(item.productId, item.variationId, currentStock + 1)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold disabled:opacity-40 transition-colors min-h-[40px] min-w-[36px] flex items-center justify-center"
                title="Increase stock"
              >
                +
              </button>
            </div>
            {isUpdating && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-r-transparent" />
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                currentStock <= 0
                  ? 'bg-rose-100 text-rose-700'
                  : currentStock < 5
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {currentStock <= 0 ? 'Out of Stock' : `${currentStock} in stock`}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Stock Management"
        subtitle="Quickly adjust real-time stock inventories and variation quantities."
        breadcrumbs={[{ label: "Stock Management" }]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SellerButton
              variant="outline"
              size="md"
              onClick={handleExport}
              disabled={filteredItems.length === 0}
              className="min-h-[44px]"
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              }
            >
              Export CSV
            </SellerButton>
            <SellerButton
              variant="outline"
              size="md"
              onClick={() => navigate("/seller/product/list")}
              className="min-h-[44px]"
              icon={<span>📋</span>}
            >
              Product Catalog
            </SellerButton>
          </div>
        }
      />

      {/* Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search product, variant, or category..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold p-1 min-h-[32px] min-w-[32px]"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[44px]"
          >
            <option value="All Category">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={stockFilter}
            onChange={(e) => {
              setStockFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[44px]"
          >
            <option value="All Products">All Stock Levels</option>
            <option value="In Stock">In Stock Only</option>
            <option value="Out of Stock">Out of Stock Only</option>
          </select>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">Active filters applied</span>
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-purple-600 hover:text-purple-800 font-bold hover:underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Stock Management Table */}
      <SellerDataTable
        data={filteredItems}
        columns={columns}
        keyExtractor={(item) => item.variationId}
        isLoading={loading}
        sortColumn={sortColumn || undefined}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        totalEntries={filteredItems.length}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No stock items found"
        emptyDescription={error || "There are no inventory items matching your selected criteria."}
        renderMobileCard={(item) => {
          const currentStock = typeof item.stock === 'number' ? item.stock : 0;
          const isUpdating = updatingStock === item.variationId;

          return (
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="text-slate-400 text-xs font-bold">📦</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{item.name}</h4>
                    <p className="text-xs text-slate-500 truncate">Var: {item.variation} • {item.category}</p>
                  </div>
                </div>
                <SellerStatusBadge status={item.status} size="sm" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Stock:</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      currentStock <= 0
                        ? 'bg-rose-100 text-rose-700'
                        : currentStock < 5
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {currentStock <= 0 ? 'Out of Stock' : `${currentStock} units`}
                  </span>
                </div>

                <div className="flex items-center rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                  <button
                    disabled={isUpdating || currentStock <= 0}
                    onClick={() => handleStockUpdate(item.productId, item.variationId, Math.max(0, currentStock - 1))}
                    className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold disabled:opacity-40 min-h-[44px] min-w-[40px] flex items-center justify-center"
                    title="Decrease stock"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={currentStock}
                    onChange={(e) => handleStockUpdate(item.productId, item.variationId, Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-14 text-center text-xs font-bold text-slate-900 outline-none border-none py-2 min-h-[44px]"
                  />
                  <button
                    disabled={isUpdating}
                    onClick={() => handleStockUpdate(item.productId, item.variationId, currentStock + 1)}
                    className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold disabled:opacity-40 min-h-[44px] min-w-[40px] flex items-center justify-center"
                    title="Increase stock"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
