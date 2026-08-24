import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "../../../context/ToastContext";
import {
  getWithdrawalRequests,
  processWithdrawal,
  type WithdrawalRequest,
} from "../../../services/api/admin/adminWalletService";

export default function AdminWithdrawals() {
  const { showToast } = useToast();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [statusFilter, setStatusFilter] = useState("all");
  const [userTypeFilter, setUserTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRequests, setTotalRequests] = useState(0);

  // Processing Modals State
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [transactionRef, setTransactionRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch withdrawals
  const fetchWithdrawals = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: 20,
        status: statusFilter === "all" ? undefined : statusFilter,
        userType: userTypeFilter === "all" ? undefined : userTypeFilter,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };

      const response = await getWithdrawalRequests(params);
      if (response.success && response.data) {
        const data = response.data;
        if (Array.isArray(data)) {
          setWithdrawals(data);
          setTotalRequests(data.length);
        } else if (data && typeof data === "object" && "requests" in data) {
          setWithdrawals(data.requests || []);
          if (data.pagination) {
            setTotalPages(data.pagination.pages || 1);
            setTotalRequests(data.pagination.total || 0);
          }
        } else {
          setWithdrawals([]);
        }
      }
    } catch (error: any) {
      console.error("Failed to load withdrawals:", error);
      showToast(
        error.response?.data?.message || "Failed to load withdrawal requests",
        "error"
      );
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    statusFilter,
    userTypeFilter,
    debouncedSearch,
    dateFrom,
    dateTo,
    showToast,
  ]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const handleApprove = async (withdrawal: WithdrawalRequest) => {
    const id = withdrawal._id || withdrawal.id;
    try {
      setActioningId(id);
      setIsProcessing(true);
      const response = await processWithdrawal({
        requestId: id,
        action: "Approve",
      });
      if (response.success) {
        showToast(
          `Withdrawal request of ₹${withdrawal.amount.toFixed(2)} approved successfully!`,
          "success"
        );
        fetchWithdrawals();
      } else {
        showToast(response.message || "Failed to approve withdrawal", "error");
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to approve withdrawal",
        "error"
      );
    } finally {
      setIsProcessing(false);
      setActioningId(null);
    }
  };

  const handleOpenRejectModal = (withdrawal: WithdrawalRequest) => {
    setSelectedWithdrawal(withdrawal);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!selectedWithdrawal) return;
    const id = selectedWithdrawal._id || selectedWithdrawal.id;

    try {
      setIsProcessing(true);
      const response = await processWithdrawal({
        requestId: id,
        action: "Reject",
        remark: rejectReason.trim() || "Rejected by platform admin",
      });
      if (response.success) {
        showToast("Withdrawal request rejected and wallet hold released", "success");
        setShowRejectModal(false);
        setSelectedWithdrawal(null);
        setRejectReason("");
        fetchWithdrawals();
      } else {
        showToast(response.message || "Failed to reject withdrawal", "error");
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to reject withdrawal",
        "error"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenCompleteModal = (withdrawal: WithdrawalRequest) => {
    setSelectedWithdrawal(withdrawal);
    setTransactionRef("");
    setShowCompleteModal(true);
  };

  const confirmComplete = async () => {
    if (!selectedWithdrawal || !transactionRef.trim()) {
      showToast("Bank Transaction Reference / UTR is required", "error");
      return;
    }
    const id = selectedWithdrawal._id || selectedWithdrawal.id;

    try {
      setIsProcessing(true);
      const response = await processWithdrawal({
        requestId: id,
        action: "Complete",
        transactionReference: transactionRef.trim(),
      });
      if (response.success) {
        showToast("Withdrawal payout completed successfully!", "success");
        setShowCompleteModal(false);
        setSelectedWithdrawal(null);
        setTransactionRef("");
        fetchWithdrawals();
      } else {
        showToast(response.message || "Failed to complete withdrawal", "error");
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to complete withdrawal",
        "error"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter("all");
    setUserTypeFilter("all");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  const handleExport = () => {
    if (withdrawals.length === 0) {
      showToast("No withdrawal requests to export", "info");
      return;
    }

    const headers = [
      "Request ID",
      "User Type",
      "User / Store Name",
      "Email",
      "Mobile",
      "Amount (₹)",
      "Status",
      "Payment Method",
      "Bank Account / Details",
      "Transaction UTR Ref",
      "Remarks",
      "Requested Date",
    ];

    const csvContent = [
      headers.join(","),
      ...withdrawals.map((w: any) => {
        const u = typeof w.userId === "object" && w.userId ? w.userId : {};
        const userName = u.storeName || u.sellerName || u.name || w.userName || "Partner";
        const email = u.email || w.userEmail || "";
        const mobile = u.mobile || "";

        return [
          `"${w._id || w.id}"`,
          `"${w.userType || "SELLER"}"`,
          `"${userName.replace(/"/g, '""')}"`,
          `"${email}"`,
          `"${mobile}"`,
          (w.amount || 0).toFixed(2),
          `"${w.status}"`,
          `"${w.paymentMethod || "Bank Transfer"}"`,
          `"${(w.accountDetails || "").replace(/"/g, '""')}"`,
          `"${w.transactionReference || ""}"`,
          `"${(w.remarks || w.remark || "").replace(/"/g, '""')}"`,
          `"${new Date(w.createdAt || w.requestDate).toLocaleDateString("en-IN")}"`,
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_withdrawals_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Withdrawal requests exported successfully", "success");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Approved":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Rejected":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-neutral-50 text-neutral-700 border-neutral-200";
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Banner & Status Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-neutral-100">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["all", "Pending", "Approved", "Completed", "Rejected"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap min-h-[36px] ${
                statusFilter === st
                  ? "bg-rose-700 text-white shadow-sm"
                  : "bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200"
              }`}
            >
              {st === "all" ? "All Requests" : st}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={withdrawals.length === 0}
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

      {/* Filter Bar */}
      <div className="p-4 bg-neutral-50/70 border border-neutral-200/80 rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* User Type */}
          <div>
            <label htmlFor="withdrawalUserType" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
              User Type
            </label>
            <select
              id="withdrawalUserType"
              value={userTypeFilter}
              onChange={(e) => {
                setUserTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
            >
              <option value="all">All User Types</option>
              <option value="SELLER">Sellers Only</option>
              <option value="DELIVERY_BOY">Delivery Partners Only</option>
            </select>
          </div>

          {/* From Date */}
          <div>
            <label htmlFor="withdrawalDateFrom" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
              From Date
            </label>
            <input
              id="withdrawalDateFrom"
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
            <label htmlFor="withdrawalDateTo" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
              To Date
            </label>
            <input
              id="withdrawalDateTo"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
            />
          </div>

          {/* Search Input */}
          <div>
            <label htmlFor="withdrawalSearch" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
              Search Beneficiary
            </label>
            <div className="relative">
              <input
                id="withdrawalSearch"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, store, bank info..."
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
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {(userTypeFilter !== "all" || searchQuery || dateFrom || dateTo || statusFilter !== "all") && (
          <div className="pt-2 border-t border-neutral-200/60">
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-xs text-rose-700 hover:text-rose-800 font-bold"
            >
              × Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Withdrawals List Cards */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-rose-700 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-neutral-200/80">
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <p className="text-sm font-bold text-neutral-800">No withdrawal requests found</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {searchQuery || dateFrom || dateTo
                ? "No requests match your filter criteria"
                : "Partner withdrawal disbursements will appear here"}
            </p>
          </div>
        ) : (
          withdrawals.map((withdrawal: any) => {
            const u = typeof withdrawal.userId === "object" && withdrawal.userId ? withdrawal.userId : {};
            const displayName = u.storeName || u.sellerName || u.name || withdrawal.userName || "Partner";
            const displayMobile = u.mobile || "";
            const displayEmail = u.email || withdrawal.userEmail || "";
            const isSeller = withdrawal.userType === "SELLER";
            const wid = withdrawal._id || withdrawal.id;

            return (
              <div
                key={wid}
                className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5 space-y-4 hover:border-neutral-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900 text-sm sm:text-base">
                        {displayName}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSeller ? "bg-rose-50 text-rose-700" : "bg-purple-50 text-purple-700"
                        }`}
                      >
                        {isSeller ? "🏪 Seller" : "🛵 Delivery Partner"}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(
                          withdrawal.status
                        )}`}
                      >
                        {withdrawal.status}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {displayMobile && <span>📞 {displayMobile}</span>}
                      {displayEmail && <span>✉️ {displayEmail}</span>}
                      <span>
                        📅 {new Date(withdrawal.createdAt || withdrawal.requestDate).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-xs text-neutral-500 font-medium">Requested Amount</div>
                    <div className="text-xl sm:text-2xl font-mono font-bold text-neutral-900">
                      ₹{(withdrawal.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Bank / Account Info Box */}
                <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
                  <div className="font-bold text-neutral-900 text-[11px] uppercase tracking-wider">
                    💳 Payment Destination ({withdrawal.paymentMethod || "Bank Transfer"})
                  </div>
                  <p className="font-mono text-neutral-800">{withdrawal.accountDetails}</p>
                  {withdrawal.transactionReference && (
                    <p className="text-emerald-700 font-mono text-[11px] pt-1">
                      ✅ Bank UTR Reference: <span className="font-bold">{withdrawal.transactionReference}</span>
                    </p>
                  )}
                  {withdrawal.remarks && (
                    <p className="text-neutral-500 italic text-[11px]">Note: {withdrawal.remarks}</p>
                  )}
                </div>

                {/* Actions Bar */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  {withdrawal.status === "Pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenRejectModal(withdrawal)}
                        disabled={isProcessing && actioningId === wid}
                        className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(withdrawal)}
                        disabled={isProcessing && actioningId === wid}
                        className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                      >
                        {isProcessing && actioningId === wid ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Approving...</span>
                          </>
                        ) : (
                          <span>Approve Payout</span>
                        )}
                      </button>
                    </>
                  )}

                  {withdrawal.status === "Approved" && (
                    <button
                      type="button"
                      onClick={() => handleOpenCompleteModal(withdrawal)}
                      disabled={isProcessing}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                    >
                      <span>Mark as Transferred / Complete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rejection Modal Dialog */}
      {showRejectModal && selectedWithdrawal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-base">
                  Reject Withdrawal Request
                </h3>
                <p className="text-xs text-neutral-500">
                  Amount ₹{(selectedWithdrawal.amount || 0).toFixed(2)} will be refunded back to partner wallet.
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="rejectReasonTextarea" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Reason for Rejection
              </label>
              <textarea
                id="rejectReasonTextarea"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Incorrect IFSC code, KYC name mismatch, bank account closed..."
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none resize-none min-h-[44px]"
              />
            </div>

            {/* Quick Reason Templates */}
            <div className="flex flex-wrap gap-1.5">
              {[
                "Incorrect IFSC / Account Number",
                "Account Holder Name Mismatch",
                "KYC Verification Incomplete",
                "Bank Account Inactive",
              ].map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => setRejectReason(tpl)}
                  className="text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-2 py-1 rounded-lg transition-colors font-medium"
                >
                  + {tpl}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedWithdrawal(null);
                }}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={isProcessing}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
              >
                {isProcessing ? (
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
      )}

      {/* Complete Payout Modal Dialog */}
      {showCompleteModal && selectedWithdrawal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-base">
                  Complete Withdrawal Transfer
                </h3>
                <p className="text-xs text-neutral-500">
                  Enter the banking UTR or IMPS reference for this disbursement.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <div className="flex justify-between font-semibold">
                <span>Disbursement Amount:</span>
                <span className="font-mono font-bold text-neutral-900">
                  ₹{(selectedWithdrawal.amount || 0).toFixed(2)}
                </span>
              </div>
              <p className="text-neutral-500 font-mono text-[11px]">
                {selectedWithdrawal.accountDetails}
              </p>
            </div>

            <div>
              <label htmlFor="transactionRefInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Bank UTR / Transaction Reference <span className="text-red-500">*</span>
              </label>
              <input
                id="transactionRefInput"
                type="text"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g. UTR1234567890 / IMPS882190"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  setShowCompleteModal(false);
                  setSelectedWithdrawal(null);
                  setTransactionRef("");
                }}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmComplete}
                disabled={isProcessing || !transactionRef.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
              >
                {isProcessing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Mark as Transferred</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
