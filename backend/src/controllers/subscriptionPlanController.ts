import { Request, Response } from 'express';
import mongoose from 'mongoose';
import SubscriptionPlan from '../models/SubscriptionPlan';
import SubscriptionPayment from '../models/SubscriptionPayment';
import Seller from '../models/Seller';
import { asyncHandler } from '../utils/asyncHandler';
import { createRazorpayOrder } from '../services/paymentService';
import { assertGatewayPayment } from '../services/razorpayVerificationService';

// Default starter plans if database has none
const DEFAULT_PLANS = [
  {
    name: 'Monthly Starter',
    description: 'Perfect for local shops getting started with online delivery.',
    price: 499,
    durationInDays: 30,
    features: [
      '0% Commission on all orders',
      'Unlimited product catalog',
      'Direct customer payments & settlements',
      'Store analytics & order management',
    ],
    isActive: true,
    isPopular: false,
    sortOrder: 1,
  },
  {
    name: 'Quarterly Growth',
    description: 'Most popular for active grocery and retail stores.',
    price: 1299,
    durationInDays: 90,
    features: [
      '0% Commission on all orders',
      'Unlimited product catalog',
      'Priority delivery dispatch',
      'Direct customer payments & settlements',
      'Store analytics & order management',
    ],
    isActive: true,
    isPopular: true,
    sortOrder: 2,
  },
  {
    name: 'Annual Merchant Pass',
    description: 'Best value for established vendors with maximum savings.',
    price: 3999,
    durationInDays: 365,
    features: [
      '0% Commission on all orders',
      'Unlimited product catalog',
      'Featured store placement on homepage',
      'Priority delivery dispatch',
      'Direct customer payments & settlements',
      'Dedicated seller onboarding support',
    ],
    isActive: true,
    isPopular: false,
    sortOrder: 3,
  },
];

/**
 * Seed default plans if collection is empty
 */
async function ensureDefaultPlans(): Promise<void> {
  const count = await SubscriptionPlan.countDocuments();
  if (count === 0) {
    await SubscriptionPlan.insertMany(DEFAULT_PLANS);
    console.log('Seeded default subscription plans');
  }
}

/**
 * Get active subscription plans (Public for seller registration / renewal)
 */
export const getActivePlans = asyncHandler(async (_req: Request, res: Response) => {
  await ensureDefaultPlans();
  const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 });
  return res.json({
    success: true,
    data: plans,
  });
});

/**
 * Create a Razorpay Order for a subscription plan before checkout
 */
export const createSubscriptionOrder = asyncHandler(async (req: Request, res: Response) => {
  const { planId, mobile } = req.body;

  if (!planId) {
    return res.status(400).json({ success: false, message: 'Plan ID is required' });
  }

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.isActive) {
    return res.status(404).json({ success: false, message: 'Selected subscription plan is not available' });
  }

  const receipt = `sub_${String(mobile || 'reg').slice(-10)}_${Date.now()}`.slice(0, 40);
  const orderResult = await createRazorpayOrder(receipt, plan.price, 'INR');

  if (!orderResult.success || !orderResult.data) {
    return res.status(500).json({
      success: false,
      message: orderResult.message || 'Failed to initiate payment gateway order',
    });
  }

  // Persist the payment intent as PENDING so it can be verified server-authoritatively (#C-01)
  await SubscriptionPayment.create({
    planId: plan._id,
    planName: plan.name,
    amount: plan.price,
    durationInDays: plan.durationInDays,
    sellerMobile: String(mobile || '').replace(/\D/g, '').slice(-10) || '0000000000',
    razorpayOrderId: orderResult.data.razorpayOrderId,
    status: 'PENDING',
    paymentDate: new Date(),
  });

  return res.json({
    success: true,
    data: {
      ...orderResult.data,
      plan: {
        id: plan._id,
        name: plan.name,
        price: plan.price,
        durationInDays: plan.durationInDays,
      },
    },
  });
});

/**
 * Admin: Get all subscription plans
 */
export const getAllPlansAdmin = asyncHandler(async (_req: Request, res: Response) => {
  await ensureDefaultPlans();
  const plans = await SubscriptionPlan.find().sort({ sortOrder: 1, createdAt: -1 });

  // Get active subscribers count for each plan
  const planStats = await Promise.all(
    plans.map(async (plan) => {
      const activeCount = await Seller.countDocuments({
        'subscription.planId': plan._id,
        'subscription.status': 'active',
        'subscription.endDate': { $gte: new Date() },
      });
      return {
        ...plan.toObject(),
        activeSubscribers: activeCount,
      };
    })
  );

  return res.json({
    success: true,
    data: planStats,
  });
});

/**
 * Admin: Create a subscription plan
 */
