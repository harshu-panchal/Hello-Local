/**
 * Adloggs configuration (Phase 6). Server-side only; fails closed.
 *
 * - Hosts come from a fixed map of the two documented environments; there is
 *   no configurable URL, so the API key can never be sent to another host.
 * - Production use is blocked in code for this phase, whatever the env says.
 * - COD is blocked in code: remittance and reconciliation are undocumented.
 * - A present API key alone never makes anything operational; every
 *   capability has its own explicit flag.
 * - The key is never returned by any function except the client's header
 *   builder, and is never logged.
 */

export const ADLOGGS_HOSTS = {
  development: "https://dev.adloggs.com",
  production: "https://app.adloggs.com",
} as const;
export type AdloggsEnvironment = keyof typeof ADLOGGS_HOSTS;

/** Live/production use is not authorised in Phase 6. */
export const ADLOGGS_PRODUCTION_ACTIVATION_ALLOWED = false;
/**
 * Adloggs COD (enabled by business decision, Nov 2026): Adloggs riders collect
 * the cash and Adloggs settles it with Hello Local on its platform
 * (dashboard: Receivables > COD Settlement). Still needs ADLOGGS_COD_ENABLED=true
 * and a booking-ready configuration; production stays behind the activation gates.
 */
export const ADLOGGS_COD_ALLOWED = true;
/**
 * Seller settlement for Adloggs-delivered orders (Phase 7). The effect is
 * queued durably but HELD until the business approves the settlement policy
 * (see backend/docs/ADLOGGS_INTEGRATION.md, "Seller settlement decisions").
 */
export const ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED = false;
/**
 * Webhook authentication. Adloggs documents no signature or header (API doc:
 * "client authentication"; Go-Live guide: just "enter the URL"). We therefore
 * use a mechanism we control: a long random secret, ADLOGGS_WEBHOOK_TOKEN,
 * which must appear in the registered URL (/webhooks/adloggs/<token>) or in the
 * x-hellolocal-webhook-token header, compared in constant time. Without a
 * configured token every webhook call is rejected.
 */
export const ADLOGGS_WEBHOOK_AUTH_CONTRACT_CONFIRMED = true;
/** Minimum length of ADLOGGS_WEBHOOK_TOKEN (URL-safe characters only). */
export const ADLOGGS_WEBHOOK_TOKEN_MIN_LENGTH = 32;

/**
 * APPROVED initial pickup window (business decision). Used when
 * ADLOGGS_PICKUP_WINDOW_MINUTES is not set.
 */
export const ADLOGGS_APPROVED_PICKUP_WINDOW_MINUTES = 30;
/**
 * Provider-contract gate for `pickup_date_time`. CONFIRMED: the API doc defines
 * it as "the time before which the pickup should be collected" (a deadline),
 * and Adloggs confirmed on a call (Nov 2026) that a 15-30 minute window is
 * normal and not a hard rule. We send booking time + the approved 30 minutes.
 * Setting this back to false blocks every real create-order request again.
 */
export const ADLOGGS_PICKUP_SEMANTICS_CONFIRMED = true;
/**
 * COD gate for Adloggs is ADLOGGS_COD_ALLOWED (above). Online and COD keep
 * independent internal gates for testing and emergency safety, but the
 * approved launch is SIMULTANEOUS: live activation needs both verified.
 */

/**
 * Online-only activation requirements. Each becomes true only in a reviewed
 * change once its evidence exists (real sandbox runs, approvals, tests).
 * Adloggs cannot be made selectable for live orders while any is false
 * (enforced by tests against ADDLOGS_INTEGRATION_AVAILABLE).
 */
