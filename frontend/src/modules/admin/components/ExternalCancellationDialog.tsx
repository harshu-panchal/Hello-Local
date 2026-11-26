import { useEffect, useState } from "react";
import {
  getAdloggsRtoPreview,
  resolveAdloggsCancellation,
  type ExternalCancellationAction,
  type RtoPreview,
} from "../../../services/api/admin/adminAdloggsService";

const rupees = (value: number) => `₹${value.toFixed(2)}`;

/** Evidence, reason and refund breakdown shown BEFORE an RTO decision is confirmed. */
function RtoPreviewPanel({ preview }: { preview: RtoPreview | null }) {
  if (!preview) return <p className="mt-3 text-xs text-neutral-500">Loading return details…</p>;
  const refund = preview.refund;
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
      <p><span className="font-semibold">Reason:</span> {preview.reason}</p>
      <div>
        <p className="font-semibold">Verified Adloggs evidence</p>
        {preview.evidence.length ? (
          <ul className="list-disc pl-4">
            {preview.evidence.map(event => <li key={`${event.status}-${event.receivedAt}`}>{event.status} · {new Date(event.receivedAt).toLocaleString()} ({event.source})</li>)}
          </ul>
        ) : <p className="text-neutral-600">{preview.verified ? "Return completed (status recorded)." : "No verified return yet."}</p>}
      </div>
      {refund && (
        <div>
          <p className="font-semibold">Refund under existing rules: {refund.eligible ? rupees(refund.amount) : "none"}</p>
          {refund.lines.length > 0 && (
            <table className="mt-1 w-full">
              <thead><tr className="text-left text-neutral-500"><th>Item</th><th>Qty</th><th className="text-right">Total</th><th className="text-right">Discount</th><th className="text-right">Net</th></tr></thead>
              <tbody>
                {refund.lines.map((line, index) => (
                  <tr key={index}><td>{line.productName}</td><td>{line.quantity}</td><td className="text-right">{rupees(line.total)}</td>
                    <td className="text-right">{rupees(line.discount)}</td><td className="text-right">{rupees(line.net)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {refund.components && (
            <p className="mt-1 text-neutral-600">Order total {rupees(refund.components.orderTotal)} − already refunded {rupees(refund.components.alreadyRefunded)}
              {" "}(includes delivery {rupees(refund.components.shipping)}, platform fee {rupees(refund.components.platformFee)}, tip {rupees(refund.components.tip)}).</p>
          )}
          <p className="mt-1 text-neutral-600">{refund.note}</p>
        </div>
      )}
    </div>
  );
}

const HELP: Record<ExternalCancellationAction, { label: string; help: string }> = {
  ACCEPT_PROVIDER_CANCELLATION: {
    label: "Accept Adloggs' cancellation",
    help: "Adloggs cancelled this delivery. Cancels this seller's items and queues the prepaid refund for them only.",
  },
  REBOOK_AFTER_PROVIDER_CANCELLATION: {
    label: "Rebook the delivery",
    help: "Keeps the items and books a new Adloggs delivery under a new partner id. No refund.",
  },
  RETRY_PROVIDER_CANCELLATION: {
    label: "Retry the provider cancellation",
    help: "Queues the cancellation request to Adloggs again (only before pickup). No refund until Adloggs confirms.",
  },
  RESOLVE_RTO_REFUND_RESTOCK: {
    label: "Refund and return items to stock",
    help: "Adloggs returned the parcel to the store (verified). Cancels this seller's items, restocks them and queues the prepaid refund for them only.",
  },
  RESOLVE_RTO_REFUND_NO_RESTOCK: {
    label: "Refund without restocking",
    help: "As above, but the returned goods are not put back on sale (for example perishables).",
  },
  WITHDRAW_CANCELLATION_REQUEST: {
    label: "Withdraw the cancellation request",
    help: "The delivery goes ahead. Only possible while Adloggs has not cancelled it.",
  },
};

interface Props {
  shipmentId: string;
  shipmentNumber: string;
  actions: ExternalCancellationAction[];
  context: string;
  onClose: () => void;
  onDone: (message: string, success: boolean) => void;
}

/** Audited admin decisions for Adloggs cancellations. Refunds only follow verified provider cancellation. */
export default function ExternalCancellationDialog({ shipmentId, shipmentNumber, actions, context, onClose, onDone }: Props) {
  const [action, setAction] = useState<ExternalCancellationAction>(actions[0]);
  const [reason, setReason] = useState("");
  const isRto = actions.some(value => value.startsWith("RESOLVE_RTO_"));
  const [rtoPreview, setRtoPreview] = useState<RtoPreview | null>(null);
  useEffect(() => {
    if (!isRto) return;
    let active = true;
    getAdloggsRtoPreview(shipmentId).then(response => { if (active) setRtoPreview(response.data); })
      .catch(() => { if (active) setRtoPreview({ verified: false, resolution: null, evidence: [], reason: "Could not load return details.", refund: null }); });
    return () => { active = false; };
  }, [isRto, shipmentId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || reason.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      const response = await resolveAdloggsCancellation(shipmentId, { action, reason: reason.trim() });
      onDone(response.message, response.success);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not record the decision.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ext-cancel-title"
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 id="ext-cancel-title" className="text-base font-bold text-neutral-900">Adloggs decision · {shipmentNumber}</h2>
        <p className="mt-1 text-xs text-neutral-600">{context}</p>
        {isRto && <RtoPreviewPanel preview={rtoPreview} />}
        <fieldset className="mt-4 space-y-1">
          <legend className="text-xs font-semibold text-neutral-700">Decision</legend>
          {actions.map(value => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="ext-cancel-action" value={value} checked={action === value} onChange={() => setAction(value)} />
              {HELP[value].label}
            </label>
          ))}
          <p className="text-xs text-neutral-500 pt-1">{HELP[action].help}</p>
        </fieldset>
        <label className="mt-3 block text-xs font-semibold text-neutral-700">Reason (required, at least 10 characters)
          <textarea className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" rows={2} value={reason}
            onChange={e => setReason(e.target.value)} maxLength={300} />
        </label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700">Close</button>
          <button type="button" onClick={() => void submit()} disabled={busy || reason.trim().length < 10}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
