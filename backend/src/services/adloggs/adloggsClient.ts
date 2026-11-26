import axios from "axios";
import { ADLOGGS_PATHS, ADLOGGS_PICKUP_SEMANTICS_CONFIRMED, AdloggsConfig, adloggsAuthHeader, adloggsCapabilities, loadAdloggsConfig } from "./adloggsConfig";
import { AdloggsError } from "./adloggsErrors";
import type {
  AdloggsCancelResult, AdloggsCreateOrderRequest, AdloggsCreateOrderResult, AdloggsCurrentStatus,
  AdloggsServiceabilityRequest, AdloggsServiceabilityResult, AdloggsWalletResult,
} from "./adloggsTypes";

/**
 * Typed client for the five documented Adloggs endpoints (all POST,
 * header `x-api-key`). Business outcomes come from the documented envelope
 * `{ status, code, message, data }` — never from the HTTP status alone.
 * No automatic retries anywhere (create-order is not documented as idempotent).
 */

export interface AdloggsTransportRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  maxResponseBytes: number;
}
export interface AdloggsTransportResponse { httpStatus: number; body: unknown }
export type AdloggsTransport = (request: AdloggsTransportRequest) => Promise<AdloggsTransportResponse>;

export const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
/** Errors raised before any bytes could reach the provider. */
const NOT_SENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ERR_INVALID_URL", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT"]);
const TIMEOUT_CODES = new Set(["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT"]);

/** Default transport: axios with bounded time and size, no redirects to other hosts, no retries. */
export const axiosTransport: AdloggsTransport = async request => {
  try {
    const response = await axios.post(request.url, request.body, {
      headers: { ...request.headers, "Content-Type": "application/json", Accept: "application/json" },
      timeout: request.timeoutMs,
      maxContentLength: request.maxResponseBytes,
      maxBodyLength: MAX_REQUEST_BYTES,
      maxRedirects: 0,
      validateStatus: () => true,
      responseType: "json",
      transitional: { clarifyTimeoutError: true },
    });
    return { httpStatus: response.status, body: response.data };
  } catch (error: any) {
    const code = String(error?.code || "");
    if (TIMEOUT_CODES.has(code)) throw new AdloggsError("TIMEOUT", "Adloggs did not answer in time.", { mayHaveReachedProvider: true });
    if (NOT_SENT_CODES.has(code)) throw new AdloggsError("CONNECTION_REFUSED", "Could not connect to Adloggs.", { mayHaveReachedProvider: false });
    if (code === "ERR_BAD_RESPONSE" || /maxContentLength/i.test(String(error?.message))) {
      throw new AdloggsError("MALFORMED_RESPONSE", "Adloggs response was too large or unreadable.", { mayHaveReachedProvider: true });
    }
    throw new AdloggsError("TRANSPORT", "Connection to Adloggs failed after the request may have been sent.", { mayHaveReachedProvider: true });
  }
};

interface Envelope { status: boolean; code: number | null; message: string; data: any; err?: unknown }

function readEnvelope(body: unknown): Envelope | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.status !== "boolean") return null;
  return {
    status: record.status,
    code: typeof record.code === "number" ? record.code : null,
    message: typeof record.message === "string" ? record.message : "",
    data: record.data && typeof record.data === "object" ? record.data : {},
    err: record.err,
  };
}

