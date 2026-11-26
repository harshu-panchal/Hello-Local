/**
 * Adloggs error taxonomy. Messages are sanitised (truncated, long digit runs
 * redacted) and never contain request bodies, headers, addresses, phone
 * numbers, OTPs or the API key.
 */
export type AdloggsErrorKind =
  | "NOT_CONFIGURED"      // integration disabled / not configured — nothing was sent
  | "CONNECTION_REFUSED"  // could not connect — nothing was sent
  | "TRANSPORT"           // connection dropped after the request may have been sent
  | "TIMEOUT"             // no answer in time — the request may have been processed
  | "HTTP_ERROR"          // non-2xx without a provider envelope
  | "AUTH"                // documented "Auth Error"
  | "UNSERVICEABLE"       // documented serviceability codes
  | "RIDER_UNAVAILABLE"   // documented "Riders not available"
  | "BUSINESS_REJECTION"  // provider answered status:false (e.g. validation, code 202)
  | "MALFORMED_RESPONSE"  // unparseable or contract-violating response
  | "NOT_PERMITTED";      // blocked locally by a contract gate — nothing was sent

export class AdloggsError extends Error {
  readonly kind: AdloggsErrorKind;
  /** The provider definitely answered with a failure (no create happened, per the documented envelope). */
  readonly definitive: boolean;
  /** The request may have reached the provider (relevant for create-order). */
  readonly mayHaveReachedProvider: boolean;
  readonly providerCode?: number;
  readonly providerMessage?: string;
  readonly httpStatus?: number;
  /** Documented `data.code` reason (e.g. distance_too_long), when the provider sent one. */
  readonly reasonCode?: string;

  constructor(kind: AdloggsErrorKind, message: string, details: {
    definitive?: boolean; mayHaveReachedProvider?: boolean; providerCode?: number; providerMessage?: string; httpStatus?: number; reasonCode?: string;
  } = {}) {
    super(sanitizeProviderText(message));
    this.name = "AdloggsError";
    this.kind = kind;
    this.definitive = details.definitive ?? false;
    this.mayHaveReachedProvider = details.mayHaveReachedProvider ?? false;
    this.providerCode = details.providerCode;
    this.providerMessage = details.providerMessage === undefined ? undefined : sanitizeProviderText(details.providerMessage);
    this.httpStatus = details.httpStatus;
    this.reasonCode = details.reasonCode;
  }
}

/** Truncate, drop control characters, redact digit runs that could be phones/OTPs/ids. */
export function sanitizeProviderText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\d{4,}/g, "[redacted]")
    .slice(0, 200)
    .trim();
}
