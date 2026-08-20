import React, { useState, useEffect } from "react";
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

export default function SellerBills() {
  const navigate = useNavigate();
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
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Selected Bill for Reprint Modal
  const [selectedBill, setSelectedBill] = useState<BillData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [loadingBillId, setLoadingBillId] = useState<string | null>(null);

  useEffect(() => {
    fetchBills();
  }, [channel, paymentMethod, dateFrom, dateTo, page]);

  const fetchBills = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSellerBills({
        channel,
        paymentMethod: paymentMethod === "All" ? undefined : paymentMethod,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
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
      setError(err?.response?.data?.message || err?.message || "Failed to load bills");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchBills();
  };

  const handleOpenBillPrint = async (orderId: string) => {
    setLoadingBillId(orderId);
    try {
      const res = await getBillById(orderId);
      if (res.success && res.data) {
        setSelectedBill(res.data);
        setIsModalOpen(true);
      } else {
        alert(res.message || "Failed to fetch bill details");
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || "Failed to fetch bill details");
    } finally {
      setLoadingBillId(null);
    }
  };

  const handleCancelOfflineSale = async (orderId: string) => {
    const reason = prompt("Please enter reason for cancelling this offline sale (stock will be restored):");
    if (reason === null) return;

    try {
      const res = await cancelOfflineSale(orderId, reason || "Customer return");
      if (res.success) {
        alert("Sale cancelled and stock restored successfully!");
        fetchBills();
      } else {
        alert(res.message || "Failed to cancel sale");
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || "Failed to cancel sale");
    }
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
            className="font-bold text-purple-700 hover:text-purple-900 cursor-pointer block"
          >
            #{b.billNumber || b.orderId?.slice(-6).toUpperCase()}
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
          <span className="font-bold text-slate-900 block">{b.customerName || "Walk-in Customer"}</span>
          {b.customerPhone && <span className="text-xs text-slate-400 block">{b.customerPhone}</span>}
        </div>
      ),
    },
    {
      key: "paymentMethod",
      header: "Payment",
      render: (b) => (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          {b.paymentMethod || "Cash"}
        </span>
      ),
    },
    {
      key: "totalAmount",
      header: "Amount",
      render: (b) => (
        <div>
          <span className="font-black text-slate-900 text-sm block">
            ₹{Number(b.totalAmount || b.total || 0).toFixed(2)}
          </span>
          {b.discount > 0 && (
            <span className="text-[10px] text-emerald-600 block">Saved ₹{b.discount.toFixed(2)}</span>
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
            onClick={() => handleOpenBillPrint(b._id)}
            disabled={loadingBillId === b._id}
            className="p-1.5 rounded-lg text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Reprint Bill"
          >
            {loadingBillId === b._id ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-600 border-r-transparent" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            )}
          </button>
          <button
            onClick={() => navigate(`/seller/bills/${b._id}`)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="View Details"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {b.channel === "OFFLINE" && b.status !== "Cancelled" && (
            <button
              onClick={() => handleCancelOfflineSale(b._id)}
              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Cancel Sale & Restore Stock"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <SellerButton
            variant="primary"
            size="md"
            onClick={() => navigate("/seller/pos")}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            }
          >
            + Create New Bill (POS)
          </SellerButton>
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
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[36px]"
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
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-600 min-h-[40px]"
            />
          </div>
          <div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-600 min-h-[40px]"
            />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Bill #, Customer Name or Phone..."
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-600 min-h-[40px]"
            />
            <SellerButton type="submit" variant="secondary" size="sm" className="min-h-[40px] px-4">
              Filter
            </SellerButton>
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
                className="min-h-[40px]"
              >
                Reset
              </SellerButton>
            )}
          </div>
        </form>
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
                  #{b.billNumber || b.orderId?.slice(-6).toUpperCase()}
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
              >
                Details
              </SellerButton>
            </div>
          </div>
        )}
      />

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