const UNSERVICEABLE_CODES = new Set(["currently_service_not_available", "distance_too_long"]);
const num = (value: unknown): number | null => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export class AdloggsClient {
  private readonly transport: AdloggsTransport;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: { transport?: AdloggsTransport; env?: NodeJS.ProcessEnv } = {}) {
    this.transport = options.transport ?? axiosTransport;
    this.env = options.env ?? process.env;
  }

  config(): AdloggsConfig {
    return loadAdloggsConfig(this.env);
  }

  /**
   * Whether a create-order request may be submitted. A REAL network transport is
   * blocked until Adloggs confirms pickup_date_time semantics; an injected
   * (test) transport never reaches Adloggs.
   */
  bookingSubmissionAllowed(): boolean {
    return ADLOGGS_PICKUP_SEMANTICS_CONFIRMED || this.transport !== axiosTransport;
  }

  /** Sends one request; returns the success envelope's data or throws a classified AdloggsError. */
  private async post(path: string, body: unknown, options: { createOrder?: boolean } = {}): Promise<{ envelope: Envelope }> {
    const config = this.config();
    const header = adloggsAuthHeader(this.env);
    if (!adloggsCapabilities(config).apiAccessAllowed || !config.baseUrl || !header) {
      throw new AdloggsError("NOT_CONFIGURED", "Adloggs integration is not enabled or not configured.", { mayHaveReachedProvider: false });
    }
    const response = await this.transport({
      url: `${config.baseUrl}${path}`,
      headers: { ...header },
      body,
      timeoutMs: config.requestTimeoutMs,
      maxResponseBytes: MAX_RESPONSE_BYTES,
    });
    const envelope = readEnvelope(response.body);
    if (!envelope) {
      if (response.httpStatus === 401 || response.httpStatus === 403) {
        throw new AdloggsError("AUTH", "Adloggs rejected the API key.", { definitive: true, httpStatus: response.httpStatus });
      }
      const kind = response.httpStatus >= 200 && response.httpStatus < 300 ? "MALFORMED_RESPONSE" : "HTTP_ERROR";
      throw new AdloggsError(kind, `Unexpected Adloggs response (HTTP ${response.httpStatus}).`, {
        httpStatus: response.httpStatus, mayHaveReachedProvider: options.createOrder ? true : undefined,
      });
    }
    if (!envelope.status) {
      const details = { definitive: true, providerCode: envelope.code ?? undefined, providerMessage: envelope.message, httpStatus: response.httpStatus };
      if (/^auth error$/i.test(envelope.message.trim())) throw new AdloggsError("AUTH", "Adloggs rejected the API key.", details);
      if (UNSERVICEABLE_CODES.has(String(envelope.data?.code))) throw new AdloggsError("UNSERVICEABLE", envelope.message || "Location not serviceable.", { ...details, reasonCode: String(envelope.data.code) });
      if (/^riders not available$/i.test(envelope.message.trim())) throw new AdloggsError("RIDER_UNAVAILABLE", "No Adloggs rider available.", details);
      throw new AdloggsError("BUSINESS_REJECTION", envelope.message || "Adloggs rejected the request.", details);
    }
    return { envelope };
  }

  /** POST /aa/oporder/v2/create — one seller shipment. Never retried automatically. */
  async createOrder(payload: AdloggsCreateOrderRequest): Promise<AdloggsCreateOrderResult> {
    if (!this.bookingSubmissionAllowed()) {
      throw new AdloggsError("NOT_PERMITTED", "Bookings are blocked until Adloggs confirms pickup_date_time semantics. Nothing was sent.",
        { mayHaveReachedProvider: false });
    }
    const { envelope } = await this.post(ADLOGGS_PATHS.createOrder, payload, { createOrder: true });
    const data = envelope.data ?? {};
    const orderUuid = typeof data.order_uuid === "string" ? data.order_uuid.trim() : "";
    const partnerOrderId = data.partner_order_id === undefined || data.partner_order_id === null ? "" : String(data.partner_order_id);
    if (!orderUuid || orderUuid.length > 200 || !partnerOrderId) {
      // status:true without the documented identifiers: something may exist at Adloggs.
      throw new AdloggsError("MALFORMED_RESPONSE", "Adloggs reported success without a valid order_uuid/partner_order_id.", { mayHaveReachedProvider: true });
    }
    return {
      orderUuid,
      partnerOrderId,
      trackUrl: typeof data.trackUrl === "string" ? data.trackUrl : undefined,
      fee: num(data.fee),
      distanceKm: num(data.distance),
    };
  }

  /**
   * POST /aa/oporder/v1.2/service/availability. "Not serviceable" is a normal
   * answer, not an exception. The doc uses both `service_available` and
   * `service_availability`; both are read.
   */
  async checkServiceAvailability(request: AdloggsServiceabilityRequest): Promise<AdloggsServiceabilityResult> {
    try {
      const { envelope } = await this.post(ADLOGGS_PATHS.serviceAvailability, request);
      const data = envelope.data ?? {};
      const available = data.service_available ?? data.service_availability;
      if (available !== true) return { available: false, code: typeof data.code === "string" ? data.code : null, message: envelope.message || "Service not available." };
      return { available: true, etaToPickupMin: num(data.to_pickup?.eta_min), distanceKm: num(data.distance), estimatedPrice: num(data.estimated_price) };
    } catch (error) {
      if (error instanceof AdloggsError && error.kind === "UNSERVICEABLE") {
        return { available: false, code: error.reasonCode ?? null, message: error.providerMessage || error.message };
      }
      throw error;
    }
  }

  /** POST /aa/oporder/getcurrentstatus */
  async getCurrentStatus(orderUuid: string): Promise<AdloggsCurrentStatus> {
    const { envelope } = await this.post(ADLOGGS_PATHS.currentStatus, { order_uuid: orderUuid });
    const data = envelope.data ?? {};
    const statusCode = num(data.order_status_id);
    if (typeof data.order_uuid !== "string" || data.order_uuid !== orderUuid || statusCode === null || !Number.isInteger(statusCode)) {
      throw new AdloggsError("MALFORMED_RESPONSE", "Adloggs status response did not match the requested order.");
    }
    return {
      orderUuid,
      statusCode,
      isReturn: typeof data.is_return === "boolean" ? data.is_return : null,
      riderName: typeof data.deliveryStaffDetails?.name === "string" ? data.deliveryStaffDetails.name.slice(0, 120) : null,
      partnerOrderId: typeof data.partner_order_id === "string" || typeof data.partner_order_id === "number" ? String(data.partner_order_id).slice(0, 100) : null,
    };
  }

  /** POST /aa/oporder/v1.2/cancel — documented as not allowed after pickup. */
  async cancelOrder(orderUuid: string, description: string): Promise<AdloggsCancelResult> {
    try {
      await this.post(ADLOGGS_PATHS.cancelOrder, { order_uuid: orderUuid, order_cancel_description: description.slice(0, 200) });
      return { cancelled: true };
    } catch (error) {
      if (error instanceof AdloggsError && error.kind === "BUSINESS_REJECTION") {
        const message = (error.providerMessage || "").trim();
        const reason = /^order already picked up\.?$/i.test(message) ? "ALREADY_PICKED_UP"
          : /^order already delivered\.?$/i.test(message) ? "ALREADY_DELIVERED"
            : /^invalid order uuid$/i.test(message) ? "INVALID_ORDER_UUID" : "UNKNOWN_REJECTION";
        return { cancelled: false, reason, message };
      }
      throw error;
    }
  }

  /** POST /aa/oporder/wallet/balance — "wallet not enabled" is documented with status:true. */
  async getWalletBalance(partnerMerchantId?: number): Promise<AdloggsWalletResult> {
    const { envelope } = await this.post(ADLOGGS_PATHS.walletBalance, partnerMerchantId === undefined ? {} : { partner_merchant_id: partnerMerchantId });
    const data = envelope.data ?? {};
    if (data.code === "wallet_not_enabled") return { state: "WALLET_NOT_ENABLED" };
    if (typeof data.wallet_balance === "string" && /^-?\d+(\.\d+)?$/.test(data.wallet_balance)) return { state: "VERIFIED", balance: data.wallet_balance };
    throw new AdloggsError("MALFORMED_RESPONSE", "Adloggs wallet response had no readable balance.");
  }
}
