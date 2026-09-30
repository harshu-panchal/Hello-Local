import api from './config';

export interface SupplierItem {
  _id: string;
  seller: string;
  name: string;
  companyName?: string;
  phone: string;
  email?: string;
  category?: string;
  address?: string;
  notes?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface SupplierListResponse {
  success: boolean;
  data: SupplierItem[];
  categories: string[];
  total: number;
}

export interface SupplierSingleResponse {
  success: boolean;
  message?: string;
  data: SupplierItem;
}

export const getSuppliers = async (params?: {
  search?: string;
  category?: string;
  status?: string;
}): Promise<SupplierListResponse> => {
  const response = await api.get<SupplierListResponse>('/seller/suppliers', { params });
  return response.data;
};

export const createSupplier = async (data: Partial<SupplierItem>): Promise<SupplierSingleResponse> => {
  const response = await api.post<SupplierSingleResponse>('/seller/suppliers', data);
  return response.data;
};

export const updateSupplier = async (id: string, data: Partial<SupplierItem>): Promise<SupplierSingleResponse> => {
  const response = await api.put<SupplierSingleResponse>(`/seller/suppliers/${id}`, data);
  return response.data;
};

export const deleteSupplier = async (id: string): Promise<{ success: boolean; message: string }> => {
  const response = await api.delete<{ success: boolean; message: string }>(`/seller/suppliers/${id}`);
  return response.data;
};
