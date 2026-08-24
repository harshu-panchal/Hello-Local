import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getAllOrders,
  type Order,
} from "../../../services/api/admin/adminOrderService";
import { getAllSellers as getSellers, type Seller } from "../../../services/api/sellerService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import AssignDeliveryBoyModal from "../components/AssignDeliveryBoyModal";

type SortField =
  | "orderNumber"
  | "customerName"
  | "orderDate"
  | "status"
  | "paymentStatus"
  | "total";
type SortDirection = "asc" | "desc";

export default function AdminAllOrders() {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedSeller, setSelectedSeller] = useState("All Sellers");
  const [selectedStatus, setSelectedStatus] = useState("All Status");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filters & Pagination State
  const [entriesPerPage, setEntriesPerPage] = useState("10");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  // Sorting
  const [sortField, setSortField] = useState<SortField | null>("orderDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Loading & Modals
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch sellers for dropdown filter
  useEffect(() => {
    const fetchSellers = async () => {
      try {
        const response = await getSellers({ status: "Approved" });
        if (response.success && Array.isArray(response.data)) {
          setSellers(response.data);
        }
      } catch (err) {
        console.error("Error fetching sellers for order filter:", err);
      }
    };
    fetchSellers();
  }, []);

  // Fetch all orders with query parameters
  const fetchOrders = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setTableError(null);

      const params: any = {
        page: currentPage,
        limit: parseInt(entriesPerPage, 10),
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      if (selectedStatus !== "All Status") {
        params.status = selectedStatus;
      }

      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      if (selectedSeller !== "All Sellers") {
        params.seller = selectedSeller;
      }

      const response = await getAllOrders(params);

      if (response.success && Array.isArray(response.data)) {
        setOrders(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.pages || 1);
          setTotalOrders(response.pagination.total || 0);
        }
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      console.error("Error fetching all orders:", err);
      const msg = err.response?.data?.message || "Failed to load orders";
      setTableError(msg);
      showToast(msg, "error");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    selectedStatus,
    currentPage,
    entriesPerPage,
    debouncedSearch,
    dateFrom,
    dateTo,
    selectedSeller,
    showToast,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedOrders = useMemo(() => {
    if (!sortField) return orders;

    return [...orders].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "orderNumber":
          aVal = a.orderNumber || "";
          bVal = b.orderNumber || "";
          break;
        case "customerName":
          aVal = (a.customerName || "").toLowerCase();
          bVal = (b.customerName || "").toLowerCase();
          break;
        case "orderDate":
          aVal = new Date(a.orderDate).getTime();
          bVal = new Date(b.orderDate).getTime();
          break;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          break;
        case "paymentStatus":
          aVal = a.paymentStatus || "";
          bVal = b.paymentStatus || "";
          break;
        case "total":
          aVal = a.total || 0;
          bVal = b.total || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [orders, sortField, sortDirection]);

  const handleClearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedSeller("All Sellers");
    setSelectedStatus("All Status");
    setSearchQuery("");
    setCurrentPage(1);
  };

  const handleExport = () => {
    if (orders.length === 0) {
      showToast("No orders available to export", "info");
      return;
    }

    const headers = [
      "Order ID",
      "Order Number",
      "Customer Name",
      "Customer Email",
      "Customer Phone",
      "Delivery Address",
      "Items Count",
      "Payment Method",
      "Payment Status",
      "Order Status",
      "Courier Name",
      "Subtotal (₹)",
      "Tax (₹)",
      "Shipping (₹)",
      "Discount (₹)",
      "Total Amount (₹)",
      "Order Date",
    ];

    const csvContent = [
      headers.join(","),
      ...orders.map((o) => {
        const address = o.deliveryAddress
          ? `${o.deliveryAddress.address || ""}, ${o.deliveryAddress.city || ""} ${o.deliveryAddress.pincode || ""}`.replace(/"/g, '""')
          : "";
        const courier = typeof o.deliveryBoy === "object" && o.deliveryBoy ? o.deliveryBoy.name : "";
        const itemsCount = Array.isArray(o.items) ? o.items.length : 0;

        return [
          `"${o._id}"`,
          `"${o.orderNumber}"`,
          `"${(o.customerName || "").replace(/"/g, '""')}"`,
          `"${o.customerEmail || ""}"`,
          `"${o.customerPhone || ""}"`,
          `"${address}"`,
          itemsCount,
          `"${o.paymentMethod || "COD"}"`,
          `"${o.paymentStatus || "Pending"}"`,
          `"${o.status}"`,
          `"${courier}"`,
          (o.subtotal || 0).toFixed(2),
          (o.tax || 0).toFixed(2),
          (o.shipping || 0).toFixed(2),
          (o.discount || 0).toFixed(2),
          (o.total || 0).toFixed(2),
          `"${new Date(o.orderDate).toLocaleDateString("en-IN")}"`,
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `hellolocal_all_orders_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("All orders records exported successfully", "success");
  };

  const getStatusBadge = (orderStatus: string) => {
    switch (orderStatus) {
      case "Received":
      case "Pending":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Processed":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Shipped":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "Out for Delivery":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Delivered":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Cancelled":
      case "Rejected":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-neutral-50 text-neutral-700 border-neutral-200";
    }
  };

  const startIndex = (currentPage - 1) * parseInt(entriesPerPage, 10);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            All Orders & Master Log
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Comprehensive order directory across all lifecycle stages, customer profiles, and fulfillment partners
          </p>
        </div>

        <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500">
          <Link
            to="/admin/dashboard"
            className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
          >
            Dashboard
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <span className="text-neutral-700 font-medium">All Orders</span>
        </nav>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner with Action Buttons */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Orders Master Log ({totalOrders} Total)
          </h2>
          <button
            type="button"
            onClick={handleExport}
            disabled={orders.length === 0}
            className="bg-white/15 hover:bg-white/25 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px] disabled:opacity-50"
            title="Export CSV"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Status Filter */}
            <div>
              <label htmlFor="allOrdersStatusFilter" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Order Status
              </label>
              <select
                id="allOrdersStatusFilter"
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="All Status">All Statuses</option>
                <option value="Received">Received</option>
                <option value="Pending">Pending</option>
                <option value="Processed">Processed</option>
                <option value="Shipped">Shipped</option>
                <option value="Out for Delivery">Out for Delivery</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Rejected">Rejected</option>
                <option value="Returned">Returned</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label htmlFor="allOrdersDateFrom" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                From Date
              </label>
              <input
                id="allOrdersDateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* To Date */}
            <div>
              <label htmlFor="allOrdersDateTo" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                To Date
              </label>
              <input
                id="allOrdersDateTo"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Seller Filter */}
            <div>
              <label htmlFor="allOrdersSellerFilter" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Store / Seller
              </label>
              <select
                id="allOrdersSellerFilter"
                value={selectedSeller}
                onChange={(e) => {
                  setSelectedSeller(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="All Sellers">All Sellers</option>
                {sellers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.storeName || s.sellerName}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div>
              <label htmlFor="allOrdersSearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Search Orders
              </label>
              <div className="relative">
                <input
                  id="allOrdersSearchInput"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Order #, customer, phone..."
                  className="w-full pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Clear & Row Count */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-200/50">
            {(dateFrom || dateTo || selectedSeller !== "All Sellers" || selectedStatus !== "All Status" || searchQuery) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs text-rose-700 hover:text-rose-800 font-bold flex items-center gap-1"
              >
                <span>× Reset all filters</span>
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-medium text-neutral-600">Show</span>
              <select
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span className="text-xs font-medium text-neutral-600">entries</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32"
                  onClick={() => handleSort("orderNumber")}
                >
                  <div className="flex items-center gap-1">
                    <span>Order #</span>
                    <span className="text-neutral-400">{sortField === "orderNumber" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("customerName")}
                >
                  <div className="flex items-center gap-1">
                    <span>Customer & Delivery</span>
                    <span className="text-neutral-400">{sortField === "customerName" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28"
                  onClick={() => handleSort("orderDate")}
                >
                  <div className="flex items-center gap-1">
                    <span>Order Date</span>
                    <span className="text-neutral-400">{sortField === "orderDate" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-center"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status</span>
                    <span className="text-neutral-400">{sortField === "status" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-3 w-32">Courier Assigned</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24 text-right"
                  onClick={() => handleSort("total")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total</span>
                    <span className="text-neutral-400">{sortField === "total" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4 w-28 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-6 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-36 mb-1" /><div className="h-3 bg-neutral-200 rounded w-48" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-16 mx-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-24" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-20 mx-auto" /></td>
                  </tr>
                ))
              ) : tableError ? (
                <tr>
                  <td colSpan={8} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{tableError}</p>
                    <button
                      type="button"
                      onClick={fetchOrders}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <path d="M16 10a4 4 0 0 1-8 0" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No orders found</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchQuery || dateFrom || dateTo || selectedStatus !== "All Status"
                        ? "No orders match your filter criteria"
                        : "Customer orders will appear here"}
                    </p>
                  </td>
                </tr>
              ) : (
                sortedOrders.map((order, index) => {
                  const courier = typeof order.deliveryBoy === "object" && order.deliveryBoy ? order.deliveryBoy : null;

                  return (
                    <tr key={order._id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 px-3 text-center font-mono font-bold text-neutral-400">
                        {startIndex + index + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-neutral-900 font-mono text-xs">
                          #{order.orderNumber}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {Array.isArray(order.items) ? order.items.length : 0} items
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-neutral-900">{order.customerName}</div>
                        {order.customerPhone && (
                          <div className="text-[11px] text-neutral-500 font-mono">
                            📞 {order.customerPhone}
                          </div>
                        )}
                        {order.deliveryAddress && (
                          <div className="text-[11px] text-neutral-400 truncate max-w-xs">
                            📍 {order.deliveryAddress.city}, {order.deliveryAddress.pincode}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-neutral-600">
                        {new Date(order.orderDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>
                        <div className="text-[10px] text-neutral-400 mt-0.5 uppercase font-semibold">
                          {order.paymentMethod} • {order.paymentStatus}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {courier ? (
                          <div>
                            <div className="font-bold text-neutral-800 text-[11px]">{courier.name}</div>
                            <div className="text-[10px] text-neutral-400 font-mono">{courier.mobile}</div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrder(order);
                              setAssignModalOpen(true);
                            }}
                            className="text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg transition-colors"
                          >
                            + Assign Courier
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-neutral-900">
                        ₹{(order.total || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/orders/${order._id}`)}
                            className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-700 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                            title="View Order Details"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrder(order);
                              setAssignModalOpen(true);
                            }}
                            className="w-8 h-8 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                            title={courier ? "Reassign Courier" : "Assign Courier"}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="8.5" cy="7" r="4" />
                              <line x1="20" y1="8" x2="20" y2="14" />
                              <line x1="23" y1="11" x2="17" y2="11" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-neutral-600 font-medium">
            Showing {orders.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(startIndex + orders.length, totalOrders)} of {totalOrders} orders
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
              className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                currentPage === 1 || loading
                  ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                  : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
              }`}
              aria-label="Previous page"
            >
              ‹ Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((page, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;

                  return (
                    <div key={page} className="flex items-center gap-1">
                      {showEllipsis && <span className="px-1 text-neutral-400">...</span>}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg font-bold min-h-[36px] transition-colors ${
                          currentPage === page
                            ? "bg-rose-700 text-white"
                            : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0 || loading}
              className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                currentPage === totalPages || totalPages === 0 || loading
                  ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                  : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
              }`}
              aria-label="Next page"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>

      {/* Assign Delivery Partner Modal */}
      {selectedOrder && (
        <AssignDeliveryBoyModal
          isOpen={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setSelectedOrder(null);
          }}
          orderId={selectedOrder._id}
          orderNumber={selectedOrder.orderNumber}
          currentDeliveryBoy={
            typeof selectedOrder.deliveryBoy === "object" && selectedOrder.deliveryBoy
              ? { name: selectedOrder.deliveryBoy.name, _id: selectedOrder.deliveryBoy._id }
              : undefined
          }
          onAssignSuccess={() => {
            showToast(`Courier assigned to Order #${selectedOrder.orderNumber} successfully!`, "success");
            fetchOrders();
          }}
        />
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quick-Commerce Master Log
      </footer>
    </div>
  );
}
