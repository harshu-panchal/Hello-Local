import { useState, useEffect } from "react";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import {
  getMySubscriptionSeller,
  getActiveSubscriptionPlans,
  createSubscriptionOrder,
  renewSubscriptionSeller,
  SubscriptionPlan,
  SellerSubscriptionStatus,
} from "../../../services/api/subscriptionService";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function SellerSubscription() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [subStatus, setSubStatus] = useState<SellerSubscriptionStatus | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statusRes, plansRes] = await Promise.all([
        getMySubscriptionSeller(),
        getActiveSubscriptionPlans(),
      ]);
      setSubStatus(statusRes);
      setPlans(plansRes);
      if (plansRes.length > 0) {
        setSelectedPlanId(plansRes[0]._id);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || "Failed to load subscription status", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRenewPayment = async () => {
    const plan = plans.find((p) => p._id === selectedPlanId);
    if (!plan) {
      showToast("Please select a subscription plan", "error");
      return;
    }

    try {
      setPaying(true);
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        showToast("Failed to load Razorpay payment gateway", "error");
        setPaying(false);
        return;
      }

      const orderData = await createSubscriptionOrder(plan._id, user?.phone);

      const options = {
        key: orderData.razorpayKey,
        amount: orderData.amount,
        currency: "INR",
        name: "Hello Local",
        description: `${plan.name} Renewal`,
        order_id: orderData.razorpayOrderId,
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: user?.phone || "",
        },
        theme: {
          color: "#BE123C",
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            showToast("Payment was cancelled", "info");
          },
        },
        handler: async (response: any) => {
          try {
            await renewSubscriptionSeller({
              planId: plan._id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            showToast("Subscription successfully renewed! Store is active.", "success");
            fetchData();
          } catch (err: any) {
            showToast(err.response?.data?.message || "Payment verification failed", "error");
          } finally {
            setPaying(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp: any) => {
        showToast(resp.error?.description || "Payment failed", "error");
        setPaying(false);
      });
      rzp.open();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || "Failed to initiate payment", "error");
      setPaying(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading subscription details...</div>;
  }

  const sub = subStatus?.subscription;
  const isExpired = subStatus?.isExpired;
  const daysRemaining = subStatus?.daysRemaining || 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full mb-2">
            Store Membership & Billing
          </span>
          <h1 className="text-2xl font-bold text-slate-800">My Store Subscription</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            HelloLocal operates on 0% commission. Your subscription covers platform access, orders, and delivery coordination.
          </p>
        </div>

        <div className="text-right">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              subStatus?.isActive
                ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"
                : "bg-rose-50 text-rose-600 ring-1 ring-rose-200"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${subStatus?.isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
            {subStatus?.isActive ? "Active Membership" : "Membership Expired"}
          </span>
        </div>
      </div>

      {/* Current Plan Overview Card */}
      <div className="bg-gradient-to-br from-rose-600 via-rose-700 to-pink-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <p className="text-rose-200 text-xs font-semibold uppercase tracking-wider">Current Package</p>
            <h2 className="text-3xl font-extrabold mt-1">{sub?.planName || "No Active Plan"}</h2>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-rose-100">
              {sub?.startDate && (
                <span>Started: {new Date(sub.startDate).toLocaleDateString("en-IN")}</span>
              )}
              {sub?.endDate && (
                <span>Expires: {new Date(sub.endDate).toLocaleDateString("en-IN")}</span>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-xl border border-white/20 text-center">
            <span className="text-3xl font-extrabold block">{daysRemaining}</span>
            <span className="text-xs text-rose-100 uppercase font-medium tracking-wider">Days Remaining</span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-rose-100">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-white/10 rounded-lg">✓</span>
            <span>0% Commission on Customer Orders</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-white/10 rounded-lg">✓</span>
            <span>Unlimited Live Store Product Listings</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-white/10 rounded-lg">✓</span>
            <span>Automated Hyperlocal Delivery Boy Dispatch</span>
          </div>
        </div>
      </div>

      {/* Renew / Upgrade Plans */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            {isExpired ? "Renew Your Store Subscription" : "Extend / Upgrade Subscription"}
          </h3>
          <p className="text-xs text-slate-500">
            Select a package below to extend your store validity. Payment is securely processed via Razorpay (UPI, GPay, Cards).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isSelected = selectedPlanId === p._id;
            return (
              <div
                key={p._id}
                onClick={() => setSelectedPlanId(p._id)}
                className={`cursor-pointer rounded-2xl p-5 border-2 transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? "border-rose-600 bg-rose-50/30 shadow-md ring-2 ring-rose-100"
                    : "border-slate-100 hover:border-slate-300 bg-white"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-slate-800">{p.name}</h4>
                    {p.isPopular && (
                      <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 my-3">
                    <span className="text-2xl font-black text-slate-900">₹{p.price}</span>
                    <span className="text-xs text-slate-500">/ {p.durationInDays} days</span>
                  </div>

                  <ul className="space-y-1.5 text-xs text-slate-600 mb-4">
                    {(p.features || []).map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <span className="text-emerald-500">✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    {isSelected ? "Selected" : "Click to select"}
                  </span>
                  <input
                    type="radio"
                    name="planRadio"
                    checked={isSelected}
                    onChange={() => setSelectedPlanId(p._id)}
                    className="text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Safe & Secure 256-bit encrypted checkout powered by Razorpay</span>
          </div>

          <button
            onClick={handleRenewPayment}
            disabled={paying || !selectedPlanId}
            className="w-full sm:w-auto px-8 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all"
          >
            {paying ? "Opening Payment Gateway..." : "Proceed to Pay & Extend Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
