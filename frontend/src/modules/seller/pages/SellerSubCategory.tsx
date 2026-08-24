import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllSubcategories, SubCategory } from '../../../services/api/categoryService';
import { exportToCsv } from '../../../utils/exportCsv';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerFilterBar } from '../components/common/SellerFilterBar';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerButton } from '../components/common/SellerButton';
import { useToast } from '../../../context/ToastContext';

export default function SellerSubCategory() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [subcategories, setSubcategories] = useState<SubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedParentCategory, setSelectedParentCategory] = useState<string>('All');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // 300ms Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

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
          const msg = response.message || 'Failed to fetch subcategories';
          setError(msg);
          showToast(msg, 'error');
        }
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || 'Failed to fetch subcategories';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchSubcategories();
  }, [showToast]);

  // Extract unique parent categories for filter dropdown
  const parentCategories = useMemo(() => {
    const set = new Set<string>();
    subcategories.forEach((sub) => {
      if (sub.categoryName) set.add(sub.categoryName);
    });
    return ['All', ...Array.from(set).sort()];
  }, [subcategories]);

  // Filter subcategories by search and parent category
  const filteredSubcategories = useMemo(() => {
    return subcategories.filter((sub) => {
      const matchesSearch =
        !debouncedSearch ||
        sub.subcategoryName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        sub.categoryName?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesCategory =
        selectedParentCategory === 'All' || sub.categoryName === selectedParentCategory;
      return matchesSearch && matchesCategory;
    });
  }, [subcategories, debouncedSearch, selectedParentCategory]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort subcategories
  const sortedSubcategories = useMemo(() => {
    return [...filteredSubcategories].sort((a, b) => {
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
  }, [filteredSubcategories, sortColumn, sortDirection]);

  const displayTotalPages = Math.max(1, Math.ceil(sortedSubcategories.length / rowsPerPage));
  const safePage = Math.min(currentPage, displayTotalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedSubcategories = sortedSubcategories.slice(startIndex, endIndex);

  const handleExport = () => {
    if (filteredSubcategories.length === 0) {
      showToast('No subcategories available to export', 'info');
      return;
    }
    exportToCsv(
      ['ID', 'Subcategory Name', 'Parent Category'],
      filteredSubcategories.map(sub => [
        sub._id,
        sub.subcategoryName,
        sub.categoryName || 'N/A',
      ]),
      'subcategories'
    );
    showToast('Subcategories exported successfully!', 'success');
  };

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
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
          {sub.categoryName || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="SubCategories"
        subtitle="View all subcategories mapped to parent store categories."
        breadcrumbs={[
          { label: "Categories", path: "/seller/category" },
          { label: "SubCategories" },
        ]}
        action={
          <SellerButton
            variant="outline"
            size="md"
            onClick={() => navigate('/seller/category')}
            className="min-h-[44px]"
            icon={<span>📁</span>}
          >
            View Categories
          </SellerButton>
        }
      />

      {/* Filter Toolbar */}
      <div className="space-y-3">
        <SellerFilterBar
          searchQuery={searchQuery}
          onSearchChange={(q) => setSearchQuery(q)}
          searchPlaceholder="Search subcategories or parent department..."
          onClear={searchQuery || selectedParentCategory !== 'All' ? () => {
            setSearchQuery('');
            setSelectedParentCategory('All');
            setCurrentPage(1);
          } : undefined}
          hasActiveFilters={Boolean(searchQuery || selectedParentCategory !== 'All')}
          onExport={handleExport}
          exportLabel="Export CSV"
        />

        {/* Parent Category Filter Dropdown */}
        {parentCategories.length > 1 && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-bold text-slate-600">Filter by Department:</span>
            <select
              value={selectedParentCategory}
              onChange={(e) => {
                setSelectedParentCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[38px]"
            >
              {parentCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Departments' : cat}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* SubCategories Data Table */}
      <SellerDataTable
        data={displayedSubcategories}
        columns={columns}
        keyExtractor={(sub) => sub._id}
        isLoading={loading}
        sortColumn={sortColumn || undefined}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentPage={safePage}
        totalPages={displayTotalPages}
        totalEntries={sortedSubcategories.length}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No subcategories found"
        emptyDescription={error || "There are no subcategories matching your filter criteria."}
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
