import { Request, Response } from 'express';
import WithdrawRequest from '../../../models/WithdrawRequest';
import { releaseWithdrawalHold } from '../../../services/walletManagementService';
import { sendNotification } from '../../../services/notificationService';
import { sendNotificationToUser } from '../../../services/firebaseAdmin';
import mongoose from 'mongoose';

/**
 * Notify a seller (in-app + push) when their withdrawal status changes.
 * Never throws — notification failures must not fail the admin action. (#withdrawal-notification)
 */
const notifyWithdrawalStatus = async (
    request: any,
    status: 'Approved' | 'Rejected' | 'Completed'
) => {
    // Delivery partners used to be skipped entirely, so a courier never learned
    // that their withdrawal had been approved, rejected or paid. (#M-13)
    const recipientId = request.userId?.toString();
    if (!recipientId) return;
    const recipientType: 'Seller' | 'Delivery' =
        request.userType === 'SELLER' ? 'Seller' : 'Delivery';
    const sellerId = recipientId;

    const amount = request.amount;
    const map: Record<string, { title: string; message: string; type: 'Success' | 'Error' }> = {
        Approved: {
            title: 'Withdrawal Approved',
            message: `Your withdrawal request of Rs.${amount} has been approved and is being processed.`,
            type: 'Success',
        },
        Rejected: {
            title: 'Withdrawal Rejected',
            message: `Your withdrawal request of Rs.${amount} was rejected.${request.remarks ? ' Reason: ' + request.remarks : ''}`,
            type: 'Error',
        },
        Completed: {
            title: 'Withdrawal Completed',
            message: `Your withdrawal of Rs.${amount} has been completed and transferred to your account.`,
            type: 'Success',
        },
    };
    const info = map[status];

    try {
        await sendNotification(recipientType, sellerId, info.title, info.message, {
            type: info.type,
            priority: 'High',
        });
    } catch (err) {
        console.error('Withdrawal in-app notification failed:', err);
    }
    try {
        await sendNotificationToUser(sellerId, recipientType, {
            title: info.title,
            body: info.message,
            data: { type: 'WITHDRAWAL_STATUS', status },
        });
    } catch (err) {
        console.error('Withdrawal push notification failed:', err);
    }
};

/**
 * Get all withdrawal requests
 */
export const getAllWithdrawals = async (req: Request, res: Response) => {
    try {
        const { status, userType, search, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

        const query: any = {};
        if (status && status !== "all" && status !== "All") query.status = status;
        if (userType && userType !== "all" && userType !== "All") query.userType = userType;

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) {
                const from = new Date(dateFrom as string);
                if (!isNaN(from.getTime())) {
                    from.setHours(0, 0, 0, 0);
                    query.createdAt.$gte = from;
                }
            }
            if (dateTo) {
                const to = new Date(dateTo as string);
                if (!isNaN(to.getTime())) {
                    to.setHours(23, 59, 59, 999);
                    query.createdAt.$lte = to;
                }
            }
        }

        if (search && typeof search === "string" && search.trim()) {
            const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const [sellerMatches, deliveryMatches] = await Promise.all([
                mongoose.model("Seller").find({
                    $or: [
                        { sellerName: { $regex: safe, $options: "i" } },
                        { storeName: { $regex: safe, $options: "i" } },
                        { mobile: { $regex: safe, $options: "i" } },
                        { email: { $regex: safe, $options: "i" } },
                    ],
                }).distinct("_id"),
                mongoose.model("Delivery").find({
                    $or: [
                        { name: { $regex: safe, $options: "i" } },
                        { mobile: { $regex: safe, $options: "i" } },
                        { email: { $regex: safe, $options: "i" } },
                    ],
                }).distinct("_id"),
            ]);
            const matchedUserIds = [...sellerMatches, ...deliveryMatches];

            query.$or = [
                { accountDetails: { $regex: safe, $options: "i" } },
                { transactionReference: { $regex: safe, $options: "i" } },
                { remarks: { $regex: safe, $options: "i" } },
                { userId: { $in: matchedUserIds } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);

        const requests = await WithdrawRequest.find(query)
            .populate('userId', 'sellerName storeName name email mobile accountNumber bankName ifscCode')
            .populate('processedBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await WithdrawRequest.countDocuments(query);

        return res.status(200).json({
            success: true,
            data: {
                requests,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit)),
                },
            },
        });
    } catch (error: any) {
        console.error('Error getting withdrawal requests:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to get withdrawal requests',
        });
    }
};

/**
 * Approve withdrawal request
 */
export const approveWithdrawal = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const adminId = req.user!.userId;

        const request = await WithdrawRequest.findById(id);
        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found',
            });
        }

        if (request.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot approve ${request.status.toLowerCase()} request`,
            });
        }

        request.status = 'Approved';
        request.processedBy = new mongoose.Types.ObjectId(adminId);
        request.processedAt = new Date();
        await request.save();

        await notifyWithdrawalStatus(request, 'Approved');

        return res.status(200).json({
            success: true,
            message: 'Withdrawal request approved successfully',
            data: request,
        });
    } catch (error: any) {
        console.error('Error approving withdrawal:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to approve withdrawal',
        });
    }
};

/**
 * Reject withdrawal request
 */
export const rejectWithdrawal = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const adminId = req.user!.userId;

        const request = await WithdrawRequest.findById(id);
        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found',
            });
        }

        if (request.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot reject ${request.status.toLowerCase()} request`,
            });
        }

        request.status = 'Rejected';
        request.processedBy = new mongoose.Types.ObjectId(adminId);
        request.processedAt = new Date();
        if (remarks) request.remarks = remarks;
        await request.save();

        // Funds are reserved when the request is raised, so rejecting must give
        // them back. (#M-12)
        try {
            await releaseWithdrawalHold(request as any, remarks || 'request rejected');
        } catch (releaseErr) {
            console.error('Failed to return reserved withdrawal funds:', releaseErr);
        }

        await notifyWithdrawalStatus(request, 'Rejected');

        return res.status(200).json({
            success: true,
            message: 'Withdrawal request rejected successfully',
            data: request,
        });
    } catch (error: any) {
        console.error('Error rejecting withdrawal:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to reject withdrawal',
        });
    }
};

/**
 * Complete withdrawal request
 */
export const completeWithdrawal = async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const { transactionReference } = req.body;
        const adminId = req.user!.userId;

        if (!transactionReference) {
            return res.status(400).json({
                success: false,
                message: 'Transaction reference is required',
            });
        }

        const request = await WithdrawRequest.findById(id).session(session);
        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found',
            });
        }

        if (request.status !== 'Approved') {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Only approved requests can be completed',
            });
        }

        // The amount was already debited (reserved) when the request was
        // raised, so completion only records the payout reference. Debiting
        // again here would take the money twice. (#M-12)

        // Update request
        request.status = 'Completed';
        request.transactionReference = transactionReference;
        request.processedBy = new mongoose.Types.ObjectId(adminId);
        request.processedAt = new Date();
        await request.save({ session });

        await session.commitTransaction();

        await notifyWithdrawalStatus(request, 'Completed');

        return res.status(200).json({
            success: true,
            message: 'Withdrawal completed successfully',
            data: request,
        });
    } catch (error: any) {
        await session.abortTransaction();
        console.error('Error completing withdrawal:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to complete withdrawal',
        });
    } finally {
        session.endSession();
    }
};
