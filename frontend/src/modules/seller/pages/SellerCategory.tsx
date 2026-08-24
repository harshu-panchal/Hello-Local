import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategories, Category } from '../../../services/api/categoryService';
import { exportToCsv } from '../../../utils/exportCsv';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerFilterBar } from '../components/common/SellerFilterBar';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerButton } from '../components/common/SellerButton';
import { useToast } from '../../../context/ToastContext';

export default function SellerCategory() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // 300ms Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError('');
      try {
        const params: any = {};
        if (debouncedSearch.trim()) {
          params.search = debouncedSearch.trim();
        }

        const response = await getCategories(params);
        if (response.success && response.data) {
          setCategories(response.data);
        } else {
          const msg = response.message || 'Failed to fetch categories';
          setError(msg);
          showToast(msg, 'error');
        }
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || 'Failed to fetch categories';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [debouncedSearch, showToast]);

  // Client-side filtering for display
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(debouncedSearch.trim().toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCategories = filteredCategories.slice(
    (safePage - 1) * rowsPerPage,
    safePage * rowsPerPage
  );

  const handleExport = () => {
    if (filteredCategories.length === 0) {
      showToast('No categories available to export', 'info');
      return;
    }
    exportToCsv(
      ['ID', 'Category Name', 'Total Subcategory'],
      filteredCategories.map(cat => [
        cat._id,
        cat.name,
        cat.totalSubcategory,
      ]),
      'categories'
    );
    showToast('Categories exported successfully!', 'success');
  };

  const columns: ColumnDef<Category>[] = [
    {
      key: 'image',
      header: 'Image',
      width: '80px',
      render: (cat) => (
        <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
          {cat.image ? (
            <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-slate-400 text-xs font-bold">📦</span>
          )}
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Category Name',
      render: (cat) => (
        <div>
          <span className="font-bold text-slate-900 block text-sm">{cat.name}</span>
          <span className="text-[10px] text-slate-400 font-mono">ID: {cat._id}</span>
        </div>
      ),
    },
    {
      key: 'totalSubcategory',
      header: 'Total Subcategories',
      align: 'center',
      render: (cat) => (
        <button
          type="button"
          onClick={() => navigate('/seller/subcategory')}
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors min-h-[32px]"
          title="View mapped subcategories"
        >
          {cat.totalSubcategory || 0} Subcategories →
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Categories"
        subtitle="Browse available store categories and view attached subcategories."
        breadcrumbs={[{ label: "Categories" }]}
        action={
          <SellerButton
            variant="outline"
            size="md"
            onClick={() => navigate('/seller/subcategory')}
            className="min-h-[44px]"
            icon={<span>📂</span>}
          >
            View Subcategories
          </SellerButton>
        }
      />

      {/* Filter Toolbar */}
      <SellerFilterBar
        searchQuery={searchTerm}
        onSearchChange={(q) => setSearchTerm(q)}
        searchPlaceholder="Search categories..."
        onClear={searchTerm ? () => setSearchTerm('') : undefined}
        hasActiveFilters={Boolean(searchTerm)}
        onExport={handleExport}
        exportLabel="Export CSV"
      />

      {/* Categories Data Table */}
      <SellerDataTable
        data={paginatedCategories}
        columns={columns}
        keyExtractor={(cat) => cat._id}
        isLoading={loading}
        currentPage={safePage}
        totalPages={totalPages}
        totalEntries={filteredCategories.length}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No categories found"
        emptyDescription={error || "There are no categories matching your search query."}
        renderMobileCard={(cat) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-400 text-sm">📦</span>
                )}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-sm truncate">{cat.name}</h4>
                <p className="text-[10px] text-slate-400 font-mono truncate">ID: {cat._id}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/seller/subcategory')}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 flex-shrink-0 min-h-[36px]"
            >
              {cat.totalSubcategory || 0} Subcats →
            </button>
          </div>
        )}
      />
    </div>
  );
}
