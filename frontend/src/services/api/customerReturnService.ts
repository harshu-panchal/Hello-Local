import api from './config';

export interface ReturnRequest {
    _id: string;
    order: { _id: string; orderNumber: string } | string;
    orderItem: {
        _id: string;
        productName: string;
        productImage?: string;
        unitPrice: number;
        quantity: number;
    } | string;
    reason: string;
    description?: string;
    quantity: number;
    refundAmount?: number;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Processing' | 'Completed';
    rejectionReason?: string;
    createdAt: string;
    processedAt?: string;
}

export interface CreateReturnData {
    orderId: string;
    orderItemId: string;
    quantity: number;
    reason: string;
    description?: string;
    images?: string[];
}

/** Raise a return against a delivered order item. */
export const createReturnRequest = async (data: CreateReturnData) => {
    const response = await api.post<{ success: boolean; message: string; data: ReturnRequest }>(
        '/customer/returns',
        data,
    );
    return response.data;
};

/** The signed-in customer's returns. */
export const getMyReturns = async (params?: { page?: number; limit?: number }) => {
    const response = await api.get<{ success: boolean; data: ReturnRequest[]; pagination: unknown }>(
        '/customer/returns',
        { params },
    );
    return response.data;
};

export const getReturnById = async (id: string) => {
    const response = await api.get<{ success: boolean; data: ReturnRequest }>(
        `/customer/returns/${id}`,
    );
    return response.data;
};
