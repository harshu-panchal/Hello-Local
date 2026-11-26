import { useCallback, useEffect, useState } from "react";
import {
  getAdloggsStatus,
  getAdloggsReadiness,
  getAdloggsWebhookEvents,
  testAdloggsConnectivity,
  type AdloggsAdminStatus,
  type AdloggsDataReadiness,
  type AdloggsWebhookEventRow,
  type AdloggsWallet,
} from "../../../services/api/admin/adminAdloggsService";
import { useToast } from "../../../context/ToastContext";

const CAPABILITY_ROWS: { key: keyof AdloggsAdminStatus["capabilities"]; label: string }[] = [
  { key: "configured", label: "Integration configured" },
  { key: "apiAccessAllowed", label: "API access (development only)" },
  { key: "serviceabilityReady", label: "Serviceability checks" },
  { key: "bookingReady", label: "Shipment booking" },
  { key: "statusReconciliationReady", label: "Status reconciliation" },
  { key: "cancellationReady", label: "Cancellation" },
  { key: "webhookReady", label: "Status webhooks" },
  { key: "onlinePaymentReady", label: "Online-paid orders" },
  { key: "codReady", label: "Cash on delivery" },
  { key: "productionActivationEligible", label: "Live activation" },
];

const when = (value?: string | null) => (value ? new Date(value).toLocaleString() : "never");

function WalletLine({ wallet }: { wallet: AdloggsWallet | AdloggsAdminStatus["wallet"] | null }) {
  if (!wallet) return <span className="text-neutral-500">Not checked yet</span>;
  if (wallet.state === "NOT_CONFIGURED") return <span className="text-neutral-500">Not configured</span>;
  if (wallet.state === "WALLET_NOT_ENABLED") return <span>Wallet not enabled by Adloggs (checked {when(wallet.retrievedAt)})</span>;
  if (wallet.state === "UNAVAILABLE") {
    return (
      <span className="text-red-700">
        Balance unavailable: {wallet.message}
        {wallet.lastVerified ? ` · last verified ₹${wallet.lastVerified.balance} at ${when(wallet.lastVerified.retrievedAt)}` : ""}
      </span>
    );
  }
  return <span className="font-semibold">₹{wallet.balance} <span className="font-normal text-neutral-500">(verified {when(wallet.retrievedAt)})</span></span>;
}

/**
 * Adloggs readiness for admins: what is configured, what is enabled and why
 * live activation is blocked. Shows no secrets; never books anything — the
 * connectivity test calls the documented wallet-balance endpoint.
 */
export default function AdloggsStatusCard() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<AdloggsAdminStatus | null>(null);
  const [wallet, setWallet] = useState<AdloggsWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [readiness, setReadiness] = useState<AdloggsDataReadiness | null>(null);
  const [events, setEvents] = useState<AdloggsWebhookEventRow[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [response, data, hooks] = await Promise.all([getAdloggsStatus(), getAdloggsReadiness().catch(() => null),
        getAdloggsWebhookEvents().catch(() => null)]);
      setStatus(response.data);
      setReadiness(data?.data ?? null);
      setEvents(hooks?.data ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not load Adloggs status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const response = await testAdloggsConnectivity();
      setWallet(response.data.wallet);
      showToast(response.data.connected ? "Adloggs connectivity verified." : "Adloggs could not be reached.", response.data.connected ? "success" : "error");
      void load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || "Connectivity test failed.", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section aria-labelledby="adloggs-heading" className="rounded-2xl border border-neutral-200/80 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="adloggs-heading" className="text-sm sm:text-base font-bold text-neutral-900">Adloggs Integration</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Environment: <span className="font-semibold">{status?.environment ?? "not configured"}</span>
            {status && ` · API key ${status.apiKeyConfigured ? "configured" : "not configured"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={testing || !status?.capabilities.apiAccessAllowed}
          title={status?.capabilities.apiAccessAllowed ? "Calls the wallet-balance endpoint; books nothing" : "API access is not enabled"}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test connectivity"}
        </button>
      </div>

      {loading && !status ? (
        <p className="text-xs text-neutral-500 mt-3">Loading…</p>
      ) : error && !status ? (
        <p className="text-xs text-red-700 mt-3">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>
      ) : status ? (
        <>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
            {CAPABILITY_ROWS.map(row => {
              const ready = Boolean(status.capabilities[row.key]);
              return (
                <li key={row.key} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2 py-1">
                  <span>{row.label}</span>
                  <span className={`font-semibold ${ready ? "text-green-700" : "text-neutral-500"}`}>{ready ? "Ready" : "Blocked"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs">
            API connectivity: {status.connectivity.verified ? "verified" : "not verified"} (last check {when(status.connectivity.lastCheckedAt)})
            {status.connectivity.lastError && <span className="text-red-700"> · {status.connectivity.lastError}</span>}
          </p>
          <p className="mt-1 text-xs">Wallet: <WalletLine wallet={wallet ?? status.wallet} /></p>
          {readiness && (
            <div className="mt-3 rounded-lg border border-neutral-200 p-3 text-xs">
              <p className="font-semibold text-neutral-800">Data needed before bookings</p>
              <ul className="mt-1 space-y-0.5">
                <li>Pickup deadline policy: {readiness.policy.pickupWindowConfigured ? "configured" : <span className="text-red-700">not configured (bookings blocked)</span>}</li>
                <li>Sellers missing pickup details: <span className={readiness.sellers.missingPickupDetails ? "font-semibold text-amber-800" : ""}>
                  {readiness.sellers.missingPickupDetails} of {readiness.sellers.approved}</span></li>
                <li>Active products without shipping weight: <span className={readiness.products.missingShippingWeight ? "font-semibold text-amber-800" : ""}>
                  {readiness.products.missingShippingWeight} of {readiness.products.activePublished}</span></li>
              </ul>
              {(readiness.sellers.examples.length > 0 || readiness.products.bySeller.length > 0) && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold">Show stores to follow up</summary>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {readiness.sellers.examples.map(seller => (
                      <li key={`s-${seller.id}`}>{seller.storeName || seller.id}: missing {seller.missing.join(", ")}</li>
                    ))}
                    {readiness.products.bySeller.map(row => (
                      <li key={`p-${row.sellerId}`}>{row.storeName || row.sellerId}: {row.count} product(s) without shipping weight</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {events && (
            <details className="mt-3 text-xs text-neutral-700">
              <summary className="cursor-pointer font-semibold">Recent webhook events ({events.length})</summary>
              {events.length === 0 ? (
                <p className="mt-1 text-neutral-500">No status webhook received yet.</p>
              ) : (
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-neutral-500">
                      <tr><th className="pr-2">Received</th><th className="pr-2">Status</th><th className="pr-2">Our order ID</th><th>Result</th></tr>
                    </thead>
                    <tbody>
                      {events.map((event, index) => (
                        <tr key={`${event.orderUuid}-${event.statusCode}-${index}`} className="border-t border-neutral-100">
                          <td className="pr-2 whitespace-nowrap">{when(event.receivedAt)}</td>
                          <td className="pr-2">{event.statusLabel} ({event.statusCode})</td>
                          <td className="pr-2 font-mono">{event.partnerOrderId ?? "—"}</td>
                          <td>{event.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          )}
          {!!status.capabilities.blockers.length && (
            <details className="mt-3 text-xs text-neutral-700">
              <summary className="cursor-pointer font-semibold">Why live activation is blocked ({status.capabilities.blockers.length})</summary>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {status.capabilities.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
              </ul>
            </details>
          )}
        </>
      ) : null}
    </section>
  );
}
