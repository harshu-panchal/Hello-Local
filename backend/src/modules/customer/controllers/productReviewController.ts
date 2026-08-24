import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Review from '../../../models/Review';
import Order from '../../../models/Order';
import OrderItem from '../../../models/OrderItem';
import Product from '../../../models/Product';

/**
 * Product reviews.
 *
 * Three separate defects made this subsystem entirely non-functional:
 *   1. the purchase check queried `items.product`, but `Order.items` is an
 *      array of OrderItem ids — not embedded documents — so it never matched
 *      and every submission was rejected with 400;
 *   2. the rating aggregate matched `product` against a *string*, and
 *      `$match` does not auto-cast, so the average was always 0;
 *   3. reviews were created `status: "Pending"` and nothing could approve them,
 *      so none were ever visible.
 * (#H-21)
 */

/** Recompute and cache the product's rating from its approved reviews. */
export async function recalculateProductRating(productId: string | mongoose.Types.ObjectId) {
  const _id = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;

  const [stats] = await Review.aggregate([
    { $match: { product: _id, status: 'Approved' } },
    { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const rating = stats ? Math.round(stats.avgRating * 10) / 10 : 0;
  const reviewsCount = stats ? stats.count : 0;

  // Product.rating / reviewsCount were never written, so listings showed a
  // rating unrelated to the actual reviews.
  await Product.updateOne({ _id }, { $set: { rating, reviewsCount } });

  return { rating, reviewsCount };
}

// Get reviews for a product (public)
export const getProductReviews = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }
    const productObjectId = new mongoose.Types.ObjectId(productId);

    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5, 1), 50);
    const skip = (page - 1) * limit;

    const [reviews, total, stats] = await Promise.all([
      Review.find({ product: productObjectId, status: 'Approved' })
        .populate('customer', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ product: productObjectId, status: 'Approved' }),
      // Cast the id — `$match` performs no implicit conversion.
      Review.aggregate([
        { $match: { product: productObjectId, status: 'Approved' } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            count: { $sum: 1 },
            five: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
            four: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            three: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            two: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            one: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const s = stats[0];

    return res.status(200).json({
      success: true,
      data: {
        reviews,
        stats: {
          avgRating: s ? Math.round(s.avgRating * 10) / 10 : 0,
          totalReviews: s ? s.count : 0,
          distribution: s
            ? { 5: s.five, 4: s.four, 3: s.three, 2: s.two, 1: s.one }
            : { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error: any) {
    console.error('Error fetching reviews:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Error fetching reviews' });
  }
};

// Add a review (must have actually bought the product)
export const addReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { productId, orderId, rating, comment, title, images } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid product or order id' });
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a whole number from 1 to 5' });
    }

    // Verify the purchase.
    //
    // `Order.items` holds OrderItem ids, so membership must be checked against
    // the OrderItem collection. Querying `items.product` matched nothing and
    // rejected every legitimate review.
    const order = await Order.findOne({
      _id: orderId,
      customer: userId,
      status: 'Delivered',
    });
    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'You can only review products from your delivered orders.',
      });
    }

    const purchased = await OrderItem.findOne({ order: orderId, product: productId });
    if (!purchased) {
      return res.status(400).json({
        success: false,
        message: 'That product was not part of this order.',
      });
    }

    const existingReview = await Review.findOne({
      customer: userId,
      product: productId,
      order: orderId,
    });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: 'You have already reviewed this product for this order.',
      });
    }

    const review = await Review.create({
      customer: userId,
      product: productId,
      order: orderId,
      rating: numericRating,
      comment,
      title,
      images: Array.isArray(images) ? images.slice(0, 5) : [],
      // Verified purchases publish immediately; the ownership check above is
      // the gate. Admin moderation can still hide one after the fact.
      status: 'Approved',
      isVerifiedPurchase: true,
    });

    await recalculateProductRating(productId);

    return res.status(201).json({
      success: true,
      message: 'Thanks for your review.',
      data: review,
    });
  } catch (error: any) {
    console.error('Error adding review:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Error adding review' });
  }
};

// Customer removes their own review
export const deleteMyReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid review id' });
    }

    const review = await Review.findOneAndDelete({ _id: id, customer: userId });
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await recalculateProductRating(review.product);

    return res.status(200).json({ success: true, message: 'Review removed' });
  } catch (error: any) {
    console.error('Error deleting review:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Error deleting review' });
  }
};
