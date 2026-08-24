import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getWalletTransactions,
  type WalletTransaction,
} from "../../../services/api/admin/adminWalletService";
import { getAllSellers as getSellers } from "../../../services/api/sellerService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

interface Seller {
  _id: string;
  sellerName: string;
  storeName: string;
}

export default function AdminSellerTransaction() {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<"id" | "storeName" | "amount" | "type" | "date" | "status">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch approved sellers for dropdown
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const fetchSellers = async () => {
      try {
        const response = await getSellers({ status: "Approved" });
        if (response.success && Array.isArray(response.data)) {
          setSellers(
            response.data.map((seller) => ({
              _id: seller._id,
              sellerName: seller.sellerName,
              storeName: seller.storeName,
            }))
          );
        }
      } catch (err) {
        console.error("Error fetching sellers for transaction filter:", err);
      }
    };

    fetchSellers();
  }, [isAuthenticated, token]);

  // Fetch transactions via single consolidated backend query
  const fetchTransactions = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await getWalletTransactions({
        userType: "SELLER",
        sellerId: selectedSeller !== "all" ? selectedSeller : undefined,
        type: selectedType !== "all" ? selectedType : undefined,
        dateFrom: fromDate || undefined,
        dateTo: toDate || undefined,
        search: debouncedSearch || undefined,
        limit: 1000,
      });

      if (response.success && Array.isArray(response.data)) {
        setTransactions(response.data);
      } else {
        setTransactions([]);
      }
    } catch (err: any) {
      console.error("Error fetching seller transactions:", err);
      const msg = err.response?.data?.message || "Failed to load seller transactions. Please try again.";
      setError(msg);
      showToast(msg, "error");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    selectedSeller,
    selectedType,
    fromDate,
    toDate,
    debouncedSearch,
    showToast,
  ]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleSort = (column: "id" | "storeName" | "amount" | "type" | "date" | "status") => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchSearch =
        debouncedSearch.trim() === "" ||
        (tx.userName && tx.userName.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (tx.storeName && tx.storeName.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (tx.description && tx.description.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (tx.reference && tx.reference.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (tx.relatedOrder?.orderNumber && tx.relatedOrder.orderNumber.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        tx._id.toLowerCase().includes(debouncedSearch.toLowerCase());

      return matchSearch;
    });
  }, [transactions, debouncedSearch]);

  // Sort transactions
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "id":
          aValue = a._id;
          bValue = b._id;
          break;
        case "storeName":
          aValue = (a.storeName || a.userName || "").toLowerCase();
          bValue = (b.storeName || b.userName || "").toLowerCase();
          break;
        case "amount":
          aValue = a.amount;
          bValue = b.amount;
          break;
        case "type":
          aValue = a.type.toLowerCase();
          bValue = b.type.toLowerCase();
          break;
        case "date":
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case "status":
          aValue = a.status.toLowerCase();
          bValue = b.status.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredTransactions, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / entriesPerPage));
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const displayedTransactions = sortedTransactions.slice(startIndex, endIndex);

  // CSV Export
  const handleExport = () => {
    if (sortedTransactions.length === 0) {
      showToast("No transactions available to export", "info");
      return;
    }

    const headers = [
      "Transaction ID",
      "Store Name",
      "Seller Name",
      "Type",
      "Amount (₹)",
      "Status",
      "Order Number",
      "Description",
      "Reference",
      "Date",
    ];

    const csvContent = [
      headers.join(","),
      ...sortedTransactions.map((tx) =>
        [
          `"${tx._id}"`,
          `"${(tx.storeName || "").replace(/"/g, '""')}"`,
          `"${(tx.userName || "").replace(/"/g, '""')}"`,
          tx.type,
          tx.amount,
          tx.status,
          `"${(tx.relatedOrder?.orderNumber || "").replace(/"/g, '""')}"`,
          `"${(tx.description || "").replace(/"/g, '""')}"`,
          `"${(tx.reference || "").replace(/"/g, '""')}"`,
          `"${new Date(tx.createdAt).toLocaleDateString("en-IN")}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_seller_transactions_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Transaction history exported successfully", "success");
  };

  const handleClearDate = () => {
    setFromDate("");
    setToDate("");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Seller Transactions & Settlements
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Audit store wallet balance inflows, order settlement credits, and withdrawal disbursements
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
          <span className="text-neutral-700 font-medium">Seller Transactions</span>
        </nav>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner with Action Buttons */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Transaction Ledger ({sortedTransactions.length} records)
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/admin/delivery-boy/fund-transfer")}
              className="bg-white text-rose-700 hover:bg-rose-50 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors min-h-[36px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
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

        {/* Filters and Controls */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filter by Seller */}
            <div>
              <label htmlFor="filterSellerSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Seller / Store
              </label>
              <select
                id="filterSellerSelect"
                value={selectedSeller}
                onChange={(e) => {
                  setSelectedSeller(e.target.value);
                  setCurrentPage(1);
                }}
                disabled={loading}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="all">All Sellers</option>
                {sellers.map((seller) => (
                  <option key={seller._id} value={seller._id}>
                    {seller.storeName ? `${seller.storeName} (${seller.sellerName})` : seller.sellerName}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Transaction Type */}
            <div>
              <label htmlFor="filterTypeSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Transaction Type
              </label>
              <select
                id="filterTypeSelect"
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="all">All Types</option>
                <option value="Credit">Credit (Earnings / Top-up)</option>
                <option value="Debit">Debit (Withdrawal / Payout)</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label htmlFor="fromDateInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                From Date
              </label>
              <input
                id="fromDateInput"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* To Date */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="toDateInput" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  To Date
                </label>
                {(fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={handleClearDate}
                    className="text-[11px] font-bold text-rose-700 hover:text-rose-800"
                  >
                    Clear Dates
                  </button>
                )}
              </div>
              <input
                id="toDateInput"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>
          </div>

          {/* Table Search & Rows Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2">
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
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-xs font-medium text-neutral-600">entries</span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search transaction, order, store..."
                className="pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none w-full sm:w-64 min-h-[44px]"
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24"
                  onClick={() => handleSort("id")}
                >
                  <div className="flex items-center gap-1">
                    <span>Tx ID</span>
                    <span className="text-neutral-400">{sortColumn === "id" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("storeName")}
                >
                  <div className="flex items-center gap-1">
                    <span>Store / Seller</span>
                    <span className="text-neutral-400">{sortColumn === "storeName" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4">Order / Reference</th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24 text-center"
                  onClick={() => handleSort("type")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Type</span>
                    <span className="text-neutral-400">{sortColumn === "type" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32 text-right"
                  onClick={() => handleSort("amount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Amount</span>
                    <span className="text-neutral-400">{sortColumn === "amount" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-center"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status</span>
                    <span className="text-neutral-400">{sortColumn === "status" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32 text-right"
                  onClick={() => handleSort("date")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Date</span>
                    <span className="text-neutral-400">{sortColumn === "date" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-14" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-36" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-28" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-16 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20 ml-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-18 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
                    <button
                      type="button"
                      onClick={fetchTransactions}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : displayedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No seller transactions found</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchTerm || fromDate || toDate
                        ? "Try adjusting your search or date filter parameters"
                        : "Transactions will appear here as orders and settlements occur"}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedTransactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-neutral-500">
                      #{tx._id.slice(-6).toUpperCase()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-neutral-900">
                        {tx.storeName || tx.userName || "Seller"}
                      </div>
                      {tx.userName && tx.storeName && tx.userName !== tx.storeName && (
                        <div className="text-[11px] text-neutral-500 font-medium">
                          {tx.userName}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      {tx.relatedOrder?.orderNumber ? (
                        <span className="font-mono font-semibold text-rose-700">
                          Order #{tx.relatedOrder.orderNumber}
                        </span>
                      ) : tx.reference ? (
                        <span className="font-mono text-neutral-700">Ref: {tx.reference}</span>
                      ) : (
                        <span className="text-neutral-500">{tx.description || "Settlement"}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          tx.type.toLowerCase() === "credit"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-rose-50 text-rose-700 border border-rose-100"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                        tx.type.toLowerCase() === "credit"
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {tx.type.toLowerCase() === "credit" ? "+" : "-"}₹{tx.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          tx.status.toLowerCase() === "completed" || tx.status.toLowerCase() === "success"
                            ? "bg-rose-50 text-rose-700 border border-rose-100"
                            : tx.status.toLowerCase() === "pending"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-neutral-500">
                      {new Date(tx.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
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
            Showing {sortedTransactions.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(endIndex, sortedTransactions.length)} of {sortedTransactions.length} entries
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
        HelloLocal Admin Panel • Quick-Commerce Operations
      </footer>
    </div>
  );
}
