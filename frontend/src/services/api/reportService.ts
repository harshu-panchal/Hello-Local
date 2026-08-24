import api from './config';

export interface SalesReportParams {
    channel?: string;
    paymentMethod?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface SalesReport {
    orderId: string;
    billNumber?: string;
    orderItemId: string;
    product: string;
    variant: string;
    quantity?: number;
    price?: number;
    taxAmount?: number;
    channel?: string;
    paymentMethod?: string;
    status?: string;
    total: number;
    date: string;
}

export interface SalesReportResponse {
    success: boolean;
    message: string;
    data: SalesReport[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

/**
 * Get seller's sales report
 */
export const getSalesReport = async (params: SalesReportParams): Promise<SalesReportResponse> => {
    const response = await api.get<SalesReportResponse>('/seller/reports/sales', { params });
    return response.data;
};
