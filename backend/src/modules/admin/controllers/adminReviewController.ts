import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Review from "../../../models/Review";
import { recalculateProductRating } from "../../customer/controllers/productReviewController";

/**
 * Review moderation.
 *
 * There was no moderation endpoint anywhere, while reviews were created
 * `Pending` and only `Approved` ones were ever returned — so every review was
 * permanently invisible. (#H-21)
 */

export const getReviews = asyncHandler(async (req: Request, res: Response) => {
  const { status, productId, page = 1, limit = 20 } = req.query;

  const safeLimit = Math.min(Math.max(parseInt(limit as string) || 20, 1), 100);
  const safePage = Math.max(parseInt(page as string) || 1, 1);

  const query: Record<string, unknown> = {};
  if (status && ["Pending", "Approved", "Rejected"].includes(status as string)) {
    query.status = status;
  }
  if (productId && mongoose.Types.ObjectId.isValid(productId as string)) {
    query.product = new mongoose.Types.ObjectId(productId as string);
  }

  const [reviews, total] = await Promise.all([
    Review.find(query)
      .populate("customer", "name phone")
      .populate("product", "productName mainImage")
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Review.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    data: reviews,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  });
});

export const moderateReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid review id" });
  }
  if (!["Approved", "Rejected", "Pending"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be Approved, Rejected or Pending",
    });
  }

  const review = await Review.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true },
  );
  if (!review) {
    return res.status(404).json({ success: false, message: "Review not found" });
  }

  // The cached product rating must follow moderation.
  await recalculateProductRating(review.product);

  return res.status(200).json({
    success: true,
    message: `Review ${status.toLowerCase()}`,
    data: review,
  });
});

export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid review id" });
  }

  const review = await Review.findByIdAndDelete(id);
  if (!review) {
    return res.status(404).json({ success: false, message: "Review not found" });
  }

  await recalculateProductRating(review.product);

  return res.status(200).json({ success: true, message: "Review deleted" });
});
