import { useState, useEffect } from 'react';
import { getProducts, updateStock, Product } from '../../../services/api/productService';
import { getCategories } from '../../../services/api/categoryService';
import { useAuth } from '../../../context/AuthContext';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';

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
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [updatingStock, setUpdatingStock] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Category');
  const [statusFilter, setStatusFilter] = useState('All Products');
  const [stockFilter, setStockFilter] = useState('All Products');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [categories, setCategories] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const { user } = useAuth();

  // Fetch categories for filter
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await getCategories();
        if (res.success) {
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
  useEffect(() => {
    const fetchStockItems = async () => {
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
          });
          setStockItems(items);
          if ((response as any).pagination) {
            setTotalPages((response as any).pagination.pages);
          }
        } else {
          setError(response.message || 'Failed to fetch stock items');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch stock items');
      } finally {
        setLoading(false);
      }
    };

    fetchStockItems();

    const intervalId = setInterval(fetchStockItems, 30000);
    return () => clearInterval(intervalId);
  }, [currentPage, rowsPerPage, categoryFilter, statusFilter, user]);

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
      } else {
        alert(response.message || 'Failed to update stock');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to update stock');
    } finally {
      setUpdatingStock(null);
    }
  };

  const filteredItems = stockItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.seller.toLowerCase().includes(searchTerm.toLowerCase());
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
    filteredItems.sort((a, b) => {
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

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
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
              <span className="text-slate-400 text-xs">📦</span>
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
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold disabled:opacity-40 transition-colors min-h-[36px]"
              >
                -
              </button>
              <input
                type="number"
                min="0"
                value={currentStock}
                onChange={(e) => handleStockUpdate(item.productId, item.variationId, Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 text-center text-xs font-bold text-slate-900 outline-none border-none py-1.5"
              />
              <button
                disabled={isUpdating}
                onClick={() => handleStockUpdate(item.productId, item.variationId, currentStock + 1)}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold disabled:opacity-40 transition-colors min-h-[36px]"
              >
                +
              </button>
            </div>
            {isUpdating && (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-600 border-r-transparent" />
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
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
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Stock Management"
        subtitle="Quickly adjust real-time stock inventories and variation quantities."
        breadcrumbs={[{ label: "Stock Management" }]}
      />

      {/* Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search product name..."
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-purple-600 min-h-[40px]"
          />

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[40px]"
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
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[40px]"
          >
            <option value="All Products">All Stock Levels</option>
            <option value="In Stock">In Stock Only</option>
            <option value="Out of Stock">Out of Stock Only</option>
          </select>
        </div>
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
        emptyDescription="There are no inventory items matching your selected criteria."
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
                      <span className="text-slate-400 text-xs">📦</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{item.name}</h4>
                    <p className="text-xs text-slate-500 truncate">Var: {item.variation}</p>
                  </div>
                </div>
                <SellerStatusBadge status={item.status} size="sm" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-700">Stock Qty:</span>
                <div className="flex items-center rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                  <button
                    disabled={isUpdating || currentStock <= 0}
                    onClick={() => handleStockUpdate(item.productId, item.variationId, Math.max(0, currentStock - 1))}
                    className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold disabled:opacity-40 min-h-[44px]"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={currentStock}
                    onChange={(e) => handleStockUpdate(item.productId, item.variationId, Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-14 text-center text-xs font-bold text-slate-900 outline-none border-none py-2"
                  >
                  </input>
                  <button
                    disabled={isUpdating}
                    onClick={() => handleStockUpdate(item.productId, item.variationId, currentStock + 1)}
                    className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold disabled:opacity-40 min-h-[44px]"
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
