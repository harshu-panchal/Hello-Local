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
        const isProduction = process.env.NODE_ENV === 'production';
        const bypassAllowed = process.env.RAZORPAY_BYPASS === 'true' || !isProduction;

        // Dev/Testing bypass: if credentials are missing, return a dummy order only when bypass is allowed
        if (!keyId || !keySecret) {
            if (!bypassAllowed) {
                throw new Error('Razorpay credentials not configured');
            }
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
    const isProduction = process.env.NODE_ENV === 'production';
    const bypassAllowed = process.env.RAZORPAY_BYPASS === 'true' || !isProduction;

    // Development/Testing bypass
    if (razorpayPaymentId.startsWith('mock_')) {
        if (!bypassAllowed) {
            console.error('❌ Blocked mock payment bypass attempt in production mode');
            return false;
        }
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
 * Capture payment and update order or ad request.
 *
 * Uses a MongoDB session/transaction when available (replica-set).
 * Falls back to plain saves when sessions are not supported (standalone dev DB)
 * so that the notification path is never silently skipped.
 */
export const capturePayment = async (
    id: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    type: 'Order' | 'AdRequest' = 'Order',
    io?: any
) => {
    // ── Session/transaction setup (optional — standalone MongoDB doesn't support it) ──
    let session: mongoose.ClientSession | null = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
    } catch (sessionError) {
        console.warn('⚠️ capturePayment: MongoDB transactions not supported. Proceeding without transaction.', sessionError);
        session = null;
    }

    try {
        // ── 1. Verify Razorpay signature ──────────────────────────────────────────
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

        // ── 2. Handle Order payment ───────────────────────────────────────────────
        if (type === 'Order') {
            const order = session
                ? await Order.findById(id).session(session)
                : await Order.findById(id);

            if (!order) throw new Error('Order not found');
            amount = order.total;
            customerOrSellerId = order.customer.toString();

            // Guard against duplicate processing
            if (order.paymentStatus === 'Paid') {
                console.warn(`⚠️ capturePayment: Order ${id} is already marked as Paid. Skipping.`);
                if (session) await session.abortTransaction();
                return { success: true, message: 'Payment already captured', data: { razorpayPaymentId, id } };
            }

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

            if (session) {
                await payment.save({ session });
            } else {
                await payment.save();
            }

            // Update order: mark paid and advance status from Pending → Received
            order.paymentStatus = 'Paid';
            order.paymentId = razorpayPaymentId;
            if (order.status === 'Pending') {
                order.status = 'Received'; // Payment confirmed — now visible to seller
            }

            if (session) {
                await order.save({ session });
                await session.commitTransaction();
            } else {
                await order.save();
            }

            console.log(`✅ capturePayment: Order ${id} marked Paid and Received.`);

            // ── 3a. Create pending commissions (non-critical) ─────────────────────
            try {
                const { createPendingCommissions } = await import('./commissionService');
                // Run in background to speed up payment capture
                createPendingCommissions(id).catch(commError => {
                    console.error('Failed to create pending commissions after payment:', commError);
                });
            } catch (importError) {
                console.error('Failed to import commissionService:', importError);
            }

            // ── 3b. Notify sellers AFTER payment is confirmed ─────────────────────
            // This is the correct trigger point: order is now Paid + Received.
            if (io) {
                try {
                    const { notifySellersOfOrderUpdate } = await import('./sellerNotificationService');
                    // Run in background
                    Order.findById(id).lean().then(leanOrder => {
                        if (leanOrder) {
                            return notifySellersOfOrderUpdate(io, leanOrder, 'NEW_ORDER').then(() => {
                                console.log(`📤 Seller notified for paid order ${leanOrder.orderNumber}`);
                            });
                        }
                    }).catch(notifyError => {
                        console.error('Failed to notify sellers after payment:', notifyError);
                    });
                } catch (importError) {
                    console.error('Failed to import sellerNotificationService:', importError);
                }
            } else {
                console.warn('⚠️ capturePayment: io not available — seller socket notification skipped.');
            }

        // ── Handle AdRequest payment ──────────────────────────────────────────────
        } else {
            const adReq = session
                ? await SellerAdRequest.findById(id).session(session)
                : await SellerAdRequest.findById(id);

            if (!adReq) throw new Error('Ad Request not found');
            amount = adReq.adPrice || adReq.requestedPrice || 0;
            customerOrSellerId = adReq.sellerId.toString();

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

            if (session) {
                await payment.save({ session });
            } else {
                await payment.save();
            }

            adReq.paymentStatus = 'Paid';
            adReq.paymentReference = razorpayPaymentId;
            adReq.paidAt = new Date();
            if (adReq.status === 'Approved' || adReq.status === 'Pending') {
                adReq.status = 'PaymentVerified';
            }

            if (session) {
                await adReq.save({ session });
                await session.commitTransaction();
            } else {
                await adReq.save();
            }
        }

        return {
            success: true,
            message: 'Payment captured successfully',
            data: { razorpayPaymentId, id },
        };

    } catch (error: any) {
        if (session) {
            try {
                await session.abortTransaction();
            } catch (abortErr) {
                console.error('Error aborting transaction in capturePayment:', abortErr);
            }
        }
        console.error('Error capturing payment:', error);
        return {
            success: false,
            message: error.message || 'Failed to capture payment',
        };
    } finally {
        if (session) {
            try {
                session.endSession();
            } catch (_) { /* ignore */ }
        }
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
    signature: string,
    io?: any
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
                await handlePaymentCaptured(payload, io);
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
const handlePaymentCaptured = async (payload: any, io?: any) => {
    try {
        const razorpayPaymentId = payload.id;
        const razorpayOrderId = payload.order_id;

        // Find payment record
        const payment = await Payment.findOne({ razorpayOrderId });

        if (payment) {
            if (payment.status === 'Completed') return; // Prevent double processing

            payment.status = 'Completed';
            payment.razorpayPaymentId = razorpayPaymentId;
            payment.paidAt = new Date();
            await payment.save();

            // Update order: mark paid AND advance Pending → Received
            // (Webhook fires after capturePayment in most cases, so the $cond
            //  only upgrades status if it is still Pending — avoids downgrading.)
            const order = await Order.findOneAndUpdate(
                { _id: payment.order },
                [
                    {
                        $set: {
                            paymentStatus: 'Paid',
                            paymentId: razorpayPaymentId,
                            // Only promote 'Pending' → 'Received'; leave other statuses alone
                            status: {
                                $cond: {
                                    if: { $eq: ['$status', 'Pending'] },
                                    then: 'Received',
                                    else: '$status',
                                },
                            },
                        },
                    },
                ],
                { new: true }
            );

            if (io && order) {
                try {
                    const { notifySellersOfOrderUpdate } = await import('./sellerNotificationService');
                    const leanOrder = await Order.findById(order._id).lean();
                    if (leanOrder) {
                        await notifySellersOfOrderUpdate(io, leanOrder, 'NEW_ORDER');
                        console.log(`📤 Webhook: seller notified for paid order ${leanOrder.orderNumber}`);
                    }
                } catch (notifyError) {
                    console.error('Failed to notify sellers after payment webhook:', notifyError);
                }
            }
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