export const ADLOGGS_ACTIVATION_REQUIREMENTS: Readonly<Record<string, { met: boolean; label: string; scope: "ONLINE" | "COD" | "BOTH" }>> = {
  // Verified 2026-11-26 on dev.adloggs.com: one synthetic Online booking created (order_uuid + track URL +
  // fee returned, partner_order_id echoed), status read (2 Pending -> 6 Cancelled), cancelled before pickup.
  sandboxBooking: { met: true, scope: "BOTH", label: "A real sandbox booking succeeded and its response was validated" },
  statusTracking: { met: true, scope: "BOTH", label: "Status tracking verified against a real sandbox booking" },
  cancellation: { met: true, scope: "BOTH", label: "Cancellation before pickup verified against a real sandbox booking" },
  pickupPolicy: { met: ADLOGGS_PICKUP_SEMANTICS_CONFIRMED, scope: "BOTH", label: "pickup_date_time semantics confirmed by Adloggs (30-minute window already approved)" },
  merchantProductRequirements: { met: false, scope: "BOTH", label: "Merchant, category and weight requirements confirmed by Adloggs; every eligible seller's pickup data and product weights complete" },
  unknownOutcomeRecovery: { met: false, scope: "BOTH", label: "Unknown-outcome recovery approved (duplicate/lookup behaviour confirmed)" },
  cancellationRefund: { met: false, scope: "BOTH", label: "Cancellation and refund handling verified end to end" },
  sellerSettlement: { met: ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED, scope: "BOTH", label: "Seller settlement for external deliveries approved, tested and enabled" },
  rtoResolution: { met: false, scope: "BOTH", label: "Operational RTO resolution process approved" },
  // Mechanism exists (secret-token URL); met only once Adloggs validates the 4 Go-Live webhook test cases.
  statusUpdates: { met: false, scope: "BOTH", label: "Authenticated webhooks validated by Adloggs (4 Go-Live test cases)" },
  databaseVerification: { met: false, scope: "BOTH", label: "Database and concurrency verification on a dedicated test database" },
  // COD (simultaneous launch): nothing here is assumed; each needs Adloggs' COD documentation.
  codEnabledInCode: { met: ADLOGGS_COD_ALLOWED, scope: "COD", label: "Adloggs COD gate enabled in a reviewed change (ADLOGGS_COD_ALLOWED)" },
  codAllocation: { met: false, scope: "COD", label: "Per-shipment COD collectible allocation approved (sums exactly to the customer payable)" },
  codSandboxBooking: { met: false, scope: "COD", label: "A real sandbox COD booking verified (collectible_amount accepted as sent)" },
  codCollection: { met: false, scope: "COD", label: "COD collection confirmation from Adloggs verified (how and when collection is reported)" },
  codRemittance: { met: false, scope: "COD", label: "COD remittance schedule, statements and deductions documented and reconciled" },
  codFailedCollection: { met: false, scope: "COD", label: "Failed and partial COD collection handling documented and implemented" },
  codRto: { met: false, scope: "COD", label: "RTO of COD shipments (no collection) handled and reconciled" },
  codSellerSettlement: { met: false, scope: "COD", label: "Seller settlement for Adloggs COD approved and tested (never the in-house courier cash flow)" },
};

/** Labels of the activation requirements that are not met yet. */
export function adloggsActivationBlockers(): string[] {
  return Object.values(ADLOGGS_ACTIVATION_REQUIREMENTS).filter(requirement => !requirement.met).map(requirement => requirement.label);
}

export const ADLOGGS_PATHS = {
  createOrder: "/aa/oporder/v2/create",
  serviceAvailability: "/aa/oporder/v1.2/service/availability",
  currentStatus: "/aa/oporder/getcurrentstatus",
  cancelOrder: "/aa/oporder/v1.2/cancel",
  walletBalance: "/aa/oporder/wallet/balance",
} as const;

export interface AdloggsConfig {
  environment: AdloggsEnvironment | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  integrationEnabled: boolean;
  bookingWorkerEnabled: boolean;
  statusPollingEnabled: boolean;
  cancellationWorkerEnabled: boolean;
  webhookEnabled: boolean;
  /** A valid ADLOGGS_WEBHOOK_TOKEN is configured (the value itself is never exposed). */
  hasWebhookToken: boolean;
  codRequested: boolean;
  /** Minutes after booking used for pickup_date_time; no policy is assumed when unset. */
  pickupWindowMinutes: number | null;
  requestTimeoutMs: number;
  statusPollIntervalSeconds: number;
  problems: string[];
}

const flag = (value: string | undefined) => value === "true";

function readApiKey(env: NodeJS.ProcessEnv): string | null {
  const key = env.ADLOGGS_API_KEY?.trim();
  if (!key || key.length < 8 || key.length > 512 || /\s/.test(key)) return null;
  return key;
}

