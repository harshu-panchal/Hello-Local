import { useState, useEffect, useCallback } from 'react';
import { getSalesReport, SalesReport } from '../../../services/api/reportService';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerTabs } from '../components/common/SellerTabs';
import { SellerFilterBar } from '../components/common/SellerFilterBar';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';

export default function SellerSalesReport() {
  const [reports, setReports] = useState<SalesReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [paymentMethod, setPaymentMethod] = useState<string>('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 0,
  });

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getSalesReport({
        channel: channel === 'ALL' ? undefined : channel,
        paymentMethod: paymentMethod === 'All' ? undefined : paymentMethod,
        fromDate,
        toDate,
        search: searchTerm,
        page: currentPage,
        limit: rowsPerPage,
        sortBy: sortColumn,
        sortOrder: sortDirection,
      });

      if (response.success) {
        setReports(response.data);
        setPagination({
          total: response.pagination.total,
          pages: response.pagination.pages,
        });
      } else {
        setError(response.message || 'Failed to fetch sales reports');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error loading sales reports');
    } finally {
      setLoading(false);
    }
  }, [channel, paymentMethod, fromDate, toDate, searchTerm, currentPage, rowsPerPage, sortColumn, sortDirection]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchReports();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [fetchReports]);

  const handleSort = (column: string) => {
    const columnMap: Record<string, string> = {
      orderId: 'orderId',
      orderItemId: '_id',
      product: 'productName',
      variant: 'variantTitle',
      total: 'subtotal',
      date: 'createdAt',
    };

    const backendColumn = columnMap[column] || column;

    if (sortColumn === backendColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(backendColumn);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFromDate('');
    setToDate('');
    setSearchTerm('');
    setChannel('ALL');
    setPaymentMethod('All');
    setCurrentPage(1);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const columns: ColumnDef<SalesReport>[] = [
    {
      key: 'orderId',
      header: 'Order / Bill #',
      sortable: true,
      sortKey: 'orderId',
      render: (r) => (
        <div>
          <span className="font-bold text-purple-700 block text-xs sm:text-sm">
            #{(r as any).orderNumber || r.billNumber || r.orderId?.slice(-6).toUpperCase()}
          </span>
          <span className="text-[10px] text-slate-400 block">{formatDate(r.date)}</span>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (r) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
            r.channel === 'OFFLINE'
              ? 'bg-purple-100 text-purple-800 border border-purple-200'
              : 'bg-sky-100 text-sky-800 border border-sky-200'
          }`}
        >
          {r.channel === 'OFFLINE' ? 'Offline (POS)' : 'Online Order'}
        </span>
      ),
    },
    {
      key: 'product',
      header: 'Product & Variant',
      sortable: true,
      sortKey: 'product',
      render: (r) => (
        <div>
          <span className="font-bold text-slate-900 block text-xs sm:text-sm">{r.product || (r as any).productName}</span>
          {(r.variant || (r as any).variantTitle) && (
            <span className="text-[10px] text-slate-500 font-semibold block">{r.variant || (r as any).variantTitle}</span>
          )}
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'center',
      render: (r) => <span className="font-black text-slate-900 text-xs">{r.quantity || 1}</span>,
    },
    {
      key: 'total',
      header: 'Total (₹)',
      align: 'right',
      sortable: true,
      sortKey: 'total',
      render: (r) => (
        <div>
          <span className="font-black text-slate-900 text-xs sm:text-sm block">
            ₹{(r.total || (r as any).subtotal || 0).toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 block">{r.paymentMethod || 'Cash'}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Sales & Revenue Reports"
        subtitle="Analyze detailed product sales performance across Online and Offline POS channels."
        breadcrumbs={[{ label: "Sales Report" }]}
      />

      {/* Channel Switcher Tabs & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SellerTabs
            tabs={[
              { id: 'ALL', label: 'All Channels' },
              { id: 'OFFLINE', label: 'POS In-Store' },
              { id: 'ONLINE', label: 'Online App Orders' },
            ]}
            activeTab={channel}
            onChange={(c) => {
              setChannel(c as any);
              setCurrentPage(1);
            }}
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">Payment:</span>
            <select
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[36px]"
            >
              <option value="All">All Modes</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="COD">COD</option>
              <option value="Razorpay">Razorpay</option>
            </select>
          </div>
        </div>

        {/* Date Filter & Search Row */}
        <SellerFilterBar
          searchQuery={searchTerm}
          onSearchChange={(q) => setSearchTerm(q)}
          searchPlaceholder="Search by Order #, product name, or variant..."
          dateRange={{ startDate: fromDate, endDate: toDate }}
          onDateRangeChange={(r) => {
            setFromDate(r.startDate);
            setToDate(r.endDate);
            setCurrentPage(1);
          }}
          onClear={fromDate || toDate || searchTerm || channel !== 'ALL' || paymentMethod !== 'All' ? handleClearFilters : undefined}
          hasActiveFilters={Boolean(fromDate || toDate || searchTerm || channel !== 'ALL' || paymentMethod !== 'All')}
        />
      </div>

      {/* Sales Report Table with Mobile Card View */}
      <SellerDataTable
        data={reports}
        columns={columns}
        keyExtractor={(r, i) => r.orderItemId || i.toString()}
        isLoading={loading}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={pagination.pages}
        totalEntries={pagination.total}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No sales records found"
        emptyDescription={error || "There are no completed sales transactions matching your selected criteria."}
        renderMobileCard={(r) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-purple-700 text-xs sm:text-sm block">
                  #{(r as any).orderNumber || r.billNumber || r.orderId?.slice(-6).toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-400">{formatDate(r.date)}</span>
              </div>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  r.channel === 'OFFLINE' ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'
                }`}
              >
                {r.channel === 'OFFLINE' ? 'POS' : 'Online'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 truncate">{r.product || (r as any).productName}</h4>
                {(r.variant || (r as any).variantTitle) && <p className="text-slate-500 truncate">{r.variant || (r as any).variantTitle}</p>}
                <p className="text-[11px] text-slate-400 mt-0.5">Mode: {r.paymentMethod || 'Cash'}</p>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-sm font-black text-slate-900">₹{(r.total || (r as any).subtotal || 0).toFixed(2)}</p>
                <p className="text-[11px] text-slate-500 font-bold">{r.quantity || 1} {(r.quantity || 1) === 1 ? 'Unit' : 'Units'}</p>
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
}
