import Razorpay from 'razorpay';
import crypto from 'crypto';
import Payment from '../models/Payment';
import Order from '../models/Order';
import mongoose from 'mongoose';
import SellerAdRequest from '../models/SellerAdRequest';

// Initialize Razorpay instance
const getRazorpayInstance = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not configured');
    }

    return new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
    });
};

/**
 * Create a Razorpay order
 */
export const createRazorpayOrder = async (
    orderId: string,
    amount: number,
    currency: string = 'INR'
) => {
    try {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        // Dev/Testing bypass: if credentials are missing, return a dummy order
        if (!keyId || !keySecret) {
            console.warn('⚠️ Razorpay credentials not configured. Returning DUMMY order for testing.');
            return {
                success: true,
                data: {
                    razorpayOrderId: 'mock_order_' + Date.now(),
                    razorpayKey: 'rzp_test_dummy_key',
                    amount: Math.round(amount * 100),
                    currency,
                    receipt: orderId,
                },
            };
        }

        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });

        const options = {
            amount: Math.round(amount * 100), // Amount in paise
            currency,
            receipt: orderId,
            notes: {
                orderId,
            },
        };

        const razorpayOrder = await razorpay.orders.create(options);

        return {
            success: true,
            data: {
                razorpayOrderId: razorpayOrder.id,
                razorpayKey: keyId,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                receipt: razorpayOrder.receipt,
            },
        };
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error);
        return {
            success: false,
            message: error.message || 'Failed to create Razorpay order',
        };
    }
};

/**
 * Verify Razorpay payment signature
 */
export const verifyPaymentSignature = (
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
): boolean => {
    // Development/Testing bypass
    if (razorpayPaymentId.startsWith('mock_')) {
        console.log('✅ Bypassing payment signature verification for MOCK payment');
        return true;
    }

    try {
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keySecret) {
            throw new Error('Razorpay key secret not configured');
        }

        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
            .createHmac('sha256', keySecret)
            .update(body)
            .digest('hex');

        return expectedSignature === razorpaySignature;
    } catch (error) {
        console.error('Error verifying payment signature:', error);
        return false;
    }
};

/**
 * Capture payment and update order or ad request
 */
export const capturePayment = async (
    id: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    type: 'Order' | 'AdRequest' = 'Order'
) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Verify signature
        const isValid = verifyPaymentSignature(
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature
        );

        if (!isValid) {
            throw new Error('Invalid payment signature');
        }

        let amount = 0;
        let customerOrSellerId = '';

        if (type === 'Order') {
            const order = await Order.findById(id).session(session);
            if (!order) throw new Error('Order not found');
            amount = order.total;
            customerOrSellerId = order.customer.toString();

            // Create payment record
            const payment = new Payment({
                order: id,
                customer: customerOrSellerId,
                paymentMethod: 'Online',
                paymentGateway: 'Razorpay',
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature,
                amount,
                currency: 'INR',
                status: 'Completed',
                paidAt: new Date(),
                gatewayResponse: {
                    success: true,
                    message: 'Payment captured successfully',
                },
            });
            await payment.save({ session });

            // Update order
            order.paymentStatus = 'Paid';
            order.paymentId = razorpayPaymentId;
            if (order.status === 'Pending') {
                order.status = 'Received';
            }
            await order.save({ session });

            await session.commitTransaction();

            // Create Pending Commissions
            try {
                const { createPendingCommissions } = await import('./commissionService');
                await createPendingCommissions(id);
            } catch (commError) {
                console.error("Failed to create pending commissions after payment:", commError);
            }

        } else {
            const adReq = await SellerAdRequest.findById(id).session(session);
            if (!adReq) throw new Error('Ad Request not found');
            amount = adReq.adPrice || adReq.requestedPrice || 0;
            customerOrSellerId = adReq.sellerId.toString();

            // Create payment record
            const payment = new Payment({
                adRequest: id,
                seller: customerOrSellerId,
                paymentMethod: 'Online',
                paymentGateway: 'Razorpay',
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature,
                amount,
                currency: 'INR',
                status: 'Completed',
                paidAt: new Date(),
                gatewayResponse: {
                    success: true,
                    message: 'Payment captured successfully',
                },
            });
            await payment.save({ session });

            // Update ad request
            adReq.paymentStatus = 'Paid';
            adReq.paymentReference = razorpayPaymentId;
            adReq.paidAt = new Date();
            // If it was already approved, maybe it can go to PaymentVerified or Live?
            // Usually it goes to PaymentVerified for admin to finally check.
            if (adReq.status === 'Approved' || adReq.status === 'Pending') {
                adReq.status = 'PaymentVerified';
            }
            await adReq.save({ session });

            await session.commitTransaction();
        }

        return {
            success: true,
            message: 'Payment captured successfully',
            data: {
                razorpayPaymentId,
                id,
            },
        };
    } catch (error: any) {
        await session.abortTransaction();
        console.error('Error capturing payment:', error);
        return {
            success: false,
            message: error.message || 'Failed to capture payment',
        };
    } finally {
        session.endSession();
    }
};

