import api from "../config";

export interface ShopAd {
    _id: string;
    shopName: string;
    tagline: string;
    description?: string;
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
    const response = await api.get("/shop-ads/active");
    return response.data;
};
