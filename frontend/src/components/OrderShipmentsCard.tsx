/**
 * Per-seller shipment progress inside one customer order (Phase 5).
 *
 * Shows only recorded events. Events whose time was never recorded (older
 * orders) say so instead of showing a made-up time. No ETAs, courier
 * locations, provider names or tracking numbers — live in-house courier
 * tracking stays in the existing map and partner card.
 */
export interface CustomerShipmentEvent {
  type: string;
  label: string;
  at: string | null;
  timestampAvailable: boolean;
}

export interface CustomerShipment {
  seller: string;
  sellerName?: string;
  status: string;
  statusLabel: string;
  itemCount: number;
  returnedItemCount: number;
  timeline?: CustomerShipmentEvent[];
  /** Verified delivery-partner facts for externally delivered shipments. */
  external?: {
    provider: string;
    booked: boolean;
    providerStatusLabel?: string;
    riderName?: string;
    trackUrl?: string;
    returnToOrigin?: "INITIATED" | "COMPLETED";
    cancellation?: string;
    cancellationRequest?: "AWAITING_PROVIDER" | "BLOCKED" | "COMPLETED" | "WITHDRAWN";
    /** Code to tell the delivery partner's rider at your door. */
    deliveryOtp?: string;
  };
}

/** Only HTTPS links on the documented Adloggs hosts are ever rendered. */
const TRACKING_HOSTS = ["dev.adloggs.com", "app.adloggs.com"];
function safeTrackUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && TRACKING_HOSTS.includes(url.hostname) && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const STATUS_STYLE: Record<string, string> = {
  RETURNED_TO_ORIGIN: "bg-orange-50 text-orange-800",
  CREATED: "bg-slate-100 text-slate-700",
  PREPARING: "bg-amber-50 text-amber-800",
  READY_FOR_PICKUP: "bg-blue-50 text-blue-800",
  PICKED_UP: "bg-indigo-50 text-indigo-800",
  DELIVERED: "bg-green-50 text-green-800",
  RETURNED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default function OrderShipmentsCard({ shipments }: { shipments?: CustomerShipment[] }) {
  if (!shipments?.length) return null;
  const multiSeller = shipments.length > 1;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs">
      <h3 className="text-xs sm:text-sm font-bold text-slate-900 pb-2.5 border-b border-slate-100">
        {multiSeller ? `Your order ships from ${shipments.length} stores` : "Shipment progress"}
      </h3>
      <ul className="divide-y divide-slate-100">
        {shipments.map(shipment => (
          <li key={shipment.seller} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-semibold text-slate-900">{shipment.sellerName || "Store"}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[shipment.status] || STATUS_STYLE.CREATED}`}>
                {shipment.statusLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {shipment.itemCount} item{shipment.itemCount === 1 ? "" : "s"}
              {shipment.returnedItemCount > 0 ? ` · ${shipment.returnedItemCount} returned` : ""}
            </p>
            {shipment.external?.booked && (
              <div className="mt-1.5 text-[11px] text-slate-700 space-y-0.5">
                <p>
                  Delivered by {shipment.external.provider}
                  {shipment.external.providerStatusLabel ? ` · ${shipment.external.providerStatusLabel}` : ""}
                  {shipment.external.riderName ? ` · Rider: ${shipment.external.riderName}` : ""}
                </p>
                {shipment.external.deliveryOtp && (
                  <p className="text-slate-800">
                    Delivery code: <span className="font-mono text-base font-bold tracking-widest">{shipment.external.deliveryOtp}</span>
                    <span className="block text-slate-500">Share it with the rider only when you receive this parcel.</span>
                  </p>
                )}
                {shipment.external.returnToOrigin && (
                  <p className="text-orange-800">
                    {shipment.external.returnToOrigin === "COMPLETED" ? "Returned to the store after a failed delivery." : "Delivery failed; being returned to the store."}
                  </p>
                )}
                {shipment.external.cancellationRequest === "AWAITING_PROVIDER" ? (
                  <p className="text-amber-800">Cancellation requested. Waiting for the delivery partner to confirm; any refund for these items follows their confirmation.</p>
                ) : shipment.external.cancellationRequest === "BLOCKED" ? (
                  <p className="text-amber-800">The delivery partner could not cancel this delivery. Our support team will contact you; no refund has been made yet.</p>
                ) : shipment.external.cancellation && shipment.external.cancellation !== "CONFIRMED" && shipment.external.cancellationRequest !== "WITHDRAWN" && (
                  <p className="text-amber-800">Cancellation in progress with the delivery partner.</p>
                )}
                {safeTrackUrl(shipment.external.trackUrl) && (
                  <a href={safeTrackUrl(shipment.external.trackUrl)} target="_blank" rel="noopener noreferrer" className="font-semibold text-rose-700 underline">
                    Track this delivery
                  </a>
                )}
              </div>
            )}
            {!!shipment.timeline?.length && (
              <ol className="mt-2 space-y-1 border-l border-slate-200 pl-3">
                {shipment.timeline.map(event => (
                  <li key={event.type} className="text-[11px] text-slate-700">
                    <span className="font-semibold">{event.label}</span>
                    <span className="text-slate-500">
                      {" · "}
                      {event.timestampAvailable && event.at ? new Date(event.at).toLocaleString() : "time not recorded"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
