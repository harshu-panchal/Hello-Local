import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import {
  getFinancialDashboard,
  getWalletTransactions,
  getAdminEarnings,
  type WalletStats,
  type WalletTransaction,
  type AdminEarning,
} from "../../../services/api/admin/adminWalletService";
import AdminWithdrawals from "./AdminWithdrawals";

export default function AdminWallet() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<
    "transactions" | "earnings" | "withdrawals"
  >("transactions");

  // Stats State
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Transactions State
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [trxLoading, setTrxLoading] = useState(false);
  const [trxFilter, setTrxFilter] = useState({ userType: "", type: "" });
  const [trxSearch, setTrxSearch] = useState("");
  const [debouncedTrxSearch, setDebouncedTrxSearch] = useState("");
  const [trxDateFrom, setTrxDateFrom] = useState("");
  const [trxDateTo, setTrxDateTo] = useState("");

  // Earnings State
  const [earnings, setEarnings] = useState<AdminEarning[]>([]);
  const [earnLoading, setEarnLoading] = useState(false);
  const [earnSearch, setEarnSearch] = useState("");

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTrxSearch(trxSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [trxSearch]);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const response = await getFinancialDashboard();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch financial stats", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchTransactions = useCallback(async () => {
    setTrxLoading(true);
    try {
      const response = await getWalletTransactions({
        userType: trxFilter.userType || undefined,
        type: trxFilter.type || undefined,
        search: debouncedTrxSearch || undefined,
        dateFrom: trxDateFrom || undefined,
        dateTo: trxDateTo || undefined,
      });
      if (response.success && Array.isArray(response.data)) {
        setTransactions(response.data);
      } else {
        setTransactions([]);
      }
    } catch (error: any) {
      console.error("Failed to load transactions", error);
      showToast("Failed to load transactions", "error");
      setTransactions([]);
    } finally {
      setTrxLoading(false);
    }
  }, [trxFilter, debouncedTrxSearch, trxDateFrom, trxDateTo, showToast]);

  const fetchEarnings = useCallback(async () => {
    setEarnLoading(true);
    try {
      const response = await getAdminEarnings();
      if (response.success && Array.isArray(response.data)) {
        setEarnings(response.data);
      } else {
        setEarnings([]);
      }
    } catch (error: any) {
      console.error("Failed to load earnings", error);
      showToast("Failed to load earnings", "error");
      setEarnings([]);
    } finally {
      setEarnLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === "transactions") {
      fetchTransactions();
    } else if (activeTab === "earnings") {
      fetchEarnings();
    }
  }, [activeTab, fetchTransactions, fetchEarnings]);

  const handleExportTransactions = () => {
    if (transactions.length === 0) {
      showToast("No transactions available to export", "info");
      return;
    }

    const headers = [
      "Transaction ID",
      "Date & Time",
      "User / Store Name",
      "User Type",
      "Type (Credit/Debit)",
      "Description",
      "Amount (₹)",
      "Order Ref",
    ];

    const csvContent = [
      headers.join(","),
      ...transactions.map((t: any) => {
        const userName = t.userName || (t.userId ? t.userId.storeName || t.userId.name : "Unknown");
        return [
          `"${t._id || t.id}"`,
          `"${new Date(t.createdAt).toLocaleString("en-IN")}"`,
          `"${userName.replace(/"/g, '""')}"`,
          `"${t.userType || ""}"`,
          `"${t.type}"`,
          `"${(t.description || "").replace(/"/g, '""')}"`,
          (t.amount || 0).toFixed(2),
          `"${t.relatedOrder?.orderNumber || t.reference || ""}"`,
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_wallet_transactions_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Wallet transactions exported successfully", "success");
  };

  const handleExportEarnings = () => {
    if (earnings.length === 0) {
      showToast("No earning records available to export", "info");
      return;
    }

    const headers = ["ID", "Date", "Source", "Description", "Status", "Commission (₹)"];
    const csvContent = [
      headers.join(","),
      ...earnings.map((e) =>
        [
          `"${e.id}"`,
          `"${new Date(e.date).toLocaleDateString("en-IN")}"`,
          `"${e.source}"`,
          `"${(e.description || "").replace(/"/g, '""')}"`,
          `"${e.status}"`,
          (e.amount || 0).toFixed(2),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_admin_earnings_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Admin earnings exported successfully", "success");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Finance & Wallet Operations
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Platform revenue ledger, commission settlement, and partner payout disbursements
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
          <span className="text-neutral-700 font-medium">Finance & Wallet</span>
        </nav>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Gross GMV */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200/80 flex items-start justify-between">
          <div>
            <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">
              Total Platform GMV
            </p>
            <h3 className="text-2xl font-bold font-mono text-neutral-900">
              ₹{(stats?.totalGMV || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-neutral-400 mt-1">Cumulative platform sales</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 text-blue-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
        </div>

        {/* Current Platform Balance */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200/80 flex items-start justify-between">
          <div>
            <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">
              Current Platform Balance
            </p>
            <h3 className="text-2xl font-bold font-mono text-rose-700">
              ₹{(stats?.currentAccountBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-neutral-400 mt-1">Available platform liquid reserve</p>
          </div>
          <div className="p-3 rounded-xl bg-rose-50 text-rose-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 7h-9a2 2 0 0 0-2 2v1m0 4v9a2 2 0 0 0 2 2h4" />
              <path d="M19 13h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" />
              <path d="M6 7H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h15v4H6.5" />
            </svg>
          </div>
        </div>

        {/* Total Admin Net Earnings */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200/80 flex items-start justify-between">
          <div>
            <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">
              Total Admin Earnings
            </p>
            <h3 className="text-2xl font-bold font-mono text-purple-700">
              ₹{(stats?.totalAdminEarnings || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-neutral-400 mt-1">Store commission + fees</p>
          </div>
          <div className="p-3 rounded-xl bg-purple-50 text-purple-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
        </div>

        {/* Seller Pending Balances */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200/80 flex items-start justify-between">
          <div>
            <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">
              Seller Pending Payouts
            </p>
            <h3 className="text-2xl font-bold font-mono text-orange-700">
              ₹{(stats?.sellerPendingPayouts || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-neutral-400 mt-1">Pending seller store balances</p>
          </div>
          <div className="p-3 rounded-xl bg-orange-50 text-orange-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>

        {/* Delivery Boy Pending Payouts */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200/80 flex items-start justify-between">
          <div>
            <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">
              Courier Pending Payouts
            </p>
            <h3 className="text-2xl font-bold font-mono text-indigo-700">
              ₹{(stats?.deliveryPendingPayouts || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-neutral-400 mt-1">Unwithdrawn courier earnings</p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>

        {/* Pending from Delivery Boy (COD) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200/80 flex items-start justify-between">
          <div>
            <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">
              Courier COD Debt
            </p>
            <h3 className="text-2xl font-bold font-mono text-amber-700">
              ₹{(stats?.pendingAmountFromDeliveryBoy || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-neutral-400 mt-1">Cash collected pending handover</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 text-amber-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Tabs Workspace */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden min-h-[500px]">
        {/* Tabs Bar */}
        <div className="flex border-b border-neutral-200 overflow-x-auto bg-neutral-50/50">
          <button
            type="button"
            onClick={() => setActiveTab("transactions")}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-bold transition-all whitespace-nowrap min-h-[44px] ${
              activeTab === "transactions"
                ? "text-rose-700 border-b-2 border-rose-700 bg-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <span>All Wallet Transactions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("earnings")}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-bold transition-all whitespace-nowrap min-h-[44px] ${
              activeTab === "earnings"
                ? "text-rose-700 border-b-2 border-rose-700 bg-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
            <span>Admin Commission Log</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("withdrawals")}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-bold transition-all whitespace-nowrap min-h-[44px] ${
              activeTab === "withdrawals"
                ? "text-rose-700 border-b-2 border-rose-700 bg-white"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 7h-9a2 2 0 0 0-2 2v1m0 4v9a2 2 0 0 0 2 2h4" />
              <path d="M19 13h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" />
              <path d="M6 7H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h15v4H6.5" />
            </svg>
            <span>Disbursement & Withdrawals</span>
            {stats?.pendingWithdrawalsCount ? (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                {stats.pendingWithdrawalsCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {/* TAB 1: ALL TRANSACTIONS */}
          {activeTab === "transactions" && (
            <div className="space-y-4">
              {/* Filter Controls Bar */}
              <div className="p-4 bg-neutral-50/70 border border-neutral-200/80 rounded-2xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* User Type */}
                  <div>
                    <label htmlFor="trxUserTypeSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      User Type
                    </label>
                    <select
                      id="trxUserTypeSelect"
                      value={trxFilter.userType}
                      onChange={(e) => setTrxFilter({ ...trxFilter, userType: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                    >
                      <option value="">All Users</option>
                      <option value="SELLER">Sellers Only</option>
                      <option value="DELIVERY_BOY">Delivery Partners Only</option>
                    </select>
                  </div>

                  {/* Transaction Type */}
                  <div>
                    <label htmlFor="trxTypeSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      Type
                    </label>
                    <select
                      id="trxTypeSelect"
                      value={trxFilter.type}
                      onChange={(e) => setTrxFilter({ ...trxFilter, type: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                    >
                      <option value="">All Types (Credit & Debit)</option>
                      <option value="Credit">Credit Only (+)</option>
                      <option value="Debit">Debit Only (-)</option>
                    </select>
                  </div>

                  {/* From Date */}
                  <div>
                    <label htmlFor="trxDateFrom" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      From Date
                    </label>
                    <input
                      id="trxDateFrom"
                      type="date"
                      value={trxDateFrom}
                      onChange={(e) => setTrxDateFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                    />
                  </div>

                  {/* To Date */}
                  <div>
                    <label htmlFor="trxDateTo" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      To Date
                    </label>
                    <input
                      id="trxDateTo"
                      type="date"
                      value={trxDateTo}
                      onChange={(e) => setTrxDateTo(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                    />
                  </div>

                  {/* Search Input */}
                  <div>
                    <label htmlFor="trxSearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      Search Description
                    </label>
                    <div className="relative">
                      <input
                        id="trxSearchInput"
                        type="text"
                        value={trxSearch}
                        onChange={(e) => setTrxSearch(e.target.value)}
                        placeholder="Search description, ref..."
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
                      {trxSearch && (
                        <button
                          type="button"
                          onClick={() => setTrxSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60">
                  {(trxFilter.userType || trxFilter.type || trxSearch || trxDateFrom || trxDateTo) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setTrxFilter({ userType: "", type: "" });
                        setTrxSearch("");
                        setTrxDateFrom("");
                        setTrxDateTo("");
                      }}
                      className="text-xs text-rose-700 hover:text-rose-800 font-bold"
                    >
                      × Reset all filters
                    </button>
                  ) : <div />}

                  <button
                    type="button"
                    onClick={handleExportTransactions}
                    disabled={transactions.length === 0}
                    className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px] disabled:opacity-50"
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

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Beneficiary</th>
                      <th className="py-3 px-3 text-center">Type</th>
                      <th className="py-3 px-4">Description / Reference</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-xs">
                    {trxLoading ? (
                      [1, 2, 3, 4].map((i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-28" /></td>
                          <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-32" /></td>
                          <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                          <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-48" /></td>
                          <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                        </tr>
                      ))
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 px-4 text-center">
                          <p className="text-sm font-bold text-neutral-800">No transactions found</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Transaction ledger entries will appear here
                          </p>
                        </td>
                      </tr>
                    ) : (
                      transactions.map((trx: any) => {
                        const userName = trx.userName || (trx.userId ? trx.userId.storeName || trx.userId.sellerName || trx.userId.name : "Partner");
                        const isCredit = trx.type === "Credit";

                        return (
                          <tr key={trx._id || trx.id} className="hover:bg-neutral-50/80 transition-colors">
                            <td className="py-3 px-4 font-mono text-neutral-600">
                              {new Date(trx.createdAt).toLocaleString("en-IN")}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-neutral-900">{userName}</div>
                              <div className="text-[10px] text-neutral-400 uppercase font-semibold">
                                {trx.userType}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isCredit
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-red-50 text-red-700 border border-red-200"
                                }`}
                              >
                                {trx.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-neutral-700">
                              <div>{trx.description}</div>
                              {trx.relatedOrder?.orderNumber && (
                                <span className="text-[10px] font-mono text-neutral-400">
                                  Order #{trx.relatedOrder.orderNumber}
                                </span>
                              )}
                            </td>
                            <td
                              className={`py-3 px-4 text-right font-mono font-bold ${
                                isCredit ? "text-emerald-700" : "text-red-600"
                              }`}
                            >
                              {isCredit ? "+" : "-"}₹{(trx.amount || 0).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: ADMIN EARNINGS */}
          {activeTab === "earnings" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2">
                <h3 className="text-sm font-bold text-neutral-800">
                  Platform Commission & Fee Ledger
                </h3>
                <button
                  type="button"
                  onClick={handleExportEarnings}
                  disabled={earnings.length === 0}
                  className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px] disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[650px]">
                  <thead>
                    <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Commission Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-xs">
                    {earnLoading ? (
                      [1, 2, 3].map((i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-24" /></td>
                          <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-28" /></td>
                          <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-48" /></td>
                          <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                          <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                        </tr>
                      ))
                    ) : earnings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 px-4 text-center">
                          <p className="text-sm font-bold text-neutral-800">No earning records found</p>
                        </td>
                      </tr>
                    ) : (
                      earnings.map((earning) => (
                        <tr key={earning.id} className="hover:bg-neutral-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-neutral-600">
                            {new Date(earning.date).toLocaleDateString("en-IN")}
                          </td>
                          <td className="py-3 px-4 font-bold text-neutral-900">{earning.source}</td>
                          <td className="py-3 px-4 text-neutral-600">{earning.description}</td>
                          <td className="py-3 px-3 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              {earning.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                            ₹{(earning.amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: WITHDRAWAL REQUESTS */}
          {activeTab === "withdrawals" && <AdminWithdrawals />}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Financial Clearinghouse & Ledger
      </footer>
    </div>
  );
}
