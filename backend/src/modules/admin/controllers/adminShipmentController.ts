import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Order from "../../../models/Order";
import {
  listShipments,
  getShipmentExceptions,
  getShipmentReconciliation,
  parseListQuery,
  ShipmentOperationsError,
} from "../../../services/shipmentOperationsService";
import { reconcileOrderShipments, getOrderShipments } from "../../../services/shipmentService";

/** Admin shipment operations (Phase 5). Mounted behind the Admin-only router. */

function fail(res: Response, error: unknown) {
  if (error instanceof ShipmentOperationsError) return res.status(error.statusCode).json({ success: false, message: error.message });
  throw error;
}

/** GET /admin/shipments?filter=&page=&limit= */
export const getShipments = asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await listShipments(parseListQuery(req.query));
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return fail(res, error);
  }
});

/** GET /admin/shipments/exceptions */
export const getShipmentExceptionSummary = asyncHandler(async (_req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await getShipmentExceptions() });
});

/** GET /admin/shipments/:id/reconciliation (admin-only financial preparation view) */
export const getShipmentReconciliationView = asyncHandler(async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, data: await getShipmentReconciliation(req.params.id) });
  } catch (error) {
    return fail(res, error);
  }
});

/**
 * POST /admin/shipments/orders/:orderId/reconcile
 * Re-runs the existing idempotent shipment sync for one order (the same
 * service the background worker uses). It only re-derives shipment status
 * from the order's own data; it cannot override a status, assign a courier,
 * book a provider or touch payments.
 */
export const reconcileOrderShipmentsNow = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ success: false, message: "Invalid order id." });
  const order = await Order.findById(orderId).select("shipmentsCreated orderChannel");
  if (!order) return res.status(404).json({ success: false, message: "Order not found." });
  if (!order.shipmentsCreated) {
    return res.status(409).json({ success: false, message: "This order has no stored shipments (placed before shipments were introduced)." });
  }
  await reconcileOrderShipments(orderId);
  const refreshed = await Order.findById(orderId);
  return res.status(200).json({
    success: true,
    message: "Shipments re-synchronised from the order's current data.",
    data: { shipments: await getOrderShipments(refreshed, { audience: "admin" }) },
  });
});
