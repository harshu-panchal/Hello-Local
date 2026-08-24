import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getOrders, updateOrderStatus, Order, GetOrdersParams } from '../../../services/api/orderService';
import { useSellerSocketContext } from '../../../context/SellerSocketContext';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerTabs } from '../components/common/SellerTabs';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerFilterBar } from '../components/common/SellerFilterBar';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';
import { SellerButton } from '../components/common/SellerButton';
import { useToast } from '../../../context/ToastContext';

type SortField = 'orderId' | 'deliveryDate' | 'orderDate' | 'status' | 'amount';
type SortDirection = 'asc' | 'desc';

export default function SellerOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string>('');
  const [newOrderBadge, setNewOrderBadge] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState(() => searchParams.get('status') || 'All Status');
  const [entriesPerPage, setEntriesPerPage] = useState('10');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Socket context — shared with SellerLayout (single connection)
  const { lastNotification } = useSellerSocketContext();

  // ─── Fetch orders ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: GetOrdersParams = {
        page: currentPage,
        limit: parseInt(entriesPerPage),
        sortBy: sortField || 'orderDate',
        sortOrder: sortDirection,
      };

      if (dateFrom && dateTo) {
        params.dateFrom = dateFrom;
        params.dateTo = dateTo;
      }
      if (status !== 'All Status') params.status = status;
      if (debouncedSearch) params.search = debouncedSearch;

      const response = await getOrders(params);
      if (response.success && response.data) {
        setOrders(response.data);
        setTotalOrders(response.pagination?.total ?? response.data.length);
        setTotalPages(response.pagination?.pages ?? Math.ceil((response.pagination?.total ?? response.data.length) / parseInt(entriesPerPage)));
      } else {
        const msg = response.message || 'Failed to fetch orders';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to fetch orders';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, status, entriesPerPage, debouncedSearch, currentPage, sortField, sortDirection, showToast]);

  // Initial fetch + re-fetch on filter/page change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Debounce the search box
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Real-time: new order via socket
  const prevNotificationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastNotification) return;
    if (lastNotification.type !== 'NEW_ORDER') return;
    if (prevNotificationRef.current === lastNotification.orderId) return;
    prevNotificationRef.current = lastNotification.orderId;

    if (currentPage !== 1) {
      setNewOrderBadge(true);
    } else {
      setCurrentPage(1);
      fetchOrders();
    }
  }, [lastNotification, currentPage, fetchOrders]);

  const handleSort = (field: string) => {
    const f = field as SortField;
    if (sortField === f) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(f);
      setSortDirection('asc');
    }
  };

  const handleStatusUpdate = async (orderId: string, orderNumber: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      const response = await updateOrderStatus(orderId, { status: newStatus as any });
      if (response.success) {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: newStatus as any } : o))
        );
        showToast(`Order #${orderNumber} marked as ${newStatus}`, 'success');
      } else {
        showToast(response.message || 'Failed to update order status', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Failed to update order status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleExport = () => {
    if (orders.length === 0) {
      showToast('No orders available to export', 'info');
      return;
    }
    const headers = ['Order ID', 'Delivery Date', 'Order Date', 'Status', 'Amount'];
    const csvContent = [
      headers.join(','),
      ...orders.map(order =>
        [order.orderId, order.deliveryDate, order.orderDate, order.status, order.amount].join(',')
      ),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Orders report exported successfully!', 'success');
  };

  const handleJumpToNewOrder = () => {
    setNewOrderBadge(false);
    setCurrentPage(1);
  };

  // Status Tab options
  const statusTabs = [
    { id: 'All Status', label: 'All Orders' },
    { id: 'Received', label: 'Received' },
    { id: 'Accepted', label: 'Accepted' },
    { id: 'Processed', label: 'Processed' },
    { id: 'On the way', label: 'On the way' },
    { id: 'Delivered', label: 'Delivered' },
    { id: 'Cancelled', label: 'Cancelled' },
  ];

  // Table Columns Definition
  const columns: ColumnDef<Order>[] = [
    {
      key: 'orderId',
      header: 'Order ID',
      sortable: true,
      sortKey: 'orderId',
      render: (order) => (
        <div>
          <span
            onClick={() => navigate(`/seller/orders/${order.id}`)}
            className="font-bold text-purple-700 hover:text-purple-900 cursor-pointer block text-xs sm:text-sm"
          >
            {order.orderId}
          </span>
          <span className="text-[10px] text-slate-400 block">{order.orderDate}</span>
        </div>
      ),
    },
    {
      key: 'deliveryDate',
      header: 'Delivery Date',
      sortable: true,
      sortKey: 'deliveryDate',
      render: (order) => (
        <span className="text-xs text-slate-700 font-medium">
          {order.deliveryDate || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortKey: 'status',
      render: (order) => <SellerStatusBadge status={order.status} size="sm" />,
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      sortKey: 'amount',
      render: (order) => (
        <span className="font-black text-slate-900 text-xs sm:text-sm">
          ₹{order.amount.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'statusUpdate',
      header: 'Update Status',
      render: (order) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <select
            value={order.status}
            disabled={updatingId === order.id}
            onChange={(e) => handleStatusUpdate(order.id, order.orderId, e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 disabled:opacity-50 min-h-[44px]"
          >
            <option value="Received">Received</option>
            <option value="Accepted">Accepted</option>
            <option value="Processed">Processed</option>
            <option value="On the way">On the way</option>
            <option value="Delivered">Delivered</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          {updatingId === order.id && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-r-transparent" />
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (order) => (
        <SellerButton
          variant="outline"
          size="sm"
          onClick={() => navigate(`/seller/orders/${order.id}`)}
          className="min-h-[44px] px-3.5"
        >
          View Details
        </SellerButton>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── New-order badge floating alert ── */}
      {newOrderBadge && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#2D1B69] text-white px-5 py-3 rounded-2xl shadow-2xl animate-bounce border border-purple-400/40">
          <span className="text-xl">📦</span>
          <span className="font-bold text-sm">New order received!</span>
          <button
            onClick={handleJumpToNewOrder}
            className="ml-2 underline text-amber-300 hover:text-white text-xs font-black uppercase tracking-wider"
          >
            View Now
          </button>
        </div>
      )}

      {/* Header */}
      <SellerPageHeader
        title="Orders List"
        subtitle="Track incoming online orders, assign fulfillment statuses, and export reports."
        breadcrumbs={[{ label: "Orders List" }]}
        action={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Orders
            </span>
          </div>
        }
      />

      {/* Status Filter Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 sm:p-3 shadow-xs">
        <SellerTabs
          tabs={statusTabs}
          activeTab={status}
          onChange={(newTab) => {
            setStatus(newTab);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Filters Toolbar */}
      <SellerFilterBar
        searchQuery={searchQuery}
        onSearchChange={(q) => setSearchQuery(q)}
        searchPlaceholder="Search by Order ID or Status..."
        dateRange={{ startDate: dateFrom, endDate: dateTo }}
        onDateRangeChange={(r) => {
          setDateFrom(r.startDate);
          setDateTo(r.endDate);
          setCurrentPage(1);
        }}
        onClear={dateFrom || dateTo || searchQuery || status !== 'All Status' ? () => {
          setDateFrom('');
          setDateTo('');
          setSearchQuery('');
          setStatus('All Status');
          setCurrentPage(1);
        } : undefined}
        hasActiveFilters={Boolean(dateFrom || dateTo || searchQuery || status !== 'All Status')}
        onExport={handleExport}
        exportLabel="Export CSV"
      />

      {/* Orders Data Table with Mobile Card View */}
      <SellerDataTable
        data={orders}
        columns={columns}
        keyExtractor={(order) => order.id}
        isLoading={loading}
        sortColumn={sortField || undefined}
        sortDirection={sortDirection}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        totalEntries={totalOrders}
        entriesPerPage={parseInt(entriesPerPage)}
        onPageChange={(p) => setCurrentPage(p)}
        onEntriesPerPageChange={(s) => {
          setEntriesPerPage(s.toString());
          setCurrentPage(1);
        }}
        emptyTitle="No orders found"
        emptyDescription="There are no customer orders matching your current filter criteria."
        renderMobileCard={(order) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-purple-700 text-sm block">
                  {order.orderId}
                </span>
                <span className="text-[10px] text-slate-400">{order.orderDate}</span>
              </div>
              <SellerStatusBadge status={order.status} size="sm" />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <div>
                <p className="text-slate-500">Delivery Date</p>
                <p className="font-bold text-slate-900">{order.deliveryDate || '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500">Total Amount</p>
                <p className="text-sm font-black text-slate-900">₹{order.amount.toFixed(2)}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <select
                value={order.status}
                disabled={updatingId === order.id}
                onChange={(e) => handleStatusUpdate(order.id, order.orderId, e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[44px]"
              >
                <option value="Received">Received</option>
                <option value="Accepted">Accepted</option>
                <option value="Processed">Processed</option>
                <option value="On the way">On the way</option>
                <option value="Delivered">Delivered</option>
                <option value="Rejected">Rejected</option>
                <option value="Cancelled">Cancelled</option>
              </select>

              <SellerButton
                variant="primary"
                size="sm"
                onClick={() => navigate(`/seller/orders/${order.id}`)}
                className="min-h-[44px] px-4"
              >
                Details
              </SellerButton>
            </div>
          </div>
        )}
      />
    </div>
  );
}
