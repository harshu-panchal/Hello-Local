import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getOrders, updateOrderStatus, Order, GetOrdersParams } from '../../../services/api/orderService';
import { useSellerSocketContext } from '../../../context/SellerSocketContext';

type SortField = 'orderId' | 'deliveryDate' | 'orderDate' | 'status' | 'amount';
type SortDirection = 'asc' | 'desc';

export default function SellerOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);         // ← true total from API
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [newOrderBadge, setNewOrderBadge] = useState(false); // ← blinking new-order indicator
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState(() => searchParams.get('status') || 'All Status');
  const [entriesPerPage, setEntriesPerPage] = useState('10');
  const [searchQuery, setSearchQuery] = useState('');        // ← immediate input value
  const [debouncedSearch, setDebouncedSearch] = useState(''); // ← used for fetching
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
        // Use real totals from API — NOT orders.length
        setTotalOrders(response.pagination?.total ?? response.data.length);
        setTotalPages(response.pagination?.pages ?? Math.ceil((response.pagination?.total ?? response.data.length) / parseInt(entriesPerPage)));
      } else {
        setError(response.message || 'Failed to fetch orders');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, status, entriesPerPage, debouncedSearch, currentPage, sortField, sortDirection]);

  // Initial fetch + re-fetch on filter/page change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Debounce the search box so typing doesn't refetch on every keystroke
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // ─── Real-time: new order via socket ──────────────────────────────────────
  // When seller gets a NEW_ORDER notification, refresh the orders list so the
  // new order appears immediately without a manual page reload.
  const prevNotificationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastNotification) return;
    if (lastNotification.type !== 'NEW_ORDER') return;
    // Avoid re-running for the same notification reference
    if (prevNotificationRef.current === lastNotification.orderId) return;
    prevNotificationRef.current = lastNotification.orderId;

    // Show badge if not on page 1 (so user knows there's a new order)
    if (currentPage !== 1) {
      setNewOrderBadge(true);
    } else {
      // On page 1: go back to top and re-fetch
      setCurrentPage(1);
      fetchOrders();
    }
  }, [lastNotification]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleClearDate = () => {
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleQuickStatus = async (
    orderId: string,
    newStatus: 'Accepted' | 'Rejected' | 'Processed',
    label: string
  ) => {
    if (!window.confirm(`Are you sure you want to mark this order as "${label}"?`)) return;
    setUpdatingId(orderId);
    try {
      const res = await updateOrderStatus(orderId, { status: newStatus });
      if (res.success) {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
        );
      } else {
        alert(res.message || 'Failed to update status');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleExport = () => {
    if (orders.length === 0) return; // nothing to export (#17)
    const headers = ['Order ID', 'Delivery Date', 'Order Date', 'Status', 'Amount'];
    const csvContent = [
      headers.join(','),
      ...orders.map(order =>
        [order.orderId, order.deliveryDate, order.orderDate, order.status, order.amount].join(',')
      ),
    ].join('\n');
    // Prepend UTF-8 BOM so Excel opens special characters (₹, etc.) correctly (#31/63)
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleJumpToNewOrder = () => {
    setNewOrderBadge(false);
    setCurrentPage(1);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Received':    return 'bg-yellow-100 text-yellow-800';
      case 'Accepted':    return 'bg-blue-100 text-blue-800';
      case 'Processed':   return 'bg-indigo-100 text-indigo-800';
      case 'On the way':  return 'bg-purple-100 text-purple-800';
      case 'Delivered':   return 'bg-green-100 text-green-800';
      case 'Rejected':    return 'bg-red-100 text-red-800';
      case 'Cancelled':   return 'bg-orange-100 text-orange-800';
      default:            return 'bg-neutral-100 text-neutral-800';
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField === field && sortDirection === 'asc')  return 'M7 14L12 9L17 14';
    if (sortField === field && sortDirection === 'desc') return 'M7 10L12 15L17 10';
    return 'M7 10L12 5L17 10M7 14L12 19L17 14';
  };

  // Pagination display values (API already paginates — orders IS the current page)
  const entriesPerPageNum = parseInt(entriesPerPage);
  const startEntry = totalOrders === 0 ? 0 : (currentPage - 1) * entriesPerPageNum + 1;
  const endEntry   = Math.min(currentPage * entriesPerPageNum, totalOrders);

  return (
    <div className="space-y-4 sm:space-y-6 -mx-3 sm:-mx-4 md:-mx-6 -mt-3 sm:-mt-4 md:-mt-6">

      {/* ── New-order badge banner ── */}
      {newOrderBadge && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-pink-700 text-white px-5 py-3 rounded-xl shadow-lg animate-bounce">
          <span className="text-lg">📦</span>
          <span className="font-semibold">New order received!</span>
          <button
            onClick={handleJumpToNewOrder}
            className="ml-2 underline text-pink-100 hover:text-white text-sm"
          >
            View
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-neutral-200 px-3 sm:px-4 md:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Orders List</h1>
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <Link to="/seller" className="text-blue-600 hover:text-blue-700">Home</Link>
            <span className="text-neutral-500">/</span>
            <span className="text-neutral-700">Orders List</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="px-3 sm:px-4 md:px-6">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">

          {/* Banner */}
          <div className="bg-pink-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-t-lg flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold">View Order List</h2>
            {/* Live-connection dot */}
            <span className="flex items-center gap-1.5 text-xs opacity-80">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse inline-block" />
              Live
            </span>
          </div>

          {/* Filters */}
          <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-neutral-200">
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 sm:gap-4">

              {/* Date range */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                <label className="text-xs sm:text-sm font-medium text-neutral-700 whitespace-nowrap">From - To Order Date</label>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
                    onClick={e => (e.currentTarget as HTMLInputElement).showPicker?.()}
                    className="text-xs sm:text-sm text-neutral-700 bg-neutral-100 border border-neutral-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-1 focus:ring-pink-500 cursor-pointer"
                  />
                  <span className="text-neutral-400 text-xs">-</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
                    onClick={e => (e.currentTarget as HTMLInputElement).showPicker?.()}
                    className="text-xs sm:text-sm text-neutral-700 bg-neutral-100 border border-neutral-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-1 focus:ring-pink-500 cursor-pointer"
                  />
                  {(dateFrom || dateTo) && (
                    <button onClick={handleClearDate} className="px-2 py-1 text-xs font-medium text-neutral-700 bg-neutral-200 hover:bg-neutral-300 rounded transition-colors flex-shrink-0">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                <label className="text-xs sm:text-sm font-medium text-neutral-700 whitespace-nowrap">Status</label>
                <select
                  value={status}
                  onChange={e => { setStatus(e.target.value); setCurrentPage(1); }}
                  className="w-full sm:w-auto px-3 py-2 border border-neutral-300 rounded text-xs sm:text-sm text-neutral-900 bg-white focus:outline-none focus:ring-1 focus:ring-pink-500 focus:border-pink-500"
                >
                  <option>All Status</option>
                  <option>Received</option>
                  <option>Accepted</option>
                  <option>Processed</option>
                  <option>On the way</option>
                  <option>Delivered</option>
                  <option>Rejected</option>
                  <option>Cancelled</option>
                </select>
              </div>

              {/* Entries per page */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                <select
                  value={entriesPerPage}
                  onChange={e => { setEntriesPerPage(e.target.value); setCurrentPage(1); }}
                  className="w-full sm:w-auto px-3 py-2 border border-neutral-300 rounded text-xs sm:text-sm text-neutral-900 bg-white focus:outline-none focus:ring-1 focus:ring-pink-500 focus:border-pink-500"
                >
                  <option>10</option>
                  <option>25</option>
                  <option>50</option>
                  <option>100</option>
                </select>
              </div>

              {/* Search */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto sm:flex-1">
                <label className="text-xs sm:text-sm font-medium text-neutral-700 whitespace-nowrap">Search:</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 w-full sm:w-auto px-3 py-2 border border-neutral-300 rounded text-xs sm:text-sm text-neutral-900 bg-white focus:outline-none focus:ring-1 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="Search by Order ID, Status, or Amount"
                />
              </div>

              {/* Export */}
              <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                <button
                  onClick={handleExport}
                  disabled={orders.length === 0}
                  title={orders.length === 0 ? 'No data to export' : 'Export orders to CSV'}
                  className="flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 sm:px-4 py-2 rounded text-xs sm:text-sm font-medium transition-colors w-full sm:w-auto"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <path d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15M7 10L12 15M12 15L17 10M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>
          </div>

          {/* Loading / Error */}
          {loading && (
            <div className="flex items-center justify-center p-8">
              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mr-3" />
              <span className="text-neutral-500 text-sm">Loading orders...</span>
            </div>
          )}
          {error && !loading && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg m-4 text-sm">
              {error}
            </div>
          )}

          {/* Table */}
          {!loading && !error && (
            <div className="overflow-x-auto -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6">
              <table className="w-full min-w-[600px]">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                      S No
                    </th>
                    {(['orderId', 'deliveryDate', 'orderDate', 'status', 'amount'] as SortField[]).map((field) => (
                      <th key={field} className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                        <button onClick={() => handleSort(field)} className="flex items-center gap-2 hover:text-neutral-900 transition-colors">
                          {field === 'orderId' ? 'Order Id' : field === 'deliveryDate' ? 'Delivery Date' : field === 'orderDate' ? 'Order Date' : field.charAt(0).toUpperCase() + field.slice(1)}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`cursor-pointer ${sortField === field ? 'text-pink-600' : 'text-neutral-400'}`}>
                            <path d={sortIcon(field)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </th>
                    ))}
                    <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 sm:px-4 md:px-6 py-8 sm:py-12 text-center text-xs sm:text-sm text-neutral-500">
                        No data available in table
                      </td>
                    </tr>
                  ) : (
                    orders.map((order, index) => (
                      <tr key={order.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-3 sm:px-4 md:px-6 py-3 text-xs sm:text-sm text-neutral-700">{startEntry + index}</td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 text-xs sm:text-sm text-neutral-900">{order.orderId}</td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 text-xs sm:text-sm text-neutral-700">{order.deliveryDate}</td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 text-xs sm:text-sm text-neutral-700">{order.orderDate}</td>
                        <td className="px-3 sm:px-4 md:px-6 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 text-xs sm:text-sm text-neutral-900 font-medium">
                          ₹{order.amount.toFixed(2)}
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3">
                          <div className="flex items-center gap-1.5">
                            {/* View */}
                            <button
                              onClick={() => navigate(`/seller/orders/${order.id}`)}
                              title="View order details"
                              className="inline-flex items-center justify-center w-8 h-8 rounded bg-pink-600 hover:bg-pink-700 text-white transition-colors flex-shrink-0"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>

                            {/* Accept – Received orders only */}
                            {order.status === 'Received' && (
                              <button
                                onClick={() => handleQuickStatus(order.id, 'Accepted', 'Accepted')}
                                disabled={updatingId === order.id}
                                title="Accept order"
                                className="inline-flex items-center justify-center w-8 h-8 rounded bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white transition-colors flex-shrink-0"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            )}

                            {/* Reject – Received orders only */}
                            {order.status === 'Received' && (
                              <button
                                onClick={() => handleQuickStatus(order.id, 'Rejected', 'Rejected')}
                                disabled={updatingId === order.id}
                                title="Reject order"
                                className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white transition-colors flex-shrink-0"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            )}

                            {/* Processed – Accepted orders only */}
                            {order.status === 'Accepted' && (
                              <button
                                onClick={() => handleQuickStatus(order.id, 'Processed', 'Processed')}
                                disabled={updatingId === order.id}
                                title="Mark as Processed (Ready for pickup)"
                                className="inline-flex items-center justify-center w-8 h-8 rounded bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white transition-colors flex-shrink-0"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            )}

                            {/* Spinner while updating */}
                            {updatingId === order.id && (
                              <div className="w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination — uses real API totals */}
          <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
            <div className="text-xs sm:text-sm text-neutral-700">
              Showing {startEntry} to {endEntry} of {totalOrders} entries
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`p-2 border border-neutral-300 rounded transition-colors ${currentPage === 1 ? 'text-neutral-400 cursor-not-allowed bg-neutral-50' : 'text-neutral-700 hover:bg-neutral-50'}`}
                aria-label="Previous page"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <span className="text-xs text-neutral-600 px-2">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className={`p-2 border border-neutral-300 rounded transition-colors ${currentPage >= totalPages ? 'text-neutral-400 cursor-not-allowed bg-neutral-50' : 'text-neutral-700 hover:bg-neutral-50'}`}
                aria-label="Next page"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <footer className="px-3 sm:px-4 md:px-6 text-center py-4 sm:py-6">
        <p className="text-xs sm:text-sm text-neutral-600">
          Copyright © 2026. Developed By{' '}
          <Link to="/seller" className="text-blue-600 hover:text-blue-700">Hello Local</Link>
        </p>
      </footer>
    </div>
  );
}
