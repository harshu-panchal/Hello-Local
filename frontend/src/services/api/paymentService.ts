import api from './config';

/**
 * Create Razorpay order for payment
 */
export const createRazorpayOrder = async (orderId: string, type: 'Order' | 'AdRequest' = 'Order') => {
    try {
        const response = await api.post('/payment/create-order', { orderId, type });
        return response.data;
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error);
        throw error;
    }
};

/**
 * Verify payment after Razorpay checkout
 */
export const verifyPayment = async (paymentData: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    type?: 'Order' | 'AdRequest';
}) => {
    try {
        const response = await api.post('/payment/verify', paymentData);
        return response.data;
    } catch (error: any) {
        console.error('Error verifying payment:', error);
        throw error;
    }
};

/**
 * Get payment history (if needed)
 */
export const getPaymentHistory = async () => {
    try {
        const response = await api.get('/customer/payments');
        return response.data;
    } catch (error: any) {
        console.error('Error getting payment history:', error);
        throw error;
    }
};
