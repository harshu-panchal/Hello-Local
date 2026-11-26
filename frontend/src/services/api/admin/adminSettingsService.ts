import api from "../config";


import { ApiResponse } from "./types";

export interface PaymentMethod {
  _id: string;
  name: string;
  type: "COD" | "Online" | "Wallet" | "UPI" | "Card" | "Net Banking";
  isActive: boolean;
  icon?: string;
  description?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SMSGatewaySettings {
  provider: string;
  apiKey?: string;
  apiSecret?: string;
  senderId?: string;
  dltTemplateId?: string;
  template?: string;
  enabled: boolean;
}

export interface PaymentMethods {
  cod: boolean;
  online: boolean;
  wallet: boolean;
  upi: boolean;
}

export interface PaymentGateways {
  razorpay?: {
    enabled: boolean;
    keyId?: string;
    keySecret?: string;
  };
  stripe?: {
    enabled: boolean;
    publishableKey?: string;
    secretKey?: string;
  };
}

export interface HomeSection {
  title: string;
  category?: string;
  subcategory?: string;
  city?: string;
  deliverableArea?: string;
  status: string;
  productSortBy?: string;
  productLimit?: number;
  order: number;
}

export interface AppSettings {
  _id: string;
  appName: string;
  appLogo?: string;
  appFavicon?: string;
  contactEmail: string;
  contactPhone: string;
  supportEmail?: string;
  supportPhone?: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyPincode?: string;
  companyCountry?: string;
  paymentMethods: PaymentMethods;
  paymentGateways?: PaymentGateways;
  defaultCommission: number;
  deliveryCharges: number;
  platformFee?: number;
  freeDeliveryThreshold?: number;
  deliveryConfig?: {
    isDistanceBased: boolean;
    baseCharge: number;
    baseDistance: number;
    kmRate: number;
    deliveryBoyKmRate?: number;
  };
  tipSettings?: {
    enabled: boolean;
    minTip?: number;
    maxTip?: number;
  };
  gstEnabled: boolean;
  gstRate?: number;
  privacyPolicy?: string;
  termsOfService?: string;
  returnPolicy?: string;
  refundPolicy?: string;
  customerAppPolicy?: string;
  deliveryAppPolicy?: string;
  faq?: Array<{
    question: string;
    answer: string;
  }>;
  homeSections?: HomeSection[];
  features: {
    sellerRegistration: boolean;
    productApproval: boolean;
    orderTracking: boolean;
    wallet: boolean;
    coupons: boolean;
  };
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateAppSettingsData extends Partial<AppSettings> { }

export interface UpdatePaymentMethodsData {
  paymentMethods: PaymentMethod[];
}

/**
 * Get app settings
 */
export const getAppSettings = async (): Promise<ApiResponse<AppSettings>> => {
  const response = await api.get<ApiResponse<AppSettings>>("/admin/settings");
  return response.data;
};

/**
 * Update app settings
 */
export const updateAppSettings = async (
  data: UpdateAppSettingsData
): Promise<ApiResponse<AppSettings>> => {
  const response = await api.put<ApiResponse<AppSettings>>(
    "/admin/settings",
    data
  );
  return response.data;
};

export interface InHouseDeliverySettings {
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
  /** Orders with an in-house courier still in progress (they keep running). */
  activeAssignments: number;
  /** Orders ready for a courier that have none yet. */
  awaitingCourier: number;
  /** A waiting-order recovery was requested (switch turned ON) and has not completed. */
  recoveryPending?: boolean;
  /** Outcome of the most recent waiting-order recovery. */
  lastRecovery?: InHouseDeliveryRecoveryRun;
  /** Present on the response that ran a recovery. */
  recovery?: InHouseDeliveryRecoveryRun & { status?: string };
  changed?: boolean;
}

export interface InHouseDeliveryRecoveryRun {
  trigger?: string;
  startedAt?: string;
  finishedAt?: string;
  considered?: number;
  offered?: number;
  alreadyOffered?: number;
  noCouriers?: number;
  ineligible?: number;
  stale?: number;
  failed?: number;
  aborted?: boolean;
  errors?: string[];
}

/**
 * Get the in-house delivery ON/OFF state
 */
export const getInHouseDeliverySettings = async (): Promise<ApiResponse<InHouseDeliverySettings>> => {
  const response = await api.get<ApiResponse<InHouseDeliverySettings>>("/admin/settings/in-house-delivery");
  return response.data;
};

/**
 * Enable or disable in-house delivery (drain mode when disabling)
 */
export const updateInHouseDeliverySettings = async (
  enabled: boolean
): Promise<ApiResponse<InHouseDeliverySettings>> => {
  const response = await api.put<ApiResponse<InHouseDeliverySettings>>(
    "/admin/settings/in-house-delivery",
    { enabled }
  );
  return response.data;
};

/**
 * Re-offer orders still waiting for an in-house courier (only while enabled)
 */
export const retryInHouseDeliveryRecovery = async (): Promise<ApiResponse<InHouseDeliverySettings>> => {
  const response = await api.post<ApiResponse<InHouseDeliverySettings>>("/admin/settings/in-house-delivery/recover");
  return response.data;
};

export type DeliveryProviderId = "IN_HOUSE" | "ADDLOGS";

export interface DeliveryProviderReadiness {
  id: DeliveryProviderId;
  label: string;
  configured: boolean;
  enabled: boolean;
  operational: boolean;
  status: "AVAILABLE" | "DISABLED" | "NOT_CONFIGURED";
  reason?: string;
}

export interface DeliveryProviderState {
  activeProvider: DeliveryProviderId;
  providers: DeliveryProviderReadiness[];
  /** Whether new delivery orders can be accepted right now. */
  deliveryAvailable: boolean;
  reason?: string;
  updatedAt?: string;
  changed?: boolean;
}

/**
 * Get the global delivery provider and each provider's readiness
 */
export const getDeliveryProviderSettings = async (): Promise<ApiResponse<DeliveryProviderState>> => {
  const response = await api.get<ApiResponse<DeliveryProviderState>>("/admin/settings/delivery-provider");
  return response.data;
};

/**
 * Select the global delivery provider (only operational providers are accepted)
 */
export const updateDeliveryProviderSettings = async (
  provider: DeliveryProviderId
): Promise<ApiResponse<DeliveryProviderState>> => {
  const response = await api.put<ApiResponse<DeliveryProviderState>>("/admin/settings/delivery-provider", { provider });
  return response.data;
};

/**
 * Get payment methods
 */
export const getPaymentMethods = async (): Promise<
  ApiResponse<PaymentMethod[]>
> => {
  const response = await api.get<ApiResponse<PaymentMethod[]>>(
    "/admin/settings/payment-methods"
  );
  return response.data;
};

/**
 * Update payment methods
 */
export const updatePaymentMethods = async (
  data: UpdatePaymentMethodsData
): Promise<ApiResponse<PaymentMethod[]>> => {
  const response = await api.put<ApiResponse<PaymentMethod[]>>(
    "/admin/settings/payment-methods",
    data
  );
  return response.data;
};

export interface AdminStoreSettings {
  _id: string;
  sellerName: string;
  storeName: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  serviceableArea?: string;
  searchLocation?: string;
  latitude: number;
  longitude: number;
  serviceRadiusKm: number;
  status?: string;
}

export interface UpdateAdminStoreSettingsData {
  sellerName?: string;
  storeName?: string;
  email?: string;
  mobile?: string;
  address?: string;
  city?: string;
  serviceableArea?: string;
  searchLocation?: string;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
}

/**
 * Get Admin Store settings
 */
export const getAdminStoreSettings = async (): Promise<ApiResponse<AdminStoreSettings>> => {
  const response = await api.get<ApiResponse<AdminStoreSettings>>(
    "/admin/store-settings"
  );
  return response.data;
};

/**
 * Update Admin Store settings
 */
export const updateAdminStoreSettings = async (
  data: UpdateAdminStoreSettingsData
): Promise<ApiResponse<AdminStoreSettings>> => {
  const response = await api.put<ApiResponse<AdminStoreSettings>>(
    "/admin/store-settings",
    data
  );
  return response.data;
};