function boundedInt(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function loadAdloggsConfig(env: NodeJS.ProcessEnv = process.env): AdloggsConfig {
  const problems: string[] = [];
  const rawEnv = env.ADLOGGS_ENVIRONMENT?.trim();
  let environment: AdloggsEnvironment | null = null;
  if (rawEnv === "development" || rawEnv === "production") environment = rawEnv;
  else problems.push(rawEnv ? "ADLOGGS_ENVIRONMENT must be exactly 'development' or 'production'." : "ADLOGGS_ENVIRONMENT is not set.");

  let baseUrl: string | null = environment ? ADLOGGS_HOSTS[environment] : null;
  if (environment === "production" && !ADLOGGS_PRODUCTION_ACTIVATION_ALLOWED) {
    baseUrl = null; // fail closed: never reach the production host in this phase
    problems.push("Production Adloggs use is blocked until production activation is approved.");
  }
  const hasApiKey = readApiKey(env) !== null;
  if (!hasApiKey) problems.push(env.ADLOGGS_API_KEY ? "ADLOGGS_API_KEY is malformed." : "ADLOGGS_API_KEY is not set.");

  // Approved business default (30) when unset; booking still needs ADLOGGS_PICKUP_SEMANTICS_CONFIRMED.
  const pickupWindowMinutes = env.ADLOGGS_PICKUP_WINDOW_MINUTES === undefined || env.ADLOGGS_PICKUP_WINDOW_MINUTES === ""
    ? ADLOGGS_APPROVED_PICKUP_WINDOW_MINUTES : boundedInt(env.ADLOGGS_PICKUP_WINDOW_MINUTES, 5, 1440);
  if (env.ADLOGGS_PICKUP_WINDOW_MINUTES !== undefined && pickupWindowMinutes === null) problems.push("ADLOGGS_PICKUP_WINDOW_MINUTES must be an integer from 5 to 1440.");

  return {
    environment,
    baseUrl,
    hasApiKey,
    integrationEnabled: flag(env.ADLOGGS_INTEGRATION_ENABLED),
    bookingWorkerEnabled: flag(env.ADLOGGS_BOOKING_WORKER_ENABLED),
    statusPollingEnabled: flag(env.ADLOGGS_STATUS_POLLING_ENABLED),
    cancellationWorkerEnabled: flag(env.ADLOGGS_CANCELLATION_WORKER_ENABLED),
    webhookEnabled: flag(env.ADLOGGS_WEBHOOK_ENABLED),
    hasWebhookToken: adloggsWebhookToken(env) !== null,
    codRequested: flag(env.ADLOGGS_COD_ENABLED),
    pickupWindowMinutes,
    requestTimeoutMs: boundedInt(env.ADLOGGS_REQUEST_TIMEOUT_MS, 1000, 30000) ?? 10000,
    statusPollIntervalSeconds: boundedInt(env.ADLOGGS_STATUS_POLL_INTERVAL_SECONDS, 30, 3600) ?? 120,
    problems,
  };
}

/** Header value for the client only. Not exported through any status API. */
export function adloggsAuthHeader(env: NodeJS.ProcessEnv = process.env): { "x-api-key": string } | null {
  const key = readApiKey(env);
  return key ? { "x-api-key": key } : null;
}

export interface AdloggsCapabilities {
  environment: AdloggsEnvironment | null;
  configured: boolean;
  /** The integration may call the documented API at all (development host only in this phase). */
  apiAccessAllowed: boolean;
  serviceabilityReady: boolean;
  bookingReady: boolean;
  statusReconciliationReady: boolean;
  cancellationReady: boolean;
  webhookReady: boolean;
  onlinePaymentReady: boolean;
  codReady: boolean;
  /** Whether Adloggs may take live customer orders. Always false in Phase 6. */
  productionActivationEligible: false;
  blockers: string[];
}

export function adloggsCapabilities(config: AdloggsConfig = loadAdloggsConfig()): AdloggsCapabilities {
  const blockers = [...config.problems];
  if (!config.integrationEnabled) blockers.push("ADLOGGS_INTEGRATION_ENABLED is not 'true'.");
  const apiAccessAllowed = config.integrationEnabled && !!config.baseUrl && config.hasApiKey;
  const bookingReady = apiAccessAllowed && config.bookingWorkerEnabled && config.pickupWindowMinutes !== null;
  if (!config.bookingWorkerEnabled) blockers.push("Booking worker is disabled (ADLOGGS_BOOKING_WORKER_ENABLED).");
  if (config.pickupWindowMinutes === null) blockers.push("Pickup deadline policy is not configured (ADLOGGS_PICKUP_WINDOW_MINUTES); none is assumed.");
  if (!ADLOGGS_PICKUP_SEMANTICS_CONFIRMED) blockers.push("Real bookings are blocked until Adloggs confirms pickup_date_time semantics (the 30-minute window is approved but not yet usable).");
  if (!ADLOGGS_WEBHOOK_AUTH_CONTRACT_CONFIRMED) blockers.push("Webhook authentication contract is not confirmed by Adloggs; webhooks are rejected.");
  else if (!config.webhookEnabled) blockers.push("Webhooks are switched off (ADLOGGS_WEBHOOK_ENABLED); status comes from polling.");
  else if (!config.hasWebhookToken) blockers.push(`Webhooks need ADLOGGS_WEBHOOK_TOKEN (at least ${ADLOGGS_WEBHOOK_TOKEN_MIN_LENGTH} URL-safe characters).`);
  if (!config.codRequested) blockers.push("Adloggs COD is switched off (ADLOGGS_COD_ENABLED).");
  for (const missing of adloggsActivationBlockers()) blockers.push(`Live activation requires: ${missing}.`);
  return {
    environment: config.environment,
    configured: config.environment !== null && config.hasApiKey,
    apiAccessAllowed,
    serviceabilityReady: apiAccessAllowed,
    bookingReady,
    statusReconciliationReady: apiAccessAllowed && config.statusPollingEnabled,
    cancellationReady: apiAccessAllowed && config.cancellationWorkerEnabled,
    // Receiving webhooks needs no API key: only the switch and our own secret token.
    webhookReady: ADLOGGS_WEBHOOK_AUTH_CONTRACT_CONFIRMED && config.webhookEnabled && config.hasWebhookToken,
    onlinePaymentReady: bookingReady,
    codReady: bookingReady && config.codRequested && ADLOGGS_COD_ALLOWED,
    productionActivationEligible: false,
    blockers: [...new Set(blockers)],
  };
}

/** Webhook secret for the server only (never exported through any status API). */
export function adloggsWebhookToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.ADLOGGS_WEBHOOK_TOKEN?.trim();
  if (!token || token.length < ADLOGGS_WEBHOOK_TOKEN_MIN_LENGTH || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  return token;
}
