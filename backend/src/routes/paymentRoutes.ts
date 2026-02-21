import { Router } from 'express';
import { authenticate, requireUserType } from '../middleware/auth';
import { Request, Response } from 'express';
import { createRazorpayOrder, capturePayment, handleWebhook } from '../services/paymentService';
import Order from '../models/Order';

const router = Router();

import SellerAdRequest from '../models/SellerAdRequest';

/**
 * Create Razorpay order for payment
 */
router.post('/create-order', authenticate, async (req: Request, res: Response) => {
    try {
        const { orderId, type = 'Order' } = req.body;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'ID is required',
            });
        }

        let amount = 0;
        let userId = '';

        if (type === 'Order') {
            const order = await Order.findById(orderId);
            if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
            if (order.customer.toString() !== req.user!.userId) {
                return res.status(403).json({ success: false, message: 'Unauthorized access to order' });
            }
            amount = order.total;
        } else if (type === 'AdRequest') {
            const adReq = await SellerAdRequest.findById(orderId);
            if (!adReq) return res.status(404).json({ success: false, message: 'Ad Request not found' });
            if (adReq.sellerId.toString() !== req.user!.userId) {
                return res.status(403).json({ success: false, message: 'Unauthorized access to ad request' });
            }
            amount = adReq.adPrice || adReq.requestedPrice || 0;
        }

        const result = await createRazorpayOrder(orderId, amount);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create payment order',
        });
    }
});

/**
 * Verify payment after Razorpay checkout
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

        const result = await capturePayment(
            orderId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            type as any
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error verifying payment:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify payment',
        });
    }
});

/**
 * Razorpay webhook endpoint
 */
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;

        if (!signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing webhook signature',
            });
        }

        const result = await handleWebhook(req.body, signature);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error handling webhook:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to handle webhook',
        });
    }
});

export default router;
