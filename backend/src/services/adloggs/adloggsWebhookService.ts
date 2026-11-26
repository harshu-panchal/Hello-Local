import crypto from "crypto";
import { Request, Response } from "express";
import AdloggsWebhookEvent from "../../models/AdloggsWebhookEvent";
import { ADLOGGS_WEBHOOK_AUTH_CONTRACT_CONFIRMED, adloggsCapabilities, loadAdloggsConfig } from "./adloggsConfig";
import { applyAdloggsStatus, ApplyOutcome } from "./adloggsTrackingService";

/**
 * Adloggs status webhook (API doc V2 §5).
 *
 * The document only says "client authentication"; it gives no header,
 * signature, secret format, replay window, acknowledgement or retry policy.
 * Authentication therefore FAILS CLOSED: until the contract is confirmed and
 * implemented in `authenticateAdloggsWebhook`, no request can change state.
 * The processing pipeline below is complete and tested so it can be enabled
 * as soon as the authentication contract exists.
 */

export const MAX_WEBHOOK_BYTES = 16 * 1024;

export interface WebhookAuthResult { ok: boolean; reason: string }

/** Placeholder for the provider's (unconfirmed) mechanism. Never accepts today. */
export function authenticateAdloggsWebhook(_req: Pick<Request, "headers">): WebhookAuthResult {
  if (!ADLOGGS_WEBHOOK_AUTH_CONTRACT_CONFIRMED) return { ok: false, reason: "WEBHOOK_AUTH_CONTRACT_UNCONFIRMED" };
  return { ok: false, reason: "WEBHOOK_AUTH_NOT_IMPLEMENTED" };
}

export interface ValidWebhookPayload { orderUuid: string; code: number; partnerOrderId?: string; riderName?: string }

/** Validates the documented fields; ignores everything else (OTPs, phones, locations are never read). */
export function parseWebhookPayload(body: unknown): ValidWebhookPayload | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, any>;
  const orderUuid = typeof record.order_uuid === "string" ? record.order_uuid.trim() : "";
  const code = typeof record.order_status_id === "number" ? record.order_status_id : Number.NaN;
  if (!orderUuid || orderUuid.length > 200 || !Number.isInteger(code)) return null;
  const partner = record.partner_order_id;
  const partnerOrderId = typeof partner === "string" || typeof partner === "number" ? String(partner).slice(0, 100) : undefined;
  const riderName = typeof record.deliveryStaffDetails?.name === "string" ? record.deliveryStaffDetails.name.slice(0, 120) : undefined;
  return { orderUuid, code, partnerOrderId, riderName };
}

function eventKeyFor(event: ValidWebhookPayload): string {
  return crypto.createHash("sha256").update(`${event.orderUuid}|${event.code}|${event.partnerOrderId ?? ""}`).digest("hex");
}

/**
 * Durable receipt → dedupe → apply. Call ONLY after authentication succeeded.
 * Unmatched events (e.g. arriving before the booking response was saved) are
 * kept and replayed when the booking is saved; they never create or complete
 * anything on their own.
 */
export async function processAdloggsWebhookPayload(body: unknown, receivedAt = new Date()): Promise<{ accepted: boolean; state: string }> {
  const event = parseWebhookPayload(body);
  if (!event) return { accepted: false, state: "INVALID_PAYLOAD" };
  const eventKey = eventKeyFor(event);
  try {
    await AdloggsWebhookEvent.create({ eventKey, orderUuid: event.orderUuid, partnerOrderId: event.partnerOrderId, statusCode: event.code,
      riderName: event.riderName, receivedAt, state: "RECEIVED" });
  } catch (error: any) {
    if (error?.code === 11000) return { accepted: true, state: "DUPLICATE" };
    throw error;
  }
  const outcome: ApplyOutcome = await applyAdloggsStatus({ ...event, source: "WEBHOOK", receivedAt });
  await AdloggsWebhookEvent.updateOne({ eventKey }, { $set: { state: outcome, processedAt: new Date() } });
  return { accepted: true, state: outcome };
}

/** Re-apply stored events for an order once its booking has been saved. */
export async function replayUnmatchedWebhookEvents(orderUuid: string): Promise<number> {
  const pending = await AdloggsWebhookEvent.find({ orderUuid, state: "UNMATCHED" }).sort({ receivedAt: 1 }).limit(50).lean();
  let applied = 0;
  for (const event of pending) {
    const outcome = await applyAdloggsStatus({ orderUuid: event.orderUuid, partnerOrderId: event.partnerOrderId, code: event.statusCode,
      riderName: event.riderName, source: "WEBHOOK", receivedAt: event.receivedAt });
    await AdloggsWebhookEvent.updateOne({ _id: event._id }, { $set: { state: outcome, processedAt: new Date() } });
    if (outcome === "APPLIED") applied++;
  }
  return applied;
}

/** POST /api/v1/webhooks/adloggs */
export async function handleAdloggsWebhook(req: Request, res: Response) {
  const config = loadAdloggsConfig();
  if (!config.webhookEnabled || !adloggsCapabilities(config).apiAccessAllowed) {
    return res.status(404).json({ success: false, message: "Not found" });
  }
  const length = Number(req.headers["content-length"] || 0);
  if (length > MAX_WEBHOOK_BYTES) return res.status(413).json({ success: false, message: "Payload too large" });
  const auth = authenticateAdloggsWebhook(req);
  if (!auth.ok) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    const result = await processAdloggsWebhookPayload(req.body);
    return res.status(result.accepted ? 200 : 400).json({ success: result.accepted });
  } catch (error: any) {
    console.error("Adloggs webhook processing failed:", error?.message);
    return res.status(500).json({ success: false });
  }
}
