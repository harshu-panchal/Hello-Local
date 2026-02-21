import api from "../config";

export interface ShopAd {
    _id: string;
    shopName: string;
    tagline: string;
    description?: string;
    startDate?: string;
    imageUrl: string;
    badge?: string;
    badgeColor?: string;
    ctaText?: string;
    ctaLink?: string;
    order: number;
    isActive: boolean;
    contactInfo?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    requestedBy?: string;
    approvedAt?: string;
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
}

let activeShopAdsCache: { success: boolean; data: ShopAd[] } | null = null;
let activeShopAdsCacheTime = 0;
let activeShopAdsInFlight: Promise<{ success: boolean; data: ShopAd[] }> | null = null;
const ACTIVE_SHOP_ADS_CACHE_TTL_MS = 30 * 1000;

/**
 * Get all shop ads (admin)
 */
export const getAllShopAds = async (params?: { status?: string }) => {
    const response = await api.get("/admin/shop-ads", { params });
    return response.data;
};

/**
 * Get shop ad by ID (admin)
 */
export const getShopAdById = async (id: string) => {
    const response = await api.get(`/admin/shop-ads/${id}`);
    return response.data;
};

/**
 * Create shop ad (admin)
 */
export const createShopAd = async (data: Partial<ShopAd>) => {
    const response = await api.post("/admin/shop-ads", data);
    return response.data;
};

/**
 * Update shop ad (admin)
 */
export const updateShopAd = async (id: string, data: Partial<ShopAd>) => {
    const response = await api.put(`/admin/shop-ads/${id}`, data);
    return response.data;
};

/**
 * Delete shop ad (admin)
 */
export const deleteShopAd = async (id: string) => {
    const response = await api.delete(`/admin/shop-ads/${id}`);
    return response.data;
};

/**
 * Toggle shop ad status (admin)
 */
export const toggleShopAdStatus = async (id: string) => {
    const response = await api.patch(`/admin/shop-ads/${id}/toggle`);
    return response.data;
};

/**
 * Get active shop ads for public carousel
 */
export const getActiveShopAds = async (): Promise<{ success: boolean; data: ShopAd[] }> => {
    const now = Date.now();

    if (activeShopAdsCache && now - activeShopAdsCacheTime < ACTIVE_SHOP_ADS_CACHE_TTL_MS) {
        return activeShopAdsCache;
    }

    if (activeShopAdsInFlight) {
        return activeShopAdsInFlight;
    }

    activeShopAdsInFlight = api
        .get("/shop-ads/active")
        .then((response) => {
            activeShopAdsCache = response.data;
            activeShopAdsCacheTime = Date.now();
            return response.data;
        })
        .finally(() => {
            activeShopAdsInFlight = null;
        });

    return activeShopAdsInFlight;
};
