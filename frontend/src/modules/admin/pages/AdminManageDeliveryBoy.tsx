import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getDeliveryBoys,
  updateDeliveryBoyStatus,
  updateDeliveryBoyAvailability,
  deleteDeliveryBoy,
  type DeliveryBoy,
} from "../../../services/api/admin/adminDeliveryService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminManageDeliveryBoy() {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [availabilityFilter, setAvailabilityFilter] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [totalPages, setTotalPages] = useState(1);
  const [totalDeliveryBoys, setTotalDeliveryBoys] = useState(0);

  // Deletion Modal State
  const [deleteTarget, setDeleteTarget] = useState<DeliveryBoy | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch delivery boys from API
  const fetchDeliveryBoys = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setTableError(null);

      const params: any = {
        page: currentPage,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        sortBy: sortColumn || undefined,
        sortOrder: sortDirection,
      };

      if (statusFilter !== "All") params.status = statusFilter;
      if (availabilityFilter !== "All") params.available = availabilityFilter;

      const response = await getDeliveryBoys(params);

      if (response.success && Array.isArray(response.data)) {
        setDeliveryBoys(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.pages || 1);
          setTotalDeliveryBoys(response.pagination.total || 0);
        }
      } else {
        setDeliveryBoys([]);
      }
    } catch (err: any) {
      console.error("Error fetching delivery boys:", err);
      const msg = err.response?.data?.message || "Failed to load delivery boys";
      setTableError(msg);
      showToast(msg, "error");
      setDeliveryBoys([]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    currentPage,
    rowsPerPage,
    debouncedSearch,
    statusFilter,
    availabilityFilter,
    sortColumn,
    sortDirection,
    showToast,
  ]);

  useEffect(() => {
    fetchDeliveryBoys();
  }, [fetchDeliveryBoys]);

  const handleSort = (column: string) => {
    const columnMap: Record<string, string> = {
      id: "_id",
      _id: "_id",
      name: "name",
      mobile: "mobile",
      city: "city",
      balance: "balance",
      cashCollected: "cashCollected",
      status: "status",
      available: "available",
      createdAt: "createdAt",
    };
    const backendColumn = columnMap[column] || column;

    if (sortColumn === backendColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(backendColumn);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handleStatusChange = async (
    deliveryBoyId: string,
    currentStatus: "Active" | "Inactive",
    courierName: string
  ) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    try {
      setProcessingId(deliveryBoyId);
      const response = await updateDeliveryBoyStatus(deliveryBoyId, newStatus);

      if (response.success) {
        setDeliveryBoys((prev) =>
          prev.map((d) => (d._id === deliveryBoyId ? { ...d, status: newStatus } : d))
        );
        showToast(
          `Courier "${courierName}" marked as ${newStatus}`,
          "success"
        );
      }
    } catch (err: any) {
      console.error("Error updating delivery boy status:", err);
      showToast(
        err.response?.data?.message || "Failed to update status",
        "error"
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleAvailabilityChange = async (
    deliveryBoyId: string,
    currentAvail: "Available" | "Not Available",
    courierName: string
  ) => {
    const newAvail = currentAvail === "Available" ? "Not Available" : "Available";
    try {
      setProcessingId(deliveryBoyId);
      const response = await updateDeliveryBoyAvailability(deliveryBoyId, newAvail);

      if (response.success) {
        setDeliveryBoys((prev) =>
          prev.map((d) => (d._id === deliveryBoyId ? { ...d, available: newAvail } : d))
        );
        showToast(
          `Courier "${courierName}" marked as ${newAvail}`,
          "success"
        );
      }
    } catch (err: any) {
      console.error("Error updating delivery boy availability:", err);
      showToast(
        err.response?.data?.message || "Failed to update availability",
        "error"
      );
    } finally {
      setProcessingId(null);
    }
  };

  const confirmDeleteCourier = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      const response = await deleteDeliveryBoy(deleteTarget._id);

      if (response.success) {
        setDeliveryBoys((prev) => prev.filter((d) => d._id !== deleteTarget._id));
        setTotalDeliveryBoys((prev) => Math.max(0, prev - 1));
        showToast(`Courier "${deleteTarget.name}" deleted successfully`, "success");
        setDeleteTarget(null);
        fetchDeliveryBoys();
      }
    } catch (err: any) {
      console.error("Error deleting delivery boy:", err);
      showToast(
        err.response?.data?.message || "Failed to delete delivery partner",
        "error"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    if (deliveryBoys.length === 0) {
      showToast("No delivery boys available to export", "info");
      return;
    }

    const headers = [
      "ID",
      "Name",
      "Mobile",
      "Address",
      "City",
      "Commission",
      "Balance (₹)",
      "Cash Collected (₹)",
      "Status",
      "Available",
    ];

    const csvContent = [
      headers.join(","),
      ...deliveryBoys.map((d) =>
        [
          `"${d._id}"`,
          `"${d.name.replace(/"/g, '""')}"`,
          `"${d.mobile}"`,
          `"${(d.address || "").replace(/"/g, '""')}"`,
          `"${(d.city || "").replace(/"/g, '""')}"`,
          d.commissionType === "Percentage" ? `"${d.commission}%"` : '"Fixed"',
          d.balance,
          d.cashCollected,
          d.status,
          d.available,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_delivery_partners_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Delivery fleet records exported successfully", "success");
  };

  const startIndex = (currentPage - 1) * rowsPerPage;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Delivery Boy Fleet Management
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Manage courier profiles, dispatch availability, commission rates, and COD collection ledgers
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
          <span className="text-neutral-700 font-medium">Delivery Boys</span>
        </nav>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner with Action Buttons */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Delivery Partners Directory ({totalDeliveryBoys} Couriers)
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/admin/delivery-boy/cash-collection")}
              className="bg-white text-rose-700 hover:bg-rose-50 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors min-h-[36px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>Cash Collection</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/delivery-boy/fund-transfer")}
              className="bg-white/15 hover:bg-white/25 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              <span>Fund Transfer</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="bg-white/15 hover:bg-white/25 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px]"
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
        </div>

        {/* Filters & Search Bar */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Status Filter */}
            <div>
              <label htmlFor="deliveryStatusSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Account Status
              </label>
              <select
                id="deliveryStatusSelect"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {/* Availability Filter */}
            <div>
              <label htmlFor="deliveryAvailSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Dispatch Availability
              </label>
              <select
                id="deliveryAvailSelect"
                value={availabilityFilter}
                onChange={(e) => {
                  setAvailabilityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="All">All Availabilities</option>
                <option value="Available">Available (On-Duty)</option>
                <option value="Not Available">Not Available (Off-Duty)</option>
              </select>
            </div>

            {/* Search */}
            <div>
              <label htmlFor="deliverySearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Search Fleet
              </label>
              <div className="relative">
                <input
                  id="deliverySearchInput"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, phone, address..."
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
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Rows per page */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600">Show</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
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
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24"
                  onClick={() => handleSort("id")}
                >
                  <div className="flex items-center gap-1">
                    <span>ID</span>
                    <span className="text-neutral-400">{sortColumn === "_id" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>Courier Name</span>
                    <span className="text-neutral-400">{sortColumn === "name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32"
                  onClick={() => handleSort("mobile")}
                >
                  <div className="flex items-center gap-1">
                    <span>Mobile</span>
                    <span className="text-neutral-400">{sortColumn === "mobile" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4">Address & City</th>
                <th className="py-3 px-4 w-32">Commission</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-right"
                  onClick={() => handleSort("balance")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Balance</span>
                    <span className="text-neutral-400">{sortColumn === "balance" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32 text-right"
                  onClick={() => handleSort("cashCollected")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>COD Debt</span>
                    <span className="text-neutral-400">{sortColumn === "cashCollected" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24 text-center"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status</span>
                    <span className="text-neutral-400">{sortColumn === "status" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-center"
                  onClick={() => handleSort("available")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Duty</span>
                    <span className="text-neutral-400">{sortColumn === "available" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4 w-28 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-12" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-32" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-24" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-40" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-16 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-20 mx-auto" /></td>
                  </tr>
                ))
              ) : tableError ? (
                <tr>
                  <td colSpan={10} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{tableError}</p>
                    <button
                      type="button"
                      onClick={fetchDeliveryBoys}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : deliveryBoys.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No delivery partners found</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchTerm
                        ? `No couriers matching "${searchTerm}"`
                        : "Registered delivery partners will appear here"}
                    </p>
                  </td>
                </tr>
              ) : (
                deliveryBoys.map((deliveryBoy) => (
                  <tr key={deliveryBoy._id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-neutral-500">
                      #{deliveryBoy._id.slice(-6).toUpperCase()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-neutral-900">{deliveryBoy.name}</div>
                      {deliveryBoy.email && (
                        <div className="text-[11px] text-neutral-500 font-medium truncate max-w-[160px]">
                          {deliveryBoy.email}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-neutral-700">
                      📞 {deliveryBoy.mobile}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      <p className="line-clamp-1">{deliveryBoy.address || "No address"}</p>
                      {deliveryBoy.city && (
                        <span className="text-[11px] text-neutral-500 font-semibold">{deliveryBoy.city}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {deliveryBoy.commissionType === "Percentage" ? (
                        <div>
                          <span className="font-bold text-rose-700">{deliveryBoy.commission}% Rate</span>
                          {deliveryBoy.minAmount ? (
                            <div className="text-[10px] text-neutral-500">
                              Min ₹{deliveryBoy.minAmount} / Max ₹{deliveryBoy.maxAmount || "∞"}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="font-bold text-neutral-700">Fixed Rate</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                      ₹{deliveryBoy.balance.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                      ₹{deliveryBoy.cashCollected.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          handleStatusChange(
                            deliveryBoy._id,
                            deliveryBoy.status as "Active" | "Inactive",
                            deliveryBoy.name
                          )
                        }
                        disabled={processingId === deliveryBoy._id}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                          deliveryBoy.status === "Active"
                            ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                            : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                        }`}
                        title="Click to toggle Active/Inactive status"
                      >
                        {deliveryBoy.status}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          handleAvailabilityChange(
                            deliveryBoy._id,
                            deliveryBoy.available as "Available" | "Not Available",
                            deliveryBoy.name
                          )
                        }
                        disabled={processingId === deliveryBoy._id}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                          deliveryBoy.available === "Available"
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200"
                        }`}
                        title="Click to toggle Available/Not Available dispatch duty"
                      >
                        {deliveryBoy.available}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(deliveryBoy)}
                          disabled={processingId === deliveryBoy._id}
                          className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors inline-flex items-center justify-center min-w-[36px] min-h-[36px]"
                          title="Delete delivery partner"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-neutral-600 font-medium">
            Showing {deliveryBoys.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(startIndex + deliveryBoys.length, totalDeliveryBoys)} of {totalDeliveryBoys} entries
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                currentPage === 1
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
              disabled={currentPage === totalPages || totalPages === 0}
              className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                currentPage === totalPages || totalPages === 0
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-base">
                  Delete Delivery Partner
                </h3>
                <p className="text-xs text-neutral-500">
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Courier Name:</span> {deleteTarget.name}
              </p>
              <p>
                <span className="font-bold">Phone:</span> {deleteTarget.mobile}
              </p>
              <p>
                <span className="font-bold">Wallet Balance:</span> ₹{deleteTarget.balance.toFixed(2)}
              </p>
              <p>
                <span className="font-bold">COD Cash Debt:</span> ₹{deleteTarget.cashCollected.toFixed(2)}
              </p>
            </div>

            <p className="text-xs text-neutral-600">
              Couriers with in-transit orders or pending cash collections cannot be deleted until settlements are concluded.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCourier}
                disabled={isDeleting}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete Courier</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quick-Commerce Operations
      </footer>
    </div>
  );
}
