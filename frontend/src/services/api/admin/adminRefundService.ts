import api from "../config";

export interface AdminRefund {
  _id: string;
  amount: number;
  reason: string;
  status: "Pending" | "Approved" | "Processed" | "Rejected" | "Completed" | "Failed";
  failureReason?: string;
  createdAt: string;
  processedAt?: string;
  order?: { _id: string; orderNumber: string; total: number };
  customer?: { _id: string; name: string; phone?: string };
}

/** Refund ledger. There was no refund path at all before this. (#H-06) */
export const getRefunds = async (params?: {
  status?: string;
  page?: number;
  limit?: number;
}) => {
  const response = await api.get<{
    success: boolean;
    data: AdminRefund[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>("/admin/refunds", { params });
  return response.data;
};

/** Issue a refund against a paid order. */
export const refundOrder = async (
  orderId: string,
  reason: string,
  amount?: number,
) => {
  const response = await api.post(`/admin/orders/${orderId}/refund`, { reason, amount });
  return response.data;
};
