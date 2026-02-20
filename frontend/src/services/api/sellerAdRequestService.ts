import api from "./config";

export interface SellerAdRequestPayload {
    shopName: string;
    tagline: string;
    description?: string;
    imageUrl: string;
    badge?: string;
    badgeColor?: string;
    ctaText?: string;
    ctaLink?: string;
    durationDays: number;
    requestedPrice?: number;
    sellerPhone?: string;
    paymentNote?: string;
    paymentMethod?: string;
    paymentReference?: string;
    paymentScreenshotUrl?: string;
}

export interface PaymentProofPayload {
    paymentMethod: string;
    paymentReference?: string;
    paymentScreenshotUrl?: string;
    paymentNote?: string;
}

export const createSellerAdRequest = async (data: SellerAdRequestPayload) => {
    const res = await api.post("/seller/ad-requests", data);
    return res.data;
};

export const getMyAdRequests = async () => {
    const res = await api.get("/seller/ad-requests");
    return res.data;
};

export const getMyAdRequestById = async (id: string) => {
    const res = await api.get(`/seller/ad-requests/${id}`);
    return res.data;
};

export const submitPaymentProof = async (id: string, data: PaymentProofPayload) => {
    const res = await api.post(`/seller/ad-requests/${id}/payment`, data);
    return res.data;
};

export const cancelAdRequest = async (id: string) => {
    const res = await api.delete(`/seller/ad-requests/${id}`);
    return res.data;
};

export const getAdAvailability = async () => {
    const res = await api.get("/seller/ad-requests/availability");
    return res.data;
};


// Admin APIs for ad requests
export const adminGetAllAdRequests = async (status?: string) => {
    const params: any = {};
    if (status) params.status = status;
    const res = await api.get("/admin/ad-requests", { params });
    return res.data;
};

export const adminGetAdRequestStats = async () => {
    const res = await api.get("/admin/ad-requests/stats");
    return res.data;
};

export const adminApproveAdRequest = async (id: string, adPrice: number, adminNote?: string) => {
    const res = await api.post(`/admin/ad-requests/${id}/approve`, { adPrice, adminNote });
    return res.data;
};

export const adminRejectAdRequest = async (id: string, adminNote: string) => {
    const res = await api.post(`/admin/ad-requests/${id}/reject`, { adminNote });
    return res.data;
};

export const adminVerifyPaymentAndActivate = async (id: string, adminNote?: string) => {
    const res = await api.post(`/admin/ad-requests/${id}/verify-payment`, { adminNote });
    return res.data;
};
