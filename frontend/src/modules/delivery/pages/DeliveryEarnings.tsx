import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import DeliveryHeader from "../components/DeliveryHeader";
import DeliveryBottomNav from "../components/DeliveryBottomNav";
import { useToast } from "../../../context/ToastContext";
import {
  getDashboardStats,
  getEarningsHistory,
  requestWithdrawal,
  DeliveryDashboardStats,
} from "../../../services/api/delivery/deliveryService";

export default function DeliveryEarnings() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [stats, setStats] = useState<DeliveryDashboardStats | null>(null);
  const [earningsHistory, setEarningsHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [error, setError] = useState("");

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      const [statsData, historyData] = await Promise.all([
        getDashboardStats(),
        getEarningsHistory(),
      ]);
      setStats(statsData);
      setEarningsHistory(historyData || []);

      if (isManualRefresh) {
        showToast("Earnings telemetry refreshed", "success");
      }
    } catch (err: any) {
      const msg = err.message || "Failed to load earnings data";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalDeliveries = earningsHistory.reduce(
    (sum, day) => sum + (day.deliveries || 0),
    0,
  );

  const handleWithdraw = async () => {
    try {
      const amount = parseFloat(withdrawAmount);
      if (!amount || isNaN(amount) || amount <= 0) {
        showToast("Please enter a valid withdrawal amount", "error");
        return;
      }

      if (stats?.walletBalance !== undefined && amount > stats.walletBalance) {
        showToast("Withdrawal amount cannot exceed available balance", "error");
        return;
      }

      setIsWithdrawing(true);
      await requestWithdrawal(amount);
      showToast("Withdrawal request submitted successfully", "success");
      setWithdrawAmount("");
      fetchData(true);
    } catch (err: any) {
      showToast(err.message || "Failed to request withdrawal", "error");
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <DeliveryHeader />
        <div className="px-4 py-4 space-y-3 animate-pulse max-w-lg mx-auto">
          <div className="h-8 bg-slate-200 rounded-xl w-1/3" />
          <div className="h-36 bg-slate-200 rounded-3xl" />
          <div className="h-28 bg-slate-200 rounded-2xl" />
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  const availableBal = stats?.walletBalance || 0;

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <DeliveryHeader />
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Header with Live Refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700"
              aria-label="Go back"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>
            <h2 className="text-slate-900 text-xl font-black tracking-tight">Earnings Overview</h2>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 active:scale-95 transition-all min-h-[40px]"
          >
            <span className={refreshing ? "animate-spin" : ""}>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center">
            {error}
          </div>
        )}

        {/* Current Wallet Balance Card */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-md space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-emerald-100 text-xs font-bold uppercase tracking-wider">Available For Withdrawal</p>
            <div className="bg-white/20 p-2 rounded-xl text-white">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-black tracking-tight">
            ₹{availableBal.toFixed(2)}
          </p>
          <div className="flex items-center justify-between pt-1 text-xs text-emerald-100 font-medium">
            <span>Ready for instant bank transfer</span>
            <button
              onClick={() => navigate("/delivery/wallet")}
              className="underline font-bold hover:text-white"
            >
              Open Full Wallet →
            </button>
          </div>
        </div>

        {/* 30-Day & Today's Earnings Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">30-Day Earnings</p>
            <p className="text-xl font-black text-slate-900">
              ₹{Number(stats?.totalEarning || 0).toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              {totalDeliveries} deliveries
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Today's Earnings</p>
            <p className="text-xl font-black text-emerald-600">
              ₹{Number(stats?.todayEarning || 0).toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              {stats?.todayDeliveredCount || 0} drops completed
            </p>
          </div>
        </div>

        {/* Earnings History */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-slate-900 font-black text-sm">Recent Daily Earnings</h3>
            <span className="text-xs text-slate-400 font-medium">Past 7 Active Days</span>
          </div>
          <div className="divide-y divide-slate-100">
            {earningsHistory.length > 0 ? (
              earningsHistory.map((day, index) => (
                <div
                  key={index}
                  className="p-3.5 flex justify-between items-center hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-slate-900 text-xs font-bold">
                      {day.date}
                    </p>
                    <p className="text-slate-400 text-[10px] font-medium mt-0.5">
                      {day.deliveries} {day.deliveries === 1 ? "delivery" : "deliveries"}
                    </p>
                  </div>
                  <p className="text-slate-900 text-sm font-black">
                    ₹{Number(day.amount || 0).toFixed(2)}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No recent daily earnings recorded
              </div>
            )}
          </div>
        </div>

        {/* Quick Withdraw Card */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 p-5 space-y-3">
          <div>
            <h3 className="text-slate-900 font-black text-sm">
              ⚡ Quick Payout Withdrawal
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Transfer your delivery commissions to your bank account or UPI ID.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Amount to Withdraw
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                ₹
              </span>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-300 rounded-2xl pl-8 pr-4 py-2.5 text-slate-900 font-black text-base focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none min-h-[44px]"
                min="0"
                step="0.01"
              />
            </div>

            {/* Quick Preset Amount Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[200, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setWithdrawAmount(preset.toString())}
                  className="px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors min-h-[32px]"
                >
                  ₹{preset}
                </button>
              ))}
              {availableBal > 0 && (
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(availableBal.toString())}
                  className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors min-h-[32px]"
                >
                  Max (₹{availableBal.toFixed(2)})
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleWithdraw}
            disabled={isWithdrawing || !withdrawAmount}
            className="w-full bg-emerald-600 text-white rounded-2xl py-3.5 font-black text-xs sm:text-sm hover:bg-emerald-700 transition-all shadow-xs active:scale-98 disabled:opacity-50 min-h-[44px]"
          >
            {isWithdrawing ? "Processing..." : "Submit Payout Request"}
          </button>
        </div>
      </div>
      <DeliveryBottomNav />
    </div>
  );
}
