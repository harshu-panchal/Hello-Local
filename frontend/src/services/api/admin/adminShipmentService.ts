import api from "../config";

export type ShipmentFilter =
  | "all" | "preparing" | "ready" | "picked_up" | "delivered" | "cancelled" | "returned" | "awaiting_booking" | "attention"
  | "booking_in_flight" | "booking_unknown" | "booking_confirmed" | "cancellation_pending" | "return_to_origin";

export type OperationalState =
  | "WAITING_FOR_SELLER" | "WAITING_FOR_PICKUP" | "WAITING_FOR_BOOKING_INTEGRATION" | "IN_TRANSIT"
  | "COMPLETED" | "CANCELLED" | "INTERNAL_SYNC_ISSUE" | "OPERATIONAL_FAILURE"
  | "BOOKING_REQUEST_IN_PROGRESS" | "BOOKING_OUTCOME_UNKNOWN" | "BOOKING_CONFIRMED" | "RIDER_ASSIGNED"
  | "OUT_FOR_DELIVERY" | "CANCELLATION_PENDING" | "RETURN_TO_ORIGIN";

export interface AdminShipmentRow {
  id: string;
  shipmentNumber: string;
  order: { id: string; orderNumber: string; status: string } | null;
  seller: { id: string; storeName?: string };
  deliveryProvider: string;
  status: string;
  statusLabel: string;
  readyForPickupAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  bookingStage: string;
  /** providerContacted: false = never sent, "POSSIBLY" = may have reached Adloggs, true = verified booking. */
  bookingIntent: { state: string; attempts: number; lastError: string | null; providerContacted: false | "POSSIBLY" | true } | null;
  /** Verified Adloggs facts (external shipments only). */
  external: {
    orderUuid: string | null; partnerOrderId: string | null; providerStatus: string | null; providerStatusLabel: string | null;
    lastStatusSyncAt: string | null; riderName: string | null; cancellation: string | null; returnToOrigin: string | null;
    outcomeUnknown: boolean; estimatedProviderCost: number | null; providerBookingFee: number | null;
    /** A rebooking request is waiting for a second admin's approval. */
    rebookRequested: boolean;
    /** How the recorded order_uuid was proven to belong to this shipment. */
    correlationSource: "CREATE_RESPONSE" | "STATUS_RESPONSE" | "AUTHENTICATED_WEBHOOK" | null;
    /** Local cancellation waiting for (or blocked by) the provider. Refund follows verified provider cancellation. */
    cancellationRequest: "AWAITING_PROVIDER" | "BLOCKED" | "COMPLETED" | "WITHDRAWN" | null;
    cancellationBlockedReason: string | null;
    /** Adloggs cancelled the delivery itself and no admin decision has been made yet. */
    providerCancelledUnhandled: boolean;
    /** Verified return to origin awaiting (or after) an admin decision. */
    rtoResolution: "PENDING_DECISION" | "REFUNDED" | null;
    rtoVerified: boolean;
  } | null;
  attention: { reason: string; at: string } | null;
  syncPending: boolean;
  missingOrder: boolean;
  operationalState: OperationalState;
  createdAt: string;
}

export interface ShipmentListResponse {
  success: boolean;
  message?: string;
  data: AdminShipmentRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface ShipmentExceptions {
  attention: number;
  syncPendingOrders: number;
  missingShipments: { count: number; windowDays: number };
  readyWaitingPickup: number;
  booking: {
    awaitingIntegration: number;
    attemptInProgress: number;
    retrying: number;
    failed: number;
    cancelled: number;
    integrationAvailable: boolean;
    integrationNote?: string;
  };
}

export const getAdminShipments = async (params: { filter: ShipmentFilter; page: number; limit: number }): Promise<ShipmentListResponse> => {
  const response = await api.get<ShipmentListResponse>("/admin/shipments", { params });
  return response.data;
};

export const getShipmentExceptions = async (): Promise<{ success: boolean; data: ShipmentExceptions }> => {
  const response = await api.get<{ success: boolean; data: ShipmentExceptions }>("/admin/shipments/exceptions");
  return response.data;
};

/** Re-run the idempotent shipment sync for one order (no status overrides). */
export const reconcileOrderShipments = async (orderId: string): Promise<{ success: boolean; message: string }> => {
  const response = await api.post<{ success: boolean; message: string }>(`/admin/shipments/orders/${orderId}/reconcile`);
  return response.data;
};
