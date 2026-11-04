import { Router } from 'express';
import {
  getActivePlans,
  createSubscriptionOrder,
  getAllPlansAdmin,
  createPlanAdmin,
  updatePlanAdmin,
  deletePlanAdmin,
  getSubscriptionTransactionsAdmin,
  getMySubscriptionSeller,
  renewSubscriptionSeller,
  grantSubscriptionAdmin,
} from '../controllers/subscriptionPlanController';
import { authenticate, requireUserType } from '../middleware/auth';
import { loginRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public routes for seller onboarding & renewal browsing
router.get('/active', getActivePlans);
router.post('/create-order', loginRateLimiter, createSubscriptionOrder);

// Seller protected routes
router.get('/me', authenticate, requireUserType('Seller'), getMySubscriptionSeller);
router.post('/renew', authenticate, requireUserType('Seller'), renewSubscriptionSeller);

// Admin protected routes
router.get('/admin/all', authenticate, requireUserType('Admin'), getAllPlansAdmin);
router.post('/admin', authenticate, requireUserType('Admin'), createPlanAdmin);
router.put('/admin/:id', authenticate, requireUserType('Admin'), updatePlanAdmin);
router.delete('/admin/:id', authenticate, requireUserType('Admin'), deletePlanAdmin);
router.get('/admin/transactions', authenticate, requireUserType('Admin'), getSubscriptionTransactionsAdmin);
router.post('/admin/grant-subscription', authenticate, requireUserType('Admin'), grantSubscriptionAdmin);

export default router;
