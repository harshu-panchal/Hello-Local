import { useState } from "react";
import {
  resolveAdloggsBookingOutcome,
  type UnknownOutcomeAction,
} from "../../../services/api/admin/adminAdloggsService";

const ACTIONS: { value: UnknownOutcomeAction; label: string; help: string }[] = [
  {
    value: "RECORD_INVESTIGATION",
    label: "Record investigation",
    help: "Adds a note to the audit trail. The booking outcome stays unknown and nothing is booked.",
  },
  {
    value: "VERIFY_PROVIDER_ORDER",
    label: "Verify an Adloggs order",
    help: "Accepted only when Adloggs evidence ties the order to this shipment's partner id (create response, authenticated status event, or a status response carrying it). Otherwise the outcome stays unknown.",
  },
  {
    value: "REQUEST_REBOOK",
    label: "Request rebooking",
    help: "Needs the reference of Adloggs' written confirmation that no order exists. Refused while any provider evidence exists. A different admin must approve.",
  },
  {
    value: "APPROVE_REBOOK",
    label: "Approve rebooking",
    help: "Second admin approval. The retry uses a new partner id so a late Adloggs order can never be mistaken for it.",
  },
];

interface Props {
  shipmentId: string;
  shipmentNumber: string;
  partnerOrderId: string | null;
  rebookRequested: boolean;
  onClose: () => void;
  onDone: (message: string, success: boolean) => void;
}

/**
 * Audited handling of an unknown Adloggs booking outcome. No action here
 * books anything immediately, and no typed phrase authorises a rebooking.
 */
export default function ResolveBookingOutcomeDialog({ shipmentId, shipmentNumber, partnerOrderId, rebookRequested, onClose, onDone }: Props) {
  const [action, setAction] = useState<UnknownOutcomeAction>(rebookRequested ? "APPROVE_REBOOK" : "RECORD_INVESTIGATION");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [orderUuid, setOrderUuid] = useState("");
  const [providerReference, setProviderReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = ACTIONS.find(a => a.value === action)!;
  const canSubmit = reason.trim().length >= 10
    && (action !== "RECORD_INVESTIGATION" || evidence.trim().length >= 10)
    && (action !== "VERIFY_PROVIDER_ORDER" || orderUuid.trim().length > 0)
    && (action !== "REQUEST_REBOOK" || providerReference.trim().length >= 3);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await resolveAdloggsBookingOutcome(shipmentId, {
        action, reason: reason.trim(), evidence: evidence.trim() || undefined,
        ...(action === "VERIFY_PROVIDER_ORDER" ? { orderUuid: orderUuid.trim() } : {}),
        ...(action === "REQUEST_REBOOK" ? { providerReference: providerReference.trim() } : {}),
      });
      onDone(response.message, response.success);
    } catch (err: any) {
      // A refusal (409) is an expected answer: show it and keep the dialog open.
      setError(err?.response?.data?.message || err?.message || "Could not record the action.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="resolve-outcome-title"
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 id="resolve-outcome-title" className="text-base font-bold text-neutral-900">Unknown booking outcome · {shipmentNumber}</h2>
        <p className="mt-1 text-xs text-neutral-600">
          Partner id sent to Adloggs: <span className="font-mono">{partnerOrderId ?? "—"}</span>. Search the Adloggs dashboard or ask Adloggs support for this id.
        </p>

        <fieldset className="mt-4 space-y-1">
          <legend className="text-xs font-semibold text-neutral-700">Action</legend>
          {ACTIONS.map(option => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="resolve-action" value={option.value} checked={action === option.value} onChange={() => setAction(option.value)} />
              {option.label}
            </label>
          ))}
          <p className="text-xs text-neutral-500 pt-1">{selected.help}</p>
        </fieldset>

        {action === "VERIFY_PROVIDER_ORDER" && (
          <label className="mt-3 block text-xs font-semibold text-neutral-700">Adloggs order_uuid
            <input className={`${field} mt-1 font-mono`} value={orderUuid} onChange={e => setOrderUuid(e.target.value)} maxLength={200} />
          </label>
        )}
        {action === "REQUEST_REBOOK" && (
          <label className="mt-3 block text-xs font-semibold text-neutral-700">Adloggs confirmation reference (ticket or email id)
            <input className={`${field} mt-1`} value={providerReference} onChange={e => setProviderReference(e.target.value)} maxLength={120} />
          </label>
        )}
        <label className="mt-3 block text-xs font-semibold text-neutral-700">Reason (required)
          <textarea className={`${field} mt-1`} rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={300} />
        </label>
        <label className="mt-3 block text-xs font-semibold text-neutral-700">
          Evidence {action === "RECORD_INVESTIGATION" ? "(required)" : "(optional)"}
          <textarea className={`${field} mt-1`} rows={2} value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={500}
            placeholder="What you checked and what you found. No passwords, phone numbers or customer details." />
        </label>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700">Close</button>
          <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
