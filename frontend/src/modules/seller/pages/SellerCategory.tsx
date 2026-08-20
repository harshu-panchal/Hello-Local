import { useState, useEffect } from 'react';
import { getCategories, Category } from '../../../services/api/categoryService';
import { exportToCsv } from '../../../utils/exportCsv';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerFilterBar } from '../components/common/SellerFilterBar';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';

export default function SellerCategory() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError('');
      try {
        const params: any = {};
        if (searchTerm.trim()) {
          params.search = searchTerm.trim();
        }

        const response = await getCategories(params);
        if (response.success && response.data) {
          setCategories(response.data);
        } else {
          setError(response.message || 'Failed to fetch categories');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch categories');
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [searchTerm]);

  // Client-side filtering for display
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCategories = filteredCategories.slice(
    (safePage - 1) * rowsPerPage,
    safePage * rowsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, rowsPerPage]);

  const handleExport = () => {
    if (filteredCategories.length === 0) return;
    exportToCsv(
      ['ID', 'Category Name', 'Total Subcategory'],
      filteredCategories.map(cat => [
        cat._id,
        cat.name,
        cat.totalSubcategory,
      ]),
      'categories'
    );
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
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
          {cat.totalSubcategory || 0} Subcategories
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Categories"
        subtitle="Browse available store categories and view attached subcategories."
        breadcrumbs={[{ label: "Categories" }]}
      />

      {/* Filter Toolbar */}
      <SellerFilterBar
        searchQuery={searchTerm}
        onSearchChange={(q) => setSearchTerm(q)}
        searchPlaceholder="Search categories..."
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

            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex-shrink-0">
              {cat.totalSubcategory || 0} Subcats
            </span>
          </div>
        )}
      />
    </div>
  );
}
