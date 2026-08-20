import { useState, useEffect } from 'react';
import { getReturnRequests, ReturnRequest, GetReturnRequestsParams } from '../../../services/api/returnService';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';

export default function SellerReturnRequest() {
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [fromDate, setFromDate] = useState('12/06/2025');
  const [toDate, setToDate] = useState('12/06/2025');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [searchTerm, setSearchTerm] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch return requests from API
  useEffect(() => {
    const fetchReturnRequests = async () => {
      setLoading(true);
      setError('');
      try {
        const params: GetReturnRequestsParams = {
          page: currentPage,
          limit: rowsPerPage,
          sortBy: sortColumn || 'returnDate',
          sortOrder: sortDirection,
        };

        if (fromDate && toDate && fromDate !== '12/06/2025') {
          params.dateFrom = fromDate;
          params.dateTo = toDate;
        }

        if (statusFilter !== 'All Status') {
          params.status = statusFilter;
        }

        if (searchTerm) {
          params.search = searchTerm;
        }

        const response = await getReturnRequests(params);
        if (response.success && response.data) {
          setReturnRequests(response.data);
        } else {
          setError(response.message || 'Failed to fetch return requests');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch return requests');
      } finally {
        setLoading(false);
      }
    };

    fetchReturnRequests();
  }, [fromDate, toDate, statusFilter, searchTerm, currentPage, rowsPerPage, sortColumn, sortDirection]);

  const totalPages = Math.ceil(returnRequests.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedRequests = returnRequests.slice(startIndex, endIndex);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
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
            #{(req as any).orderNumber || req.orderId || req.id}
          </span>
          <span className="text-[10px] text-slate-400 block">{req.date || (req as any).returnDate}</span>
        </div>
      ),
    },
    {
      key: 'productName',
      header: 'Product Details',
      render: (req) => (
        <div>
          <span className="font-bold text-slate-900 block text-xs sm:text-sm">{req.product || (req as any).productName}</span>
          <span className="text-[10px] text-slate-400 block">{req.customerName}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Return Reason',
      render: (req) => (
        <span className="text-xs text-slate-600 font-medium block max-w-xs truncate">
          {(req as any).reason || 'Customer Return'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      sortable: true,
      sortKey: 'status',
      render: (req) => <SellerStatusBadge status={req.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Customer Return Requests"
        subtitle="Review, approve, and track product return requests from local buyers."
        breadcrumbs={[{ label: "Return Requests" }]}
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
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[36px]"
            >
              <option value="All Status">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div className="flex-1 max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by Order # or product..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-600 min-h-[36px]"
            />
          </div>
        </div>
      </div>

      {/* Return Requests Data Table with Mobile Card View */}
      <SellerDataTable
        data={displayedRequests}
        columns={columns}
        keyExtractor={(req) => req.id || (req as any)._id}
        isLoading={loading}
        sortColumn={sortColumn || undefined}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        totalEntries={returnRequests.length}
        entriesPerPage={rowsPerPage}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setRowsPerPage(s);
          setCurrentPage(1);
        }}
        emptyTitle="No return requests"
        emptyDescription={error || "There are no customer return requests matching your current filters."}
        renderMobileCard={(req) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-purple-700 text-xs sm:text-sm block">
                  #{(req as any).orderNumber || req.orderId || req.id}
                </span>
                <span className="text-[10px] text-slate-400">{req.date || (req as any).returnDate}</span>
              </div>
              <SellerStatusBadge status={req.status} size="sm" />
            </div>

            <div className="pt-2 border-t border-slate-100 text-xs">
              <h4 className="font-bold text-slate-900">{req.product || (req as any).productName}</h4>
              <p className="text-slate-500 mt-0.5">Customer: {req.customerName}</p>
              {(req as any).reason && (
                <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg mt-1.5 border border-slate-100">
                  Reason: {(req as any).reason}
                </p>
              )}
            </div>
          </div>
        )}
      />
    </div>
  );
}