export const createPlanAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, price, durationInDays, features, isActive, isPopular, sortOrder } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Plan name is required' });
  }

  const numericPrice = Number(price);
  if (isNaN(numericPrice) || numericPrice < 1) {
    return res.status(400).json({ success: false, message: 'Valid price (minimum ₹1) is required' });
  }

  const numericDuration = Number(durationInDays);
  if (isNaN(numericDuration) || numericDuration < 1) {
    return res.status(400).json({ success: false, message: 'Duration must be at least 1 day' });
  }

  const parsedFeatures = Array.isArray(features)
    ? features.filter((f) => typeof f === 'string' && f.trim())
    : typeof features === 'string'
    ? features.split('\n').map((f) => f.trim()).filter(Boolean)
    : [];

  const plan = await SubscriptionPlan.create({
    name: name.trim(),
    description: description ? String(description).trim() : '',
    price: numericPrice,
    durationInDays: numericDuration,
    features: parsedFeatures.length > 0 ? parsedFeatures : undefined,
    isActive: isActive !== false,
    isPopular: Boolean(isPopular),
    sortOrder: Number(sortOrder) || 0,
  });

  return res.status(201).json({
    success: true,
    message: 'Subscription plan created successfully',
    data: plan,
  });
});

/**
 * Admin: Update a subscription plan
 */
export const updatePlanAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, price, durationInDays, features, isActive, isPopular, sortOrder } = req.body;

  const plan = await SubscriptionPlan.findById(id);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'Subscription plan not found' });
  }

  if (name !== undefined) plan.name = String(name).trim();
  if (description !== undefined) plan.description = String(description).trim();
  if (price !== undefined) {
    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < 1) {
      return res.status(400).json({ success: false, message: 'Valid price (minimum ₹1) is required' });
    }
    plan.price = numericPrice;
  }
  if (durationInDays !== undefined) {
    const numericDuration = Number(durationInDays);
    if (isNaN(numericDuration) || numericDuration < 1) {
      return res.status(400).json({ success: false, message: 'Duration must be at least 1 day' });
    }
    plan.durationInDays = numericDuration;
  }
  if (features !== undefined) {
    plan.features = Array.isArray(features)
      ? features.filter((f) => typeof f === 'string' && f.trim())
      : typeof features === 'string'
      ? features.split('\n').map((f) => f.trim()).filter(Boolean)
      : [];
  }
  if (isActive !== undefined) plan.isActive = Boolean(isActive);
  if (isPopular !== undefined) plan.isPopular = Boolean(isPopular);
  if (sortOrder !== undefined) plan.sortOrder = Number(sortOrder) || 0;

  await plan.save();

  return res.json({
    success: true,
    message: 'Subscription plan updated successfully',
    data: plan,
  });
});

/**
 * Admin: Delete a subscription plan
 */
export const deletePlanAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const activeSellers = await Seller.countDocuments({
    'subscription.planId': id,
    'subscription.status': 'active',
  });

  if (activeSellers > 0) {
    // If sellers have this plan active, soft-deactivate instead of hard deleting
    await SubscriptionPlan.findByIdAndUpdate(id, { isActive: false });
    return res.json({
      success: true,
      message: 'Plan has active subscribers. It has been deactivated instead of deleted.',
    });
  }

  await SubscriptionPlan.findByIdAndDelete(id);

  return res.json({
    success: true,
    message: 'Subscription plan deleted successfully',
  });
});

/**
 * Admin: Get all subscription payment transactions
 */
export const getSubscriptionTransactionsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string;
  const search = req.query.search as string;
  const skip = (page - 1) * limit;

  const query: any = {};
  if (status && status !== 'ALL') {
    query.status = status;
  }
  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { sellerName: { $regex: s, $options: 'i' } },
      { sellerMobile: { $regex: s, $options: 'i' } },
      { razorpayOrderId: { $regex: s, $options: 'i' } },
      { razorpayPaymentId: { $regex: s, $options: 'i' } },
      { planName: { $regex: s, $options: 'i' } },
    ];
  }

  const [transactions, total] = await Promise.all([
    SubscriptionPayment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sellerId', 'sellerName storeName mobile email status logo'),
    SubscriptionPayment.countDocuments(query),
  ]);

  return res.json({
    success: true,
    data: transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Seller: Get my subscription status
 */
export const getMySubscriptionSeller = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const seller = await Seller.findById(sellerId).select('sellerName storeName subscription status');

  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller not found' });
  }

  const sub = seller.subscription;
  const isExpired = sub?.endDate ? new Date(sub.endDate) < new Date() : true;
  if (seller.subscription && isExpired && seller.subscription.status === 'active') {
    seller.subscription.status = 'expired';
    await seller.save();
  }
  const daysRemaining = sub?.endDate
    ? Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return res.json({
    success: true,
    data: {
      subscription: sub,
      isExpired,
      daysRemaining,
      isActive: sub?.status === 'active' && !isExpired,
    },
  });
});

/**
 * Seller: Renew / upgrade subscription
 */
