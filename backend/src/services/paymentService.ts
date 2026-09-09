import Payment from '../models/Payment';
import Order from '../models/Order';
import Refund from '../models/Refund';
import Settlement from '../models/Settlement';
import mongoose from 'mongoose';
import SellerAdRequest from '../models/SellerAdRequest';
import { sendNotificationToUser } from './firebaseAdmin';
import {
    assertGatewayPayment,
    assertGatewayWebhookPayment,
    getRazorpayInstance,
    verifyWebhookSignature,
    PaymentVerificationError,
    PaymentFetcher,
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

export interface GetOrReuseOrderResult {
    success: boolean;
    message?: string;
    isPaid?: boolean;
    reused?: boolean;
    data?: {
        razorpayOrderId: string;
        razorpayKey?: string;
        amount: string | number;
        currency: string;
        receipt?: string;
    };
}

/**
 * P1 #5: Get or reuse an active Razorpay payment intent for a payable document (Order or SellerAdRequest).
 * 
 * Enforces the Financial Invariant:
 *   One Hello-Local payable record -> one active Razorpay payment intent at a time.
 *
 * If a valid, unpaid Razorpay order was already issued for this exact record with matching
 * amount and currency, that intent is reused rather than creating a duplicate order at the gateway.
 * This completely prevents:
 *   1. Dual charges (where a user completes an earlier UPI collect prompt and a later web checkout).
 *   2. Orphaned payments (where Razorpay charges the customer but Hello-Local drops the webhook).
 *   3. Client verification errors on retry ("This payment does not belong to this order").
 */
export const getOrReuseRazorpayOrder = async (
    payableDoc: any,
    amountDue: number,
    options?: {
        orderFetcher?: (orderId: string) => Promise<any>;
        razorpayInstance?: any;
    }
): Promise<GetOrReuseOrderResult> => {
    try {
        if (!payableDoc) {
            return { success: false, message: 'Invalid payable document' };
        }

        const expectedAmountMinor = Math.round(Number(amountDue) * 100);
        if (!Number.isFinite(expectedAmountMinor) || expectedAmountMinor <= 0) {
            return { success: false, message: 'Invalid payment amount' };
        }

        const existingOrderId = String(payableDoc.razorpayOrderId || '').trim();

        if (existingOrderId) {
            try {
                let existingOrder: any = null;
                if (options?.orderFetcher) {
                    existingOrder = await options.orderFetcher(existingOrderId);
                } else {
                    const razorpay = options?.razorpayInstance || getRazorpayInstance();
                    existingOrder = await razorpay.orders.fetch(existingOrderId);
                }

                if (existingOrder && existingOrder.id === existingOrderId) {
                    // Gateway reports this intent is already paid
                    if (existingOrder.status === 'paid') {
                        return {
                            success: false,
                            isPaid: true,
                            message: 'This payment has already been completed.',
                        };
                    }

                    // Gateway reports intent is active ('created' or 'attempted')
                    if (existingOrder.status === 'created' || existingOrder.status === 'attempted') {
                        const existingAmount = Number(existingOrder.amount);
                        const existingCurrency = String(existingOrder.currency || 'INR');

                        // Verify amount and currency match the authoritative server figures
                        if (existingAmount === expectedAmountMinor && existingCurrency === 'INR') {
                            return {
                                success: true,
                                reused: true,
                                data: {
                                    razorpayOrderId: existingOrder.id,
                                    razorpayKey: process.env.RAZORPAY_KEY_ID,
                                    amount: existingOrder.amount,
                                    currency: existingOrder.currency,
                                    receipt: existingOrder.receipt,
                                },
                            };
                        }

                        console.warn(
                            `[Payment intent reuse] Existing intent ${existingOrderId} amount/currency mismatch (existing: ${existingAmount} ${existingCurrency}, expected: ${expectedAmountMinor} INR). Creating new intent.`
                        );
                    } else {
                        console.warn(
                            `[Payment intent reuse] Existing intent ${existingOrderId} has non-payable status: ${existingOrder.status}. Creating new intent.`
                        );
                    }
                }
            } catch (fetchErr: any) {
                console.warn(
                    `[Payment intent reuse] Could not fetch existing Razorpay order ${existingOrderId} (${fetchErr?.message || fetchErr}). Creating new intent.`
                );
            }
        }

        // Concurrency guard: check if another request concurrently created an intent
        if (!existingOrderId && payableDoc.constructor?.findById && typeof payableDoc.constructor.findById === 'function') {
            try {
                const freshDoc = await payableDoc.constructor.findById(payableDoc._id).select('razorpayOrderId');
                if (freshDoc?.razorpayOrderId && freshDoc.razorpayOrderId !== existingOrderId) {
                    return await getOrReuseRazorpayOrder(freshDoc, amountDue, options);
                }
            } catch {
                // ignore
            }
        }

        // No reusable intent exists or previous intent is unusable/outdated: create a new one
        const newOrderResult = await createRazorpayOrder(String(payableDoc._id), amountDue);
        if (!newOrderResult.success || !newOrderResult.data) {
            return {
                success: false,
                message: newOrderResult.message,
            };
        }

        payableDoc.razorpayOrderId = newOrderResult.data.razorpayOrderId;
        if (typeof payableDoc.save === 'function') {
            await payableDoc.save();
        }

        return {
            success: true,
            reused: false,
            data: newOrderResult.data,
        };
    } catch (error: any) {
        console.error('Error in getOrReuseRazorpayOrder:', error?.message || error);
        return {
            success: false,
            message:
                error instanceof PaymentVerificationError
                    ? error.message
                    : 'Failed to process payment intent',
        };
    }
};

/**
 * Refund processor function type for safe auto-refunds and test mocks.
 */
export type RefundProcessor = (
    paymentId: string,
    params: { amount: number; notes: Record<string, string> }
) => Promise<{ id: string; amount?: number; status?: string; [key: string]: any }>;

const defaultRefundProcessor: RefundProcessor = async (paymentId, params) => {
    const razorpay = getRazorpayInstance();
    return await razorpay.payments.refund(paymentId, params);
};

export function computeGatewayFeeFields(
    amount: number,
    fee?: number,
    tax?: number
): { gatewayFee?: number; gatewayTax?: number; netAmount?: number } {
    if (fee === undefined || fee === null || !Number.isFinite(fee) || fee < 0) {
        return {};
    }
    const gatewayFee = Math.round(fee * 100) / 100;
    const gatewayTax = (tax !== undefined && tax !== null && Number.isFinite(tax) && tax >= 0)
        ? Math.round(tax * 100) / 100
        : undefined;
    const netAmount = Math.max(0, Math.round((amount - gatewayFee + Number.EPSILON) * 100) / 100);
    return {
        gatewayFee,
        gatewayTax,
        netAmount,
    };
}

export interface HandleDuplicatePaymentParams {
    payableType: 'Order' | 'SellerAdRequest';
    orderId?: string;
    adRequestId?: string;
    customerId?: string;
    sellerId?: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature?: string;
    amount: number;
    currency: string;
    fee?: number;
    tax?: number;
    refundProcessor?: RefundProcessor;
}

/**
 * Handle a genuine, distinct captured payment received for an already-paid payable.
 *
 * Sequence: Verify -> Record -> Identify as Duplicate -> Attempt one idempotent refund -> Record outcome.
 *
 * Guaranteed invariants (P1 #6):
 * 1. The duplicate payment NEVER alters Order.paymentStatus or adRequest.paymentStatus.
 * 2. NEVER creates pending seller or rider commissions.
 * 3. NEVER sends seller notifications or creates fulfillment events.
 * 4. NEVER loses or deletes the duplicate Payment record on refund failures.
 * 5. Exactly 1 duplicate Payment record is maintained, protected by unique razorpayPaymentId.
 * 6. Gateway refund is called at most once for the duplicate payment.
 */
export const handleDuplicatePayment = async (
    params: HandleDuplicatePaymentParams
): Promise<{ success: boolean; duplicatePayment: any; refunded: boolean; refundId?: string }> => {
    const {
        payableType,
        orderId,
        adRequestId,
        customerId,
        sellerId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        amount,
        currency,
        fee,
        tax,
        refundProcessor,
    } = params;

    const feeFields = computeGatewayFeeFields(amount, fee, tax);

    // 1. Check if Payment record already exists for this paymentId
    let duplicatePayment = await Payment.findOne({ razorpayPaymentId });
    if (!duplicatePayment) {
        try {
            const docs = await Payment.create(
                [
                    {
                        order: payableType === 'Order' ? orderId : undefined,
                        customer: payableType === 'Order' ? customerId : undefined,
                        adRequest: payableType === 'SellerAdRequest' ? adRequestId : undefined,
                        seller: payableType === 'SellerAdRequest' ? sellerId : undefined,
                        paymentMethod: 'Online',
                        paymentGateway: 'Razorpay',
                        razorpayOrderId,
                        razorpayPaymentId,
                        razorpaySignature: razorpaySignature || 'DUPLICATE_CAPTURED',
                        amount,
                        currency: currency || 'INR',
                        ...feeFields,
                        status: 'Completed',
                        paidAt: new Date(),
                        isDuplicate: true,
                        notes: 'DUPLICATE_PAYMENT_CAPTURED: Order already paid; pending auto-refund',
                        gatewayResponse: {
                            success: true,
                            isDuplicate: true,
                            message: 'Duplicate payment captured for already-paid payable',
                        },
                    },
                ]
            );
            duplicatePayment = docs[0];
            console.log(
                `[Duplicate Payment] Successfully recorded duplicate payment ${razorpayPaymentId} for ${payableType} ${orderId || adRequestId}`
            );
        } catch (err: any) {
            // Handle concurrent race duplicate key E11000
            if (err?.code === 11000 || String(err?.message || '').includes('duplicate key')) {
                duplicatePayment = await Payment.findOne({ razorpayPaymentId });
                if (!duplicatePayment) throw err;
            } else {
                throw err;
            }
        }
    }

    // 2. Check if already refunded (idempotency guard)
    if (
        duplicatePayment.status === 'Refunded' ||
        (duplicatePayment.totalRefunded || 0) >= duplicatePayment.amount - 0.01
    ) {
        console.log(`[Duplicate Payment] Payment ${razorpayPaymentId} is already refunded (idempotent exit).`);
        return {
            success: true,
            duplicatePayment,
            refunded: true,
            refundId: duplicatePayment.gatewayResponse?.refundId,
        };
    }

    let existingRefund: any = null;
    if (mongoose.connection.readyState === 1 || (Refund.findOne as any) !== (mongoose.Model as any).findOne) {
        try {
            existingRefund = await Refund.findOne({
                payment: duplicatePayment._id,
                status: 'Completed',
            });
        } catch {
            // ignore in disconnected test environments
        }
    }

    if (existingRefund) {
        duplicatePayment.status = 'Refunded';
        duplicatePayment.refundAmount = duplicatePayment.amount;
        duplicatePayment.totalRefunded = duplicatePayment.amount;
        duplicatePayment.refundedAt = existingRefund.processedAt || new Date();
        duplicatePayment.refundReason = existingRefund.reason || 'DUPLICATE_PAYMENT_AUTO_REFUND';
        await duplicatePayment.save();
        return {
            success: true,
            duplicatePayment,
            refunded: true,
            refundId: existingRefund.refundTransactionId,
        };
    }

    // 3. Attempt safe gateway auto-refund
    const processor = refundProcessor || defaultRefundProcessor;
    try {
        const refundResult = await processor(razorpayPaymentId, {
            amount: Math.round(amount * 100),
            notes: {
                reason: 'DUPLICATE_PAYMENT_AUTO_REFUND',
                duplicatePaymentId: razorpayPaymentId,
                payableId: orderId || adRequestId || '',
            },
        });

        const refundTxId = refundResult?.id || `rfnd_${Date.now()}`;

        duplicatePayment.status = 'Refunded';
        duplicatePayment.refundAmount = amount;
        duplicatePayment.totalRefunded = amount;
        duplicatePayment.refundedAt = new Date();
        duplicatePayment.refundReason = 'DUPLICATE_PAYMENT_AUTO_REFUND';
        duplicatePayment.notes = `DUPLICATE_PAYMENT_REFUNDED: Auto-refund processed via Razorpay (${refundTxId})`;
        duplicatePayment.gatewayResponse = {
            success: true,
            message: duplicatePayment.gatewayResponse?.message,
            rawResponse: duplicatePayment.gatewayResponse?.rawResponse,
            isDuplicate: true,
            refundId: refundTxId,
            refundStatus: 'processed',
            rawRefund: refundResult,
        };
        await duplicatePayment.save();

        if (mongoose.connection.readyState === 1 || (Refund.create as any) !== (mongoose.Model as any).create) {
            try {
                await Refund.create({
                    order: payableType === 'Order' ? orderId : undefined,
                    customer: payableType === 'Order' ? customerId : undefined,
                    adRequest: payableType === 'SellerAdRequest' ? adRequestId : undefined,
                    seller: payableType === 'SellerAdRequest' ? sellerId : undefined,
                    payment: duplicatePayment._id,
                    amount,
                    reason: 'DUPLICATE_PAYMENT_AUTO_REFUND',
                    status: 'Completed',
                    refundTransactionId: refundTxId,
                    processedAt: new Date(),
                    gatewayResponse: refundResult,
                });
            } catch (refCreateErr) {
                console.warn('[Duplicate Payment] Could not create Refund doc for duplicate refund:', refCreateErr);
            }
        }

        console.log(
            `[Duplicate Payment] Payment ${razorpayPaymentId} successfully refunded via gateway (${refundTxId}).`
        );

        return {
            success: true,
            duplicatePayment,
            refunded: true,
            refundId: refundTxId,
        };
    } catch (refundError: any) {
        console.error(
            `[Duplicate Payment] Auto-refund failed for payment ${razorpayPaymentId}:`,
            refundError?.message || refundError
        );
        // DO NOT delete the duplicate payment record. Preserve for manual/retry reconciliation.
        duplicatePayment.status = 'Completed';
        duplicatePayment.notes = `DUPLICATE_PAYMENT_PENDING_MANUAL_REFUND: Auto-refund failed (${refundError?.message || 'Gateway error'})`;
        duplicatePayment.gatewayResponse = {
            success: true,
            message: duplicatePayment.gatewayResponse?.message,
            rawResponse: duplicatePayment.gatewayResponse?.rawResponse,
            isDuplicate: true,
            autoRefundFailed: true,
            refundError: refundError?.message || String(refundError),
        };
        await duplicatePayment.save();

        if (mongoose.connection.readyState === 1 || (Refund.create as any) !== (mongoose.Model as any).create) {
            try {
                await Refund.create({
                    order: payableType === 'Order' ? orderId : undefined,
                    customer: payableType === 'Order' ? customerId : undefined,
                    adRequest: payableType === 'SellerAdRequest' ? adRequestId : undefined,
                    seller: payableType === 'SellerAdRequest' ? sellerId : undefined,
                    payment: duplicatePayment._id,
                    amount,
                    reason: 'DUPLICATE_PAYMENT_AUTO_REFUND',
                    status: 'Failed',
                    failureReason: refundError?.message || 'Gateway error during auto-refund',
                });
            } catch {
                // ignore
            }
        }

        return {
            success: true,
            duplicatePayment,
            refunded: false,
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
    io?: any,
    options?: { paymentFetcher?: PaymentFetcher; refundProcessor?: RefundProcessor }
) => {
    try {
        // ── Replay guard: a gateway payment id is single-use. ─────────────────
        const alreadyConsumed = await Payment.findOne({ razorpayPaymentId });
        if (alreadyConsumed) {
            const matchesThis = String(alreadyConsumed.order || alreadyConsumed.get('adRequest') || '') === String(id);
            if (matchesThis) {
                if (alreadyConsumed.isDuplicate) {
                    return {
                        success: true,
                        message: 'Duplicate payment already recorded and processed',
                        data: { razorpayPaymentId, id, isDuplicate: true },
                    };
                }
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
            return await captureOrderPayment(id, razorpayOrderId, razorpayPaymentId, razorpaySignature, io, options);
        }
        return await captureAdRequestPayment(id, razorpayOrderId, razorpayPaymentId, razorpaySignature, options);
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
    io?: any,
    options?: { paymentFetcher?: PaymentFetcher; refundProcessor?: RefundProcessor }
) {
    const order = await Order.findById(id);
    if (!order) throw new PaymentVerificationError('Order not found', 404);

    if (order.paymentStatus === 'Paid') {
        if (order.paymentId === razorpayPaymentId) {
            return {
                success: true,
                message: 'Payment already captured',
                data: { razorpayPaymentId, id },
            };
        }

        // Distinct captured payment for already-paid order!
        // Server-authoritative verification against the gateway. (#C-01 / #C-02)
        const assertion = await assertGatewayPayment({
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            expectedAmount: order.total,
            expectedRazorpayOrderId: order.razorpayOrderId,
            paymentFetcher: options?.paymentFetcher,
        });

        const dupResult = await handleDuplicatePayment({
            payableType: 'Order',
            orderId: id,
            customerId: order.customer.toString(),
            razorpayOrderId: assertion.razorpayOrderId,
            razorpayPaymentId: assertion.razorpayPaymentId,
            razorpaySignature,
            amount: assertion.amount,
            currency: assertion.currency,
            fee: assertion.fee,
            tax: assertion.tax,
            refundProcessor: options?.refundProcessor,
        });

        return {
            success: true,
            message: dupResult.refunded
                ? 'Duplicate payment detected, recorded, and refunded successfully'
                : 'Duplicate payment detected and recorded (pending refund)',
            data: {
                razorpayPaymentId: assertion.razorpayPaymentId,
                id,
                isDuplicate: true,
                refunded: dupResult.refunded,
                refundId: dupResult.refundId,
            },
        };
    }

    // Server-authoritative verification against the gateway. (#C-01 / #C-02)
    const assertion = await assertGatewayPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        expectedAmount: order.total,
        expectedRazorpayOrderId: order.razorpayOrderId,
        paymentFetcher: options?.paymentFetcher,
    });

    const feeFields = computeGatewayFeeFields(assertion.amount, assertion.fee, assertion.tax);
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
                    ...feeFields,
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
            // Another request captured it concurrently — abort and report success / duplicate.
            await session.abortTransaction();
            const freshOrder = await Order.findById(id);
            if (
                freshOrder &&
                freshOrder.paymentStatus === 'Paid' &&
                freshOrder.paymentId !== assertion.razorpayPaymentId
            ) {
                const dupResult = await handleDuplicatePayment({
                    payableType: 'Order',
                    orderId: id,
                    customerId,
                    razorpayOrderId: assertion.razorpayOrderId,
                    razorpayPaymentId: assertion.razorpayPaymentId,
                    razorpaySignature,
                    amount: assertion.amount,
                    currency: assertion.currency,
                    fee: assertion.fee,
                    tax: assertion.tax,
                    refundProcessor: options?.refundProcessor,
                });
                return {
                    success: true,
                    message: dupResult.refunded
                        ? 'Duplicate payment detected, recorded, and refunded successfully'
                        : 'Duplicate payment detected and recorded (pending refund)',
                    data: {
                        razorpayPaymentId: assertion.razorpayPaymentId,
                        id,
                        isDuplicate: true,
                        refunded: dupResult.refunded,
                        refundId: dupResult.refundId,
                    },
                };
            }
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
    razorpaySignature: string,
    options?: { paymentFetcher?: PaymentFetcher; refundProcessor?: RefundProcessor }
) {
    const adReq = await SellerAdRequest.findById(id);
    if (!adReq) throw new PaymentVerificationError('Ad Request not found', 404);

    const due = adReq.adPrice || adReq.requestedPrice || 0;
    if (!due || due <= 0) {
        throw new PaymentVerificationError('This ad request has no price set yet.');
    }

    if (adReq.paymentStatus === 'Paid') {
        const existingPrimary = await Payment.findOne({
            adRequest: id,
            razorpayPaymentId,
            isDuplicate: { $ne: true },
        });
        if (existingPrimary) {
            return {
                success: true,
                message: 'Payment already captured',
                data: { razorpayPaymentId, id },
            };
        }

        // Distinct captured payment for already-paid ad request!
        const assertion = await assertGatewayPayment({
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            expectedAmount: due,
            expectedRazorpayOrderId: adReq.razorpayOrderId,
            paymentFetcher: options?.paymentFetcher,
        });

        const dupResult = await handleDuplicatePayment({
            payableType: 'SellerAdRequest',
            adRequestId: id,
            sellerId: adReq.sellerId.toString(),
            razorpayOrderId: assertion.razorpayOrderId,
            razorpayPaymentId: assertion.razorpayPaymentId,
            razorpaySignature,
            amount: assertion.amount,
            currency: assertion.currency,
            fee: assertion.fee,
            tax: assertion.tax,
            refundProcessor: options?.refundProcessor,
        });

        return {
            success: true,
            message: dupResult.refunded
                ? 'Duplicate payment detected, recorded, and refunded successfully'
                : 'Duplicate payment detected and recorded (pending refund)',
            data: {
                razorpayPaymentId: assertion.razorpayPaymentId,
                id,
                isDuplicate: true,
                refunded: dupResult.refunded,
                refundId: dupResult.refundId,
            },
        };
    }

    const assertion = await assertGatewayPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        expectedAmount: due,
        expectedRazorpayOrderId: adReq.razorpayOrderId,
        paymentFetcher: options?.paymentFetcher,
    });

    const feeFields = computeGatewayFeeFields(assertion.amount, assertion.fee, assertion.tax);
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
                    ...feeFields,
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
 * Supports full refunds, partial refunds, and sequential partial refunds.
 */
export const processRefund = async (
    paymentId: string,
    amount?: number,
    reason?: string,
    options?: { returnId?: string; idempotencyKey?: string }
) => {
    try {
        const payment = await Payment.findById(paymentId);
        if (!payment) throw new Error('Payment not found');
        if (!payment.razorpayPaymentId) throw new Error('Razorpay payment ID not found');

        const alreadyRefunded = Math.round((payment.totalRefunded || payment.refundAmount || 0) * 100) / 100;
        const remaining = Math.max(0, Math.round((payment.amount - alreadyRefunded + Number.EPSILON) * 100) / 100);

        if (payment.status === 'Refunded' || remaining <= 0.009) {
            return {
                success: true,
                message: 'Payment already refunded',
                data: {
                    amount: alreadyRefunded,
                    totalRefunded: alreadyRefunded,
                    remainingRefundable: 0,
                    isFullyRefunded: true,
                },
            };
        }

        const refundAmount = amount === undefined ? remaining : Math.round(Number(amount) * 100) / 100;
        if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
            throw new Error('Refund amount must be greater than zero');
        }
        if (refundAmount > remaining + 0.01) {
            throw new Error(`Refund amount (${refundAmount}) must be between 0 and the remaining refundable amount (${remaining})`);
        }

        const toRefund = Math.min(refundAmount, remaining);

        const razorpay = getRazorpayInstance();
        const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
            amount: Math.round(toRefund * 100),
            notes: {
                reason: reason || 'Order cancelled',
                returnId: options?.returnId || '',
                idempotencyKey: options?.idempotencyKey || '',
            },
        });

        const newTotal = Math.min(
            payment.amount,
            Math.round((alreadyRefunded + toRefund + Number.EPSILON) * 100) / 100
        );
        const isFully = newTotal >= payment.amount - 0.01;

        payment.refundAmount = newTotal;
        payment.totalRefunded = newTotal;
        payment.refundedAt = new Date();
        payment.refundReason = reason;
        payment.status = isFully ? 'Refunded' : 'PartiallyRefunded';
        await payment.save();

        return {
            success: true,
            message: 'Refund processed successfully',
            data: {
                refundId: refund.id,
                amount: toRefund,
                totalRefunded: newTotal,
                remainingRefundable: Math.max(0, Math.round((payment.amount - newTotal + Number.EPSILON) * 100) / 100),
                isFullyRefunded: isFully,
            },
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
    io?: any,
    options?: { paymentFetcher?: PaymentFetcher; refundProcessor?: RefundProcessor }
): Promise<{ success: boolean; message: string }> => {
    try {
        if (!verifyWebhookSignature(rawBody, signature)) {
            throw new Error('Invalid webhook signature');
        }

        const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
        const event = body?.event;

        switch (event) {
            case 'payment.captured':
                await handlePaymentCaptured(body?.payload?.payment?.entity, io, options);
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
            case 'settlement.processed':
                await handleSettlementProcessed(body?.payload?.settlement?.entity || body?.payload?.settlement);
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

export const handlePaymentCaptured = async (
    payload: any,
    io?: any,
    options?: { paymentFetcher?: PaymentFetcher; refundProcessor?: RefundProcessor }
) => {
    if (!payload?.id) {
        console.warn('[Webhook payment.captured] Ignored: payload has no payment id');
        return;
    }

    const razorpayPaymentId = String(payload.id);
    const razorpayOrderId = String(payload.order_id || '');

    if (!razorpayOrderId) {
        console.warn(`[Webhook payment.captured] Payment ${razorpayPaymentId} has no order_id.`);
        return;
    }

    try {
        // ── 1. Replay / Idempotency check on gateway payment id ──────────────
        const existingPayment = await Payment.findOne({ razorpayPaymentId });
        if (existingPayment) {
            if (existingPayment.isDuplicate) {
                if (
                    existingPayment.status === 'Refunded' ||
                    (existingPayment.totalRefunded || 0) >= existingPayment.amount - 0.01
                ) {
                    console.log(`[Webhook payment.captured] Duplicate payment ${razorpayPaymentId} already processed and refunded (idempotent exit).`);
                    return;
                }
                // If refund had failed previously, retry auto-refund
                await handleDuplicatePayment({
                    payableType: existingPayment.order ? 'Order' : 'SellerAdRequest',
                    orderId: existingPayment.order?.toString(),
                    adRequestId: existingPayment.adRequest?.toString(),
                    customerId: existingPayment.customer?.toString(),
                    sellerId: existingPayment.seller?.toString(),
                    razorpayOrderId: existingPayment.razorpayOrderId || razorpayOrderId,
                    razorpayPaymentId: existingPayment.razorpayPaymentId || razorpayPaymentId,
                    amount: existingPayment.amount,
                    currency: existingPayment.currency,
                    refundProcessor: options?.refundProcessor,
                });
                return;
            }
            if (existingPayment.status === 'Completed') {
                console.log(`[Webhook payment.captured] Payment ${razorpayPaymentId} already processed (idempotent exit).`);
                return;
            }
        }

        // ── 2. Check if primary Payment record already exists for this intent ────────
        const payment = await Payment.findOne({ razorpayOrderId, isDuplicate: { $ne: true } });
        if (payment) {
            if (payment.status === 'Completed') {
                if (payment.razorpayPaymentId && payment.razorpayPaymentId !== razorpayPaymentId) {
                    console.log(
                        `[Webhook payment.captured] Intent ${razorpayOrderId} already completed via ${payment.razorpayPaymentId}. Handling ${razorpayPaymentId} as duplicate.`
                    );
                    if (payment.order) {
                        const order = await Order.findById(payment.order);
                        if (order) {
                            const assertion = await assertGatewayWebhookPayment({
                                razorpayOrderId,
                                razorpayPaymentId,
                                expectedAmount: order.total,
                                expectedRazorpayOrderId: order.razorpayOrderId,
                                expectedCurrency: 'INR',
                                paymentFetcher: options?.paymentFetcher,
                            });
                            await handleDuplicatePayment({
                                payableType: 'Order',
                                orderId: order._id.toString(),
                                customerId: order.customer.toString(),
                                razorpayOrderId,
                                razorpayPaymentId,
                                razorpaySignature: 'WEBHOOK_VERIFIED',
                                amount: assertion.amount,
                                currency: assertion.currency,
                                fee: assertion.fee,
                                tax: assertion.tax,
                                refundProcessor: options?.refundProcessor,
                            });
                            return;
                        }
                    } else if (payment.adRequest) {
                        const adReq = await SellerAdRequest.findById(payment.adRequest);
                        if (adReq) {
                            const due = adReq.adPrice || adReq.requestedPrice || 0;
                            const assertion = await assertGatewayWebhookPayment({
                                razorpayOrderId,
                                razorpayPaymentId,
                                expectedAmount: due,
                                expectedRazorpayOrderId: adReq.razorpayOrderId,
                                expectedCurrency: 'INR',
                                paymentFetcher: options?.paymentFetcher,
                            });
                            await handleDuplicatePayment({
                                payableType: 'SellerAdRequest',
                                adRequestId: adReq._id.toString(),
                                sellerId: adReq.sellerId.toString(),
                                razorpayOrderId,
                                razorpayPaymentId,
                                razorpaySignature: 'WEBHOOK_VERIFIED',
                                amount: assertion.amount,
                                currency: assertion.currency,
                                fee: assertion.fee,
                                tax: assertion.tax,
                                refundProcessor: options?.refundProcessor,
                            });
                            return;
                        }
                    }
                }
                console.log(`[Webhook payment.captured] Order intent ${razorpayOrderId} already completed.`);
                return;
            }

            // Existing pending Payment record: promote to Completed
            payment.status = 'Completed';
            payment.razorpayPaymentId = razorpayPaymentId;
            payment.paidAt = new Date();

            let payloadFee: number | undefined = undefined;
            if (payload?.fee !== null && payload?.fee !== undefined) {
                const rawFee = Number(payload.fee);
                if (Number.isFinite(rawFee) && rawFee >= 0) payloadFee = Math.round(rawFee) / 100;
            }
            let payloadTax: number | undefined = undefined;
            if (payload?.tax !== null && payload?.tax !== undefined) {
                const rawTax = Number(payload.tax);
                if (Number.isFinite(rawTax) && rawTax >= 0) payloadTax = Math.round(rawTax) / 100;
            }
            const feeFields = computeGatewayFeeFields(payment.amount, payloadFee, payloadTax);
            if (feeFields.gatewayFee !== undefined) payment.gatewayFee = feeFields.gatewayFee;
            if (feeFields.gatewayTax !== undefined) payment.gatewayTax = feeFields.gatewayTax;
            if (feeFields.netAmount !== undefined) payment.netAmount = feeFields.netAmount;

            await payment.save();

            const order = await Order.findOneAndUpdate(
                { _id: payment.order, paymentStatus: { $ne: 'Paid' } },
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

            if (order) {
                try {
                    const { createPendingCommissions } = await import('./commissionService');
                    await createPendingCommissions(String(order._id));
                } catch (commError) {
                    console.error('[Webhook payment.captured] Failed to create pending commissions:', commError);
                }

                if (io) {
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
                        console.error('[Webhook payment.captured] Failed to notify sellers:', notifyError);
                    }
                }
            }
            return;
        }

        // ── 3. Payment record does NOT exist -> RECOVERY via Order or AdRequest ─
        const order = await Order.findOne({ razorpayOrderId });
        if (!order) {
            const adReq = await SellerAdRequest.findOne({ razorpayOrderId });
            if (adReq) {
                if (adReq.paymentStatus === 'Paid') {
                    const primaryAdPayment = await Payment.findOne({
                        adRequest: adReq._id,
                        isDuplicate: { $ne: true },
                    });
                    if (!primaryAdPayment || primaryAdPayment.razorpayPaymentId !== razorpayPaymentId) {
                        console.log(`[Webhook payment.captured] AdRequest ${adReq._id} already Paid. Handling ${razorpayPaymentId} as duplicate.`);
                        const due = adReq.adPrice || adReq.requestedPrice || 0;
                        const assertion = await assertGatewayWebhookPayment({
                            razorpayOrderId,
                            razorpayPaymentId,
                            expectedAmount: due,
                            expectedRazorpayOrderId: adReq.razorpayOrderId,
                            expectedCurrency: 'INR',
                            paymentFetcher: options?.paymentFetcher,
                        });
                        await handleDuplicatePayment({
                            payableType: 'SellerAdRequest',
                            adRequestId: adReq._id.toString(),
                            sellerId: adReq.sellerId.toString(),
                            razorpayOrderId,
                            razorpayPaymentId,
                            razorpaySignature: 'WEBHOOK_VERIFIED',
                            amount: assertion.amount,
                            currency: assertion.currency,
                            fee: assertion.fee,
                            tax: assertion.tax,
                            refundProcessor: options?.refundProcessor,
                        });
                        return;
                    }
                }
            }
            console.warn(
                `[Webhook payment.captured] No Order found matching razorpayOrderId: ${razorpayOrderId}, paymentId: ${razorpayPaymentId}`
            );
            return;
        }

        if (order.paymentStatus === 'Paid') {
            if (order.paymentId && order.paymentId !== razorpayPaymentId) {
                console.log(`[Webhook payment.captured] Order ${order._id} already Paid via ${order.paymentId}. Handling ${razorpayPaymentId} as duplicate.`);
                const assertion = await assertGatewayWebhookPayment({
                    razorpayOrderId,
                    razorpayPaymentId,
                    expectedAmount: order.total,
                    expectedRazorpayOrderId: order.razorpayOrderId,
                    expectedCurrency: 'INR',
                    paymentFetcher: options?.paymentFetcher,
                });
                await handleDuplicatePayment({
                    payableType: 'Order',
                    orderId: order._id.toString(),
                    customerId: order.customer.toString(),
                    razorpayOrderId,
                    razorpayPaymentId,
                    razorpaySignature: 'WEBHOOK_VERIFIED',
                    amount: assertion.amount,
                    currency: assertion.currency,
                    fee: assertion.fee,
                    tax: assertion.tax,
                    refundProcessor: options?.refundProcessor,
                });
                return;
            }
            console.log(`[Webhook payment.captured] Order ${order._id} is already Paid (idempotent exit).`);
            return;
        }

        // Server-authoritative verification against Razorpay (never trust payload amount blindly)
        const assertion = await assertGatewayWebhookPayment({
            razorpayOrderId,
            razorpayPaymentId,
            expectedAmount: order.total,
            expectedRazorpayOrderId: order.razorpayOrderId,
            expectedCurrency: 'INR',
            paymentFetcher: options?.paymentFetcher,
        });

        const feeFields = computeGatewayFeeFields(assertion.amount, assertion.fee, assertion.tax);
        const customerId = order.customer.toString();
        const orderId = order._id.toString();

        let session: mongoose.ClientSession | null = null;
        let captureSuccess = false;

        try {
            session = await mongoose.startSession();
            session.startTransaction();

            // Replay guard inside transaction session
            const replayQuery = Payment.findOne({ razorpayPaymentId });
            const replayCheck = typeof (replayQuery as any)?.session === 'function'
                ? await (replayQuery as any).session(session)
                : await replayQuery;
            if (replayCheck) {
                await session.abortTransaction();
                console.log(`[Webhook payment.captured] Payment ${razorpayPaymentId} was captured concurrently.`);
                return;
            }

            await Payment.create(
                [
                    {
                        order: orderId,
                        customer: customerId,
                        paymentMethod: 'Online',
                        paymentGateway: 'Razorpay',
                        razorpayOrderId: assertion.razorpayOrderId,
                        razorpayPaymentId: assertion.razorpayPaymentId,
                        razorpaySignature: 'WEBHOOK_VERIFIED',
                        amount: assertion.amount,
                        currency: assertion.currency,
                        ...feeFields,
                        status: 'Completed',
                        paidAt: new Date(),
                        gatewayResponse: {
                            success: true,
                            message: `Captured via webhook (${assertion.method || 'razorpay'})`,
                        },
                    },
                ],
                { session }
            );

            // Promote Pending -> Received; never downgrade a later status
            const updated = await Order.findOneAndUpdate(
                { _id: orderId, paymentStatus: { $ne: 'Paid' } },
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
                // Another request (e.g. concurrent client verify) captured it concurrently — abort cleanly
                await session.abortTransaction();
                const freshOrder = await Order.findById(orderId);
                if (
                    freshOrder &&
                    freshOrder.paymentStatus === 'Paid' &&
                    freshOrder.paymentId !== assertion.razorpayPaymentId
                ) {
                    console.log(
                        `[Webhook payment.captured] Order ${orderId} was paid concurrently by another payment. Handling ${assertion.razorpayPaymentId} as duplicate.`
                    );
                    await handleDuplicatePayment({
                        payableType: 'Order',
                        orderId,
                        customerId,
                        razorpayOrderId: assertion.razorpayOrderId,
                        razorpayPaymentId: assertion.razorpayPaymentId,
                        razorpaySignature: 'WEBHOOK_VERIFIED',
                        amount: assertion.amount,
                        currency: assertion.currency,
                        fee: assertion.fee,
                        tax: assertion.tax,
                        refundProcessor: options?.refundProcessor,
                    });
                    return;
                }
                console.log(`[Webhook payment.captured] Order ${orderId} was captured concurrently by another request.`);
                return;
            }

            await session.commitTransaction();
            captureSuccess = true;
            console.log(`[Webhook payment.captured] Order ${orderId} successfully recovered and marked Paid (${assertion.amount} ${assertion.currency}).`);
        } catch (err) {
            if (session?.inTransaction()) {
                try { await session.abortTransaction(); } catch { /* ignore */ }
            }
            throw err;
        } finally {
            session?.endSession();
        }

        if (captureSuccess) {
            sendNotificationToUser(customerId, 'Customer', {
                title: 'Order Placed Successfully',
                body: `Your order #${order.orderNumber} has been confirmed. We'll notify you when the seller prepares it.`,
                data: {
                    type: 'ORDER_PLACED',
                    orderId,
                    orderNumber: order.orderNumber || '',
                },
            }).catch(err => console.error(`Push notification failed for customer ${customerId}:`, err));

            try {
                const { createPendingCommissions } = await import('./commissionService');
                createPendingCommissions(orderId).catch(commError =>
                    console.error('[Webhook payment.captured] Failed to create pending commissions after payment:', commError)
                );
            } catch (importError) {
                console.error('[Webhook payment.captured] Failed to import commissionService:', importError);
            }

            if (io) {
                try {
                    const { notifySellersOfOrderUpdate } = await import('./sellerNotificationService');
                    const claimed = await Order.findOneAndUpdate(
                        { _id: orderId, sellerNotified: { $ne: true } },
                        { $set: { sellerNotified: true } },
                        { new: true }
                    ).lean();
                    if (claimed) {
                        notifySellersOfOrderUpdate(io, claimed, 'NEW_ORDER')
                            .then(() => console.log(`Webhook: seller notified for recovered order ${claimed.orderNumber}`))
                            .catch(err => console.error('[Webhook payment.captured] Failed to notify sellers:', err));
                    }
                } catch (importError) {
                    console.error('[Webhook payment.captured] Failed to import sellerNotificationService:', importError);
                }
            }
        }
    } catch (error: any) {
        console.error('[Webhook payment.captured] Error handling payment captured:', error?.message || error);
        throw error;
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

        if (payment.order) {
            await Order.findByIdAndUpdate(payment.order, { paymentStatus: 'Failed' });
        }
    } catch (error) {
        console.error('Error handling payment failed:', error);
    }
};

const handleRefundCreated = async (payload: any) => {
    if (!payload?.id || !payload?.payment_id) return;
    const razorpayRefundId = String(payload.id);
    const razorpayPaymentId = String(payload.payment_id);

    try {
        const payment = await Payment.findOne({ razorpayPaymentId });
        if (!payment) return;

        // Idempotency guard: check if this Razorpay refund has already been recorded
        let existingRefund: any = null;
        if (mongoose.connection.readyState === 1 || (Refund.findOne as any) !== (mongoose.Model as any).findOne) {
            try {
                existingRefund = await Refund.findOne({ refundTransactionId: razorpayRefundId });
            } catch {
                // ignore in disconnected test environments
            }
        }

        if (existingRefund && existingRefund.status === 'Completed') {
            console.log(`[Webhook refund] Refund ${razorpayRefundId} already recorded locally (idempotent exit).`);
            return;
        }

        const thisRefundAmount = Number(payload.amount) / 100;
        if (!Number.isFinite(thisRefundAmount) || thisRefundAmount <= 0) {
            console.warn(`[Webhook refund] Invalid refund amount in payload: ${payload.amount}`);
            return;
        }

        const currentTotal = payment.totalRefunded || payment.refundAmount || 0;

        const newTotal = Math.min(
            payment.amount,
            Math.round((currentTotal + thisRefundAmount + Number.EPSILON) * 100) / 100
        );
        const isFully = newTotal >= payment.amount - 0.01;

        payment.refundAmount = newTotal;
        payment.totalRefunded = newTotal;
        payment.refundedAt = new Date();
        payment.status = isFully ? 'Refunded' : 'PartiallyRefunded';
        await payment.save();

        // Duplicate payment refunds NEVER alter Order.paymentStatus!
        if (!payment.isDuplicate && payment.order && (mongoose.connection.readyState === 1 || (Order.findByIdAndUpdate as any) !== (mongoose.Model as any).findByIdAndUpdate)) {
            try {
                await Order.findByIdAndUpdate(payment.order, {
                    paymentStatus: isFully ? 'Refunded' : 'PartiallyRefunded',
                });
            } catch (orderErr) {
                console.warn('[Webhook refund] Non-fatal: could not update order paymentStatus:', orderErr);
            }
        }

        let customerId = payment.customer;
        if (!customerId && payment.order && (mongoose.connection.readyState === 1 || (Order.findById as any) !== (mongoose.Model as any).findById)) {
            try {
                const orderDoc = await Order.findById(payment.order).select('customer');
                customerId = orderDoc?.customer;
            } catch {
                // ignore
            }
        }

        if (existingRefund) {
            existingRefund.status = 'Completed';
            existingRefund.processedAt = new Date();
            await existingRefund.save();
        } else if (mongoose.connection.readyState === 1 || (Refund.create as any) !== (mongoose.Model as any).create) {
            try {
                await Refund.create({
                    order: payment.order,
                    customer: customerId,
                    adRequest: payment.adRequest,
                    seller: payment.seller,
                    payment: payment._id,
                    amount: thisRefundAmount,
                    reason: payload.notes?.reason || 'Refund processed via Razorpay',
                    status: 'Completed',
                    refundTransactionId: razorpayRefundId,
                    processedAt: new Date(),
                    gatewayResponse: payload,
                });
            } catch (createErr) {
                console.warn(`[Webhook refund] Non-fatal: could not create Refund record for ${razorpayRefundId}:`, createErr);
            }
        }
    } catch (error) {
        console.error('Error handling refund created:', error);
    }
};

/**
 * Step 6 — P2 #1: Prepaid Settlement Visibility & UTR Tracking
 *
 * Handles Razorpay `settlement.processed` webhooks idempotently.
 * Records settlement audit entries without modifying Orders, Payments,
 * Commissions, PlatformWallets, or COD accounting.
 */
export const handleSettlementProcessed = async (payload: any) => {
    const entity = payload?.entity || payload;
    if (!entity || !entity.id || typeof entity.id !== 'string') {
        console.warn('[Webhook settlement.processed] Ignored: payload has no valid settlement id');
        return;
    }

    const settlementId = String(entity.id).trim();
    if (!settlementId) {
        console.warn('[Webhook settlement.processed] Ignored: empty settlement id');
        return;
    }

    // Validate amount
    const rawAmount = Number(entity.amount);
    if (!Number.isFinite(rawAmount) || rawAmount < 0) {
        console.warn(`[Webhook settlement.processed] Ignored: invalid amount ${entity.amount} for ${settlementId}`);
        return;
    }
    // Convert paise -> rupees (minor units to major units)
    const amount = Math.round(rawAmount) / 100;

    // Fees: optional. If missing, null, or undefined -> remains undefined.
    // If present and non-negative finite number -> convert paise -> rupees.
    let fees: number | undefined;
    if (entity.fees !== undefined && entity.fees !== null && entity.fees !== '') {
        const rawFees = Number(entity.fees);
        if (Number.isFinite(rawFees) && rawFees >= 0) {
            fees = Math.round(rawFees) / 100;
        } else {
            console.warn(`[Webhook settlement.processed] Ignored invalid fees value ${entity.fees} for ${settlementId}`);
        }
    }

    // Tax: optional. If missing, null, or undefined -> remains undefined.
    // If present and non-negative finite number -> convert paise -> rupees.
    let tax: number | undefined;
    if (entity.tax !== undefined && entity.tax !== null && entity.tax !== '') {
        const rawTax = Number(entity.tax);
        if (Number.isFinite(rawTax) && rawTax >= 0) {
            tax = Math.round(rawTax) / 100;
        } else {
            console.warn(`[Webhook settlement.processed] Ignored invalid tax value ${entity.tax} for ${settlementId}`);
        }
    }

    // UTR: optional string. If missing, empty, or whitespace -> undefined
    let utr: string | undefined;
    if (entity.utr !== undefined && entity.utr !== null) {
        const trimmedUtr = String(entity.utr).trim();
        if (trimmedUtr.length > 0) {
            utr = trimmedUtr;
        }
    }

    // Status: required string, defaults to 'processed'
    const status = entity.status ? String(entity.status).trim() : 'processed';

    // settledAt: optional Date. Razorpay created_at is seconds or ms timestamp
    let settledAt: Date | undefined;
    if (entity.created_at !== undefined && entity.created_at !== null) {
        const rawTime = Number(entity.created_at);
        if (Number.isFinite(rawTime) && rawTime > 0) {
            settledAt = rawTime < 1e11 ? new Date(rawTime * 1000) : new Date(rawTime);
        } else if (typeof entity.created_at === 'string' && !isNaN(Date.parse(entity.created_at))) {
            settledAt = new Date(entity.created_at);
        }
    }

    try {
        // 1. Replay / Idempotency check on settlementId
        const existing = await Settlement.findOne({ settlementId });
        if (existing) {
            console.log(`[Webhook settlement.processed] Settlement ${settlementId} already recorded (idempotent exit).`);
            return existing;
        }

        // 2. Persist new Settlement audit record
        const record = await Settlement.create({
            settlementId,
            utr,
            amount,
            fees,
            tax,
            status,
            settledAt,
        });

        console.log(`[Webhook settlement.processed] Settlement ${settlementId} recorded successfully.`);
        return record;
    } catch (error: any) {
        // Catch MongoDB duplicate key error (code 11000) on concurrent webhook deliveries
        if (error?.code === 11000 || (error?.name === 'MongoServerError' && error?.code === 11000)) {
            console.log(`[Webhook settlement.processed] Concurrent insert duplicate key on ${settlementId}, returning existing record.`);
            return await Settlement.findOne({ settlementId });
        }
        console.error(`[Webhook settlement.processed] Error recording settlement ${settlementId}:`, error?.message || error);
        throw error;
    }
};

// Re-exported so existing importers keep working; the mock bypass is gone. (#C-02)
export { verifyCheckoutSignature as verifyPaymentSignature } from './razorpayVerificationService';
