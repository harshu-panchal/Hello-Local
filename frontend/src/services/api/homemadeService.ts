import api from "./config";
import { Product, GetProductsParams, ProductListResponse } from "./customerProductService";

export interface HomemadeCategorySubcategory {
  id: string;
  _id?: string;
  slug: string;
  name: string;
  icon: string;
}

export interface HomemadeCategory {
  id: string;
  _id?: string;
  slug: string;
  name: string;
  shortName: string;
  tagline: string;
  icon: string;
  image?: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  heroImage: string;
  subcategories: HomemadeCategorySubcategory[];
  productCount?: number;
}

export interface HomemadeSeller {
  id: string;
  _id: string;
  name: string;
  specialty: string;
  distance: string;
  distanceKm: number;
  rating: number;
  reviewsCount: number;
  deliveryTag: string;
  avatarUrl: string;
  isVerified: boolean;
  productPreviews: string[];
}

export interface HomemadeProductItem {
  id: string;
  _id: string;
  name: string;
  sellerId: string;
  sellerName: string;
  isSellerVerified: boolean;
  rating: number;
  reviewsCount: number;
  distance: string;
  distanceKm: number;
  price: number;
  originalPrice?: number;
  unit: string;
  badge?: string;
  categorySlug: string;
  subcategorySlug: string;
  imageUrl: string;
  foodType?: string;
  description?: string;
  isAvailable?: boolean;
  stock?: number;
}

export interface HomemadeHubData {
  categories: HomemadeCategory[];
  trendingProducts: HomemadeProductItem[];
  nearbySellers: HomemadeSeller[];
  totalProducts: number;
}

export interface HomemadeHubResponse {
  success: boolean;
  data: HomemadeHubData;
  message?: string;
}

/**
 * Fetch dynamic homemade hub data
 */
export const getHomemadeHub = async (params?: {
  latitude?: number;
  longitude?: number;
}): Promise<HomemadeHubResponse> => {
  const response = await api.get<HomemadeHubResponse>("/customer/homemade/hub", {
    params,
  });
  return response.data;
};

/**
 * Fetch dynamic homemade products for category listing
 */
export const getHomemadeProducts = async (
  params?: GetProductsParams & {
    isHomemade?: boolean;
    homemadeCategory?: string;
    homemadeSubcategory?: string;
    maxDistanceKm?: number;
  }
): Promise<ProductListResponse> => {
  const queryParams = {
    ...params,
    isHomemade: true,
  };
  const response = await api.get<ProductListResponse>("/customer/products", {
    params: queryParams,
  });
  return response.data;
};
