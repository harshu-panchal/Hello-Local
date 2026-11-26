import { useCallback, useEffect, useState } from "react";
import {
  getInHouseDeliverySettings,
  updateInHouseDeliverySettings,
  retryInHouseDeliveryRecovery,
  type InHouseDeliverySettings,
} from "../../../services/api/admin/adminSettingsService";
import { useToast } from "../../../context/ToastContext";

const DISABLE_CONSEQUENCE =
  "New in-house delivery assignments will stop. Already assigned deliveries can continue until completion.";

/**
 * Admin ON/OFF switch for the in-house courier fleet.
 * The displayed state only ever comes from the backend: a failed save leaves
 * the previous persisted value on screen.
 */
export default function InHouseDeliveryToggleCard({ onChanged }: { onChanged?: () => void } = {}) {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<InHouseDeliverySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await getInHouseDeliverySettings();
      if (!response.success) throw new Error(response.message);
      setSettings(response.data);
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || error?.message || "Could not load in-house delivery status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (enabled: boolean) => {
    if (saving) return; // no duplicate requests
    setSaving(true);
    try {
      const response = await updateInHouseDeliverySettings(enabled);
      if (!response.success) throw new Error(response.message);
      setSettings(response.data);
      setConfirmingDisable(false);
      showToast(response.message, "success");
      onChanged?.();
    } catch (error: any) {
      showToast(error?.response?.data?.message || error?.message || "Failed to update in-house delivery.", "error");
      // Re-sync with what the server actually holds.
      void load();
    } finally {
      setSaving(false);
    }
  };

  const retryRecovery = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await retryInHouseDeliveryRecovery();
      if (!response.success) throw new Error(response.message);
      setSettings(response.data);
      showToast(response.message, "success");
    } catch (error: any) {
      showToast(error?.response?.data?.message || error?.message || "Waiting-order recovery failed.", "error");
      void load();
    } finally {
      setSaving(false);
    }
  };

  const onToggle = () => {
    if (!settings || saving) return;
    if (settings.enabled) setConfirmingDisable(true);
    else void save(true);
  };

  const enabled = settings?.enabled ?? false;

  return (
    <section
      aria-labelledby="in-house-delivery-heading"
      className={`rounded-2xl border shadow-sm p-4 sm:p-5 ${
        settings && !enabled ? "bg-amber-50 border-amber-300" : "bg-white border-neutral-200/80"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="in-house-delivery-heading" className="text-sm sm:text-base font-bold text-neutral-900">
            In-House Delivery
          </h2>
          {loading && !settings ? (
            <p className="text-xs sm:text-sm text-neutral-500 mt-1">Loading current status…</p>
          ) : loadError && !settings ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs sm:text-sm text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="text-xs font-semibold text-rose-700 hover:text-rose-800 underline"
              >
                Retry
              </button>
            </div>
          ) : settings ? (
            <>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1">
                {enabled
                  ? "Enabled: orders are offered to your delivery partners and can be assigned manually."
                  : "Disabled: no new in-house assignments. Already assigned deliveries are finishing (drain mode)."}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {settings.activeAssignments} in-house deliver{settings.activeAssignments === 1 ? "y" : "ies"} in progress
                {" · "}
                {settings.awaitingCourier} order{settings.awaitingCourier === 1 ? "" : "s"} waiting for a courier
                {!enabled && settings.awaitingCourier > 0 ? " (will not be offered to delivery partners)" : ""}
              </p>
            </>
          ) : null}
        </div>

        {settings && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? "Disable in-house delivery" : "Enable in-house delivery"}
            onClick={onToggle}
            disabled={saving || confirmingDisable}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition-colors min-h-[28px] ${
              enabled ? "bg-green-600" : "bg-neutral-300"
            } ${saving || confirmingDisable ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        )}
      </div>

      {confirmingDisable && (
        <div role="alertdialog" aria-label="Confirm disabling in-house delivery" className="mt-3 rounded-xl border border-amber-300 bg-white p-3">
          <p className="text-xs sm:text-sm font-semibold text-neutral-900">Disable in-house delivery?</p>
          <p className="text-xs sm:text-sm text-neutral-600 mt-1">{DISABLE_CONSEQUENCE}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save(false)}
              disabled={saving}
              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {saving ? "Disabling…" : "Disable in-house delivery"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDisable(false)}
              disabled={saving}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {settings?.lastRecovery && (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          <p className="font-semibold text-neutral-900">
            Last waiting-order recovery
            {settings.lastRecovery.finishedAt ? ` · ${new Date(settings.lastRecovery.finishedAt).toLocaleString()}` : ""}
            {settings.lastRecovery.aborted ? " · stopped (switched off)" : ""}
          </p>
          <p className="mt-1">
            {settings.lastRecovery.offered ?? 0} re-offered · {settings.lastRecovery.noCouriers ?? 0} no courier available ·{" "}
            {settings.lastRecovery.failed ?? 0} failed · {settings.lastRecovery.stale ?? 0} older than 4h
          </p>
          {!!settings.lastRecovery.errors?.length && (
            <ul className="mt-1 list-disc pl-4 text-red-700">
              {settings.lastRecovery.errors.map(message => <li key={message}>{message}</li>)}
            </ul>
          )}
        </div>
      )}
      {settings?.enabled && (settings.recoveryPending || settings.awaitingCourier > 0) && (
        <button
          type="button"
          onClick={() => void retryRecovery()}
          disabled={saving}
          className="mt-3 rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          {settings.recoveryPending ? "Recovery pending: run now" : "Re-offer waiting orders"}
        </button>
      )}
      {saving && !confirmingDisable && <p className="text-xs text-neutral-500 mt-2">Saving…</p>}
    </section>
  );
}
