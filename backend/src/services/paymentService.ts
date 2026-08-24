import Payment from '../models/Payment';
import Order from '../models/Order';
import mongoose from 'mongoose';
import SellerAdRequest from '../models/SellerAdRequest';
import { sendNotificationToUser } from './firebaseAdmin';
import {
    assertGatewayPayment,
    getRazorpayInstance,
    verifyWebhookSignature,
    PaymentVerificationError,
} from './razorpayVerificationService';

/**
 * Create a Razorpay order (payment intent) and persist its id against the
 * record being paid for, so that verification can prove the payment belongs
 * to THIS record. (#C-01)
 *
 * There is no dummy/mock fallback: a missing credential is a hard failure.
 * The previous fallback returned a fabricated `mock_order_*` which, combined
 * with the signature bypass, allowed free checkout. (#C-02)
 */
export const createRazorpayOrder = async (
    receipt: string,
    amount: number,
    currency: string = 'INR'
) => {
    try {
        const razorpay = getRazorpayInstance();

        const amountMinor = Math.round(Number(amount) * 100);
        if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
            return { success: false, message: 'Invalid payment amount' };
        }

        const razorpayOrder = await razorpay.orders.create({
            amount: amountMinor,
            currency,
            receipt: String(receipt).slice(0, 40), // Razorpay caps receipt length
            notes: { receipt: String(receipt) },
        });

        return {
            success: true,
            data: {
                razorpayOrderId: razorpayOrder.id,
                razorpayKey: process.env.RAZORPAY_KEY_ID,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                receipt: razorpayOrder.receipt,
            },
        };
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error?.message || error);
        return {
            success: false,
            message:
                error instanceof PaymentVerificationError
                    ? error.message
                    : 'Failed to create payment order',
        };
    }
};

/**
 * Capture (confirm) a payment.
 *
 * Every one of these checks is required; removing any one of them reopens a
 * free-order path:
 *   - the caller must own the record (enforced by the route),
 *   - `razorpayOrderId` must equal the intent we issued for this record,
 *   - the gateway must report the payment as `captured`,
 *   - the captured amount must cover the amount due,
 *   - the gateway payment id must not have been consumed already.
 */
export const capturePayment = async (
    id: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    type: 'Order' | 'AdRequest' = 'Order',
    io?: any
) => {
    try {
        // ── Replay guard: a gateway payment id is single-use. ─────────────────
        const alreadyConsumed = await Payment.findOne({ razorpayPaymentId });
        if (alreadyConsumed) {
            if (String(alreadyConsumed.order || alreadyConsumed.get('adRequest') || '') === String(id)) {
                return {
                    success: true,
                    message: 'Payment already captured',
                    data: { razorpayPaymentId, id },
                };
            }
            return {
                success: false,
                message: 'This payment has already been used for another order.',
            };
        }

        if (type === 'Order') {
            return await captureOrderPayment(id, razorpayOrderId, razorpayPaymentId, razorpaySignature, io);
        }
        return await captureAdRequestPayment(id, razorpayOrderId, razorpayPaymentId, razorpaySignature);
    } catch (error: any) {
        console.error('Error capturing payment:', error?.message || error);
        return {
            success: false,
            message: error?.message || 'Failed to capture payment',
        };
    }
};

