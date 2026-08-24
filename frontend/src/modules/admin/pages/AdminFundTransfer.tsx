import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getWalletTransactions,
  createFundTransfer,
  type WalletTransaction,
} from "../../../services/api/admin/adminWalletService";
import {
  getDeliveryBoys,
  type DeliveryBoy,
} from "../../../services/api/admin/adminDeliveryService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminFundTransfer() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);

  // Filter & Search State
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedDeliveryBoy, setSelectedDeliveryBoy] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<"id" | "userName" | "amount" | "type" | "date" | "status">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalCourierId, setModalCourierId] = useState("");
  const [modalAmount, setModalAmount] = useState("");
  const [modalType, setModalType] = useState<"Credit" | "Debit">("Credit");
  const [modalDescription, setModalDescription] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch Delivery Boys for filter and modal
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const fetchCouriers = async () => {
      try {
        const response = await getDeliveryBoys({ limit: 1000 });
        if (response.success && Array.isArray(response.data)) {
          setDeliveryBoys(response.data);
        }
      } catch (err) {
        console.error("Error fetching delivery boys for fund transfer:", err);
      }
    };

    fetchCouriers();
  }, [isAuthenticated, token]);

  // Fetch Delivery Boy Wallet Transactions
  const fetchTransfers = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setTableError(null);

      const response = await getWalletTransactions({
        userType: "DELIVERY_BOY",
        userId: selectedDeliveryBoy !== "all" ? selectedDeliveryBoy : undefined,
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
      console.error("Error fetching delivery fund transfers:", err);
      const msg = err.response?.data?.message || "Failed to load fund transfers";
      setTableError(msg);
      showToast(msg, "error");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    selectedDeliveryBoy,
    selectedType,
    fromDate,
    toDate,
    debouncedSearch,
    showToast,
  ]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // Execute Fund Transfer
  const handleCreateFundTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!modalCourierId) {
      setModalError("Please select a delivery partner");
      return;
    }

    const numAmount = parseFloat(modalAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setModalError("Please enter a valid transfer amount greater than 0");
      return;
    }

    if (!modalDescription.trim()) {
      setModalError("Please provide a transfer reason or notes");
      return;
    }

    try {
      setModalSubmitting(true);
      const response = await createFundTransfer({
        userId: modalCourierId,
        userType: "DELIVERY_BOY",
        amount: numAmount,
        type: modalType,
        description: modalDescription.trim(),
      });

      if (response.success) {
        showToast(
          response.message || `Successfully ${modalType === "Credit" ? "credited" : "debited"} ₹${numAmount.toFixed(2)}`,
          "success"
        );
        setShowAddModal(false);
        setModalCourierId("");
        setModalAmount("");
        setModalDescription("");
        setModalType("Credit");
        fetchTransfers();
      } else {
        setModalError(response.message || "Failed to execute fund transfer");
      }
    } catch (err: any) {
      console.error("Error creating fund transfer:", err);
      setModalError(
        err.response?.data?.message || err.message || "Failed to execute fund transfer"
      );
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleSort = (column: "id" | "userName" | "amount" | "type" | "date" | "status") => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Filter transactions
  const filteredTransfers = useMemo(() => {
    return transactions.filter((tx) => {
      const matchSearch =
        debouncedSearch.trim() === "" ||
        (tx.userName && tx.userName.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (tx.description && tx.description.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        (tx.reference && tx.reference.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
        tx._id.toLowerCase().includes(debouncedSearch.toLowerCase());

      return matchSearch;
    });
  }, [transactions, debouncedSearch]);

  // Sort transactions
  const sortedTransfers = useMemo(() => {
    return [...filteredTransfers].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "id":
          aValue = a._id;
          bValue = b._id;
          break;
        case "userName":
          aValue = (a.userName || "").toLowerCase();
          bValue = (b.userName || "").toLowerCase();
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
  }, [filteredTransfers, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedTransfers.length / entriesPerPage));
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const displayedTransfers = sortedTransfers.slice(startIndex, endIndex);

  // CSV Export
  const handleExport = () => {
    if (sortedTransfers.length === 0) {
      showToast("No transfers available to export", "info");
      return;
    }

    const headers = [
      "Transaction ID",
      "Courier Name",
      "Type",
      "Amount (₹)",
      "Status",
      "Description",
      "Reference",
      "Date",
    ];

    const csvContent = [
      headers.join(","),
      ...sortedTransfers.map((tx) =>
        [
          `"${tx._id}"`,
          `"${(tx.userName || "Courier").replace(/"/g, '""')}"`,
          tx.type,
          tx.amount,
          tx.status,
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
      `hellolocal_fund_transfers_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Fund transfer ledger exported successfully", "success");
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
            Delivery Partner Fund Transfers
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Audit manual balance adjustments, incentives, and emergency disbursements for delivery couriers
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
          <span className="text-neutral-700 font-medium">Fund Transfer</span>
        </nav>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner with Action Buttons */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Transfer History ({sortedTransfers.length} Records)
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setModalError(null);
                setShowAddModal(true);
              }}
              className="bg-white text-rose-700 hover:bg-rose-50 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors min-h-[36px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Fund Transfer</span>
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

        {/* Filters Bar */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filter by Delivery Partner */}
            <div>
              <label htmlFor="filterCourierSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Delivery Partner
              </label>
              <select
                id="filterCourierSelect"
                value={selectedDeliveryBoy}
                onChange={(e) => {
                  setSelectedDeliveryBoy(e.target.value);
                  setCurrentPage(1);
                }}
                disabled={loading}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="all">All Delivery Partners ({deliveryBoys.length})</option>
                {deliveryBoys.map((boy) => (
                  <option key={boy._id} value={boy._id}>
                    {boy.name} ({boy.mobile})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Method / Type */}
            <div>
              <label htmlFor="filterMethodSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Transfer Type
              </label>
              <select
                id="filterMethodSelect"
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="all">All Types</option>
                <option value="Credit">Credit (Incentive / Top-up)</option>
                <option value="Debit">Debit (Deduction / Adjustment)</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label htmlFor="fromTransferDate" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                From Date
              </label>
              <input
                id="fromTransferDate"
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
                <label htmlFor="toTransferDate" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
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
                id="toTransferDate"
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

          {/* Search and Entries */}
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
                placeholder="Search courier, notes, reference..."
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
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
                  onClick={() => handleSort("userName")}
                >
                  <div className="flex items-center gap-1">
                    <span>Courier Name</span>
                    <span className="text-neutral-400">{sortColumn === "userName" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4">Remarks / Reference</th>
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
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-44" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-16 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20 ml-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-18 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : tableError ? (
                <tr>
                  <td colSpan={7} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{tableError}</p>
                    <button
                      type="button"
                      onClick={fetchTransfers}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : displayedTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No fund transfers recorded</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchTerm || fromDate || toDate
                        ? "Try adjusting your search or date filter parameters"
                        : "Use the 'Add Fund Transfer' button above to issue a credit or debit"}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedTransfers.map((tx) => (
                  <tr key={tx._id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-neutral-500">
                      #{tx._id.slice(-6).toUpperCase()}
                    </td>
                    <td className="py-3 px-4 font-bold text-neutral-900">
                      {tx.userName || "Delivery Partner"}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      <p className="line-clamp-1">{tx.description || "Manual adjustment"}</p>
                      {tx.reference && (
                        <span className="text-[10px] font-mono text-neutral-400">Ref: {tx.reference}</span>
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
            Showing {sortedTransfers.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(endIndex, sortedTransfers.length)} of {sortedTransfers.length} entries
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

      {/* Add Fund Transfer Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
                  ₹
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 text-base">
                    Add Courier Fund Transfer
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Adjust wallet balance with atomic ledger synchronization
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-bold p-1"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateFundTransfer} className="space-y-3.5">
              {/* Courier Selection */}
              <div>
                <label htmlFor="modalCourierSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Select Delivery Partner <span className="text-red-500">*</span>
                </label>
                <select
                  id="modalCourierSelect"
                  value={modalCourierId}
                  onChange={(e) => setModalCourierId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="">-- Choose Courier --</option>
                  {deliveryBoys.map((boy) => (
                    <option key={boy._id} value={boy._id}>
                      {boy.name} (📞 {boy.mobile}) — Current Balance: ₹{boy.balance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount and Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="modalAmountInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="modalAmountInput"
                    type="number"
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    required
                    min="1"
                    step="0.01"
                    placeholder="e.g. 500"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold text-neutral-900 bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="modalTypeSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Transfer Direction <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="modalTypeSelect"
                    value={modalType}
                    onChange={(e) => setModalType(e.target.value as "Credit" | "Debit")}
                    required
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                  >
                    <option value="Credit">Credit (Add to Wallet)</option>
                    <option value="Debit">Debit (Deduct from Wallet)</option>
                  </select>
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label htmlFor="modalNotesInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Reason & Administrative Remarks <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="modalNotesInput"
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  required
                  rows={2}
                  placeholder="e.g. Peak hours delivery incentive or manual cash collection adjustment"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none resize-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={modalSubmitting}
                  className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                >
                  {modalSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Processing Transfer...</span>
                    </>
                  ) : (
                    <span>Execute Fund Transfer</span>
                  )}
                </button>
              </div>
            </form>
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
