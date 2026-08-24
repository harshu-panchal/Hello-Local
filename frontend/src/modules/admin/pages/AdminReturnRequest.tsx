import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  getReturnRequests,
  updateReturnRequest,
  type MiscReturnRequest as ReturnRequest,
} from "../../../services/api/admin/adminMiscService";
import { getAllSellers, type Seller } from "../../../services/api/sellerService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

const REJECTION_TEMPLATES = [
  "Item damaged or altered by customer",
  "Return window expired (exceeds return policy)",
  "Original packaging, tags, or seals missing",
  "Item verified as fully functional upon inspection",
  "Perishable product claim window expired",
];

export default function AdminReturnRequest() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  // Filters & Pagination State
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>("requestedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Data State
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sellersList, setSellersList] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modals State
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ReturnRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Debounce search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchTerm(val);
      setCurrentPage(1);
    }, 300);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchTerm("");
    setCurrentPage(1);
  };

  // Fetch sellers on mount
  useEffect(() => {
    const fetchSellers = async () => {
      try {
        const response = await getAllSellers();
        if (response.success && Array.isArray(response.data)) {
          setSellersList(response.data);
        }
      } catch (err) {
        console.error("Failed to load sellers:", err);
      }
    };
    fetchSellers();
  }, []);

  // Fetch return requests
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    const fetchRequests = async () => {
      try {
        setLoading(true);

        const params: any = {
          page: currentPage,
          limit: entriesPerPage,
          sortBy: sortColumn || "createdAt",
          sortOrder: sortDirection,
        };

        if (selectedStatus !== "all") params.status = selectedStatus;
        if (selectedSeller !== "all") params.seller = selectedSeller;
        if (searchTerm.trim()) params.search = searchTerm.trim();
        if (fromDate) params.dateFrom = fromDate;
        if (toDate) params.dateTo = toDate;

        const response = await getReturnRequests(params);

        if (response.success) {
          setReturnRequests(response.data || []);
          if (response.pagination) {
            setTotalEntries(response.pagination.total);
            setTotalPages(response.pagination.pages || 1);
          } else {
            setTotalEntries(response.data?.length || 0);
            setTotalPages(Math.ceil((response.data?.length || 0) / entriesPerPage) || 1);
          }
        } else {
          showToast(response.message || "Failed to load return requests", "error");
        }
      } catch (err: any) {
        console.error("Error fetching return requests:", err);
        showToast(err.response?.data?.message || "Failed to load return requests", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [
    isAuthenticated,
    token,
    currentPage,
    entriesPerPage,
    selectedStatus,
    selectedSeller,
    searchTerm,
    fromDate,
    toDate,
    sortColumn,
    sortDirection,
  ]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleClearDate = () => {
    setFromDate("");
    setToDate("");
    setCurrentPage(1);
  };

  // Open Approval Modal
  const openApprovalModal = (request: ReturnRequest) => {
    setSelectedRequest(request);
    setApprovalModalOpen(true);
  };

  // Execute Approval
  const handleConfirmApproval = async () => {
    if (!selectedRequest) return;

    try {
      setActionLoading(true);
      setUpdatingId(selectedRequest._id);

      const response = await updateReturnRequest(selectedRequest._id, {
        status: "Approved",
        refundAmount: selectedRequest.total,
      });

      if (response.success) {
        setReturnRequests((requests) =>
          requests.map((req) =>
            req._id === selectedRequest._id
              ? { ...req, status: "Approved", refundAmount: selectedRequest.total }
              : req
          )
        );
        showToast(`Return request approved (Refund: ₹${selectedRequest.total.toFixed(2)})`, "success");
        setApprovalModalOpen(false);
        setSelectedRequest(null);
      } else {
        showToast(response.message || "Failed to approve return request", "error");
      }
    } catch (err: any) {
      console.error("Error approving return request:", err);
      showToast(err.response?.data?.message || "Failed to approve return request", "error");
    } finally {
      setActionLoading(false);
      setUpdatingId(null);
    }
  };

  // Open Rejection Modal
  const openRejectionModal = (request: ReturnRequest) => {
    setSelectedRequest(request);
    setRejectionReason("");
    setRejectionModalOpen(true);
  };

  // Execute Rejection
  const handleConfirmRejection = async () => {
    if (!selectedRequest) return;
    if (!rejectionReason.trim()) {
      showToast("Please provide a reason for rejecting this return", "error");
      return;
    }

    try {
      setActionLoading(true);
      setUpdatingId(selectedRequest._id);

      const response = await updateReturnRequest(selectedRequest._id, {
        status: "Rejected",
        adminNotes: rejectionReason.trim(),
      });

      if (response.success) {
        setReturnRequests((requests) =>
          requests.map((req) =>
            req._id === selectedRequest._id
              ? { ...req, status: "Rejected", adminNotes: rejectionReason.trim() }
              : req
          )
        );
        showToast("Return request rejected successfully", "info");
        setRejectionModalOpen(false);
        setSelectedRequest(null);
      } else {
        showToast(response.message || "Failed to reject return request", "error");
      }
    } catch (err: any) {
      console.error("Error rejecting return request:", err);
      showToast(err.response?.data?.message || "Failed to reject return request", "error");
    } finally {
      setActionLoading(false);
      setUpdatingId(null);
    }
  };

  // True CSV Export Engine
  const handleExportCSV = () => {
    if (returnRequests.length === 0) {
      showToast("No return requests available to export", "info");
      return;
    }

    const headers = [
      "Return Request ID",
      "Order Number",
      "Customer Name",
      "Product Name",
      "Variant",
      "Quantity",
      "Unit Price (₹)",
      "Total Amount (₹)",
      "Return Reason",
      "Status",
      "Requested Date",
      "Admin Notes",
    ];

    const rows = returnRequests.map((req) => [
      `"${req._id}"`,
      `"${req.orderNumber || req.orderId || "N/A"}"`,
      `"${req.userName || "Unknown"}"`,
      `"${req.productName || "Unknown"}"`,
      `"${req.variant || "-"}"`,
      req.quantity,
      req.price.toFixed(2),
      req.total.toFixed(2),
      `"${(req.reason || "").replace(/"/g, '""')}"`,
      `"${req.status}"`,
      `"${new Date(req.requestedAt).toLocaleDateString()}"`,
      `"${(req.adminNotes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `return_requests_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${returnRequests.length} return requests to CSV!`, "success");
  };

  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <span>📦</span> Return Requests & Refunds
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Audit item return claims, review customer reasons, and process refund settlements
          </p>
        </div>

        <div className="flex items-center gap-3">
          <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500 hidden sm:block">
            <Link
              to="/admin/dashboard"
              className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
            >
              Dashboard
            </Link>
            <span className="mx-2 text-neutral-300">/</span>
            <span className="text-neutral-700 font-medium">Return Requests</span>
          </nav>

          <button
            type="button"
            onClick={handleExportCSV}
            className="bg-neutral-900 hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
          >
            <span>📥</span> Export CSV
          </button>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner Bar */}
        <div className="bg-rose-700 px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <span>📋</span> Return Request Pipeline
          </h2>
          <span className="text-xs text-rose-100 font-semibold">
            Total: {totalEntries} Requests
          </span>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 sm:p-5 border-b border-neutral-200/80 bg-neutral-50/50 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            {/* From Date */}
            <div className="lg:col-span-3 space-y-1">
              <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                Date Range (From - To)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[40px]"
                />
                <span className="text-neutral-400 font-bold">-</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[40px]"
                />
                {(fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={handleClearDate}
                    className="p-2 text-neutral-500 hover:text-neutral-800 text-xs font-bold"
                    title="Clear date filter"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Filter by Seller */}
            <div className="lg:col-span-3 space-y-1">
              <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                Filter by Merchant Store
              </label>
              <select
                value={selectedSeller}
                onChange={(e) => {
                  setSelectedSeller(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[40px] font-medium"
              >
                <option value="all">All Merchant Stores</option>
                {sellersList.map((seller) => (
                  <option key={seller._id} value={seller._id}>
                    {seller.storeName || seller.sellerName}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Status */}
            <div className="lg:col-span-2 space-y-1">
              <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                Return Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[40px] font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="lg:col-span-3 space-y-1">
              <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                Search Reason / Order / User
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={handleSearchChange}
                  placeholder="Order ID, reason, user..."
                  className="w-full pl-3 pr-8 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[40px]"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-sm font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Entries Per Page */}
            <div className="lg:col-span-1 space-y-1">
              <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                Rows
              </label>
              <select
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="w-full px-2 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[40px] font-medium"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left border-collapse">
            <thead className="bg-neutral-50/80 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
              <tr>
                <th
                  onClick={() => handleSort("orderNumber")}
                  className="px-4 py-3.5 cursor-pointer hover:text-neutral-900"
                >
                  Order / Item
                </th>
                <th
                  onClick={() => handleSort("userName")}
                  className="px-4 py-3.5 cursor-pointer hover:text-neutral-900"
                >
                  Customer
                </th>
                <th
                  onClick={() => handleSort("productName")}
                  className="px-4 py-3.5 cursor-pointer hover:text-neutral-900"
                >
                  Product & Variant
                </th>
                <th
                  onClick={() => handleSort("price")}
                  className="px-4 py-3.5 cursor-pointer hover:text-neutral-900"
                >
                  Unit / Total
                </th>
                <th className="px-4 py-3.5">Return Reason</th>
                <th
                  onClick={() => handleSort("status")}
                  className="px-4 py-3.5 cursor-pointer hover:text-neutral-900"
                >
                  Status
                </th>
                <th
                  onClick={() => handleSort("requestedAt")}
                  className="px-4 py-3.5 cursor-pointer hover:text-neutral-900"
                >
                  Requested Date
                </th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200 text-xs text-neutral-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-neutral-500">
                      <div className="w-5 h-5 border-2 border-rose-700 border-t-transparent rounded-full animate-spin" />
                      <span>Loading return requests...</span>
                    </div>
                  </td>
                </tr>
              ) : returnRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-neutral-400">
                    No return requests matching the selected criteria
                  </td>
                </tr>
              ) : (
                returnRequests.map((request) => (
                  <tr key={request._id} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Order / Item */}
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-bold text-neutral-900">
                        {request.orderNumber || (request.orderId ? `#${request.orderId.slice(-6)}` : "N/A")}
                      </div>
                      <div className="text-[11px] text-neutral-400 font-mono">
                        Item: {request.orderItemId ? request.orderItemId.slice(-8) : "N/A"}
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-neutral-900">{request.userName || "Customer"}</div>
                      <div className="text-[11px] text-neutral-400">ID: {request.userId ? request.userId.slice(-6) : "N/A"}</div>
                    </td>

                    {/* Product & Variant */}
                    <td className="px-4 py-3.5 max-w-[220px]">
                      <div className="font-semibold text-neutral-900 truncate" title={request.productName}>
                        {request.productName}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Qty: <span className="font-bold text-neutral-800">{request.quantity}</span>
                        {request.variant && ` • Variant: ${request.variant}`}
                      </div>
                    </td>

                    {/* Unit / Total */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-neutral-900">
                        ₹{request.total.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        ₹{request.price.toFixed(2)} / unit
                      </div>
                    </td>

                    {/* Return Reason */}
                    <td className="px-4 py-3.5 max-w-[240px]">
                      <p className="text-neutral-700 line-clamp-2 leading-relaxed" title={request.reason}>
                        {request.reason || "No reason specified"}
                      </p>
                      {request.adminNotes && (
                        <p className="text-[10px] text-rose-700 italic mt-0.5" title={request.adminNotes}>
                          Admin note: {request.adminNotes}
                        </p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          request.status === "Approved"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : request.status === "Pending"
                            ? "bg-amber-100 text-amber-800 border border-amber-200 animate-pulse"
                            : request.status === "Rejected"
                            ? "bg-red-100 text-red-800 border border-red-200"
                            : "bg-blue-100 text-blue-800 border border-blue-200"
                        }`}
                      >
                        {request.status === "Approved" && "✓ "}
                        {request.status === "Rejected" && "✕ "}
                        {request.status}
                      </span>
                    </td>

                    {/* Requested Date */}
                    <td className="px-4 py-3.5 text-neutral-600 whitespace-nowrap text-[11px]">
                      {new Date(request.requestedAt).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {request.status === "Pending" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openApprovalModal(request)}
                            disabled={updatingId === request._id}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-[36px] shadow-sm"
                            title="Approve return and initiate refund"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => openRejectionModal(request)}
                            disabled={updatingId === request._id}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-[36px] shadow-sm"
                            title="Reject return request with reason"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-neutral-400 italic">
                          {request.status === "Approved" ? "Refund Processed" : "Closed"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Driven Pagination Footer */}
        <div className="px-5 py-4 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="text-xs text-neutral-500 font-medium">
            Showing <span className="font-bold text-neutral-800">{totalEntries > 0 ? startIndex + 1 : 0}</span> to{" "}
            <span className="font-bold text-neutral-800">{endIndex}</span> of{" "}
            <span className="font-bold text-neutral-800">{totalEntries}</span> return requests
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1 || loading}
              className="px-3 py-1.5 border border-neutral-300 rounded-xl bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] shadow-sm transition-colors"
            >
              Previous
            </button>

            <span className="text-xs text-neutral-600 font-semibold px-2">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1.5 border border-neutral-300 rounded-xl bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] shadow-sm transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Approval Confirmation Modal */}
      {approvalModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-neutral-200 animate-scale-up">
            <div className="bg-emerald-700 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span>✓</span> Confirm Return Approval
              </h3>
              <button
                type="button"
                onClick={() => setApprovalModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                You are approving the return request for the following order item. Approving will authorize the refund to the customer.
              </p>

              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Order ID:</span>
                  <span className="font-mono font-bold text-neutral-900">
                    {selectedRequest.orderNumber || selectedRequest.orderId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Product:</span>
                  <span className="font-bold text-neutral-900 truncate max-w-[200px]">
                    {selectedRequest.productName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Customer:</span>
                  <span className="font-semibold text-neutral-900">{selectedRequest.userName}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-neutral-200 font-bold text-emerald-800 text-sm">
                  <span>Refund Value:</span>
                  <span>₹{selectedRequest.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApprovalModalOpen(false)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApproval}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                >
                  {actionLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Approving...</span>
                    </>
                  ) : (
                    <span>Confirm & Approve</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal with Reason Textarea */}
      {rejectionModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-neutral-200 animate-scale-up">
            <div className="bg-red-700 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span>✕</span> Reject Return Request
              </h3>
              <button
                type="button"
                onClick={() => setRejectionModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs flex justify-between">
                <div>
                  <span className="text-neutral-400">Order: </span>
                  <span className="font-mono font-bold text-neutral-800">
                    {selectedRequest.orderNumber || selectedRequest.orderId}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400">Item: </span>
                  <span className="font-bold text-neutral-800">{selectedRequest.productName}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Rejection Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this return claim is being rejected..."
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-red-600 outline-none"
                />

                {/* Quick Templates */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Quick Reason Templates:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {REJECTION_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl}
                        type="button"
                        onClick={() => setRejectionReason(tmpl)}
                        className="text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-2 py-1 rounded-lg font-medium transition-colors"
                      >
                        + {tmpl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectionModalOpen(false)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRejection}
                  disabled={actionLoading || !rejectionReason.trim()}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                >
                  {actionLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Rejecting...</span>
                    </>
                  ) : (
                    <span>Confirm Rejection</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quality Assurance & Customer Dispute Resolution
      </footer>
    </div>
  );
}
