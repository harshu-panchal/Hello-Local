import api from './config';

export interface SubscriptionPlan {
  _id: string;
  name: string;
  description?: string;
  price: number;
  durationInDays: number;
  features: string[];
  isActive: boolean;
  isPopular?: boolean;
  sortOrder: number;
  activeSubscribers?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionPaymentRecord {
  _id: string;
  sellerId: {
    _id: string;
    sellerName: string;
    storeName: string;
    mobile: string;
    email: string;
    status: string;
    logo?: string;
  };
  sellerName: string;
  sellerMobile: string;
  planId: string;
  planName: string;
  amount: number;
  durationInDays: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  startDate: string;
  endDate: string;
  paymentDate: string;
  createdAt: string;
}

export interface CreateSubscriptionOrderResponse {
  success: boolean;
  message?: string;
  data: {
    razorpayOrderId: string;
    razorpayKey: string;
    amount: number; // in paise
    currency: string;
    plan: {
      id: string;
      name: string;
      price: number;
      durationInDays: number;
    };
  };
}

export interface SellerSubscriptionStatus {
  subscription?: {
    planId?: string;
    planName?: string;
    amount?: number;
    durationInDays?: number;
    startDate?: string;
    endDate?: string;
    status: 'active' | 'expired' | 'trial' | 'inactive';
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    paymentDate?: string;
  };
  isExpired: boolean;
  daysRemaining: number;
  isActive: boolean;
}

/**
 * Fetch active subscription plans (Public for sellers)
 */
export const getActiveSubscriptionPlans = async (): Promise<SubscriptionPlan[]> => {
  const response = await api.get<{ success: boolean; data: SubscriptionPlan[] }>('/subscription-plans/active');
  return response.data.data;
};

/**
 * Create a Razorpay Order for a subscription plan before payment
 */
export const createSubscriptionOrder = async (
  planId: string,
  mobile?: string
): Promise<CreateSubscriptionOrderResponse['data']> => {
  const response = await api.post<CreateSubscriptionOrderResponse>('/subscription-plans/create-order', {
    planId,
    mobile,
  });
  return response.data.data;
};

/**
 * Admin: Get all subscription plans
 */
export const getAllSubscriptionPlansAdmin = async (): Promise<SubscriptionPlan[]> => {
  const response = await api.get<{ success: boolean; data: SubscriptionPlan[] }>('/subscription-plans/admin/all');
  return response.data.data;
};

/**
 * Admin: Create a new subscription plan
 */
export const createSubscriptionPlanAdmin = async (
  planData: Partial<SubscriptionPlan>
): Promise<SubscriptionPlan> => {
  const response = await api.post<{ success: boolean; message: string; data: SubscriptionPlan }>(
    '/subscription-plans/admin',
    planData
  );
  return response.data.data;
};

/**
 * Admin: Update a subscription plan
 */
export const updateSubscriptionPlanAdmin = async (
  id: string,
  planData: Partial<SubscriptionPlan>
): Promise<SubscriptionPlan> => {
  const response = await api.put<{ success: boolean; message: string; data: SubscriptionPlan }>(
    `/subscription-plans/admin/${id}`,
    planData
  );
  return response.data.data;
};

/**
 * Admin: Delete a subscription plan
 */
export const deleteSubscriptionPlanAdmin = async (id: string): Promise<string> => {
  const response = await api.delete<{ success: boolean; message: string }>(
    `/subscription-plans/admin/${id}`
  );
  return response.data.message;
};

/**
 * Admin: Get subscription payment transaction history
 */
export const getSubscriptionTransactionsAdmin = async (
  page: number = 1,
  limit: number = 20,
  status?: string,
  search?: string
): Promise<{ transactions: SubscriptionPaymentRecord[]; total: number; pages: number }> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('limit', String(limit));
  if (status && status !== 'ALL') params.append('status', status);
  if (search && search.trim()) params.append('search', search.trim());

  const response = await api.get<{
    success: boolean;
    data: SubscriptionPaymentRecord[];
    pagination: { total: number; pages: number };
  }>(`/subscription-plans/admin/transactions?${params.toString()}`);
  return {
    transactions: response.data.data,
    total: response.data.pagination.total,
    pages: response.data.pagination.pages,
  };
};

/**
 * Seller: Get my subscription status
 */
export const getMySubscriptionSeller = async (): Promise<SellerSubscriptionStatus> => {
  const response = await api.get<{ success: boolean; data: SellerSubscriptionStatus }>(
    '/subscription-plans/me'
  );
  return response.data.data;
};

/**
 * Seller: Renew / upgrade subscription
 */
export const renewSubscriptionSeller = async (paymentData: {
  planId?: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<any> => {
  const response = await api.post<{ success: boolean; message: string; data: any }>(
    '/subscription-plans/renew',
    paymentData
  );
  return response.data;
};

/**
 * Admin: Grant or extend a subscription for a seller manually (support/dispute)
 */
export const grantSubscriptionAdmin = async (payload: {
  sellerId: string;
  durationInDays: number;
  planName?: string;
  notes?: string;
}): Promise<any> => {
  const response = await api.post<{ success: boolean; message: string; data: any }>(
    '/subscription-plans/admin/grant-subscription',
    payload
  );
  return response.data;
};

