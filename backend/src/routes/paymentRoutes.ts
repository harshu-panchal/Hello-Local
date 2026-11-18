import { Router, Request, Response } from 'express';
import express from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';
import { getOrReuseRazorpayOrder, capturePayment, handleWebhook, reconcileRazorpayIntent } from '../services/paymentService';
import Order from '../models/Order';
import SellerAdRequest from '../models/SellerAdRequest';

const router = Router();

/**
 * Resolve the record being paid for and assert the caller owns it.
 * Ownership is checked on BOTH create-order and verify. It used to be checked
 * only on create-order, which let any authenticated user confirm a payment
 * against any order in the system. (#C-01)
 */
async function loadOwnedPayable(
    id: string,
    type: 'Order' | 'AdRequest',
    userId: string,
): Promise<
    | { ok: true; kind: 'Order'; doc: any; amountDue: number }
    | { ok: true; kind: 'AdRequest'; doc: any; amountDue: number }
    | { ok: false; status: number; message: string }
> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return { ok: false, status: 400, message: 'Invalid ID format' };
    }

    if (type === 'Order') {
        const order = await Order.findById(id);
        if (!order) return { ok: false, status: 404, message: 'Order not found' };
        if (order.customer.toString() !== userId) {
            return { ok: false, status: 403, message: 'Unauthorized access to order' };
        }
        return { ok: true, kind: 'Order', doc: order, amountDue: order.originalTotal ?? order.total };
    }

    const adReq = await SellerAdRequest.findById(id);
    if (!adReq) return { ok: false, status: 404, message: 'Ad Request not found' };
    if (adReq.sellerId.toString() !== userId) {
        return { ok: false, status: 403, message: 'Unauthorized access to ad request' };
    }
    return {
        ok: true,
        kind: 'AdRequest',
        doc: adReq,
        amountDue: adReq.adPrice || adReq.requestedPrice || 0,
    };
}

/**
 * Create a Razorpay payment intent for an order or ad request.
 * The issued razorpayOrderId is persisted on the record so that verification
 * can prove the payment belongs to it. (#C-01)
 */
router.post('/create-order', authenticate, async (req: Request, res: Response) => {
    try {
        const { orderId, type = 'Order' } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: 'ID is required' });
        }
        if (type !== 'Order' && type !== 'AdRequest') {
            return res.status(400).json({ success: false, message: 'Invalid payment type' });
        }

        const loaded = await loadOwnedPayable(orderId, type, req.user!.userId);
        if (!loaded.ok) {
            return res.status(loaded.status).json({ success: false, message: loaded.message });
        }

        if (loaded.kind === 'Order' && (loaded.doc.paymentMethod === 'COD' || ['Cancelled', 'Rejected', 'Returned', 'Delivered'].includes(loaded.doc.status))) {
            return res.status(400).json({ success: false, message: 'This order cannot accept a new payment' });
        }
        if (loaded.kind === 'Order' && loaded.doc.paymentStatus === 'Paid') {
            return res.status(400).json({ success: false, message: 'This order is already paid' });
        }
        if (loaded.kind === 'AdRequest' && loaded.doc.paymentStatus === 'Paid') {
            return res.status(400).json({ success: false, message: 'This ad request is already paid' });
        }

        if (loaded.kind === 'AdRequest' && loaded.doc.status !== 'Approved') {
            return res.status(400).json({ success: false, message: 'Online payment is available only for an approved advertisement.' });
        }

        if (!loaded.amountDue || loaded.amountDue <= 0) {
            return res.status(400).json({ success: false, message: 'Nothing to pay for this record' });
        }

        const result = await getOrReuseRazorpayOrder(loaded.doc, loaded.amountDue);

        // Razorpay says this intent is already paid but our record is not:
        // the earlier /verify call was lost. Credit the captured payment now
        // instead of leaving the customer charged on an unpaid order.
        if (result.isPaid && loaded.doc.razorpayOrderId) {
            try {
                await reconcileRazorpayIntent(String(loaded.doc.razorpayOrderId), req.app.get('io'));
            } catch (reconcileError: any) {
                console.error('Payment reconciliation failed:', reconcileError?.message || reconcileError);
            }
            const fresh: any = type === 'Order'
                ? await Order.findById(orderId).select('paymentStatus')
                : await SellerAdRequest.findById(orderId).select('paymentStatus');
            if (fresh?.paymentStatus === 'Paid') {
                return res.status(409).json({
                    success: false,
                    alreadyPaid: true,
                    message: 'Your payment was received. This order is already paid.',
                });
            }
        }

        if (!result.success || !result.data) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error?.message || error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
        });
    }
});

/**
 * Verify a payment after Razorpay checkout.
 * Ownership + intent binding + gateway amount are all enforced server-side.
 */
router.post('/verify', authenticate, async (req: Request, res: Response) => {
    try {
        const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, type = 'Order' } = req.body;

        if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment verification parameters',
            });
        }
        if (type !== 'Order' && type !== 'AdRequest') {
            return res.status(400).json({ success: false, message: 'Invalid payment type' });
        }

        // Ownership check — previously absent on this route. (#C-01)
        const loaded = await loadOwnedPayable(orderId, type, req.user!.userId);
        if (!loaded.ok) {
            return res.status(loaded.status).json({ success: false, message: loaded.message });
        }

        const io = req.app.get('io');
        const result = await capturePayment(
            orderId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            type,
            io,
        );

        if (!result.success) {
            return res.status(400).json(result);
        }
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error verifying payment:', error?.message || error);
        return res.status(500).json({ success: false, message: 'Failed to verify payment' });
    }
});

/**
 * Razorpay webhook.
 *
 * `express.raw` is mounted on this route specifically so the signature can be
 * checked against the exact bytes Razorpay signed. The global `express.json()`
 * in server.ts discards the raw buffer, which is why signature verification
 * could never succeed before. (#H-10)
 */
router.post(
    '/webhook',
    express.raw({ type: '*/*', limit: '1mb' }),
    async (req: Request, res: Response) => {
        try {
            const signature = req.headers['x-razorpay-signature'] as string;
            if (!signature) {
                return res.status(400).json({ success: false, message: 'Missing webhook signature' });
            }

            const rawBody: Buffer | string = Buffer.isBuffer(req.body)
                ? req.body
                : typeof req.body === 'string'
                    ? req.body
                    : JSON.stringify(req.body ?? {});

            const io = req.app.get('io');
            const result = await handleWebhook(rawBody, signature, io);

            // 200 = processed or a permanent business rejection (no point retrying).
            // 4xx/5xx = bad signature, missing secret or a transient failure, so
            // Razorpay shows it and retries instead of the event being lost.
            const { statusCode = 200, ...body } = result;
            return res.status(statusCode).json(body);
        } catch (error: any) {
            console.error('Error handling webhook:', error?.message || error);
            // If signature verification failed, return 200 to acknowledge and prevent retry storms
            if (error?.message === 'Invalid webhook signature') {
                return res.status(200).json({ success: false, message: 'Invalid webhook signature acknowledged' });
            }
            return res.status(500).json({ success: false, message: 'Failed to handle webhook' });
        }
    },
);

export default router;
