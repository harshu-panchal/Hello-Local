import type { AdloggsProviderStatus, ShipmentStatus } from "../../models/Shipment";

/**
 * Adloggs order_status_id values (API doc V2, "ORDER STATUSES") and an
 * explicit transition model. Numeric codes are NOT ordered (11 comes before
 * 4, 8 before 5), so progression is decided by the sequences below, never by
 * comparing numbers.
 */
export const ADLOGGS_STATUS_BY_CODE: Record<number, AdloggsProviderStatus> = {
  2: "PENDING",
  3: "ASSIGNED",
  11: "ARRIVED_AT_PICKUP",
  4: "PICKED_UP",
  9: "OUT_FOR_DELIVERY",
  8: "ARRIVED_AT_DELIVERY",
  5: "DELIVERED",
  6: "CANCELLED",
  13: "RETURN_INITIATED",
  14: "RTO_DELIVERED",
};

export const ADLOGGS_STATUS_LABELS: Record<AdloggsProviderStatus, string> = {
  PENDING: "Booked, awaiting rider",
  ASSIGNED: "Rider assigned",
  ARRIVED_AT_PICKUP: "Rider at the store",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  ARRIVED_AT_DELIVERY: "Rider at delivery location",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled by delivery partner",
  RETURN_INITIATED: "Returning to store",
  RTO_DELIVERED: "Returned to store",
};

const FORWARD: AdloggsProviderStatus[] = ["PENDING", "ASSIGNED", "ARRIVED_AT_PICKUP", "PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED_AT_DELIVERY", "DELIVERED"];
const PRE_PICKUP: Array<AdloggsProviderStatus | null> = [null, "PENDING", "ASSIGNED", "ARRIVED_AT_PICKUP"];
const IN_TRANSIT: AdloggsProviderStatus[] = ["PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED_AT_DELIVERY"];
export const TERMINAL_ADLOGGS_STATUSES: AdloggsProviderStatus[] = ["DELIVERED", "CANCELLED", "RTO_DELIVERED"];

export type ProviderTransitionVerdict =
  | "APPLY"        // valid forward/branch move (skipped intermediate events allowed)
  | "DUPLICATE"    // same status again
  | "STALE"        // older event arriving late (e.g. ASSIGNED after PICKED_UP): ignore quietly
  | "INVALID";     // contradicts what we know (e.g. CANCELLED after pickup): needs an admin

export function judgeProviderTransition(from: AdloggsProviderStatus | null | undefined, to: AdloggsProviderStatus): ProviderTransitionVerdict {
  const current = from ?? null;
  if (current === to) return "DUPLICATE";
  if (current && TERMINAL_ADLOGGS_STATUSES.includes(current)) {
    // Anything after a terminal state is either a late forward event or a contradiction.
    if (current === "DELIVERED" && FORWARD.includes(to)) return "STALE";
    if (current === "RTO_DELIVERED" && (FORWARD.slice(0, 6).includes(to) || to === "RETURN_INITIATED")) return "STALE";
    return "INVALID";
  }
  if (to === "CANCELLED") return PRE_PICKUP.includes(current) ? "APPLY" : "INVALID";
  if (to === "RETURN_INITIATED") {
    if (current && IN_TRANSIT.includes(current)) return "APPLY";
    return PRE_PICKUP.includes(current) ? "INVALID" : "STALE";
  }
  if (to === "RTO_DELIVERED") return current === "RETURN_INITIATED" || (current !== null && IN_TRANSIT.includes(current)) ? "APPLY" : "INVALID";
  if (current === "RETURN_INITIATED") {
    // On the return branch: forward delivery events are late/stale; delivery itself contradicts it.
    return to === "DELIVERED" ? "INVALID" : "STALE";
  }
  const fromIndex = current === null ? -1 : FORWARD.indexOf(current);
  const toIndex = FORWARD.indexOf(to);
  return toIndex > fromIndex ? "APPLY" : "STALE";
}

/** Internal shipment status implied by a provider status (null = no change). */
export function shipmentStatusForProvider(status: AdloggsProviderStatus): ShipmentStatus | null {
  if (IN_TRANSIT.includes(status) || status === "RETURN_INITIATED") return "PICKED_UP";
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "RTO_DELIVERED") return "RETURNED_TO_ORIGIN";
  return null; // pre-pickup states and provider cancellation do not move the shipment by themselves
}

/** Approved tracking hosts: the two documented Adloggs environments, HTTPS only. */
const TRACKING_HOSTS = new Set(["dev.adloggs.com", "app.adloggs.com"]);
export function safeTrackingUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 500) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !TRACKING_HOSTS.has(url.hostname) || url.username || url.password || url.port) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
