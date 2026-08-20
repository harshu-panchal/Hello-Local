import { useState, useEffect } from 'react';
import { getAllSubcategories, SubCategory } from '../../../services/api/categoryService';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';

export default function SellerSubCategory() {
  const [subcategories, setSubcategories] = useState<SubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch subcategories from API
  useEffect(() => {
    const fetchSubcategories = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getAllSubcategories();
        if (response.success && response.data) {
          setSubcategories(response.data);
        } else {
          setError(response.message || 'Failed to fetch subcategories');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch subcategories');
      } finally {
        setLoading(false);
      }
    };

    fetchSubcategories();
  }, []);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort subcategories
  const sortedSubcategories = [...subcategories].sort((a, b) => {
    if (!sortColumn) return 0;

    let aVal: any = a[sortColumn as keyof SubCategory] || '';
    let bVal: any = b[sortColumn as keyof SubCategory] || '';

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  const displayTotalPages = Math.ceil(sortedSubcategories.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedSubcategories = sortedSubcategories.slice(startIndex, endIndex);

  const columns: ColumnDef<SubCategory>[] = [
    {
      key: 'image',
      header: 'Image',
      width: '80px',
      render: (sub) => {
        const img = sub.subcategoryImage || (sub as any).image;
        return (
          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
            {img ? (
              <img src={img} alt={sub.subcategoryName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-slate-400 text-xs">📦</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'subcategoryName',
      header: 'Subcategory Name',
      sortable: true,
      sortKey: 'subcategoryName',
      render: (sub) => (
        <div>
          <span className="font-bold text-slate-900 block text-sm">{sub.subcategoryName}</span>
          <span className="text-[10px] text-slate-400 font-mono">ID: {sub._id}</span>
        </div>
      ),
    },
    {
      key: 'categoryName',
      header: 'Main Category',
      sortable: true,
      sortKey: 'categoryName',
      render: (sub) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
          {sub.categoryName || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="SubCategories"
        subtitle="View all subcategories mapped to parent store categories."
        breadcrumbs={[
          { label: "Categories", path: "/seller/category" },
          { label: "SubCategories" },
        ]}
      />

      {/* SubCategories Data Table */}
      <SellerDataTable
        data={displayedSubcategories}
        columns={columns}
        keyExtractor={(sub) => sub._id}
        isLoading={loading}
        sortColumn={sortColumn || undefined}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={displayTotalPages}
        totalEntries={sortedSubcategories.length}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No subcategories found"
        emptyDescription={error || "There are no subcategories registered."}
        renderMobileCard={(sub) => {
          const img = sub.subcategoryImage || (sub as any).image;
          return (
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {img ? (
                    <img src={img} alt={sub.subcategoryName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-slate-400 text-sm">📦</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 text-sm truncate">{sub.subcategoryName}</h4>
                  <p className="text-xs text-slate-500 truncate">{sub.categoryName || '—'}</p>
                </div>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
