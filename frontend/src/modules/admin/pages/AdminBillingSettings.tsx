import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import {
  getAppSettings,
  updateAppSettings,
  type AppSettings,
} from "../../../services/api/admin/adminSettingsService";

export default function AdminBillingSettings() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialSettings, setInitialSettings] = useState<AppSettings | null>(null);

  // Form State
  const [platformFee, setPlatformFee] = useState<number>(0);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState<number>(0);
  const [deliveryCharges, setDeliveryCharges] = useState<number>(0);
  const [defaultCommission, setDefaultCommission] = useState<number>(10);

  // Distance-Based Config
  const [isDistanceBased, setIsDistanceBased] = useState(false);
  const [baseCharge, setBaseCharge] = useState<number>(0);
  const [baseDistance, setBaseDistance] = useState<number>(0);
  const [kmRate, setKmRate] = useState<number>(0);
  const [deliveryBoyKmRate, setDeliveryBoyKmRate] = useState<number>(0);

  // Live Simulator Test Inputs
  const [simCartSubtotal, setSimCartSubtotal] = useState<number>(350);
  const [simDistanceKm, setSimDistanceKm] = useState<number>(4.5);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await getAppSettings();
      if (response && response.success && response.data) {
        const data = response.data;
        setInitialSettings(data);
        populateForm(data);
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Failed to fetch billing settings", "error");
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (data: AppSettings) => {
    setPlatformFee(data.platformFee || 0);
    setFreeDeliveryThreshold(data.freeDeliveryThreshold || 0);
    setDeliveryCharges(data.deliveryCharges || 0);
    setDefaultCommission(data.defaultCommission || 10);

    if (data.deliveryConfig) {
      setIsDistanceBased(data.deliveryConfig.isDistanceBased || false);
      setBaseCharge(data.deliveryConfig.baseCharge || 0);
      setBaseDistance(data.deliveryConfig.baseDistance || 0);
      setKmRate(data.deliveryConfig.kmRate || 0);
      setDeliveryBoyKmRate(data.deliveryConfig.deliveryBoyKmRate || 0);
    }
  };

  const handleReset = () => {
    if (initialSettings) {
      populateForm(initialSettings);
      showToast("Settings reset to last saved values", "info");
    }
  };

  // Dirty State Detection
  const hasUnsavedChanges = useMemo(() => {
    if (!initialSettings) return false;
    const cfg = initialSettings.deliveryConfig;

    return (
      platformFee !== (initialSettings.platformFee || 0) ||
      freeDeliveryThreshold !== (initialSettings.freeDeliveryThreshold || 0) ||
      deliveryCharges !== (initialSettings.deliveryCharges || 0) ||
      defaultCommission !== (initialSettings.defaultCommission || 10) ||
      isDistanceBased !== (cfg?.isDistanceBased || false) ||
      baseCharge !== (cfg?.baseCharge || 0) ||
      baseDistance !== (cfg?.baseDistance || 0) ||
      kmRate !== (cfg?.kmRate || 0) ||
      deliveryBoyKmRate !== (cfg?.deliveryBoyKmRate || 0)
    );
  }, [
    initialSettings,
    platformFee,
    freeDeliveryThreshold,
    deliveryCharges,
    defaultCommission,
    isDistanceBased,
    baseCharge,
    baseDistance,
    kmRate,
    deliveryBoyKmRate,
  ]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    try {
      setSaving(true);

      const updatePayload: any = {
        platformFee: Math.max(0, platformFee),
        freeDeliveryThreshold: Math.max(0, freeDeliveryThreshold),
        deliveryCharges: Math.max(0, deliveryCharges),
        defaultCommission: Math.max(0, defaultCommission),
        deliveryConfig: {
          isDistanceBased,
          baseCharge: Math.max(0, baseCharge),
          baseDistance: Math.max(0, baseDistance),
          kmRate: Math.max(0, kmRate),
          deliveryBoyKmRate: Math.max(0, deliveryBoyKmRate),
        },
      };

      const response = await updateAppSettings(updatePayload);
      if (response.success) {
        showToast("Billing settings updated successfully!", "success");
        setInitialSettings(response.data);
      } else {
        showToast(response.message || "Failed to update settings", "error");
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.response?.data?.message || "Error updating settings", "error");
    } finally {
      setSaving(false);
    }
  };

  // Live Simulator Calculations
  const simResults = useMemo(() => {
    const subtotal = Math.max(0, simCartSubtotal);
    const distance = Math.max(0, simDistanceKm);

    // Free delivery check
    let calculatedDeliveryFee = 0;
    const isFree = freeDeliveryThreshold > 0 && subtotal >= freeDeliveryThreshold;

    if (!isFree) {
      if (!isDistanceBased) {
        calculatedDeliveryFee = deliveryCharges;
      } else {
        const extraKm = Math.max(0, distance - baseDistance);
        calculatedDeliveryFee = Math.ceil(baseCharge + extraKm * kmRate);
      }
    }

    const customerTotal = subtotal + calculatedDeliveryFee + platformFee;
    const deliveryBoyEarning = isDistanceBased
      ? Math.ceil(distance * deliveryBoyKmRate)
      : calculatedDeliveryFee;
    const adminCommissionEarning = (subtotal * defaultCommission) / 100 + platformFee;

    return {
      subtotal,
      distance,
      isFree,
      deliveryFee: calculatedDeliveryFee,
      customerTotal,
      deliveryBoyEarning,
      adminCommissionEarning,
    };
  }, [
    simCartSubtotal,
    simDistanceKm,
    freeDeliveryThreshold,
    isDistanceBased,
    deliveryCharges,
    baseCharge,
    baseDistance,
    kmRate,
    platformFee,
    deliveryBoyKmRate,
    defaultCommission,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-8 h-8 border-4 border-rose-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <span>⚙️</span> Billing & Charges
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Configure delivery fees, platform surcharges, free delivery thresholds, and partner commissions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500 hidden sm:block">
            <Link
              to="/admin/dashboard"
              className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
            >
              Dashboard
            </Link>
            <span className="mx-2 text-neutral-300">/</span>
            <span className="text-neutral-700 font-medium">Billing Settings</span>
          </nav>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || !hasUnsavedChanges}
            className="bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2 font-medium">
            <span>⚠️</span>
            <span>You have unsaved changes in your billing configuration.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="underline text-amber-900 hover:text-amber-950 font-bold"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-lg font-bold shadow-sm"
            >
              Save Now
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Settings Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* General Platform Surcharges & Commission */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider pb-2 border-b border-neutral-100 flex items-center gap-2">
              <span>💳</span> General Platform Charges
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Platform Fee */}
              <div>
                <label htmlFor="inputPlatformFee" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Platform / Handling Surcharge (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">
                    ₹
                  </span>
                  <input
                    id="inputPlatformFee"
                    type="number"
                    min="0"
                    step="0.5"
                    value={platformFee}
                    onChange={(e) => setPlatformFee(Math.max(0, Number(e.target.value)))}
                    className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    placeholder="e.g. 2"
                  />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Fixed service fee added to every customer checkout order.
                </p>
              </div>

              {/* Free Delivery Threshold */}
              <div>
                <label htmlFor="inputFreeDeliveryThreshold" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Free Delivery Threshold (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">
                    ₹
                  </span>
                  <input
                    id="inputFreeDeliveryThreshold"
                    type="number"
                    min="0"
                    step="1"
                    value={freeDeliveryThreshold}
                    onChange={(e) =>
                      setFreeDeliveryThreshold(Math.max(0, Number(e.target.value)))
                    }
                    className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    placeholder="e.g. 499"
                  />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Orders with cart value at or above this amount get free delivery (0 = disabled).
                </p>
              </div>

              {/* Global Platform Commission */}
              <div className="sm:col-span-2">
                <label htmlFor="inputDefaultCommission" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Default Seller Commission Rate (%)
                </label>
                <div className="relative">
                  <input
                    id="inputDefaultCommission"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={defaultCommission}
                    onChange={(e) =>
                      setDefaultCommission(Math.max(0, Number(e.target.value)))
                    }
                    className="w-full pl-3 pr-8 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    placeholder="e.g. 10"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">
                    %
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Default marketplace commission deducted from merchant product sales.
                </p>
              </div>
            </div>
          </div>

          {/* Delivery Configuration */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-100">
              <div>
                <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
                  <span>🛵</span> Delivery Fee Model
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Select flat rate pricing or automated distance-based calculation
                </p>
              </div>

              {/* Segmented Mode Switcher */}
              <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsDistanceBased(false)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all min-h-[36px] ${
                    !isDistanceBased
                      ? "bg-white text-rose-700 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  Fixed Flat Rate
                </button>
                <button
                  type="button"
                  onClick={() => setIsDistanceBased(true)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all min-h-[36px] ${
                    isDistanceBased
                      ? "bg-white text-rose-700 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  Distance-Based
                </button>
              </div>
            </div>

            {/* Flat Rate Inputs */}
            {!isDistanceBased ? (
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200/70 space-y-2">
                <label htmlFor="inputFlatDeliveryCharges" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Fixed Delivery Charge (₹)
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">
                    ₹
                  </span>
                  <input
                    id="inputFlatDeliveryCharges"
                    type="number"
                    min="0"
                    step="1"
                    value={deliveryCharges}
                    onChange={(e) =>
                      setDeliveryCharges(Math.max(0, Number(e.target.value)))
                    }
                    className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    placeholder="e.g. 40"
                  />
                </div>
                <p className="text-[11px] text-neutral-400">
                  Flat delivery fee applied uniformly to all orders below the threshold regardless of distance.
                </p>
              </div>
            ) : (
              /* Distance-Based Inputs */
              <div className="space-y-4">
                <div className="p-3 bg-rose-50/70 border border-rose-200/70 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                  <span className="text-base leading-none">ℹ️</span>
                  <span>
                    Distance is calculated automatically using road routing or precise GPS coordinates between the seller store and customer address.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Base Charge */}
                  <div>
                    <label htmlFor="inputBaseCharge" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      Base Charge (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">
                        ₹
                      </span>
                      <input
                        id="inputBaseCharge"
                        type="number"
                        min="0"
                        step="1"
                        value={baseCharge}
                        onChange={(e) => setBaseCharge(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                        placeholder="e.g. 25"
                      />
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Minimum fee charged for deliveries within base distance.
                    </p>
                  </div>

                  {/* Base Distance */}
                  <div>
                    <label htmlFor="inputBaseDistance" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      Base Distance Threshold (km)
                    </label>
                    <div className="relative">
                      <input
                        id="inputBaseDistance"
                        type="number"
                        min="0"
                        step="0.5"
                        value={baseDistance}
                        onChange={(e) =>
                          setBaseDistance(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full pl-3 pr-10 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                        placeholder="e.g. 3"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">
                        km
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Maximum distance covered under the flat base charge.
                    </p>
                  </div>

                  {/* Km Rate */}
                  <div>
                    <label htmlFor="inputKmRate" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      Incremental Fee per Extra km (₹/km)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">
                        ₹
                      </span>
                      <input
                        id="inputKmRate"
                        type="number"
                        min="0"
                        step="1"
                        value={kmRate}
                        onChange={(e) => setKmRate(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                        placeholder="e.g. 10"
                      />
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Charged per kilometer beyond the base distance threshold.
                    </p>
                  </div>

                  {/* Delivery Partner Rate */}
                  <div>
                    <label htmlFor="inputDeliveryBoyKmRate" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      Courier Payout Rate (₹/km)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">
                        ₹
                      </span>
                      <input
                        id="inputDeliveryBoyKmRate"
                        type="number"
                        min="0"
                        step="1"
                        value={deliveryBoyKmRate}
                        onChange={(e) =>
                          setDeliveryBoyKmRate(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                        placeholder="e.g. 8"
                      />
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Payout credited to the courier per kilometer travelled.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Interactive Order Bill Simulator */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden sticky top-6">
            <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
                <span>🧮</span> Live Customer Bill Simulator
              </h3>
              <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded font-bold">
                Test Preview
              </span>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-neutral-500">
                Simulate how your current settings calculate the customer checkout bill in real time:
              </p>

              {/* Simulation Inputs */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200">
                <div>
                  <label htmlFor="simInputCartSubtotal" className="block text-[10px] font-bold text-neutral-700 mb-1 uppercase">
                    Sample Cart Value (₹)
                  </label>
                  <input
                    id="simInputCartSubtotal"
                    type="number"
                    min="0"
                    value={simCartSubtotal}
                    onChange={(e) => setSimCartSubtotal(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs font-bold bg-white focus:border-rose-600 outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="simInputDistanceKm" className="block text-[10px] font-bold text-neutral-700 mb-1 uppercase">
                    Trip Distance (km)
                  </label>
                  <input
                    id="simInputDistanceKm"
                    type="number"
                    min="0"
                    step="0.5"
                    disabled={!isDistanceBased}
                    value={simDistanceKm}
                    onChange={(e) => setSimDistanceKm(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs font-bold bg-white focus:border-rose-600 outline-none disabled:bg-neutral-100 disabled:text-neutral-400"
                  />
                </div>
              </div>

              {/* Calculated Breakdown Card */}
              <div className="p-4 rounded-xl bg-neutral-900 text-white space-y-2.5">
                <div className="flex items-center justify-between text-neutral-300 text-xs">
                  <span>Cart Items Subtotal</span>
                  <span className="font-mono font-bold">₹{simResults.subtotal.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between text-neutral-300 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span>Delivery Fee</span>
                    {simResults.isFree && (
                      <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                        FREE (Threshold ≥ ₹{freeDeliveryThreshold})
                      </span>
                    )}
                  </div>
                  <span className={`font-mono font-bold ${simResults.isFree ? "text-emerald-400 line-through" : ""}`}>
                    ₹{simResults.deliveryFee.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-neutral-300 text-xs">
                  <span>Platform / Handling Fee</span>
                  <span className="font-mono font-bold">₹{platformFee.toFixed(2)}</span>
                </div>

                <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-sm font-extrabold text-white">
                  <span>Customer Pays Total</span>
                  <span className="font-mono text-rose-400 text-base">
                    ₹{simResults.customerTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Ecosystem Earnings Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200">
                  <div className="text-neutral-400 font-bold">Courier Estimated Payout</div>
                  <div className="font-mono font-extrabold text-neutral-800 text-xs mt-0.5">
                    ₹{simResults.deliveryBoyEarning.toFixed(2)}
                  </div>
                </div>

                <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200">
                  <div className="text-neutral-400 font-bold">Admin Platform Margin</div>
                  <div className="font-mono font-extrabold text-neutral-800 text-xs mt-0.5">
                    ₹{simResults.adminCommissionEarning.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Billing & Pricing Policy Engine
      </footer>
    </div>
  );
}
