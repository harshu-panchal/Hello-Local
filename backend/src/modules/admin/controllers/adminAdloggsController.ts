import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { getAdloggsAdminStatus, checkAdloggsWallet, updateSellerAdloggsProfile, getAdloggsDataReadiness } from "../../../services/adloggs/adloggsAdminService";
import { resolveUnknownBookingOutcome, UNKNOWN_OUTCOME_ACTIONS } from "../../../services/adloggs/adloggsBookingService";
import { handleExternalCancellation, PROVIDER_CANCELLATION_ACTIONS, getRtoResolutionPreview } from "../../../services/adloggs/adloggsCancellationWorkflow";
import { processOrderEffects } from "../../../services/orderEffectService";

/** Admin-only Adloggs endpoints (mounted behind the Admin router guard). No secrets are ever returned. */

/** GET /admin/delivery-providers/adloggs */
export const getAdloggsStatus = asyncHandler(async (_req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await getAdloggsAdminStatus() });
});

/** POST /admin/delivery-providers/adloggs/connectivity-test — documented non-booking endpoint (wallet balance). */
export const testAdloggsConnectivity = asyncHandler(async (_req: Request, res: Response) => {
  const wallet = await checkAdloggsWallet();
  const ok = wallet.state === "VERIFIED" || wallet.state === "WALLET_NOT_ENABLED";
  return res.status(200).json({ success: true, data: { connected: ok, wallet } });
});

/** GET /admin/delivery-providers/adloggs/readiness — missing seller/product data (read-only, no provider calls). */
export const getAdloggsReadiness = asyncHandler(async (_req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await getAdloggsDataReadiness() });
});

/** GET /admin/delivery-providers/adloggs/wallet */
export const getAdloggsWallet = asyncHandler(async (_req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await checkAdloggsWallet() });
});

/** PUT /admin/delivery-providers/adloggs/sellers/:sellerId/profile  body: { pickupPincode?, pickupState?, adloggsOrderCategory? } */
export const updateSellerProfile = asyncHandler(async (req: Request, res: Response) => {
  const result = await updateSellerAdloggsProfile(req.params.sellerId, req.body);
  return res.status(result.ok ? 200 : result.status ?? 400).json({ success: result.ok, message: result.message });
});

/**
 * POST /admin/shipments/:id/adloggs/resolve-outcome
 * body: { action, reason, evidence?, orderUuid?, providerReference? }
 *   action: RECORD_INVESTIGATION | VERIFY_PROVIDER_ORDER | REQUEST_REBOOK | APPROVE_REBOOK
 * The acting admin always comes from the authenticated session, never the body.
 */
export const resolveBookingOutcome = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const action = body.action;
  if (!UNKNOWN_OUTCOME_ACTIONS.includes(action)) {
    return res.status(400).json({ success: false, message: `action must be one of ${UNKNOWN_OUTCOME_ACTIONS.join(", ")}.` });
  }
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const result = await resolveUnknownBookingOutcome(req.params.id, {
    action, adminId: String(req.user?.userId ?? ""), reason: text(body.reason) ?? "",
    evidence: text(body.evidence), orderUuid: text(body.orderUuid), providerReference: text(body.providerReference),
  });
  const status = result.resolved ? 200 : result.state === "INVALID" ? 400 : 409;
  return res.status(status).json({ success: result.resolved, state: result.state, message: result.message });
});

/** GET /admin/shipments/:id/adloggs/rto-preview — evidence, reason and refund breakdown (read-only). */
export const getRtoPreview = asyncHandler(async (req: Request, res: Response) => {
  const preview = await getRtoResolutionPreview(req.params.id);
  return preview ? res.status(200).json({ success: true, data: preview }) : res.status(404).json({ success: false, message: "Shipment not found." });
});

/**
 * POST /admin/shipments/:id/adloggs/cancellation
 * body: { action, reason } — action: ACCEPT_PROVIDER_CANCELLATION | REBOOK_AFTER_PROVIDER_CANCELLATION |
 *   RETRY_PROVIDER_CANCELLATION | WITHDRAW_CANCELLATION_REQUEST. Audited; refunds only via the verified path.
 */
export const resolveExternalCancellation = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body ?? {};
  if (!PROVIDER_CANCELLATION_ACTIONS.includes(body.action)) {
    return res.status(400).json({ success: false, message: `action must be one of ${PROVIDER_CANCELLATION_ACTIONS.join(", ")}.` });
  }
  const result = await handleExternalCancellation(req.params.id, {
    action: body.action, adminId: String(req.user?.userId ?? ""), reason: typeof body.reason === "string" ? body.reason : "",
  });
  if (result.ok && result.state === "COMPLETED") await processOrderEffects().catch(() => undefined);
  return res.status(result.ok ? 200 : result.state === "INVALID" ? 400 : 409).json({ success: result.ok, state: result.state, message: result.message });
});