/**
 * Process refund
 */
export const processRefund = async (
    paymentId: string,
    amount?: number,
    reason?: string
) => {
    try {
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            throw new Error('Payment not found');
        }

        if (!payment.razorpayPaymentId) {
            throw new Error('Razorpay payment ID not found');
        }

        const razorpay = getRazorpayInstance();

        const refundAmount = amount || payment.amount;

        const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
            amount: Math.round(refundAmount * 100), // Amount in paise
            notes: {
                reason: reason || 'Order cancelled',
            },
        });

        // Update payment record
        payment.status = 'Refunded';
        payment.refundAmount = refundAmount;
        payment.refundedAt = new Date();
        payment.refundReason = reason;
        await payment.save();

        return {
            success: true,
            message: 'Refund processed successfully',
            data: {
                refundId: refund.id,
                amount: refundAmount,
            },
        };
    } catch (error: any) {
        console.error('Error processing refund:', error);
        return {
            success: false,
            message: error.message || 'Failed to process refund',
        };
    }
};

/**
 * Handle Razorpay webhook
 */
export const handleWebhook = async (
    body: any,
    signature: string
): Promise<{ success: boolean; message: string }> => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        if (!webhookSecret) {
            throw new Error('Razorpay webhook secret not configured');
        }

        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(body))
            .digest('hex');

        if (expectedSignature !== signature) {
            throw new Error('Invalid webhook signature');
        }

        const event = body.event;
        const payload = body.payload.payment.entity;

        // Handle different events
        switch (event) {
            case 'payment.captured':
                // Payment was captured successfully
                await handlePaymentCaptured(payload);
                break;

            case 'payment.failed':
                // Payment failed
                await handlePaymentFailed(payload);
                break;

            case 'refund.created':
                // Refund was created
                await handleRefundCreated(body.payload.refund.entity);
                break;

            default:
                console.log('Unhandled webhook event:', event);
        }

        return {
            success: true,
            message: 'Webhook processed successfully',
        };
    } catch (error: any) {
        console.error('Error handling webhook:', error);
        return {
            success: false,
            message: error.message || 'Failed to process webhook',
        };
    }
};

// Helper functions for webhook events
const handlePaymentCaptured = async (payload: any) => {
    try {
        const razorpayPaymentId = payload.id;
        const razorpayOrderId = payload.order_id;

        // Find payment record
        const payment = await Payment.findOne({ razorpayOrderId });

        if (payment) {
            payment.status = 'Completed';
            payment.razorpayPaymentId = razorpayPaymentId;
            payment.paidAt = new Date();
            await payment.save();

            // Update order
            await Order.findByIdAndUpdate(payment.order, {
                paymentStatus: 'Paid',
                paymentId: razorpayPaymentId,
            });
        }
    } catch (error) {
        console.error('Error handling payment captured:', error);
    }
};

const handlePaymentFailed = async (payload: any) => {
    try {
        const razorpayOrderId = payload.order_id;

        // Find payment record
        const payment = await Payment.findOne({ razorpayOrderId });

        if (payment) {
            payment.status = 'Failed';
            payment.gatewayResponse = {
                success: false,
                message: payload.error_description || 'Payment failed',
                rawResponse: payload,
            };
            await payment.save();

            // Update order
            await Order.findByIdAndUpdate(payment.order, {
                paymentStatus: 'Failed',
            });
        }
    } catch (error) {
        console.error('Error handling payment failed:', error);
    }
};

const handleRefundCreated = async (payload: any) => {
    try {
        const razorpayPaymentId = payload.payment_id;

        // Find payment record
        const payment = await Payment.findOne({ razorpayPaymentId });

        if (payment) {
            payment.status = 'Refunded';
            payment.refundAmount = payload.amount / 100; // Convert from paise
            payment.refundedAt = new Date();
            await payment.save();

            // Update order
            await Order.findByIdAndUpdate(payment.order, {
                paymentStatus: 'Refunded',
            });
        }
    } catch (error) {
        console.error('Error handling refund created:', error);
    }
};
