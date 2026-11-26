import { useCallback, useEffect, useState } from "react";
import {
  getDeliveryProviderSettings,
  updateDeliveryProviderSettings,
  type DeliveryProviderId,
  type DeliveryProviderState,
} from "../../../services/api/admin/adminSettingsService";
import { useToast } from "../../../context/ToastContext";

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  AVAILABLE: { label: "Available", className: "bg-green-100 text-green-800 border-green-200" },
  DISABLED: { label: "Disabled", className: "bg-amber-100 text-amber-800 border-amber-200" },
  NOT_CONFIGURED: { label: "Not configured", className: "bg-neutral-100 text-neutral-600 border-neutral-200" },
};

/**
 * Global delivery provider selection. Shows each provider's readiness and
 * lets an admin pick only an operational one. What is displayed always comes
 * from the backend; a failed save re-reads the persisted state.
 */
export default function DeliveryProviderCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { showToast } = useToast();
  const [state, setState] = useState<DeliveryProviderState | null>(null);
  const [selected, setSelected] = useState<DeliveryProviderId | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await getDeliveryProviderSettings();
      if (!response.success) throw new Error(response.message);
      setState(response.data);
      setSelected(response.data.activeProvider);
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || error?.message || "Could not load delivery providers.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on mount and whenever the in-house switch changes readiness.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const save = async () => {
    if (saving) return; // no duplicate requests
    if (!state || !selected || selected === state.activeProvider) return;
    setSaving(true);
    try {
      const response = await updateDeliveryProviderSettings(selected);
      if (!response.success) throw new Error(response.message);
      setState(response.data);
      setSelected(response.data.activeProvider);
      showToast(response.message, "success");
    } catch (error: any) {
      showToast(error?.response?.data?.message || error?.message || "Failed to change the delivery provider.", "error");
      void load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="delivery-provider-heading" className="rounded-2xl border border-neutral-200/80 bg-white p-4 sm:p-5 shadow-sm">
      <h2 id="delivery-provider-heading" className="text-sm sm:text-base font-bold text-neutral-900">
        Active Delivery Provider
      </h2>
      <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
        Applies to new orders across the platform. Orders already placed keep their current provider.
      </p>

      {loading && !state ? (
        <p className="text-xs sm:text-sm text-neutral-500 mt-3">Loading providers…</p>
      ) : loadError && !state ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-xs sm:text-sm text-red-700">{loadError}</p>
          <button type="button" onClick={() => void load()} className="text-xs font-semibold text-rose-700 underline">
            Retry
          </button>
        </div>
      ) : state ? (
        <>
          {!state.deliveryAvailable && (
            <div role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs sm:text-sm text-red-800">
              No delivery provider is available. New customer orders are blocked until one is available.
              {state.reason ? ` ${state.reason}` : ""}
            </div>
          )}
          <fieldset className="mt-3 space-y-2" disabled={saving}>
            <legend className="sr-only">Delivery provider</legend>
            {state.providers.map(provider => {
              const style = STATUS_STYLE[provider.status] || STATUS_STYLE.NOT_CONFIGURED;
              const isActive = provider.id === state.activeProvider;
              return (
                <label
                  key={provider.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${
                    provider.operational ? "cursor-pointer" : "cursor-not-allowed opacity-70"
                  } ${selected === provider.id ? "border-rose-400 bg-rose-50/40" : "border-neutral-200"}`}
                >
                  <input
                    type="radio"
                    name="delivery-provider"
                    value={provider.id}
                    checked={selected === provider.id}
                    onChange={() => setSelected(provider.id)}
                    disabled={!provider.operational && !isActive}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900">{provider.label}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>{style.label}</span>
                      {isActive && <span className="text-[11px] font-semibold text-rose-700">Active</span>}
                    </span>
                    {provider.reason && <span className="block text-xs text-neutral-500 mt-0.5">{provider.reason}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !selected || selected === state.activeProvider || !state.providers.find(p => p.id === selected)?.operational}
            className="mt-3 rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save provider"}
          </button>
        </>
      ) : null}
    </section>
  );
}
