import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import DeliveryHeader from "../components/DeliveryHeader";
import SummaryBar from "../components/SummaryBar";
import DashboardCard from "../components/DashboardCard";
import DeliveryBottomNav from "../components/DeliveryBottomNav";
import { getDashboardStats } from "../../../services/api/delivery/deliveryService";
import { useDeliveryStatus } from "../context/DeliveryStatusContext";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function DeliveryDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isOnline, sellersInRangeCount, locationError } = useDeliveryStatus();
  const { user } = useAuth();
  const isPendingApproval = ((user as any)?.status ?? "Active") === "Inactive";
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const data = await getDashboardStats();
      setStats(data);
      setError("");

      if (isManualRefresh) {
        showToast("Dashboard telemetry refreshed", "success");
      }
    } catch (err: any) {
      console.error("Failed to load dashboard data", err);
      const errMsg = err.message || "Failed to load dashboard data";
      setError(errMsg);
      showToast(errMsg, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Icons for dashboard cards
  const pendingOrderIcon = (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 17H4L5 12H19L20 17H22M2 17C2 18.1046 2.89543 19 4 19C5.10457 19 6 18.1046 6 17M2 17C2 15.8954 2.89543 15 4 15C5.10457 15 6 15.8954 6 17M22 17C22 18.1046 21.1046 19 20 19C18.8954 19 18 18.1046 18 17M22 17C22 15.8954 21.1046 15 20 15C18.8954 15 18 15.8954 18 17M6 17H18M5 12L4 7H2M20 12L21 7H22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8 10H10M12 10H14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );

  const allOrderIcon = (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 17H4L5 12H19L20 17H22M2 17C2 18.1046 2.89543 19 4 19C5.10457 19 6 18.1046 6 17M2 17C2 15.8954 2.89543 15 4 15C5.10457 15 6 15.8954 6 17M22 17C22 18.1046 21.1046 19 20 19C18.8954 19 18 18.1046 18 17M22 17C22 15.8954 21.1046 15 20 15C18.8954 15 18 15.8954 18 17M6 17H18M5 12L4 7H2M20 12L21 7H22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect
        x="7"
        y="5"
        width="10"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <rect
        x="8"
        y="3"
        width="8"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );

  const returnOrderIcon = (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );

  const returnItemIcon = (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 12L7 8M3 12L7 16M3 12H21M21 12L17 8M21 12L17 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );

  const dailyCollectionIcon = (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <rect
        x="2"
        y="6"
        width="20"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M6 10H18M6 14H14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M9 17L11 19L15 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );

  const cashBalanceIcon = (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <rect
        x="2"
        y="6"
        width="20"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M6 10H18M6 14H14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle
        cx="16"
        cy="12"
        r="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );

  const earningIcon = (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <rect
        x="2"
        y="6"
        width="20"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M6 10H18M6 14H14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16 12H20M18 10V14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <DeliveryHeader />
        <div className="px-4 py-4 space-y-3 animate-pulse max-w-lg mx-auto">
          <div className="h-20 bg-slate-200 rounded-3xl" />
          <div className="h-24 bg-slate-200 rounded-3xl" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-28 bg-slate-200 rounded-3xl" />
            <div className="h-28 bg-slate-200 rounded-3xl" />
          </div>
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 bg-rose-50 text-rose-600 rounded-3xl border border-rose-200 max-w-sm">
          <p className="text-sm font-bold">{error}</p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          className="px-4 py-2 bg-rose-600 text-white rounded-2xl font-bold text-xs shadow-xs hover:bg-rose-700 transition-colors"
        >
          🔄 Try Again
        </button>
        <DeliveryBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      {/* Header */}
      <DeliveryHeader />

      {/* Pending admin approval banner */}
      {isPendingApproval && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-2xl text-xs font-bold shadow-2xs">
          ⚠️ <span className="underline">Pending Admin Approval</span>: Your account is under review. Full dispatch privileges will activate once approved.
        </div>
      )}

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Top Actions & Live Refresh */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-slate-900 text-lg font-black tracking-tight">Command Center</h2>
            <p className="text-[11px] text-slate-500 font-semibold">Real-time delivery telemetry</p>
          </div>

          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 active:scale-95 transition-all min-h-[40px]"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Daily Collection & Cash Balance Bar */}
        <SummaryBar
          leftIcon={dailyCollectionIcon}
          leftLabel="Daily Collection"
          leftValue={`₹ ${stats?.dailyCollection?.toLocaleString("en-IN") || "0"}`}
          rightIcon={cashBalanceIcon}
          rightLabel="Cash Balance"
          rightValue={`₹ ${stats?.cashBalance?.toFixed(2) || "0.00"}`}
          accentColor="#FFC94A"
        />

        {/* Wallet Balance Card */}
        <div
          onClick={() => navigate("/delivery/wallet")}
          className="bg-gradient-to-br from-rose-600 to-pink-700 rounded-3xl p-5 text-white shadow-xs cursor-pointer active:scale-[0.99] transition-all min-h-[44px]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-rose-100 text-xs font-bold uppercase tracking-wider">Available Wallet Balance</p>
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-xs">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-black">
              ₹ {stats?.walletBalance?.toFixed(2) || "0.00"}
            </p>
            <p className="text-rose-100 text-xs font-bold flex items-center gap-1">
              View Wallet
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </p>
          </div>
        </div>

        {/* Real-time Seller Radius Indicator */}
        <div
          onClick={() => isOnline && navigate("/delivery/sellers-in-range")}
          className={`p-4 rounded-3xl border cursor-pointer transition-all active:scale-[0.99] shadow-2xs min-h-[44px] ${
            isOnline ? "bg-rose-50/80 border-rose-200/80 hover:bg-rose-100/70" : "bg-white border-slate-200/80"
          }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-2xl ${
                  isOnline ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400"
                }`}>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div>
                <h3
                  className={`text-xs sm:text-sm font-black ${isOnline ? "text-rose-950" : "text-slate-700"}`}>
                  {isOnline ? "Active Service Areas" : "Courier Offline"}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  {isOnline
                    ? `You are within range of ${sellersInRangeCount} store${sellersInRangeCount !== 1 ? 's' : ''}`
                    : "Go online to receive incoming order alerts"}
                </p>
              </div>
            </div>
            {isOnline && (
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                </span>
                <span className="text-lg font-black text-rose-800">
                  {sellersInRangeCount}
                </span>
              </div>
            )}
          </div>
          {locationError && isOnline && (
            <div className="mt-2.5 p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {locationError}
            </div>
          )}
        </div>

        {/* Dashboard Cards Grid */}
        <div className="grid grid-cols-2 gap-3">
          <DashboardCard
            icon={pendingOrderIcon}
            title="Today's Pending Order"
            value={stats?.pendingOrders || 0}
            accentColor="#e11d48"
            onClick={() => navigate("/delivery/orders/pending")}
          />
          <DashboardCard
            icon={allOrderIcon}
            title="Today's All Order"
            value={stats?.allOrders || 0}
            accentColor="#ef4444"
            onClick={() => navigate("/delivery/orders/all")}
          />
          <DashboardCard
            icon={returnOrderIcon}
            title="Today's Return Order"
            value={stats?.returnOrders || 0}
            accentColor="#f97316"
            onClick={() => navigate("/delivery/orders/return")}
          />
          <DashboardCard
            icon={returnItemIcon}
            title="Total return item have"
            value={stats?.returnItems || 0}
            accentColor="#3b82f6"
          />
        </div>

        {/* Today's Earning & Total Earning Bar */}
        <SummaryBar
          leftIcon={earningIcon}
          leftLabel="Today's Earning"
          leftValue={`₹ ${stats?.todayEarning || 0}`}
          rightIcon={cashBalanceIcon}
          rightLabel="Total Earning"
          rightValue={`₹ ${stats?.totalEarning?.toFixed(2) || "0.00"}`}
          accentColor="#e11d48"
        />

        {/* Today's Pending Order Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-slate-900 text-sm font-black">
              Today's In-Flight Queue
            </h2>
            <button
              onClick={() => navigate("/delivery/orders/today")}
              className="text-xs font-bold text-rose-600 hover:underline min-h-[36px] flex items-center"
            >
              View all orders →
            </button>
          </div>

          {stats?.pendingOrdersList && stats.pendingOrdersList.length > 0 ? (
            <div className="space-y-2.5">
              {stats.pendingOrdersList.map((order: any) => (
                <div
                  key={order.id}
                  className="bg-white rounded-3xl p-4 shadow-2xs border border-slate-200/80 cursor-pointer active:scale-[0.99] transition-all min-h-[44px]"
                  onClick={() => navigate(`/delivery/orders/${order.id}`)}>
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <p className="text-slate-900 font-black text-xs sm:text-sm">
                        {order.orderId}
                      </p>
                      <p className="text-slate-500 text-xs font-medium mt-0.5">
                        {order.customerName}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        order.status === "Ready for pickup"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="text-slate-600 text-xs mb-2 font-medium line-clamp-1">
                    📍 {order.address}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <p className="text-slate-900 font-black">
                      ₹ {order.totalAmount}
                    </p>
                    {order.estimatedDeliveryTime && (
                      <p className="text-slate-400 text-[11px] font-medium">
                        ETA: {order.estimatedDeliveryTime}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 min-h-[160px] flex flex-col items-center justify-center text-center shadow-2xs border border-slate-200/80 space-y-1.5">
              <span className="text-2xl">📦</span>
              <p className="text-slate-700 text-xs font-bold">No in-flight orders</p>
              <p className="text-slate-400 text-[11px]">When orders are assigned to you, they will appear here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <DeliveryBottomNav />
    </div>
  );
}
