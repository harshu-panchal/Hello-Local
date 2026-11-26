import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAdminShipments,
  getShipmentExceptions,
  reconcileOrderShipments,
  type AdminShipmentRow,
  type ShipmentExceptions,
  type ShipmentFilter,
  type OperationalState,
} from "../../../services/api/admin/adminShipmentService";
import { useToast } from "../../../context/ToastContext";
import ResolveBookingOutcomeDialog from "../components/ResolveBookingOutcomeDialog";
import ExternalCancellationDialog from "../components/ExternalCancellationDialog";
import type { ExternalCancellationAction } from "../../../services/api/admin/adminAdloggsService";

const FILTERS: { value: ShipmentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready for pickup" },
  { value: "picked_up", label: "Picked up" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
  { value: "awaiting_booking", label: "Awaiting external booking" },
  { value: "attention", label: "Requires attention" },
  { value: "booking_in_flight", label: "Booking in progress" },
  { value: "booking_unknown", label: "Booking outcome unknown" },
  { value: "booking_confirmed", label: "Booking confirmed" },
  { value: "cancellation_pending", label: "Cancellation pending" },
  { value: "return_to_origin", label: "Return to origin" },
];

const STATE_LABEL: Record<OperationalState, { label: string; className: string }> = {
  WAITING_FOR_SELLER: { label: "Waiting for seller", className: "bg-neutral-100 text-neutral-700" },
  WAITING_FOR_PICKUP: { label: "Waiting for pickup", className: "bg-blue-50 text-blue-800" },
  WAITING_FOR_BOOKING_INTEGRATION: { label: "Waiting for booking integration", className: "bg-amber-50 text-amber-800" },
  IN_TRANSIT: { label: "In transit", className: "bg-indigo-50 text-indigo-800" },
  COMPLETED: { label: "Completed", className: "bg-green-50 text-green-800" },
  CANCELLED: { label: "Cancelled", className: "bg-neutral-100 text-neutral-500" },
  INTERNAL_SYNC_ISSUE: { label: "Internal sync issue", className: "bg-orange-50 text-orange-800" },
  OPERATIONAL_FAILURE: { label: "Booking preparation failed", className: "bg-red-50 text-red-800" },
  BOOKING_REQUEST_IN_PROGRESS: { label: "Booking request in progress", className: "bg-amber-50 text-amber-800" },
  BOOKING_OUTCOME_UNKNOWN: { label: "Booking outcome unknown", className: "bg-red-50 text-red-800" },
  BOOKING_CONFIRMED: { label: "Booking confirmed", className: "bg-blue-50 text-blue-800" },
  RIDER_ASSIGNED: { label: "Rider assigned", className: "bg-blue-50 text-blue-800" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", className: "bg-indigo-50 text-indigo-800" },
  CANCELLATION_PENDING: { label: "Cancellation pending", className: "bg-amber-50 text-amber-800" },
  RETURN_TO_ORIGIN: { label: "Return to origin", className: "bg-orange-50 text-orange-800" },
};

const PAGE_SIZE = 20;
const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

/**
 * Shipment operations: read-only monitoring of seller shipments. The only
 * action re-synchronises an order's shipments from its own data; there are no
 * status overrides and no booking controls.
 */
export default function AdminShipments() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<ShipmentFilter>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminShipmentRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [exceptions, setExceptions] = useState<ShipmentExceptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, summary] = await Promise.all([
        getAdminShipments({ filter, page, limit: PAGE_SIZE }),
        getShipmentExceptions(),
      ]);
      setRows(list.data);
      setPagination(list.pagination);
      setExceptions(summary.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not load shipments.");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Unknown booking outcome: never "retry". Handled in an audited dialog that
   * needs provider evidence (verify) or dual-admin approval (rebook).
   */
  const [resolving, setResolving] = useState<AdminShipmentRow | null>(null);
  const resolveUnknown = (row: AdminShipmentRow) => setResolving(row);
  const [cancelling, setCancelling] = useState<{ row: AdminShipmentRow; actions: ExternalCancellationAction[]; context: string } | null>(null);
  /** Which audited cancellation decisions apply to this row (none = no button). */
  const cancellationActions = (row: AdminShipmentRow): { actions: ExternalCancellationAction[]; context: string } | null => {
    const ext = row.external;
    if (!ext) return null;
    if (ext.rtoVerified && ext.rtoResolution !== "REFUNDED") return { actions: ["RESOLVE_RTO_REFUND_RESTOCK", "RESOLVE_RTO_REFUND_NO_RESTOCK"],
      context: "Adloggs returned this shipment to the store (verified). It is not a delivery; nothing was refunded or restocked yet." };
    if (ext.providerCancelledUnhandled) return { actions: ["ACCEPT_PROVIDER_CANCELLATION", "REBOOK_AFTER_PROVIDER_CANCELLATION"],
      context: "Adloggs cancelled this delivery. Nothing was cancelled or refunded in Hello Local yet." };
    if (ext.cancellationRequest === "BLOCKED") return { actions: ["RETRY_PROVIDER_CANCELLATION", "WITHDRAW_CANCELLATION_REQUEST"],
      context: `Cancellation blocked: ${ext.cancellationBlockedReason ?? "Adloggs did not confirm"}. No refund was made.` };
    if (ext.cancellation === "UNKNOWN" || ext.cancellation === "REJECTED") return { actions: ["RETRY_PROVIDER_CANCELLATION", "WITHDRAW_CANCELLATION_REQUEST"],
      context: "The Adloggs cancellation could not be confirmed. No refund was made." };
    if (ext.cancellationRequest === "AWAITING_PROVIDER") return { actions: ["WITHDRAW_CANCELLATION_REQUEST"],
      context: "A cancellation is waiting for Adloggs to confirm. The refund follows confirmation." };
    return null;
  };

  const resync = async (orderId: string) => {
    if (reconciling) return;
    setReconciling(orderId);
    try {
      const response = await reconcileOrderShipments(orderId);
      showToast(response.message, "success");
      void load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || "Re-sync failed.", "error");
    } finally {
      setReconciling(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">Shipment Operations</h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
          Seller shipments for orders placed since shipments were introduced. Read-only, apart from re-synchronising an order.
        </p>
      </div>

      {exceptions && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Requires attention" value={exceptions.attention + exceptions.booking.failed} tone="red" />
          <Stat label="Sync pending (orders)" value={exceptions.syncPendingOrders} tone="orange" />
          <Stat label="Ready, waiting for pickup" value={exceptions.readyWaitingPickup} tone="blue" />
          <Stat label={`Missing shipments (last ${exceptions.missingShipments.windowDays} days)`} value={exceptions.missingShipments.count} tone="orange" />
          <div className="col-span-2 lg:col-span-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            External booking: {exceptions.booking.awaitingIntegration} awaiting integration · {exceptions.booking.attemptInProgress} attempt in progress ·{" "}
            {exceptions.booking.retrying} retrying · {exceptions.booking.failed} failed · {exceptions.booking.cancelled} cancelled.{" "}
            {!exceptions.booking.integrationAvailable && (
              <span className="font-semibold">No external provider is integrated, so nothing has been booked or sent to a provider.</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Shipment filters">
        {FILTERS.map(option => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            onClick={() => { setFilter(option.value); setPage(1); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filter === option.value ? "border-rose-600 bg-rose-600 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-x-auto">
        {error ? (
          <div className="p-4 text-sm text-red-700">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="underline font-semibold">Retry</button>
          </div>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-neutral-50 text-neutral-600 text-left">
              <tr>
                {["Shipment", "Order", "Seller", "Provider", "Status", "Ready", "Picked up", "Delivered", "Booking", "Adloggs", "State", ""].map(header => (
                  <th key={header} className="px-3 py-2 font-semibold whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-neutral-500">Loading…</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-neutral-500">No shipments match this filter.</td></tr>
              ) : rows.map(row => {
                const state = STATE_LABEL[row.operationalState];
                return (
                  <tr key={row.id} className="border-t border-neutral-100 align-top">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{row.shipmentNumber}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.order ? (
                        <Link to={`/admin/orders/${row.order.id}`} className="text-rose-700 hover:underline font-semibold">{row.order.orderNumber}</Link>
                      ) : <span className="text-red-700">Parent order missing</span>}
                    </td>
                    <td className="px-3 py-2">{row.seller.storeName || row.seller.id}</td>
                    <td className="px-3 py-2">{row.deliveryProvider}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.statusLabel}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{when(row.readyForPickupAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{when(row.pickedUpAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{when(row.deliveredAt)}</td>
                    <td className="px-3 py-2">
                      {row.bookingIntent
                        ? `${row.bookingIntent.state}${row.bookingIntent.providerContacted === false ? " (not sent to a provider)" : row.bookingIntent.providerContacted === "POSSIBLY" ? " (may have reached Adloggs)" : ""}`
                        : row.bookingStage === "READY_NO_BOOKING_REQUIRED" ? "Not required" : "—"}
                      {row.bookingIntent?.lastError && <div className="text-red-700">{row.bookingIntent.lastError}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.external ? (
                        <div className="space-y-0.5">
                          <div>{row.external.providerStatusLabel ?? (row.external.orderUuid ? "Booked" : "Not booked")}</div>
                          {row.external.orderUuid && <div className="font-mono text-[10px] text-neutral-500" title={row.external.orderUuid}>{row.external.orderUuid.slice(0, 12)}…</div>}
                          {row.external.riderName && <div>Rider: {row.external.riderName}</div>}
                          {row.external.lastStatusSyncAt && <div className="text-neutral-500">Synced {when(row.external.lastStatusSyncAt)}</div>}
                          {row.external.cancellation && <div className="text-amber-800">Cancellation: {row.external.cancellation}</div>}
                          {row.external.cancellationRequest === "AWAITING_PROVIDER" && <div className="text-amber-800">Local cancellation + refund waiting for Adloggs</div>}
                          {row.external.cancellationRequest === "BLOCKED" && <div className="text-red-700">Cancellation blocked; no refund</div>}
                          {row.external.providerCancelledUnhandled && <div className="text-red-700">Cancelled by Adloggs: decision needed</div>}
                          {row.external.rtoVerified && row.external.rtoResolution !== "REFUNDED" && <div className="text-red-700">Returned to store: decision needed</div>}
                          {row.external.returnToOrigin && <div className="text-orange-800">RTO: {row.external.returnToOrigin}</div>}
                          {(row.external.estimatedProviderCost !== null || row.external.providerBookingFee !== null) && (
                            <div className="text-neutral-500">Est. ₹{row.external.estimatedProviderCost ?? "?"} · fee ₹{row.external.providerBookingFee ?? "?"}</div>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 font-semibold whitespace-nowrap ${state.className}`}>{state.label}</span>
                      {row.attention && <div className="mt-1 text-orange-800">{row.attention.reason}</div>}
                      {row.syncPending && <div className="mt-1 text-orange-800">Return sync pending</div>}
                    </td>
                    <td className="px-3 py-2 space-y-1">
                      {row.external?.outcomeUnknown && (
                        <button type="button" onClick={() => resolveUnknown(row)}
                          className="rounded-lg border border-red-300 px-2 py-1 font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap">
                          {row.external.rebookRequested ? "Approve rebooking" : "Resolve outcome"}
                        </button>
                      )}
                      {(() => {
                        const options = cancellationActions(row);
                        return options ? (
                          <button type="button" onClick={() => setCancelling({ row, ...options })}
                            className="rounded-lg border border-amber-300 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-50 whitespace-nowrap">
                            Decide…
                          </button>
                        ) : null;
                      })()}
                      {row.order && (row.attention || row.syncPending) && (
                        <button
                          type="button"
                          onClick={() => void resync(row.order!.id)}
                          disabled={!!reconciling}
                          className="rounded-lg border border-neutral-300 px-2 py-1 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          {reconciling === row.order.id ? "Re-syncing…" : "Re-sync"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>{pagination.total} shipment{pagination.total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-50">Previous</button>
          <span>Page {pagination.pages ? page : 0} of {pagination.pages}</span>
          <button type="button" disabled={page >= pagination.pages || loading} onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-50">Next</button>
        </div>
      </div>
      {cancelling && (
        <ExternalCancellationDialog
          shipmentId={cancelling.row.id}
          shipmentNumber={cancelling.row.shipmentNumber}
          actions={cancelling.actions}
          context={cancelling.context}
          onClose={() => setCancelling(null)}
          onDone={(message, success) => { showToast(message, success ? "success" : "error"); setCancelling(null); void load(); }}
        />
      )}
      {resolving && (
        <ResolveBookingOutcomeDialog
          shipmentId={resolving.id}
          shipmentNumber={resolving.shipmentNumber}
          partnerOrderId={resolving.external?.partnerOrderId ?? null}
          rebookRequested={Boolean(resolving.external?.rebookRequested)}
          onClose={() => setResolving(null)}
          onDone={(message, success) => { showToast(message, success ? "success" : "error"); setResolving(null); void load(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "red" | "orange" | "blue" }) {
  const tones = { red: "text-red-700", orange: "text-orange-700", blue: "text-blue-700" };
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className={`text-xl font-bold ${value ? tones[tone] : "text-neutral-400"}`}>{value}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  );
}