async function captureOrderPayment(
    id: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    io?: any
) {
    const order = await Order.findById(id);
    if (!order) throw new PaymentVerificationError('Order not found', 404);

    if (order.paymentStatus === 'Paid') {
        return {
            success: true,
            message: 'Payment already captured',
            data: { razorpayPaymentId, id },
        };
    }

    // Server-authoritative verification against the gateway. (#C-01 / #C-02)
    const assertion = await assertGatewayPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        expectedAmount: order.total,
        expectedRazorpayOrderId: order.razorpayOrderId,
    });

    const customerId = order.customer.toString();

    let session: mongoose.ClientSession | null = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        await Payment.create(
            [
                {
                    order: id,
                    customer: customerId,
                    paymentMethod: 'Online',
                    paymentGateway: 'Razorpay',
                    razorpayOrderId: assertion.razorpayOrderId,
                    razorpayPaymentId: assertion.razorpayPaymentId,
                    razorpaySignature,
                    amount: assertion.amount,
                    currency: assertion.currency,
                    status: 'Completed',
                    paidAt: new Date(),
                    gatewayResponse: {
                        success: true,
                        message: `Captured via ${assertion.method || 'razorpay'}`,
                    },
                },
            ],
            { session }
        );

        // Only promote Pending → Received; never downgrade a later status.
        const updated = await Order.findOneAndUpdate(
            { _id: id, paymentStatus: { $ne: 'Paid' } },
            [
                {
                    $set: {
                        paymentStatus: 'Paid',
                        paymentId: assertion.razorpayPaymentId,
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
            { new: true, session }
        );

        if (!updated) {
            // Another request captured it concurrently — abort and report success.
            await session.abortTransaction();
            return {
                success: true,
                message: 'Payment already captured',
                data: { razorpayPaymentId, id },
            };
        }

        await session.commitTransaction();
        console.log(`capturePayment: Order ${id} marked Paid (${assertion.amount} ${assertion.currency}).`);
    } catch (err) {
        if (session?.inTransaction()) {
            try { await session.abortTransaction(); } catch { /* ignore */ }
        }
        throw err;
    } finally {
        session?.endSession();
    }

    // ── Post-commit side effects (never block or fail the capture) ───────────
    sendNotificationToUser(customerId, 'Customer', {
        title: 'Order Placed Successfully',
        body: `Your order #${order.orderNumber} has been confirmed. We'll notify you when the seller prepares it.`,
        data: {
            type: 'ORDER_PLACED',
            orderId: id,
            orderNumber: order.orderNumber || '',
        },
    }).catch(err => console.error(`Push notification failed for customer ${customerId}:`, err));

    try {
        const { createPendingCommissions } = await import('./commissionService');
        createPendingCommissions(id).catch(commError =>
            console.error('Failed to create pending commissions after payment:', commError)
        );
    } catch (importError) {
        console.error('Failed to import commissionService:', importError);
    }

    if (io) {
        try {
            const { notifySellersOfOrderUpdate } = await import('./sellerNotificationService');
            // Atomically claim the one-time notify flag so only one path
            // (capturePayment vs webhook) notifies the seller.
            const claimed = await Order.findOneAndUpdate(
                { _id: id, sellerNotified: { $ne: true } },
                { $set: { sellerNotified: true } },
                { new: true }
            ).lean();
            if (claimed) {
                notifySellersOfOrderUpdate(io, claimed, 'NEW_ORDER')
                    .then(() => console.log(`Seller notified for paid order ${claimed.orderNumber}`))
                    .catch(err => console.error('Failed to notify sellers after payment:', err));
            }
        } catch (importError) {
            console.error('Failed to import sellerNotificationService:', importError);
        }
    } else {
        console.warn('capturePayment: io not available — seller socket notification skipped.');
    }

    return {
        success: true,
        message: 'Payment captured successfully',
        data: { razorpayPaymentId: assertion.razorpayPaymentId, id },
    };
}

async function captureAdRequestPayment(
    id: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
) {
    const adReq = await SellerAdRequest.findById(id);
    if (!adReq) throw new PaymentVerificationError('Ad Request not found', 404);

    if (adReq.paymentStatus === 'Paid') {
        return {
            success: true,
            message: 'Payment already captured',
            data: { razorpayPaymentId, id },
        };
    }

    const due = adReq.adPrice || adReq.requestedPrice || 0;
    if (!due || due <= 0) {
        throw new PaymentVerificationError('This ad request has no price set yet.');
    }

    const assertion = await assertGatewayPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        expectedAmount: due,
        expectedRazorpayOrderId: adReq.razorpayOrderId,
    });

    const sellerId = adReq.sellerId.toString();

    let session: mongoose.ClientSession | null = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        await Payment.create(
            [
                {
                    adRequest: id,
                    seller: sellerId,
                    paymentMethod: 'Online',
                    paymentGateway: 'Razorpay',
                    razorpayOrderId: assertion.razorpayOrderId,
                    razorpayPaymentId: assertion.razorpayPaymentId,
                    razorpaySignature,
                    amount: assertion.amount,
                    currency: assertion.currency,
                    status: 'Completed',
                    paidAt: new Date(),
                    gatewayResponse: { success: true, message: 'Payment captured successfully' },
                },
            ],
            { session }
        );

        adReq.paymentStatus = 'Paid';
        adReq.paymentReference = assertion.razorpayPaymentId;
        adReq.paidAt = new Date();
        if (adReq.status === 'Approved' || adReq.status === 'Pending') {
            adReq.status = 'PaymentVerified';
        }
        await adReq.save({ session });

        await session.commitTransaction();
    } catch (err) {
        if (session?.inTransaction()) {
            try { await session.abortTransaction(); } catch { /* ignore */ }
        }
        throw err;
    } finally {
        session?.endSession();
    }

    return {
        success: true,
        message: 'Payment captured successfully',
        data: { razorpayPaymentId: assertion.razorpayPaymentId, id },
    };
}

/**
 * Process a refund against a recorded payment.
 */
