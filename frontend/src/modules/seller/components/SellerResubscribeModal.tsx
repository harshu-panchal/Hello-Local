import { useState, useEffect } from "react";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import {
  getActiveSubscriptionPlans,
  createSubscriptionOrder,
  renewSubscriptionSeller,
  SubscriptionPlan,
} from "../../../services/api/subscriptionService";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface SellerResubscribeModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess: () => void;
  currentExpiryDate?: string | Date;
  isExpired: boolean;
}

export default function SellerResubscribeModal({
  isOpen,
  onClose,
  onSuccess,
  currentExpiryDate,
  isExpired,
}: SellerResubscribeModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPlans();
    }
  }, [isOpen]);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const data = await getActiveSubscriptionPlans();
      setPlans(data);
      if (data.length > 0) {
        // Prefer popular or first plan
        const popular = data.find((p) => p.isPopular);
        setSelectedPlanId(popular?._id || data[0]._id);
      }
    } catch (err: any) {
      console.error(err);
      showToast("Failed to load subscription plans", "error");
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

  const handlePay = async () => {
    const plan = plans.find((p) => p._id === selectedPlanId);
    if (!plan) {
      showToast("Please choose a plan to continue", "error");
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
        description: `Renew ${plan.name}`,
        order_id: orderData.razorpayOrderId,
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: user?.phone || "",
        },
        theme: {
          color: "#E11D48",
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
          },
        },
        handler: async (response: any) => {
          try {
            await renewSubscriptionSeller({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            showToast("Subscription renewed successfully! Your store is active.", "success");
            onSuccess();
          } catch (err: any) {
            console.error(err);
            showToast(err.response?.data?.message || "Payment verification failed", "error");
          } finally {
            setPaying(false);
          }
        },
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.on("payment.failed", (res: any) => {
        showToast(res.error?.description || "Payment failed", "error");
        setPaying(false);
      });
      razorpayInstance.open();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || err.message || "Failed to initiate payment", "error");
      setPaying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 max-w-xl w-full p-6 md:p-8 overflow-y-auto max-h-[90vh] relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        )}

        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-700 mb-3">
            ⚠️ {isExpired ? "Subscription Required" : "Renewal Required"}
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            {isExpired ? "Subscribe to Activate Your Store" : "Renew Your Subscription"}
          </h2>
          <p className="text-sm text-slate-600 mt-2">
            {isExpired
              ? "Your subscription has ended or your store is not yet subscribed. Customer ordering and product updates are paused. Choose a plan below to activate your store immediately."
              : `Your subscription expires soon (${currentExpiryDate ? new Date(currentExpiryDate).toLocaleDateString() : ""}). Renew now to maintain uninterrupted store access.`}
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading plans...</div>
        ) : (
          <div className="space-y-3 mb-6">
            {plans.map((p) => {
              const isSelected = selectedPlanId === p._id;
              return (
                <div
                  key={p._id}
                  onClick={() => setSelectedPlanId(p._id)}
                  className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? "border-rose-600 bg-rose-50/60 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedPlanId(p._id)}
                      className="text-rose-600 focus:ring-rose-500 h-4 w-4"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{p.name}</span>
                        {p.isPopular && (
                          <span className="text-[10px] bg-rose-600 text-white font-bold px-2 py-0.5 rounded-full uppercase">
                            Popular
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {p.durationInDays} Days Validity • 0% Platform Commission
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-rose-700">₹{p.price}</span>
                    <span className="text-[11px] text-slate-400 block">one-time</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 flex flex-col gap-2">
          <button
            onClick={handlePay}
            disabled={paying || loading || !selectedPlanId}
            className="w-full py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {paying ? "Processing Payment..." : "Pay & Resubscribe Now"}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              disabled={paying}
              className="text-xs text-slate-500 hover:text-slate-700 py-1 font-medium transition-colors cursor-pointer"
            >
              Remind me later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
