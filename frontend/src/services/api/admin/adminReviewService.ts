import api from "../config";

export interface AdminReview {
  _id: string;
  rating: number;
  title?: string;
  comment?: string;
  status: "Pending" | "Approved" | "Rejected";
  isVerifiedPurchase: boolean;
  createdAt: string;
  customer?: { _id: string; name: string; phone?: string };
  product?: { _id: string; productName: string; mainImage?: string };
}

/** Reviews awaiting or past moderation. (#H-21) */
export const getReviews = async (params?: {
  status?: "Pending" | "Approved" | "Rejected";
  productId?: string;
  page?: number;
  limit?: number;
}) => {
  const response = await api.get<{
    success: boolean;
    data: AdminReview[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>("/admin/reviews", { params });
  return response.data;
};

export const moderateReview = async (
  id: string,
  status: "Approved" | "Rejected" | "Pending",
) => {
  const response = await api.patch(`/admin/reviews/${id}/status`, { status });
  return response.data;
};

export const deleteReview = async (id: string) => {
  const response = await api.delete(`/admin/reviews/${id}`);
  return response.data;
};
