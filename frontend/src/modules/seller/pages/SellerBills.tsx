import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSellerBills,
  getBillById,
  cancelOfflineSale,
  BillData,
  BillSummaryStats,
} from "../../../services/api/orderService";
import { PrintableBillModal } from "../components/PrintableBillModal";
import { SellerPageHeader } from "../components/common/SellerPageHeader";
import { SellerStatCard } from "../components/common/SellerStatCard";
import { SellerTabs } from "../components/common/SellerTabs";
import { SellerDataTable, ColumnDef } from "../components/common/SellerDataTable";
import { SellerStatusBadge } from "../components/common/SellerStatusBadge";
import { SellerButton } from "../components/common/SellerButton";
import { useToast } from "../../../context/ToastContext";

export default function SellerBills() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [bills, setBills] = useState<any[]>([]);
  const [stats, setStats] = useState<BillSummaryStats>({
    totalRevenue: 0,
    totalBills: 0,
    cashSales: 0,
    upiSales: 0,
    cardSales: 0,
    onlineSales: 0,
    offlineSales: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Filters
  const [channel, setChannel] = useState<"ALL" | "ONLINE" | "OFFLINE">("ALL");
  const [paymentMethod, setPaymentMethod] = useState<string>("All");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Selected Bill for Reprint Modal
  const [selectedBill, setSelectedBill] = useState<BillData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [loadingBillId, setLoadingBillId] = useState<string | null>(null);

  // Cancel Offline Sale Modal State
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancellingBill, setCancellingBill] = useState<{ id: string; billNumber: string } | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // 300ms Search Debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSellerBills({
        channel,
        paymentMethod: paymentMethod === "All" ? undefined : paymentMethod,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: debouncedSearch || undefined,
        page,
        limit: 20,
      });

      if (res.success) {
        setBills(res.data || []);
        if (res.stats) setStats(res.stats);
        if (res.pagination) {
          setTotalPages(res.pagination.pages || 1);
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Failed to load bills";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [channel, paymentMethod, dateFrom, dateTo, debouncedSearch, page, showToast]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const handleOpenBillPrint = async (orderId: string) => {
    setLoadingBillId(orderId);
    try {
      const res = await getBillById(orderId);
      if (res.success && res.data) {
        setSelectedBill(res.data);
        setIsModalOpen(true);
      } else {
        showToast(res.message || "Failed to fetch bill details", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || "Failed to fetch bill details", "error");
    } finally {
      setLoadingBillId(null);
    }
  };

  const handleConfirmCancelSale = async () => {
    if (!cancellingBill) return;
    setIsCancelling(true);
    try {
      const res = await cancelOfflineSale(cancellingBill.id, cancelReason || "Customer return / cancelled by seller");
      if (res.success) {
        showToast(`Sale #${cancellingBill.billNumber} cancelled & stock restored!`, "success");
        setShowCancelModal(false);
        setCancellingBill(null);
        setCancelReason("");
        fetchBills();
      } else {
        showToast(res.message || "Failed to cancel sale", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || "Failed to cancel sale", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleExportCSV = () => {
    if (bills.length === 0) {
      showToast("No bills available to export", "info");
      return;
    }

    const headers = [
      "Bill Number",
      "Date",
      "Channel",
      "Customer Name",
      "Customer Phone",
      "Payment Mode",
      "Status",
      "Subtotal",
      "Tax",
      "Discount",
      "Total Amount",
    ];

    const rows = bills.map((b) => [
      `"${b.billNumber || b.orderNumber || b._id}"`,
      `"${b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-IN") : ""}"`,
      `"${b.channel || "OFFLINE"}"`,
      `"${b.customerName || "Walk-in Customer"}"`,
      `"${b.customerPhone || ""}"`,
      `"${b.paymentMethod || "Cash"}"`,
      `"${b.status || "Delivered"}"`,
      `"${(b.subtotal || 0).toFixed(2)}"`,
      `"${(b.tax || 0).toFixed(2)}"`,
      `"${(b.discount || 0).toFixed(2)}"`,
      `"${(b.totalAmount || b.total || 0).toFixed(2)}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Seller_Bills_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Tax invoices report exported successfully!", "success");
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Define Table Columns
  const columns: ColumnDef<any>[] = [
    {
      key: "billNumber",
      header: "Bill Number",
      render: (b) => (
        <div>
          <span
            onClick={() => navigate(`/seller/bills/${b._id}`)}
            className="font-bold text-purple-700 hover:text-purple-900 cursor-pointer block text-xs"
          >
            #{b.billNumber || b.orderId?.slice(-6).toUpperCase() || b._id?.slice(-6).toUpperCase()}
          </span>
          <span className="text-[10px] text-slate-400 block">{formatDate(b.createdAt)}</span>
        </div>
      ),
    },
    {
      key: "channel",
      header: "Channel",
      render: (b) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
            b.channel === "OFFLINE"
              ? "bg-purple-100 text-purple-800 border border-purple-200"
              : "bg-sky-100 text-sky-800 border border-sky-200"
          }`}
        >
          {b.channel === "OFFLINE" ? "Offline (POS)" : "Online Order"}
        </span>
      ),
    },
    {
      key: "customerName",
      header: "Customer",
      render: (b) => (
        <div>
          <span className="font-bold text-slate-900 block text-xs">{b.customerName || "Walk-in Customer"}</span>
          {b.customerPhone && <span className="text-[11px] text-slate-400 block">{b.customerPhone}</span>}
        </div>
      ),
    },
    {
      key: "paymentMethod",
      header: "Payment",
      render: (b) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          {b.paymentMethod || "Cash"}
        </span>
      ),
    },
    {
      key: "totalAmount",
      header: "Amount",
      render: (b) => (
        <div>
          <span className="font-black text-slate-900 text-xs block">
            ₹{Number(b.totalAmount || b.total || 0).toFixed(2)}
          </span>
          {b.discount > 0 && (
            <span className="text-[10px] text-emerald-600 font-bold block">Saved ₹{b.discount.toFixed(2)}</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => <SellerStatusBadge status={b.status || "Completed"} size="sm" />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (b) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => handleOpenBillPrint(b._id)}
            disabled={loadingBillId === b._id}
            className="p-2 rounded-xl text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Reprint Bill"
            aria-label={`Reprint Bill ${b.billNumber || b._id}`}
          >
            {loadingBillId === b._id ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-r-transparent" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/seller/bills/${b._id}`)}
            className="p-2 rounded-xl text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="View Details"
            aria-label={`View Details for ${b.billNumber || b._id}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {b.channel === "OFFLINE" && b.status !== "Cancelled" && (
            <button
              type="button"
              onClick={() => {
                setCancellingBill({ id: b._id, billNumber: b.billNumber || b._id.slice(-6).toUpperCase() });
                setShowCancelModal(true);
              }}
              className="p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Cancel Sale & Restore Stock"
              aria-label={`Cancel Sale ${b.billNumber || b._id}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <SellerPageHeader
        title="Bills & Invoices"
        subtitle="Manage, reprint, and track both Online and Offline in-store sales bills."
        breadcrumbs={[{ label: "Bills & Invoices" }]}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl min-h-[44px] transition-colors shadow-2xs"
            >
              <span>📥</span>
              <span>Export CSV</span>
            </button>
            <SellerButton
              variant="primary"
              size="md"
              onClick={() => navigate("/seller/pos")}
              className="min-h-[44px]"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              }
            >
              + Create New Bill (POS)
            </SellerButton>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SellerStatCard
          label="Total Revenue"
          value={`₹${stats.totalRevenue.toFixed(2)}`}
          variant="purple"
        />
        <SellerStatCard
          label="Total Bills"
          value={stats.totalBills}
          variant="default"
        />
        <SellerStatCard
          label="Cash Sales"
          value={`₹${stats.cashSales.toFixed(2)}`}
          variant="emerald"
        />
        <SellerStatCard
          label="UPI Sales"
          value={`₹${stats.upiSales.toFixed(2)}`}
          variant="default"
        />
        <SellerStatCard
          label="Card Sales"
          value={`₹${stats.cardSales.toFixed(2)}`}
          variant="default"
        />
        <SellerStatCard
          label="POS Sales"
          value={`₹${stats.offlineSales.toFixed(2)}`}
          variant="purple"
        />
      </div>

      {/* Channel Tabs & Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SellerTabs
            tabs={[
              { id: "ALL", label: "All Channels" },
              { id: "OFFLINE", label: "Offline (POS)" },
              { id: "ONLINE", label: "Online Orders" },
            ]}
            activeTab={channel}
            onChange={(tabId) => {
              setChannel(tabId as any);
              setPage(1);
            }}
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">Payment:</span>
            <select
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[40px]"
            >
              <option value="All">All Modes</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="COD">COD</option>
              <option value="Razorpay">Razorpay</option>
            </select>
          </div>
        </div>

        {/* Date and Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 items-center">
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-600 min-h-[44px]"
            />
          </div>
          <div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-600 min-h-[44px]"
            />
          </div>
          <div className="sm:col-span-2 flex gap-2 relative">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Bill #, Customer Name or Phone..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-600 min-h-[44px] pr-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-base"
                >
                  ×
                </button>
              )}
            </div>

            {(dateFrom || dateTo || search || paymentMethod !== "All" || channel !== "ALL") && (
              <SellerButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setSearch("");
                  setPaymentMethod("All");
                  setChannel("ALL");
                  setPage(1);
                }}
                className="min-h-[44px]"
              >
                Reset
              </SellerButton>
            )}
          </div>
        </div>
      </div>

      {/* Bills Data Table with Mobile Card View */}
      <SellerDataTable
        data={bills}
        columns={columns}
        keyExtractor={(b) => b._id}
        isLoading={loading}
        currentPage={page}
        totalPages={totalPages}
        onPageChange={(p) => setPage(p)}
        emptyTitle="No bills found"
        emptyDescription="There are no transaction bills matching your selected filters."
        renderMobileCard={(b) => (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-purple-700 text-sm block">
                  #{b.billNumber || b.orderId?.slice(-6).toUpperCase() || b._id?.slice(-6).toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-400">{formatDate(b.createdAt)}</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  b.channel === "OFFLINE" ? "bg-purple-100 text-purple-800" : "bg-sky-100 text-sky-800"
                }`}
              >
                {b.channel === "OFFLINE" ? "POS" : "Online"}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <div>
                <p className="font-bold text-slate-900">{b.customerName || "Walk-in Customer"}</p>
                <p className="text-slate-500">{b.paymentMethod || "Cash"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-900">
                  ₹{Number(b.totalAmount || b.total || 0).toFixed(2)}
                </p>
                <SellerStatusBadge status={b.status || "Completed"} size="sm" />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <SellerButton
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => handleOpenBillPrint(b._id)}
                className="min-h-[44px]"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                }
              >
                Print
              </SellerButton>
              <SellerButton
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => navigate(`/seller/bills/${b._id}`)}
                className="min-h-[44px]"
              >
                Details
              </SellerButton>
            </div>
          </div>
        )}
      />

      {/* Cancel Offline Sale Confirmation Modal */}
      {showCancelModal && cancellingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">Cancel Sale #{cancellingBill.billNumber}?</h3>
                <p className="text-xs text-slate-500">Inventory items will be restored automatically.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Cancellation Reason</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason for customer return or cancellation..."
                className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 outline-none focus:border-purple-600 min-h-[80px]"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancellingBill(null);
                }}
                disabled={isCancelling}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl min-h-[44px]"
              >
                Keep Bill
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelSale}
                disabled={isCancelling}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl min-h-[44px] transition-colors flex items-center gap-2"
              >
                {isCancelling ? "Cancelling..." : "Yes, Cancel & Restock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Bill Print Modal */}
      <PrintableBillModal
        bill={selectedBill}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedBill(null);
        }}
      />
    </div>
  );
}
