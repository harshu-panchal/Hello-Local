/**
 * The single authoritative order-status vocabulary and transition table.
 *
 * Before this existed the codebase held four disagreeing definitions:
 *   - Order.ts               12 enum values
 *   - orderService.ts        9 different values, in a validator nothing called
 *   - seller/orderController 6 values, applied with no state check at all
 *   - admin/orderController  9 values, likewise unchecked
 *   - delivery controller    accepted any string
 *
 * so an order could go Delivered -> Pending, or Cancelled -> Delivered, and
 * each hop re-triggered the money side-effects bound to that status. (#H-05)
 */

export const ORDER_STATUSES = [
  "Pending",           // created, awaiting online payment
  "Received",          // paid (or COD placed) — visible to the seller
  "Accepted",          // seller accepted
  "Processed",         // seller prepared
  "Shipped",           // handed to the courier
  "Picked up",         // courier collected from the seller
  "Out for Delivery",  // en route to the customer
  "Delivered",         // completed
  "Cancelled",
  "Rejected",
  "Returned",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses from which nothing further may happen. */
export const TERMINAL_STATUSES: OrderStatus[] = [
  "Cancelled",
  "Rejected",
  "Returned",
];

/**
 * Legacy alias retained in the Order enum for historical rows.
 * "On the way" was written by the seller panel; it means Out for Delivery.
 */
export const STATUS_ALIASES: Record<string, OrderStatus> = {
  "On the way": "Out for Delivery",
};

export function normalizeStatus(status: string): OrderStatus | null {
  const aliased = STATUS_ALIASES[status] ?? status;
  return (ORDER_STATUSES as readonly string[]).includes(aliased)
    ? (aliased as OrderStatus)
    : null;
}

/** Who is attempting the transition. Each actor gets a different subset. */
export type OrderActor = "customer" | "seller" | "delivery" | "admin" | "system";

/** from -> allowed next states */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ["Received", "Cancelled", "Rejected"],
  Received: ["Accepted", "Processed", "Cancelled", "Rejected"],
  Accepted: ["Processed", "Shipped", "Picked up", "Cancelled", "Rejected"],
  Processed: ["Shipped", "Picked up", "Cancelled", "Rejected"],
  Shipped: ["Picked up", "Out for Delivery", "Cancelled"],
  "Picked up": ["Out for Delivery", "Cancelled"],
  "Out for Delivery": ["Delivered", "Cancelled"],
  Delivered: ["Returned"],
  Cancelled: [],
  Rejected: [],
  Returned: [],
};

/** What each actor is permitted to set, independent of the current state. */
const ACTOR_PERMISSIONS: Record<OrderActor, OrderStatus[]> = {
  // Customers may only cancel, and only before dispatch (enforced by TRANSITIONS).
  customer: ["Cancelled"],
  // Sellers run the fulfilment stages up to handing the parcel over.
  seller: ["Accepted", "Processed", "Shipped", "Cancelled", "Rejected"],
  // Couriers move the parcel. "Delivered" is deliberately absent: completion
  // must go through delivery-OTP verification. (#C-08 / #H-37)
  delivery: ["Picked up", "Out for Delivery"],
  // Admin can drive any stage for support purposes, but still only along legal
  // edges — no resurrecting a terminal order.
  admin: [...ORDER_STATUSES],
  // Internal transitions (payment capture, OTP verification).
  system: [...ORDER_STATUSES],
};

export interface TransitionResult {
  valid: boolean;
  /** The canonical status to persist (aliases resolved). */
  status?: OrderStatus;
  message?: string;
}

/**
 * Validate a status change. This is the only place the rules live.
 */
export function validateTransition(
  current: string,
  requested: string,
  actor: OrderActor,
): TransitionResult {
  const to = normalizeStatus(requested);
  if (!to) {
    return {
      valid: false,
      message: `Unknown order status "${requested}". Valid: ${ORDER_STATUSES.join(", ")}`,
    };
  }

  const from = normalizeStatus(current);
  if (!from) {
    return { valid: false, message: `Order is in an unrecognised state "${current}".` };
  }

  if (!ACTOR_PERMISSIONS[actor].includes(to)) {
    return {
      valid: false,
      message:
        to === "Delivered" && actor === "delivery"
          ? "Deliveries must be completed by verifying the customer's delivery OTP."
          : `A ${actor} cannot set an order to "${to}".`,
    };
  }

  if (from === to) {
    return { valid: false, message: `Order is already ${to}.` };
  }

  if (TERMINAL_STATUSES.includes(from)) {
    return {
      valid: false,
      message: `Order is ${from} and can no longer be changed.`,
    };
  }

  if (!TRANSITIONS[from].includes(to)) {
    return {
      valid: false,
      message: `Cannot move an order from ${from} to ${to}. Allowed from ${from}: ${
        TRANSITIONS[from].join(", ") || "nothing"
      }.`,
    };
  }

  return { valid: true, status: to };
}

/** Statuses that mean the order is still in flight. */
export const ACTIVE_COURIER_STATUSES: OrderStatus[] = [
  "Accepted",
  "Processed",
  "Shipped",
  "Picked up",
  "Out for Delivery",
];

/** True when stock committed to this order should be returned to the shelf. */
export function releasesStock(to: OrderStatus): boolean {
  return to === "Cancelled" || to === "Rejected" || to === "Returned";
}
