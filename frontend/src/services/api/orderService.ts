import api from './config';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface Order {
  id: string;
  orderId: string;
  deliveryDate: string;
  orderDate: string;
  status: string;
  amount: number;
  customerName?: string;
  customerPhone?: string;
  deliveryBoyName?: string;
}

export interface OrderItem {
  srNo: string;
  product: string;
  soldBy: string;
  unit: string;
  price: number;
  tax: number;
  taxPercent: number;
  qty: number;
  subtotal: number;
}

export interface DeliveryAddress {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  invoiceNumber: string;
  orderDate: string;
  deliveryDate: string;
  timeSlot: string;
  status: 'Out For Delivery' | 'Received' | 'Payment Pending' | 'Cancelled' | 'Rejected';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryBoyName: string;
  deliveryBoyPhone: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  deliveryAddress: DeliveryAddress;
}

export interface UpdateOrderStatusData {
  status: 'Accepted' | 'Rejected' | 'Processed' | 'On the way' | 'Delivered' | 'Cancelled';
}

export interface GetOrdersParams {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface GetOrdersResponse {
  success: boolean;
  message: string;
  data: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * POS & Billing Types
 */
export interface POSVariation {
  id?: string;
  name: string;
  value: string;
  price: number;
  discPrice: number;
  effectivePrice: number;
  stock: number;
  status: string;
  sku?: string;
}

export interface POSProduct {
  id: string;
  productName: string;
  mainImage: string;
  categoryName: string;
  price: number;
  discPrice: number;
  effectivePrice: number;
  stock: number;
  sku: string;
  barcode: string;
  taxRate: number;
  hasVariations: boolean;
  variations: POSVariation[];
}

export interface POSCartItem {
  productId: string;
  productName: string;
  mainImage: string;
  variation?: string;
  variantTitle?: string;
  unitPrice: number;
  quantity: number;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  availableStock: number;
}

export interface CreateOfflineSalePayload {
  items: Array<{
    productId: string;
    variation?: string;
    quantity: number;
  }>;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  paymentMethod: 'Cash' | 'UPI' | 'Card';
  offlinePaymentDetails?: {
    receivedAmount?: number;
    changeReturned?: number;
    paymentReference?: string;
    paymentNotes?: string;
  };
  discount?: number;
  notes?: string;
}

export interface BillItem {
  srNo: number;
  productId?: string;
  product?: string;
  productName?: string;
  unit?: string;
  variantTitle?: string;
  price: number;
  unitPrice?: number;
  qty: number;
  quantity?: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface BillData {
  id: string;
  orderNumber: string;
  billNumber: string;
  orderDate: string;
  date?: string;
  billGeneratedAt?: string;
  channel: 'ONLINE' | 'OFFLINE';
  saleType: string;
  customer: {
    name: string;
    phone: string;
    email: string;
    isWalkIn: boolean;
  };
  seller: {
    storeName: string;
    address: string;
    city?: string;
    phone: string;
    email?: string;
    gstin?: string;
    logo?: string;
  };
  items: BillItem[];
  pricing: {
    subtotal: number;
    tax: number;
    shipping?: number;
    discount?: number;
    total: number;
  };
  payment: {
    method: string;
    status: string;
    receivedAmount?: number;
    changeReturned?: number;
    reference?: string;
    notes?: string;
  };
  status: string;
}

export interface BillSummaryStats {
  totalRevenue: number;
  totalBills: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  onlineSales: number;
  offlineSales: number;
}

export interface GetBillsParams {
  channel?: 'ALL' | 'ONLINE' | 'OFFLINE';
  dateFrom?: string;
  dateTo?: string;
  paymentMethod?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetBillsResponse {
  success: boolean;
  message: string;
  data: Array<{
    id: string;
    billNumber: string;
    orderNumber: string;
    date: string;
    channel: 'ONLINE' | 'OFFLINE';
    saleType: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: string;
    paymentStatus: string;
    status: string;
    itemCount: number;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
  }>;
  stats: BillSummaryStats;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Get orders with filters
 */
export const getOrders = async (params?: GetOrdersParams): Promise<GetOrdersResponse> => {
  const response = await api.get<GetOrdersResponse>('/orders', { params });
  return response.data;
};

/**
 * Get order by ID
 */
export const getOrderById = async (id: string): Promise<ApiResponse<OrderDetail>> => {
  const response = await api.get<ApiResponse<OrderDetail>>(`/orders/${id}`);
  return response.data;
};

/**
 * Update order status
 */
export const updateOrderStatus = async (id: string, data: UpdateOrderStatusData): Promise<ApiResponse<{ id: string; status: string }>> => {
  const response = await api.patch<ApiResponse<{ id: string; status: string }>>(`/orders/${id}/status`, data);
  return response.data;
};

/**
 * Get POS Products with real-time stock and barcode/SKU search
 */
export const getPOSProducts = async (params?: {
  query?: string;
  category?: string;
  barcode?: string;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<POSProduct[]> & { pagination: { page: number; limit: number; total: number; pages: number } }> => {
  const response = await api.get('/orders/pos/products', { params });
  return response.data;
};

/**
 * Create Offline In-Store Sale and Generate Bill
 */
export const createOfflineSale = async (payload: CreateOfflineSalePayload): Promise<ApiResponse<BillData>> => {
  const response = await api.post<ApiResponse<BillData>>('/orders/offline', payload);
  return response.data;
};

/**
 * Cancel Offline Sale and Restore Inventory
 */
export const cancelOfflineSale = async (id: string, reason?: string): Promise<ApiResponse<{ id: string; status: string; paymentStatus: string }>> => {
  const response = await api.post(`/orders/offline/${id}/cancel`, { reason });
  return response.data;
};

/**
 * Get Seller Bills and Invoices History (Online & Offline)
 */
export const getSellerBills = async (params?: GetBillsParams): Promise<GetBillsResponse> => {
  const response = await api.get<GetBillsResponse>('/orders/bills', { params });
  return response.data;
};

/**
 * Get Bill Details for Printing and View
 */
export const getBillById = async (id: string): Promise<ApiResponse<BillData>> => {
  const response = await api.get<ApiResponse<BillData>>(`/orders/bills/${id}`);
  return response.data;
};
