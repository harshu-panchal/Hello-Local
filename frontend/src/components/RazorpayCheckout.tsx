import React, { useEffect } from 'react';
import { createRazorpayOrder, verifyPayment } from '../services/api/paymentService';

interface RazorpayCheckoutProps {
    orderId: string;
    amount: number;
    onSuccess: (paymentId: string) => void;
    onFailure: (error: string) => void;
    customerDetails: {
        name: string;
        email: string;
        phone: string;
    };
    type?: 'Order' | 'AdRequest';
}

declare global {
    interface Window {
        Razorpay: any;
    }
}

const RazorpayCheckout: React.FC<RazorpayCheckoutProps> = ({
    orderId,
    amount,
    onSuccess,
    onFailure,
    customerDetails,
    type = 'Order',
}) => {
    useEffect(() => {
        // Load Razorpay script if not already loaded
        const loadRazorpayScript = () => {
            return new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.body.appendChild(script);
            });
        };

        const initiatePayment = async () => {
            try {
                // Load Razorpay script
                const scriptLoaded = await loadRazorpayScript();
                if (!scriptLoaded) {
                    onFailure('Failed to load Razorpay SDK');
                    return;
                }

                // Create Razorpay order
                const orderResponse = await createRazorpayOrder(orderId, type);

                if (!orderResponse.success) {
                    onFailure(orderResponse.message || 'Failed to create payment order');
                    return;
                }

                const { razorpayOrderId, razorpayKey } = orderResponse.data;

                // Razorpay options
                const options = {
                    key: razorpayKey, // Get key from backend response
                    amount: amount * 100, // Amount in paise
                    currency: 'INR',
                    name: 'Hello Local',
                    description: `${type === 'AdRequest' ? 'Ad Request' : 'Order'} #${orderId}`,
                    order_id: razorpayOrderId,
                    prefill: {
                        name: customerDetails.name,
                        email: customerDetails.email,
                        contact: customerDetails.phone,
                    },
                    theme: {
                        color: type === 'AdRequest' ? '#FF4B6E' : '#3B82F6', // Pick pink for ads, blue for orders
                    },
                    handler: async function (response: any) {
                        try {
                            // Verify payment with backend
                            const verificationResponse = await verifyPayment({
                                orderId,
                                razorpayOrderId: response.razorpay_order_id,
                                razorpayPaymentId: response.razorpay_payment_id,
                                razorpaySignature: response.razorpay_signature,
                                type
                            });

                            if (verificationResponse.success) {
                                onSuccess(response.razorpay_payment_id);
                            } else {
                                onFailure(verificationResponse.message || 'Payment verification failed');
                            }
                        } catch (error: any) {
                            console.error('Payment verification error:', error);
                            onFailure(error.response?.data?.message || 'Payment verification failed');
                        }
                    },
                    modal: {
                        ondismiss: function () {
                            onFailure('Payment cancelled by user');
                        },
                    },
                };

                const razorpay = new window.Razorpay(options);
                razorpay.open();
            } catch (error: any) {
                console.error('Payment initiation error:', error);
                onFailure(error.response?.data?.message || 'Failed to initiate payment');
            }
        };

        initiatePayment();
    }, [orderId, amount, customerDetails, onSuccess, onFailure, type]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
                    <h3 className="text-lg font-semibold mb-2">Initiating Payment...</h3>
                    <p className="text-sm text-gray-600 mb-6">Please wait while we redirect you to the payment gateway</p>

                    <div className="pt-4 border-t border-gray-100 italic">
                        <p className="text-[10px] text-gray-400 mb-3 text-center">Testing mode: Razorpay might not be enabled</p>
                        <button
                            onClick={async () => {
                                try {
                                    console.log("Mocking success for testing...");
                                    const mockPaymentId = "mock_payment_" + Date.now();

                                    // Hit the backend to mark as paid
                                    const verificationResponse = await verifyPayment({
                                        orderId,
                                        razorpayOrderId: "mock_order_id",
                                        razorpayPaymentId: mockPaymentId,
                                        razorpaySignature: "mock_signature",
                                        type
                                    });

                                    if (verificationResponse.success) {
                                        onSuccess(mockPaymentId);
                                    } else {
                                        onFailure(verificationResponse.message || "Mock verification failed");
                                    }
                                } catch (err: any) {
                                    onFailure(err.message || "Mock payment failed");
                                }
                            }}
                            className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 transition"
                        >
                            Proceed with Mock Payment (Testing)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RazorpayCheckout;