export const processRefund = async (
    paymentId: string,
    amount?: number,
    reason?: string
) => {
    try {
        const payment = await Payment.findById(paymentId);
        if (!payment) throw new Error('Payment not found');
        if (!payment.razorpayPaymentId) throw new Error('Razorpay payment ID not found');
        if (payment.status === 'Refunded') {
            return { success: true, message: 'Payment already refunded', data: { amount: payment.refundAmount } };
        }

        const refundAmount = amount ?? payment.amount;
        if (refundAmount <= 0 || refundAmount > payment.amount + 0.01) {
            throw new Error('Refund amount must be between 0 and the captured amount');
        }

        const razorpay = getRazorpayInstance();
        const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
            amount: Math.round(refundAmount * 100),
            notes: { reason: reason || 'Order cancelled' },
        });

        payment.status = 'Refunded';
        payment.refundAmount = refundAmount;
        payment.refundedAt = new Date();
        payment.refundReason = reason;
        await payment.save();

        return {
            success: true,
            message: 'Refund processed successfully',
            data: { refundId: refund.id, amount: refundAmount },
        };
    } catch (error: any) {
        console.error('Error processing refund:', error?.message || error);
        return { success: false, message: error?.message || 'Failed to process refund' };
    }
};

/**
 * Handle a Razorpay webhook.
 *
 * `rawBody` MUST be the exact bytes Razorpay sent — a re-serialised parsed body
 * does not reproduce the signed payload. (#H-10)
 */
export const handleWebhook = async (
    rawBody: Buffer | string,
    signature: string,
    io?: any
): Promise<{ success: boolean; message: string }> => {
    try {
        if (!verifyWebhookSignature(rawBody, signature)) {
            throw new Error('Invalid webhook signature');
        }

        const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
        const event = body?.event;

        switch (event) {
            case 'payment.captured':
                await handlePaymentCaptured(body?.payload?.payment?.entity, io);
                break;
            case 'payment.failed':
                await handlePaymentFailed(body?.payload?.payment?.entity);
                break;
            case 'refund.created':
            case 'refund.processed':
                // `refund.*` events carry payload.refund, not payload.payment.
                // Reading payload.payment unconditionally used to throw here. (#H-10)
                await handleRefundCreated(body?.payload?.refund?.entity);
                break;
            default:
                console.log('Unhandled webhook event:', event);
        }

        return { success: true, message: 'Webhook processed successfully' };
    } catch (error: any) {
        console.error('Error handling webhook:', error?.message || error);
        return { success: false, message: error?.message || 'Failed to process webhook' };
    }
};

const handlePaymentCaptured = async (payload: any, io?: any) => {
    if (!payload?.id) return;
    try {
        const razorpayPaymentId = payload.id;
        const razorpayOrderId = payload.order_id;

        const payment = await Payment.findOne({ razorpayOrderId });
        if (!payment) return;
        if (payment.status === 'Completed') return; // already processed

        payment.status = 'Completed';
        payment.razorpayPaymentId = razorpayPaymentId;
        payment.paidAt = new Date();
        await payment.save();

        const order = await Order.findOneAndUpdate(
            { _id: payment.order },
            [
                {
                    $set: {
                        paymentStatus: 'Paid',
                        paymentId: razorpayPaymentId,
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
                const claimed = await Order.findOneAndUpdate(
                    { _id: order._id, sellerNotified: { $ne: true } },
                    { $set: { sellerNotified: true } },
                    { new: true }
                ).lean();
                if (claimed) {
                    await notifySellersOfOrderUpdate(io, claimed, 'NEW_ORDER');
                    console.log(`Webhook: seller notified for paid order ${claimed.orderNumber}`);
                }
            } catch (notifyError) {
                console.error('Failed to notify sellers after payment webhook:', notifyError);
            }
        }
    } catch (error) {
        console.error('Error handling payment captured:', error);
    }
};

const handlePaymentFailed = async (payload: any) => {
    if (!payload?.order_id) return;
    try {
        const payment = await Payment.findOne({ razorpayOrderId: payload.order_id });
        if (!payment) return;

        payment.status = 'Failed';
        payment.gatewayResponse = {
            success: false,
            message: payload.error_description || 'Payment failed',
            rawResponse: payload,
        };
        await payment.save();

        await Order.findByIdAndUpdate(payment.order, { paymentStatus: 'Failed' });
    } catch (error) {
        console.error('Error handling payment failed:', error);
    }
};

const handleRefundCreated = async (payload: any) => {
    if (!payload?.payment_id) return;
    try {
        const payment = await Payment.findOne({ razorpayPaymentId: payload.payment_id });
        if (!payment) return;

        payment.status = 'Refunded';
        payment.refundAmount = Number(payload.amount) / 100;
        payment.refundedAt = new Date();
        await payment.save();

        await Order.findByIdAndUpdate(payment.order, { paymentStatus: 'Refunded' });
    } catch (error) {
        console.error('Error handling refund created:', error);
    }
};

// Re-exported so existing importers keep working; the mock bypass is gone. (#C-02)
export { verifyCheckoutSignature as verifyPaymentSignature } from './razorpayVerificationService';
