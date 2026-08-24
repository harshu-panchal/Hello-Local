import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import {
  requestReturn,
  listCustomerReturns,
  ReturnError,
} from "../../../services/returnService";
import Return from "../../../models/Return";
import mongoose from "mongoose";

/**
 * Customer-facing return endpoints.
 *
 * These did not exist. Without a way to create a `Return`, the admin, seller and
 * courier return screens could only ever show an empty list. (#H-20)
 */

export const createReturnRequest = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user!.userId;
  const { orderId, orderItemId, quantity, reason, description, images } = req.body;

  try {
    const created = await requestReturn({
      customerId,
      orderId,
      orderItemId,
      quantity,
      reason,
      description,
      images,
    });

    return res.status(201).json({
      success: true,
      message: "Return request submitted. We'll review it shortly.",
      data: created,
    });
  } catch (error: any) {
    const status = error instanceof ReturnError ? error.statusCode : 500;
    return res.status(status).json({
      success: false,
      message: error?.message || "Could not submit the return request",
    });
  }
});

export const getMyReturns = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user!.userId;
  const { page, limit } = req.query;

  const result = await listCustomerReturns(
    customerId,
    Number(page) || 1,
    Number(limit) || 20,
  );

  return res.status(200).json({
    success: true,
    data: result.returns,
    pagination: result.pagination,
  });
});

export const getMyReturnById = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user!.userId;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid return id" });
  }

  // Scoped to the requesting customer — a return is not readable by anyone else.
  const ret = await Return.findOne({ _id: id, customer: customerId })
    .populate("order", "orderNumber total")
    .populate("orderItem", "productName productImage unitPrice quantity");

  if (!ret) {
    return res.status(404).json({ success: false, message: "Return not found" });
  }

  return res.status(200).json({ success: true, data: ret });
});
