import api from './config';

export interface StorePreviewData {
  store: {
    id: string;
    name: string;
    storeBanner?: string;
    logo?: string;
    address?: string;
    city?: string;
    mobile?: string;
    isShopOpen: boolean;
    category?: string;
    slug?: string;
  };
  products: StorePreviewProduct[];
}

export interface StorePreviewProduct {
  _id: string;
  productName: string;
  mainImage?: string;
  mainImageUrl?: string;
  price: number;
  discPrice: number;
  discount?: number;
  publish: boolean;
  popular: boolean;
  displayOrder: number;
  category?: {
    _id: string;
    name: string;
    icon?: string;
    image?: string;
  };
  subcategory?: {
    _id: string;
    name: string;
  };
}

export const getStorePreviewData = async (): Promise<{ success: boolean; data: StorePreviewData }> => {
  const response = await api.get('/seller/store-preview');
  return response.data;
};

export const quickUpdateProductPrice = async (
  productId: string,
  price: number,
  discPrice?: number
): Promise<{ success: boolean; message: string; data: any }> => {
  const response = await api.patch(`/seller/store-preview/products/${productId}/price`, {
    price,
    discPrice,
  });
  return response.data;
};

export const toggleProductPublish = async (
  productId: string
): Promise<{ success: boolean; message: string; data: any }> => {
  const response = await api.patch(`/seller/store-preview/products/${productId}/toggle-publish`);
  return response.data;
};

export const toggleProductFeature = async (
  productId: string
): Promise<{ success: boolean; message: string; data: any }> => {
  const response = await api.patch(`/seller/store-preview/products/${productId}/toggle-feature`);
  return response.data;
};

export const reorderProducts = async (
  productIds: string[]
): Promise<{ success: boolean; message: string }> => {
  const response = await api.patch('/seller/store-preview/products/reorder', { productIds });
  return response.data;
};

export const uploadMediaFile = async (file: File, folder = 'store_banners'): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('folder', folder);
  const response = await api.post('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data?.data?.url || response.data?.url || '';
};
