import { useState, useEffect } from 'react';
import * as taxService from '../../../services/api/taxService';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerFilterBar } from '../components/common/SellerFilterBar';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';

export default function SellerTaxes() {
  const [taxes, setTaxes] = useState<taxService.Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const fetchTaxes = async () => {
      setLoading(true);
      try {
        const response = await taxService.getTaxes();
        if (response.success) {
          setTaxes(response.data);
        }
      } catch (err) {
        console.error('Error fetching taxes:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTaxes();
  }, []);

  const filteredTaxes = taxes.filter(tax =>
    tax.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredTaxes.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedTaxes = filteredTaxes.slice(startIndex, endIndex);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    if (filteredTaxes.length === 0) return;
    const headers = ['ID', 'Name', 'Rate (%)', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredTaxes.map(tax => [
        tax._id,
        `"${tax.name}"`,
        tax.percentage,
        tax.status
      ].join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `taxes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        <span className="font-black text-purple-700 text-sm">
          {tax.percentage}%
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
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Tax Configuration"
        subtitle="View GST and system tax slabs applicable to your store items."
        breadcrumbs={[{ label: "Taxes" }]}
      />

      {/* Filter Toolbar */}
      <SellerFilterBar
        searchQuery={searchTerm}
        onSearchChange={(q) => setSearchTerm(q)}
        searchPlaceholder="Search taxes by name..."
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
        currentPage={currentPage}
        totalPages={totalPages}
        totalEntries={filteredTaxes.length}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No taxes found"
        emptyDescription="There are no tax slabs matching your search."
        renderMobileCard={(tax) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">{tax.name}</h4>
              <p className="text-xs text-purple-700 font-black mt-0.5">{tax.percentage}% GST</p>
            </div>
            <SellerStatusBadge status={tax.status || 'Active'} size="sm" />
          </div>
        )}
      />
    </div>
  );
}
