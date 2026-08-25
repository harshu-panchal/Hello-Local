import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useToast } from "../../../context/ToastContext";
import {
  getDeliveryWalletBalance,
  getDeliveryWalletTransactions,
  requestDeliveryWithdrawal,
  getDeliveryWithdrawals,
  getDeliveryCommissions,
  createAdminPayoutOrder,
  verifyAdminPayout,
} from "../../../services/api/deliveryWalletService";

type Tab = "transactions" | "withdrawals" | "commissions";

export default function DeliveryWallet() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [balance, setBalance] = useState(0);
  const [pendingAdminPayout, setPendingAdminPayout] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any>({
    commissions: [],
    total: 0,
    paid: 0,
    pending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"Bank Transfer" | "UPI">(
    "Bank Transfer",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchWalletData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const [balanceRes, transactionsRes, withdrawalsRes, commissionsRes] =
        await Promise.all([
          getDeliveryWalletBalance(),
          getDeliveryWalletTransactions(),
          getDeliveryWithdrawals(),
          getDeliveryCommissions(),
        ]);

      if (balanceRes.success) {
        setBalance(balanceRes.data.balance || 0);
        setPendingAdminPayout(balanceRes.data.pendingAdminPayout || 0);
      }
      if (transactionsRes.success)
        setTransactions(transactionsRes.data.transactions || []);
      if (withdrawalsRes.success) setWithdrawals(withdrawalsRes.data || []);
      if (commissionsRes.success) setCommissions(commissionsRes.data);

      if (isManualRefresh) {
        showToast("Wallet balances & ledgers refreshed", "success");
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to load wallet data",
        "error",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchWalletData();
    // Load Razorpay script
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [fetchWalletData]);

  const handleWithdrawRequest = async () => {
    try {
      const amount = parseFloat(withdrawAmount);
      if (isNaN(amount) || amount <= 0) {
        showToast("Please enter a valid amount", "error");
        return;
      }

      if (amount > balance) {
        showToast("Withdrawal amount cannot exceed available balance", "error");
        return;
      }

      setIsSubmitting(true);
      const response = await requestDeliveryWithdrawal(amount, paymentMethod);
      if (response.success) {
        showToast("Withdrawal request submitted successfully", "success");
        setShowWithdrawModal(false);
        setWithdrawAmount("");
        fetchWalletData(true);
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to request withdrawal",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayToAdmin = async () => {
    if (pendingAdminPayout <= 0) {
      showToast("No pending COD collection amount to pay", "info");
      return;
    }

    try {
      setIsSubmitting(true);
      const orderRes = await createAdminPayoutOrder(pendingAdminPayout);

      if (!orderRes.success) {
        showToast(orderRes.message || "Failed to create payout order", "error");
        return;
      }

      const { razorpayOrderId, razorpayKey, amount, currency } = orderRes.data;

      const options = {
        key: razorpayKey,
        amount: amount,
        currency: currency,
        name: "Hello Local",
        description: "Admin Payout for COD Collections",
        order_id: razorpayOrderId,
        handler: async (response: any) => {
          try {
            const verifyRes = await verifyAdminPayout({
              razorpayOrderId: razorpayOrderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              amount: pendingAdminPayout,
            });

            if (verifyRes.success) {
              showToast("COD settlement to admin successful!", "success");
              fetchWalletData(true);
            } else {
              showToast(
                verifyRes.message || "Payment verification failed",
                "error",
              );
            }
          } catch (error: any) {
            showToast(error.message || "Verification failed", "error");
          }
        },
        prefill: {
          name: "Delivery Partner",
        },
        theme: {
          color: "#16a34a",
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (error: any) {
      showToast(error.message || "Payment initiation failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 pb-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header with Live Refresh */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
        <div className="px-4 py-3 flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700"
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
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Delivery Wallet</h1>
          </div>

          <button
            onClick={() => fetchWalletData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-100 active:scale-95 transition-all min-h-[40px]"
          >
            <span className={refreshing ? "animate-spin" : ""}>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto space-y-4 pt-4 px-4">
        {/* Available Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-rose-600 to-pink-700 rounded-3xl p-6 text-white shadow-md relative overflow-hidden space-y-4"
        >
          <div className="relative z-10 flex items-center justify-between">
            <p className="text-rose-100 text-xs font-bold uppercase tracking-wider">
              Available For Payout
            </p>
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

          <h1 className="text-4xl sm:text-5xl font-black relative z-10 tracking-tight">
            ₹{balance.toFixed(2)}
          </h1>

          <button
            onClick={() => setShowWithdrawModal(true)}
            className="w-full bg-white text-rose-700 py-3.5 rounded-2xl font-black text-sm hover:bg-rose-50 transition-all shadow-sm active:scale-[0.98] min-h-[44px] relative z-10"
          >
            ⚡ Request Payout Withdrawal
          </button>

          {/* Decorative shapes */}
          <div className="absolute -right-8 -top-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="absolute -left-8 -bottom-8 w-36 h-36 bg-pink-400/20 rounded-full blur-2xl pointer-events-none"></div>
        </motion.div>

        {/* Admin Payout Card (COD Collection Debt) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white border border-rose-100 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                COD Collections To Remit
              </p>
              <p className="text-[11px] text-rose-600 font-medium">
                Cash collected from customers pending admin payment
              </p>
            </div>
            <div className="bg-rose-50 p-2.5 rounded-2xl text-rose-600">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <polyline points="16 11 18 13 22 9" />
              </svg>
            </div>
          </div>

          <h2 className="text-3xl font-black text-slate-900">
            ₹{pendingAdminPayout.toFixed(2)}
          </h2>

          <button
            onClick={handlePayToAdmin}
            disabled={isSubmitting || pendingAdminPayout <= 0}
            className={`w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm transition-all shadow-xs active:scale-[0.98] flex items-center justify-center min-h-[44px] ${
              pendingAdminPayout > 0
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
            }`}
          >
            {isSubmitting ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              "💳 Pay Admin via Razorpay"
            )}
          </button>
        </motion.div>

        {/* Commission Summary KPI Cards */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl p-3.5 shadow-2xs border border-slate-200/80 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total Earned</p>
            <p className="text-sm sm:text-base font-black text-slate-900">
              ₹{Number(commissions.total || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-3.5 shadow-2xs border border-slate-200/80 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Paid Out</p>
            <p className="text-sm sm:text-base font-black text-rose-600">
              ₹{Number(commissions.paid || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-3.5 shadow-2xs border border-slate-200/80 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pending</p>
            <p className="text-sm sm:text-base font-black text-amber-600">
              ₹{Number(commissions.pending || 0).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Tabs & Ledgers */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 overflow-hidden">
          <div className="flex border-b border-slate-100 bg-slate-50/50 p-1 gap-1">
            <button
              onClick={() => setActiveTab("transactions")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all min-h-[40px] ${
                activeTab === "transactions"
                  ? "bg-white text-rose-700 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Transactions
            </button>
            <button
              onClick={() => setActiveTab("withdrawals")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all min-h-[40px] ${
                activeTab === "withdrawals"
                  ? "bg-white text-rose-700 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Withdrawals
            </button>
            <button
              onClick={() => setActiveTab("commissions")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all min-h-[40px] ${
                activeTab === "commissions"
                  ? "bg-white text-rose-700 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Commissions
            </button>
          </div>

          <div className="p-4">
            {/* Transactions Tab */}
            {activeTab === "transactions" && (
              <div className="space-y-2.5">
                {transactions.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-8 font-medium">
                    No transactions recorded yet
                  </p>
                ) : (
                  transactions.map((txn: any) => (
                    <div
                      key={txn._id}
                      className="flex justify-between items-start p-3 bg-slate-50 rounded-2xl border border-slate-100"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-bold text-xs text-slate-900 truncate">
                          {txn.description}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                          {new Date(txn.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <p
                        className={`font-black text-sm ${
                          txn.type === "Credit" ? "text-rose-600" : "text-slate-600"
                        }`}
                      >
                        {txn.type === "Credit" ? "+" : "-"}₹
                        {Number(txn.amount || 0).toFixed(2)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Withdrawals Tab */}
            {activeTab === "withdrawals" && (
              <div className="space-y-2.5">
                {withdrawals.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-8 font-medium">
                    No withdrawal requests yet
                  </p>
                ) : (
                  withdrawals.map((withdrawal: any) => (
                    <div
                      key={withdrawal._id}
                      className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-sm text-slate-900">
                            ₹{Number(withdrawal.amount || 0).toFixed(2)}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {withdrawal.paymentMethod}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            withdrawal.status === "Completed"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : withdrawal.status === "Approved"
                                ? "bg-blue-100 text-blue-800"
                                : withdrawal.status === "Rejected"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {withdrawal.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {new Date(withdrawal.createdAt).toLocaleDateString(
                          "en-IN",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </p>
                      {withdrawal.remarks && (
                        <p className="text-[11px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200">
                          {withdrawal.remarks}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Commissions Tab */}
            {activeTab === "commissions" && (
              <div className="space-y-2.5">
                {commissions.commissions?.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-8 font-medium">
                    No commissions recorded yet
                  </p>
                ) : (
                  commissions.commissions?.map((comm: any) => (
                    <div key={comm.id || comm._id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-xs text-slate-900">
                            Delivery Commission
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Rate: {comm.rate}% • Order: ₹{Number(comm.orderAmount || 0).toFixed(2)}
                          </p>
                        </div>
                        <p className="font-black text-sm text-rose-600">
                          +₹{Number(comm.amount || 0).toFixed(2)}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {new Date(comm.createdAt).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Withdrawal Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4"
          >
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Request Payout Withdrawal</h2>
              <p className="text-xs text-slate-500 font-medium">
                Funds will be transferred to your registered bank account / UPI ID.
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
                  className="w-full border border-slate-300 rounded-2xl pl-8 pr-4 py-2.5 text-slate-900 font-black text-base focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none min-h-[44px]"
                  placeholder="0.00"
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
                {balance > 0 && (
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(balance.toString())}
                    className="px-3 py-1 rounded-xl text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 transition-colors min-h-[32px]"
                  >
                    Max (₹{balance.toFixed(2)})
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-500 pt-0.5">
                Available Balance: <strong className="text-slate-800">₹{balance.toFixed(2)}</strong>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full border border-slate-300 rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none min-h-[44px]"
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                <option value="UPI">UPI Transfer</option>
              </select>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawAmount("");
                }}
                className="flex-1 border border-slate-300 rounded-2xl py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all min-h-[44px]"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleWithdrawRequest}
                className="flex-1 bg-rose-600 text-white rounded-2xl py-3 text-xs font-black hover:bg-rose-700 transition-all shadow-sm active:scale-98 disabled:opacity-50 min-h-[44px]"
                disabled={isSubmitting || !withdrawAmount}
              >
                {isSubmitting ? "Submitting..." : "Submit Payout Request"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
