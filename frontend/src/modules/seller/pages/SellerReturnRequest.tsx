import { useState, useEffect, useCallback } from 'react';
import { getReturnRequests, updateReturnStatus, ReturnRequest, GetReturnRequestsParams } from '../../../services/api/returnService';
import { exportToCsv } from '../../../utils/exportCsv';
import { useToast } from '../../../context/ToastContext';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';
import { SellerButton } from '../components/common/SellerButton';
import { SellerModal } from '../components/common/SellerModal';
import { SellerFilterBar } from '../components/common/SellerFilterBar';

export default function SellerReturnRequest() {
  const { showToast } = useToast();
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  // Action Modal State
  const [selectedReturn, setSelectedReturn] = useState<ReturnRequest | null>(null);
  const [actionType, setActionType] = useState<'Approved' | 'Rejected' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 300ms Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch return requests from API
  const fetchReturnRequests = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      const params: GetReturnRequestsParams = {
        page: currentPage,
        limit: rowsPerPage,
        sortBy: sortColumn || 'createdAt',
        sortOrder: sortDirection,
      };

      if (fromDate) params.dateFrom = fromDate;
      if (toDate) params.dateTo = toDate;
      if (statusFilter !== 'All Status') params.status = statusFilter;
      if (debouncedSearch) params.search = debouncedSearch;

      const response = await getReturnRequests(params);
      if (response.success && response.data) {
        setReturnRequests(response.data);
        if ((response as any).pagination) {
          setPagination({
            total: (response as any).pagination.total,
            pages: (response as any).pagination.pages || 1,
          });
        } else {
          setPagination({
            total: response.data.length,
            pages: Math.ceil(response.data.length / rowsPerPage) || 1,
          });
        }
        if (isManualRefresh) {
          showToast('Return requests refreshed', 'success');
        }
      } else {
        const msg = response.message || 'Failed to fetch return requests';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to fetch return requests';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate, statusFilter, debouncedSearch, currentPage, rowsPerPage, sortColumn, sortDirection, showToast]);

  useEffect(() => {
    fetchReturnRequests();
  }, [fetchReturnRequests]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedReturn || !actionType) return;
    try {
      setIsSubmitting(true);
      const res = await updateReturnStatus(selectedReturn.id, { status: actionType });
      if (res.success) {
        showToast(`Return request marked as ${actionType}`, 'success');
        setSelectedReturn(null);
        setActionType(null);
        fetchReturnRequests();
      } else {
        showToast(res.message || 'Failed to update return status', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Failed to update return status', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    if (returnRequests.length === 0) {
      showToast('No return requests to export', 'info');
      return;
    }

    exportToCsv(
      ['Return ID', 'Order Reference', 'Customer Name', 'Product Name', 'Amount (₹)', 'Return Reason', 'Status', 'Date'],
      returnRequests.map((r: any) => [
        r.id || r._id,
        r.orderId || r.orderNumber || 'N/A',
        r.customerName || 'Customer',
        r.productName || r.product,
        (r.amount || r.total || 0).toFixed(2),
        r.returnReason || r.reason || 'N/A',
        r.status,
        formatDate(r.date || r.createdAt),
      ]),
      'seller_return_requests'
    );
    showToast('Return requests exported successfully!', 'success');
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

  const handleClearFilters = () => {
    setFromDate('');
    setToDate('');
    setSearchTerm('');
    setDebouncedSearch('');
    setStatusFilter('All Status');
    setCurrentPage(1);
  };

  const columns: ColumnDef<ReturnRequest>[] = [
    {
      key: 'orderId',
      header: 'Order Reference',
      sortable: true,
      sortKey: 'orderId',
      render: (req) => (
        <div>
          <span className="font-bold text-purple-700 block text-xs sm:text-sm">
            #{(req as any).orderNumber || req.orderId || req.id?.slice(-6).toUpperCase()}
          </span>
          <span className="text-[10px] text-slate-400 block">{formatDate(req.date || (req as any).createdAt)}</span>
        </div>
      ),
    },
    {
      key: 'productName',
      header: 'Product Details',
      render: (req) => (
        <div className="min-w-0">
          <span className="font-bold text-slate-900 block text-xs sm:text-sm truncate">
            {req.product || (req as any).productName}
          </span>
          <span className="text-[10px] text-slate-400 block truncate">Customer: {req.customerName}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Return Reason',
      render: (req) => (
        <span className="text-xs text-slate-600 font-medium block max-w-xs truncate" title={(req as any).returnReason || (req as any).reason}>
          {(req as any).returnReason || (req as any).reason || 'Customer Return'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Refund Amount',
      align: 'right',
      render: (req) => (
        <span className="font-black text-slate-900 text-xs sm:text-sm">
          ₹{((req as any).amount || req.total || 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      sortable: true,
      sortKey: 'status',
      render: (req) => (
        <div className="flex items-center justify-end gap-2">
          <SellerStatusBadge status={req.status} size="sm" />
          {req.status === 'Pending' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedReturn(req);
                  setActionType('Approved');
                }}
                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 min-h-[32px]"
                title="Approve Return"
              >
                ✓
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedReturn(req);
                  setActionType('Rejected');
                }}
                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 min-h-[32px]"
                title="Reject Return"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Customer Return Requests"
        subtitle="Review, approve, and track product return requests from local buyers."
        breadcrumbs={[{ label: "Return Requests" }]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SellerButton
              variant="outline"
              size="md"
              onClick={() => fetchReturnRequests(true)}
              isLoading={refreshing}
              className="min-h-[44px]"
              icon={<span>🔄</span>}
            >
              Refresh
            </SellerButton>
            <SellerButton
              variant="outline"
              size="md"
              onClick={handleExport}
              disabled={returnRequests.length === 0}
              className="min-h-[44px]"
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              }
            >
              Export CSV
            </SellerButton>
          </div>
        }
      />

      {/* Filters Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[44px]"
            >
              <option value="All Status">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>

        <SellerFilterBar
          searchQuery={searchTerm}
          onSearchChange={(q) => setSearchTerm(q)}
          searchPlaceholder="Search by Order #, Customer, Product, or Reason..."
          dateRange={{ startDate: fromDate, endDate: toDate }}
          onDateRangeChange={(r) => {
            setFromDate(r.startDate);
            setToDate(r.endDate);
            setCurrentPage(1);
          }}
          onClear={fromDate || toDate || searchTerm || statusFilter !== 'All Status' ? handleClearFilters : undefined}
          hasActiveFilters={Boolean(fromDate || toDate || searchTerm || statusFilter !== 'All Status')}
        />
      </div>

      {/* Return Requests Data Table with Mobile Card View */}
      <SellerDataTable
        data={returnRequests}
        columns={columns}
        keyExtractor={(req) => req.id || (req as any)._id}
        isLoading={loading}
        sortColumn={sortColumn || undefined}
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
        emptyTitle="No return requests found"
        emptyDescription={error || "There are no customer return requests matching your current filters."}
        renderMobileCard={(req) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-purple-700 text-xs sm:text-sm block">
                  #{(req as any).orderNumber || req.orderId || req.id?.slice(-6).toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-400">{formatDate(req.date || (req as any).createdAt)}</span>
              </div>
              <SellerStatusBadge status={req.status} size="sm" />
            </div>

            <div className="pt-2 border-t border-slate-100 text-xs space-y-1">
              <h4 className="font-bold text-slate-900">{req.product || (req as any).productName}</h4>
              <p className="text-slate-500">Customer: {req.customerName}</p>
              <p className="font-bold text-slate-800">Refund Amount: ₹{((req as any).amount || req.total || 0).toFixed(2)}</p>
              {((req as any).returnReason || (req as any).reason) && (
                <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg mt-1.5 border border-slate-100">
                  Reason: {(req as any).returnReason || (req as any).reason}
                </p>
              )}
            </div>

            {req.status === 'Pending' && (
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReturn(req);
                    setActionType('Approved');
                  }}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs min-h-[44px] transition-colors"
                >
                  ✓ Approve Return
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReturn(req);
                    setActionType('Rejected');
                  }}
                  className="flex-1 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 min-h-[44px] transition-colors"
                >
                  ✕ Reject
                </button>
              </div>
            )}
          </div>
        )}
      />

      {/* Confirmation Modal */}
      <SellerModal
        isOpen={Boolean(selectedReturn && actionType)}
        onClose={() => {
          setSelectedReturn(null);
          setActionType(null);
        }}
        title={`${actionType === 'Approved' ? 'Approve' : 'Reject'} Return Request`}
        description={`Confirm updating return request #${(selectedReturn as any)?.orderNumber || selectedReturn?.orderId || selectedReturn?.id?.slice(-6).toUpperCase()} to ${actionType}.`}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <SellerButton
              variant="outline"
              size="md"
              onClick={() => {
                setSelectedReturn(null);
                setActionType(null);
              }}
              disabled={isSubmitting}
              className="min-h-[44px]"
            >
              Cancel
            </SellerButton>
            <SellerButton
              variant={actionType === 'Approved' ? 'primary' : 'danger'}
              size="md"
              onClick={handleStatusUpdate}
              isLoading={isSubmitting}
              className="min-h-[44px]"
            >
              Confirm {actionType}
            </SellerButton>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-slate-600">
          <p>
            <strong className="text-slate-800">Product:</strong> {selectedReturn?.product || (selectedReturn as any)?.productName}
          </p>
          <p>
            <strong className="text-slate-800">Refund Amount:</strong> ₹{((selectedReturn as any)?.amount || selectedReturn?.total || 0).toFixed(2)}
          </p>
          <p>
            <strong className="text-slate-800">Reason:</strong> {(selectedReturn as any)?.returnReason || (selectedReturn as any)?.reason || 'Customer Return'}
          </p>
        </div>
      </SellerModal>
    </div>
  );
}
