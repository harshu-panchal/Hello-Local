import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getCashCollections,
  collectCashFromCourier,
  getDeliveryBoys,
  type CashCollection,
  type DeliveryBoy,
} from "../../../services/api/admin/adminDeliveryService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminCashCollection() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [cashCollections, setCashCollections] = useState<CashCollection[]>([]);
  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);

  // Filters & Search
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedDeliveryBoy, setSelectedDeliveryBoy] = useState("all");
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>("collectedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Cash-collection modal state
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [collectCourierId, setCollectCourierId] = useState("");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectSubmitting, setCollectSubmitting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Debounce search (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch Delivery Boys for Dropdown
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const fetchBoys = async () => {
      try {
        const response = await getDeliveryBoys({ limit: 1000 });
        if (response.success && Array.isArray(response.data)) {
          setDeliveryBoys(response.data);
        }
      } catch (err) {
        console.error("Error fetching delivery boys for cash collection:", err);
      }
    };

    fetchBoys();
  }, [isAuthenticated, token, refreshTick]);

  // Fetch Cash Collections
  const fetchCollections = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setTableError(null);

      const params: any = {
        page: 1,
        limit: 1000,
      };

      if (selectedDeliveryBoy !== "all") {
        params.deliveryBoyId = selectedDeliveryBoy;
      }
      if (fromDate) {
        params.fromDate = fromDate;
      }
      if (toDate) {
        params.toDate = toDate;
      }
      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      const response = await getCashCollections(params);

      if (response.success && Array.isArray(response.data)) {
        setCashCollections(response.data);
      } else {
        setCashCollections([]);
      }
    } catch (err: any) {
      console.error("Error fetching cash collections:", err);
      const msg = err.response?.data?.message || "Failed to load cash collections";
      setTableError(msg);
      showToast(msg, "error");
      setCashCollections([]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    selectedDeliveryBoy,
    fromDate,
    toDate,
    debouncedSearch,
    showToast,
  ]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections, refreshTick]);

  // Record COD Cash Handover
  const handleAddCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    setCollectError(null);

    if (!collectCourierId) {
      setCollectError("Please choose a delivery partner");
      return;
    }

    const amount = Number(collectAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCollectError("Please enter a valid positive cash amount");
      return;
    }

    setCollectSubmitting(true);
    try {
      const result = await collectCashFromCourier(
        collectCourierId,
        amount,
        collectNotes || undefined
      );

      setShowCollectModal(false);
      setCollectAmount("");
      setCollectNotes("");
      setCollectCourierId("");
      showToast(
        `Recorded ₹${result.data.amountCollected.toFixed(2)}. ${result.data.ordersSettled} order(s) settled. Remaining COD debt: ₹${result.data.pendingAdminPayout.toFixed(2)}`,
        "success"
      );
      setRefreshTick((t) => t + 1);
    } catch (err: any) {
      console.error("Error recording cash collection:", err);
      setCollectError(
        err?.response?.data?.message || err?.message || "Could not record the cash collection"
      );
    } finally {
      setCollectSubmitting(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sort collections
  const sortedCollections = useMemo(() => {
    return [...cashCollections].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "id":
          aValue = a._id;
          bValue = b._id;
          break;
        case "name":
          aValue = (a.deliveryBoyName || "").toLowerCase();
          bValue = (b.deliveryBoyName || "").toLowerCase();
          break;
        case "orderId":
          aValue = a.orderNumber || a.orderId || "";
          bValue = b.orderNumber || b.orderId || "";
          break;
        case "total":
          aValue = a.total || 0;
          bValue = b.total || 0;
          break;
        case "amount":
          aValue = a.amount;
          bValue = b.amount;
          break;
        case "collectedAt":
        case "dateTime":
          aValue = new Date(a.collectedAt).getTime();
          bValue = new Date(b.collectedAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [cashCollections, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedCollections.length / entriesPerPage));
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const displayedCollections = sortedCollections.slice(startIndex, endIndex);

  // CSV Export
  const handleExport = () => {
    if (sortedCollections.length === 0) {
      showToast("No collections available to export", "info");
      return;
    }

    const headers = [
      "Collection ID",
      "Delivery Partner",
      "Order Number",
      "Order Total (₹)",
      "Amount Handed Over (₹)",
      "Collected By",
      "Remark",
      "Date & Time",
    ];

    const csvContent = [
      headers.join(","),
      ...sortedCollections.map((c) =>
        [
          `"${c._id}"`,
          `"${(c.deliveryBoyName || "Courier").replace(/"/g, '""')}"`,
          `"${c.orderNumber || c.orderId || "-"}"`,
          c.total.toFixed(2),
          c.amount.toFixed(2),
          `"${(c.collectedBy || "Admin").replace(/"/g, '""')}"`,
          `"${(c.remark || "").replace(/"/g, '""')}"`,
          `"${new Date(c.collectedAt).toLocaleString("en-IN")}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_cash_collections_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Cash collection ledger exported successfully", "success");
  };

  const handleClearDate = () => {
    setFromDate("");
    setToDate("");
    setCurrentPage(1);
  };

  const selectedCourierObj = deliveryBoys.find((d) => d._id === collectCourierId);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            COD Cash Collection Ledger
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Audit physical Cash on Delivery handovers, settle courier COD debts, and release order commissions
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
          <span className="text-neutral-700 font-medium">Cash Collection</span>
        </nav>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner with Action Buttons */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Cash Collection Records ({sortedCollections.length} Entries)
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCollectError(null);
                setShowCollectModal(true);
              }}
              className="bg-white text-rose-700 hover:bg-rose-50 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors min-h-[36px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>Record Cash Collection</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Filter by Delivery Boy */}
            <div>
              <label htmlFor="filterCourierSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Filter by Delivery Partner
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
                    {boy.name} (📞 {boy.mobile})
                  </option>
                ))}
              </select>
            </div>

            {/* From Date */}
            <div>
              <label htmlFor="fromCashDate" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                From Date
              </label>
              <input
                id="fromCashDate"
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
                <label htmlFor="toCashDate" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
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
                id="toCashDate"
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
                placeholder="Search courier, order #, remark..."
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
                    <span>ID</span>
                    <span className="text-neutral-400">{sortColumn === "id" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>Delivery Partner</span>
                    <span className="text-neutral-400">{sortColumn === "name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32"
                  onClick={() => handleSort("orderId")}
                >
                  <div className="flex items-center gap-1">
                    <span>Order #</span>
                    <span className="text-neutral-400">{sortColumn === "orderId" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-right"
                  onClick={() => handleSort("total")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Order Total</span>
                    <span className="text-neutral-400">{sortColumn === "total" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-36 text-right"
                  onClick={() => handleSort("amount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Handed Over</span>
                    <span className="text-neutral-400">{sortColumn === "amount" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4">Remark / Collected By</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-36 text-right"
                  onClick={() => handleSort("collectedAt")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Date & Time</span>
                    <span className="text-neutral-400">{sortColumn === "collectedAt" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-12" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-36" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-24" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20 ml-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-40" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-24 ml-auto" /></td>
                  </tr>
                ))
              ) : tableError ? (
                <tr>
                  <td colSpan={7} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{tableError}</p>
                    <button
                      type="button"
                      onClick={fetchCollections}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : displayedCollections.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No cash collections found</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchTerm || fromDate || toDate
                        ? "Try adjusting your search or date filters"
                        : "Recorded cash handovers from couriers will appear here"}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedCollections.map((collection) => (
                  <tr key={collection._id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-neutral-500">
                      #{collection._id.slice(-6).toUpperCase()}
                    </td>
                    <td className="py-3 px-4 font-bold text-neutral-900">
                      {collection.deliveryBoyName}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-neutral-700">
                      {collection.orderNumber || (collection.orderId ? `#${collection.orderId.slice(-6).toUpperCase()}` : "-")}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-neutral-600">
                      ₹{collection.total.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 text-sm">
                      ₹{collection.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      <p className="line-clamp-1">{collection.remark || "COD Cash Handover"}</p>
                      {collection.collectedBy && (
                        <span className="text-[10px] text-neutral-400 font-medium">
                          Handled by: {collection.collectedBy}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-neutral-500">
                      {new Date(collection.collectedAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
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
            Showing {sortedCollections.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(endIndex, sortedCollections.length)} of {sortedCollections.length} entries
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

      {/* Record Cash Collection Modal */}
      {showCollectModal && (
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
                    Record COD Cash Handover
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Deposit courier collected cash and conclude order settlements
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCollectModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-bold p-1"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {collectError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                {collectError}
              </div>
            )}

            <form onSubmit={handleAddCollection} className="space-y-3.5">
              {/* Courier Selection */}
              <div>
                <label htmlFor="collect-courier" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Select Delivery Partner <span className="text-red-500">*</span>
                </label>
                <select
                  id="collect-courier"
                  value={collectCourierId}
                  onChange={(e) => setCollectCourierId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="">-- Choose Courier --</option>
                  {deliveryBoys.map((d: any) => (
                    <option key={d._id} value={d._id}>
                      {d.name} (📞 {d.mobile}) — Outstanding COD Debt: ₹{(d.pendingAdminPayout ?? d.cashCollected ?? 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCourierObj && (
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 flex items-center justify-between">
                  <div>
                    <span className="text-neutral-500">Pending COD Payout:</span>{" "}
                    <span className="font-bold text-rose-700">
                      ₹{((selectedCourierObj as any).pendingAdminPayout ?? selectedCourierObj.cashCollected ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Wallet Earnings:</span>{" "}
                    <span className="font-bold text-emerald-700">
                      ₹{selectedCourierObj.balance.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Amount Received */}
              <div>
                <label htmlFor="collect-amount" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Amount Received (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  id="collect-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  required
                  placeholder="e.g. 1500"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold text-neutral-900 bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="collect-notes" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Remarks / Handover Notes (Optional)
                </label>
                <input
                  id="collect-notes"
                  type="text"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  placeholder="e.g. Evening shift cash reconciliation"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  disabled={collectSubmitting}
                  className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                >
                  {collectSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Recording Handover...</span>
                    </>
                  ) : (
                    <span>Record Cash Collection</span>
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