export const renewSubscriptionSeller = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({
      success: false,
      message: 'Razorpay Order ID, Payment ID, and Signature are required',
    });
  }

  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller not found' });
  }

  // 1. Anti-replay: verify this payment has not already been credited
  const duplicateSuccess = await SubscriptionPayment.findOne({
    razorpayPaymentId,
    status: 'SUCCESS',
  });
  if (duplicateSuccess) {
    return res.status(409).json({
      success: false,
      message: 'This payment has already been credited to an account.',
    });
  }

  // 2. Find the pending subscription intent (immune to client tampering)
  const pendingPayment = await SubscriptionPayment.findOne({
    razorpayOrderId,
    status: 'PENDING',
  });
  if (!pendingPayment) {
    return res.status(400).json({
      success: false,
      message: 'Payment session expired, already processed, or not found. Please restart checkout.',
    });
  }

  const plan = await SubscriptionPlan.findById(pendingPayment.planId);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'Subscription plan not found' });
  }

  // 3. Authoritatively verify payment with Razorpay with expectedRazorpayOrderId (#C-01)
  await assertGatewayPayment({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    expectedAmount: pendingPayment.amount,
    expectedRazorpayOrderId: pendingPayment.razorpayOrderId,
    expectedCurrency: 'INR',
  });

  const now = new Date();
  let startDate = now;
  // If seller has an active, future subscription, stack the duration onto current end date
  if (seller.subscription?.endDate && new Date(seller.subscription.endDate) > now) {
    startDate = new Date(seller.subscription.endDate);
  }

  const endDate = new Date(startDate.getTime() + plan.durationInDays * 24 * 60 * 60 * 1000);

  // 4. ATOMIC CLAIM: Update the pending payment intent to SUCCESS atomically
  const paymentRecord = await SubscriptionPayment.findOneAndUpdate(
    { razorpayOrderId, status: 'PENDING' },
    {
      $set: {
        sellerId: seller._id,
        sellerName: seller.sellerName,
        sellerMobile: seller.mobile,
        planId: plan._id,
        planName: plan.name,
        amount: plan.price,
        durationInDays: plan.durationInDays,
        razorpayPaymentId,
        razorpaySignature,
        status: 'SUCCESS',
        startDate,
        endDate,
        paymentDate: now,
      },
    },
    { new: true }
  );

  if (!paymentRecord) {
    return res.status(409).json({
      success: false,
      message: 'This payment has already been claimed or processed by another request.',
    });
  }

  // 5. Update seller subscription
  seller.subscription = {
    planId: plan._id as mongoose.Types.ObjectId,
    planName: plan.name,
    amount: plan.price,
    durationInDays: plan.durationInDays,
    startDate,
    endDate,
    status: 'active',
    razorpayOrderId,
    razorpayPaymentId,
    paymentDate: now,
  };
  seller.commission = 0;
  seller.commissionRate = 0;
  await seller.save();

  return res.json({
    success: true,
    message: `Subscription successfully activated! Valid until ${endDate.toLocaleDateString('en-IN')}`,
    data: seller.subscription,
  });
});

/**
 * Admin: Grant or extend a subscription for a seller manually (e.g., support cases / dispute resolutions)
 */
export const grantSubscriptionAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { sellerId, durationInDays, planName, notes } = req.body;

  if (!sellerId || !durationInDays || Number(durationInDays) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'sellerId and a positive durationInDays are required.',
    });
  }

  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return res.status(404).json({
      success: false,
      message: 'Seller not found.',
    });
  }

  const days = Number(durationInDays);
  const now = new Date();
  let startDate = now;
  let endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // If already actively subscribed, extend from current endDate
  if (
    seller.subscription &&
    seller.subscription.status === 'active' &&
    seller.subscription.endDate &&
    new Date(seller.subscription.endDate) > now
  ) {
    startDate = seller.subscription.startDate ? new Date(seller.subscription.startDate) : now;
    endDate = new Date(new Date(seller.subscription.endDate).getTime() + days * 24 * 60 * 60 * 1000);
  }

  const assignedPlanName = planName || seller.subscription?.planName || 'Admin Granted Plan';
  const adminOrderId = `ADMIN_GRANT_${seller._id.toString().slice(-6)}_${Date.now()}`;

  // 1. Record an audit transaction in SubscriptionPayment first
  await SubscriptionPayment.create({
    sellerId: seller._id,
    sellerName: seller.storeName || seller.sellerName,
    sellerMobile: seller.mobile,
    planId: seller.subscription?.planId,
    planName: assignedPlanName,
    amount: 0,
    durationInDays: days,
    razorpayOrderId: adminOrderId,
    status: 'SUCCESS',
    paymentMethod: 'ADMIN_GRANT',
    notes: notes || `Admin granted ${days} day(s) extension`,
    startDate,
    endDate,
    paymentDate: now,
  });

  // 2. Update seller subscription
  seller.subscription = {
    planId: seller.subscription?.planId,
    planName: assignedPlanName,
    amount: 0,
    durationInDays: days,
    startDate,
    endDate,
    status: 'active',
    razorpayOrderId: adminOrderId,
    paymentDate: now,
  };
  await seller.save();

  return res.json({
    success: true,
    message: `Subscription successfully extended by ${days} days (valid until ${endDate.toLocaleDateString('en-IN')}).`,
    data: seller.subscription,
  });
});
