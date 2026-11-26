import api from "../config";

/** Admin-only Adloggs API. The server never returns the API key. */

export interface AdloggsCapabilities {
  environment: "development" | "production" | null;
  configured: boolean;
  apiAccessAllowed: boolean;
  serviceabilityReady: boolean;
  bookingReady: boolean;
  statusReconciliationReady: boolean;
  cancellationReady: boolean;
  webhookReady: boolean;
  onlinePaymentReady: boolean;
  codReady: boolean;
  productionActivationEligible: false;
  blockers: string[];
}

export type AdloggsWallet =
  | { state: "NOT_CONFIGURED"; message: string }
  | { state: "UNAVAILABLE"; message: string; lastVerified: { balance?: string; retrievedAt: string } | null }
  | { state: "WALLET_NOT_ENABLED"; retrievedAt: string }
  | { state: "VERIFIED"; balance: string; currency: "INR"; retrievedAt: string };

export interface AdloggsAdminStatus {
  environment: "development" | "production" | null;
  integrationEnabled: boolean;
  apiKeyConfigured: boolean;
  capabilities: AdloggsCapabilities;
  connectivity: { verified: boolean; lastCheckedAt: string | null; lastError: string | null };
  wallet: { state: "VERIFIED" | "WALLET_NOT_ENABLED"; balance?: string; retrievedAt: string } | null;
}

export const getAdloggsStatus = async () =>
  (await api.get<{ success: boolean; data: AdloggsAdminStatus }>("/admin/delivery-providers/adloggs")).data;

export const testAdloggsConnectivity = async () =>
  (await api.post<{ success: boolean; data: { connected: boolean; wallet: AdloggsWallet } }>("/admin/delivery-providers/adloggs/connectivity-test")).data;

export type UnknownOutcomeAction = "RECORD_INVESTIGATION" | "VERIFY_PROVIDER_ORDER" | "REQUEST_REBOOK" | "APPROVE_REBOOK";

/**
 * Handle an unknown booking outcome (audited; the acting admin comes from the session).
 * Refusals come back as HTTP 409 with an explanatory message.
 */
export const resolveAdloggsBookingOutcome = async (shipmentId: string, body: {
  action: UnknownOutcomeAction; reason: string; evidence?: string; orderUuid?: string; providerReference?: string;
}) => (await api.post<{ success: boolean; state: string; message: string }>(`/admin/shipments/${shipmentId}/adloggs/resolve-outcome`, body)).data;

export type ExternalCancellationAction =
  | "ACCEPT_PROVIDER_CANCELLATION" | "REBOOK_AFTER_PROVIDER_CANCELLATION" | "RETRY_PROVIDER_CANCELLATION" | "WITHDRAW_CANCELLATION_REQUEST"
  | "RESOLVE_RTO_REFUND_RESTOCK" | "RESOLVE_RTO_REFUND_NO_RESTOCK";

/** Audited decision on an Adloggs cancellation (refunds only after verified provider cancellation). */
export const resolveAdloggsCancellation = async (shipmentId: string, body: { action: ExternalCancellationAction; reason: string }) =>
  (await api.post<{ success: boolean; state: string; message: string }>(`/admin/shipments/${shipmentId}/adloggs/cancellation`, body)).data;

export interface AdloggsDataReadiness {
  policy: { pickupWindowConfigured: boolean };
  sellers: { approved: number; missingPickupDetails: number; examples: { id: string; storeName: string; missing: string[] }[] };
  products: { activePublished: number; missingShippingWeight: number; bySeller: { sellerId: string; storeName: string; count: number }[] };
}

/** Missing seller/product data that blocks Adloggs bookings (read-only). */
export const getAdloggsReadiness = async () =>
  (await api.get<{ success: boolean; data: AdloggsDataReadiness }>("/admin/delivery-providers/adloggs/readiness")).data;

export interface RtoPreview {
  verified: boolean;
  resolution: "PENDING_DECISION" | "REFUNDED" | null;
  evidence: { status: string; receivedAt: string; source: string }[];
  reason: string;
  refund: null | {
    eligible: boolean;
    basis: "ITEMS" | "REMAINING_BALANCE" | "NOT_PREPAID";
    amount: number;
    lines: { productName: string; quantity: number; total: number; discount: number; net: number }[];
    components?: { orderTotal: number; alreadyRefunded: number; shipping: number; platformFee: number; tip: number };
    note: string;
  };
}

/** Read-only: provider evidence, reason and the refund the existing rules would produce. */
export const getAdloggsRtoPreview = async (shipmentId: string) =>
  (await api.get<{ success: boolean; data: RtoPreview }>(`/admin/shipments/${shipmentId}/adloggs/rto-preview`)).data;
