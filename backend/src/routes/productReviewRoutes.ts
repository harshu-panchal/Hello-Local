
import { Router } from 'express';
import { getProductReviews, addReview, deleteMyReview } from '../modules/customer/controllers/productReviewController';
import { authenticate, requireUserType } from '../middleware/auth';

const router = Router();

// Public route to view reviews
router.get('/:productId', getProductReviews);

// Protected route to add review
router.post('/', authenticate, requireUserType('Customer'), addReview);

// Customer removes their own review
router.delete('/:id', authenticate, requireUserType('Customer'), deleteMyReview);

export default router;
