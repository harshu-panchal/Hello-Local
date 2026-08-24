import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as taxService from '../../../services/api/taxService';
import { exportToCsv } from '../../../utils/exportCsv';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerFilterBar } from '../components/common/SellerFilterBar';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';
import { SellerButton } from '../components/common/SellerButton';
import { useToast } from '../../../context/ToastContext';

export default function SellerTaxes() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [taxes, setTaxes] = useState<taxService.Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // 300ms Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const fetchTaxes = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await taxService.getTaxes();
        if (response.success && response.data) {
          setTaxes(response.data);
        } else {
          const msg = response.message || 'Failed to fetch tax slabs';
          setError(msg);
          showToast(msg, 'error');
        }
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || 'Failed to fetch tax slabs';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchTaxes();
  }, [showToast]);

  const filteredTaxes = useMemo(() => {
    return taxes.filter(tax =>
      tax.name.toLowerCase().includes(debouncedSearch.trim().toLowerCase()) ||
      tax.percentage.toString().includes(debouncedSearch.trim())
    );
  }, [taxes, debouncedSearch]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedTaxes = useMemo(() => {
    return [...filteredTaxes].sort((a, b) => {
      if (!sortColumn) return 0;

      let aVal: any = a[sortColumn as keyof taxService.Tax] || '';
      let bVal: any = b[sortColumn as keyof taxService.Tax] || '';

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
  }, [filteredTaxes, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedTaxes.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedTaxes = sortedTaxes.slice(startIndex, endIndex);

  const handleExport = () => {
    if (filteredTaxes.length === 0) {
      showToast('No tax slabs available to export', 'info');
      return;
    }
    exportToCsv(
      ['ID', 'Tax Name', 'Rate (%)', 'Status'],
      filteredTaxes.map(tax => [
        tax._id,
        tax.name,
        `${tax.percentage}%`,
        tax.status || 'Active',
      ]),
      'tax_slabs'
    );
    showToast('Tax configuration exported successfully!', 'success');
  };

  const columns: ColumnDef<taxService.Tax>[] = [
    {
      key: 'name',
      header: 'Tax Name',
      sortable: true,
      sortKey: 'name',
      render: (tax) => (
        <div>
          <span className="font-bold text-slate-900 block text-sm">{tax.name}</span>
          <span className="text-[10px] text-slate-400 font-mono">ID: {tax._id}</span>
        </div>
      ),
    },
    {
      key: 'percentage',
      header: 'Tax Rate (%)',
      sortable: true,
      sortKey: 'percentage',
      render: (tax) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-50 text-purple-700 border border-purple-200">
          {tax.percentage}% GST
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (tax) => <SellerStatusBadge status={tax.status || 'Active'} size="sm" />,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Tax Configuration"
        subtitle="View GST and system tax slabs applicable to your store items."
        breadcrumbs={[{ label: "Taxes" }]}
        action={
          <SellerButton
            variant="outline"
            size="md"
            onClick={() => navigate('/seller/product/add')}
            className="min-h-[44px]"
            icon={<span>➕</span>}
          >
            Add Product
          </SellerButton>
        }
      />

      {/* Filter Toolbar */}
      <SellerFilterBar
        searchQuery={searchTerm}
        onSearchChange={(q) => setSearchTerm(q)}
        searchPlaceholder="Search taxes by name or percentage..."
        onClear={searchTerm ? () => setSearchTerm('') : undefined}
        hasActiveFilters={Boolean(searchTerm)}
        onExport={handleExport}
        exportLabel="Export CSV"
      />

      {/* Tax Data Table */}
      <SellerDataTable
        data={displayedTaxes}
        columns={columns}
        keyExtractor={(tax) => tax._id}
        isLoading={loading}
        sortColumn={sortColumn || undefined}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentPage={safePage}
        totalPages={totalPages}
        totalEntries={filteredTaxes.length}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No taxes found"
        emptyDescription={error || "There are no tax slabs matching your search query."}
        renderMobileCard={(tax) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">{tax.name}</h4>
              <p className="text-xs text-purple-700 font-black mt-0.5">{tax.percentage}% GST</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {tax._id}</p>
            </div>
            <SellerStatusBadge status={tax.status || 'Active'} size="sm" />
          </div>
        )}
      />
    </div>
  );
}
