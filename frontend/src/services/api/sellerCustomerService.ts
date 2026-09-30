import api from './config';

export interface SellerCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
  channel: 'ONLINE' | 'OFFLINE' | 'BOTH';
  city: string;
  isWalkIn: boolean;
}

export interface SellerCustomerResponse {
  success: boolean;
  data: SellerCustomer[];
  pagination: {
    total: number;
    page: number;
    pages: number;
    limit: number;
  };
  stats: {
    totalCustomers: number;
    totalOrders: number;
    totalRevenue: number;
  };
}

export const getSellerCustomers = async (params?: {
  search?: string;
  channel?: 'ALL' | 'ONLINE' | 'OFFLINE';
  page?: number;
  limit?: number;
}): Promise<SellerCustomerResponse> => {
  const response = await api.get<SellerCustomerResponse>('/seller/customers', { params });
  return response.data;
};
