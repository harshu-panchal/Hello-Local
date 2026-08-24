import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getUsers,
  updateUserStatus,
  type User as UserType,
} from "../../../services/api/admin/adminMiscService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminUsers() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filters & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>("registrationDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch users from API
  const fetchUsers = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setTableError(null);

      const params: any = {
        page: currentPage,
        limit: entriesPerPage,
      };

      if (statusFilter !== "All") {
        params.status = statusFilter;
      }

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      if (sortColumn) {
        params.sortBy = sortColumn;
        params.sortOrder = sortDirection;
      }

      const response = await getUsers(params);

      if (response.success && Array.isArray(response.data)) {
        setUsers(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.pages || 1);
          setTotalUsers(response.pagination.total || 0);
        }
      } else {
        setUsers([]);
      }
    } catch (err: any) {
      console.error("Error fetching users:", err);
      const msg = err.response?.data?.message || "Failed to load users";
      setTableError(msg);
      showToast(msg, "error");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    currentPage,
    entriesPerPage,
    statusFilter,
    debouncedSearch,
    sortColumn,
    sortDirection,
    showToast,
  ]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSort = (column: string) => {
    const columnMap: Record<string, string> = {
      id: "_id",
      name: "name",
      _id: "_id",
      registrationDate: "registrationDate",
      status: "status",
      refCode: "refCode",
      walletAmount: "walletAmount",
      totalOrders: "totalOrders",
      totalSpent: "totalSpent",
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
    userId: string,
    currentStatus: "Active" | "Inactive" | "Suspended",
    userName: string
  ) => {
    const newStatus: "Active" | "Suspended" =
      currentStatus === "Active" ? "Suspended" : "Active";

    try {
      setProcessingId(userId);
      const response = await updateUserStatus(userId, newStatus);

      if (response.success) {
        setUsers((prev) =>
          prev.map((u) => (u._id === userId ? { ...u, status: newStatus } : u))
        );
        showToast(
          `User "${userName}" status updated to ${newStatus}`,
          "success"
        );
      }
    } catch (err: any) {
      console.error("Error updating user status:", err);
      showToast(
        err.response?.data?.message || "Failed to update user status",
        "error"
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleExport = () => {
    if (users.length === 0) {
      showToast("No user records available to export", "info");
      return;
    }

    const headers = [
      "ID",
      "Customer Name",
      "Email",
      "Phone",
      "Registration Date",
      "Status",
      "Referral Code",
      "Wallet Amount (₹)",
      "Total Orders",
      "Total Spent (₹)",
    ];

    const csvContent = [
      headers.join(","),
      ...users.map((u) =>
        [
          `"${u._id}"`,
          `"${u.name.replace(/"/g, '""')}"`,
          `"${u.email || ""}"`,
          `"${u.phone || ""}"`,
          `"${new Date(u.registrationDate).toLocaleDateString("en-IN")}"`,
          u.status,
          `"${u.refCode || ""}"`,
          (u.walletAmount || 0).toFixed(2),
          u.totalOrders || 0,
          (u.totalSpent || 0).toFixed(2),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_customers_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Customer directory exported successfully", "success");
  };

  const startIndex = (currentPage - 1) * entriesPerPage;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Customer Directory & Accounts
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Manage registered customer profiles, account security statuses, order volumes, and lifetime spending
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
          <span className="text-neutral-700 font-medium">Users</span>
        </nav>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner with Action Buttons */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Registered Users Directory ({totalUsers} Total)
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={users.length === 0}
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
        </div>

        {/* Filters Bar */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Status Filter */}
            <div>
              <label htmlFor="userStatusFilter" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Account Status
              </label>
              <select
                id="userStatusFilter"
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
                <option value="Suspended">Suspended</option>
              </select>
            </div>

            {/* Search Input */}
            <div>
              <label htmlFor="userSearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Search Customers
              </label>
              <div className="relative">
                <input
                  id="userSearchInput"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, email, phone, ref code..."
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
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(Number(e.target.value));
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
                <th className="py-3 px-4 w-16 text-center">Sr #</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>Customer Name</span>
                    <span className="text-neutral-400">{sortColumn === "name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4">Contact Details</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32"
                  onClick={() => handleSort("registrationDate")}
                >
                  <div className="flex items-center gap-1">
                    <span>Registered</span>
                    <span className="text-neutral-400">{sortColumn === "registrationDate" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
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
                <th className="py-3 px-3 w-24 text-center">Ref Code</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-right"
                  onClick={() => handleSort("walletAmount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Wallet</span>
                    <span className="text-neutral-400">{sortColumn === "walletAmount" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-20 text-center"
                  onClick={() => handleSort("totalOrders")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Orders</span>
                    <span className="text-neutral-400">{sortColumn === "totalOrders" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-right"
                  onClick={() => handleSort("totalSpent")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total Spent</span>
                    <span className="text-neutral-400">{sortColumn === "totalSpent" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4 w-28 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-8 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-32" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-36" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-16 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-8 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-20 mx-auto" /></td>
                  </tr>
                ))
              ) : tableError ? (
                <tr>
                  <td colSpan={10} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{tableError}</p>
                    <button
                      type="button"
                      onClick={fetchUsers}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No users found</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchTerm
                        ? `No users matching "${searchTerm}"`
                        : "Registered customer profiles will appear here"}
                    </p>
                  </td>
                </tr>
              ) : (
                users.map((user, index) => (
                  <tr key={user._id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 text-center font-mono font-bold text-neutral-400">
                      {startIndex + index + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-neutral-900">{user.name}</div>
                      <div className="text-[10px] font-mono text-neutral-400">
                        #{user._id.slice(-6).toUpperCase()}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-neutral-800 font-medium">{user.email || "No email"}</div>
                      {user.phone && (
                        <div className="text-[11px] text-neutral-500 font-mono">
                          📞 {user.phone}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-600">
                      {new Date(user.registrationDate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          user.status === "Active"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : user.status === "Suspended"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-semibold text-neutral-600">
                      {user.refCode || "-"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                      ₹{(user.walletAmount || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-neutral-800">
                      {user.totalOrders || 0}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-neutral-900">
                      ₹{(user.totalSpent || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(user._id, user.status, user.name)}
                          disabled={processingId === user._id}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1 min-h-[36px] ${
                            user.status === "Active"
                              ? "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                              : "bg-rose-700 hover:bg-rose-800 text-white"
                          }`}
                          title={user.status === "Active" ? "Suspend user account" : "Activate user account"}
                        >
                          {processingId === user._id ? (
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : user.status === "Active" ? (
                            <span>Suspend</span>
                          ) : (
                            <span>Activate</span>
                          )}
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
            Showing {users.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(startIndex + users.length, totalUsers)} of {totalUsers} entries
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

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quick-Commerce Customer Operations
      </footer>
    </div>
  );
}
