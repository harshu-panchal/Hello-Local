import { Request, Response } from "express";
import {
  getWalletTransactions,
  createWithdrawalRequest,
  getWithdrawalRequests,
} from "../../../services/walletManagementService";
import { getCommissionSummary } from "../../../services/commissionService";
import Delivery from "../../../models/Delivery";
import { createRazorpayOrder } from "../../../services/paymentService";
import {
  assertGatewayPayment,
  PaymentVerificationError,
} from "../../../services/razorpayVerificationService";
import {
  settleCourierCodDebt,
  CodSettlementError,
} from "../../../services/codSettlementService";

/**
 * Get delivery boy wallet balance and pending admin payout
 */
export const getBalance = async (req: Request, res: Response) => {
  try {
    const deliveryBoyId = req.user!.userId;
    const deliveryBoy = await Delivery.findById(deliveryBoyId).select(
      "balance pendingAdminPayout",
    );

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        balance: deliveryBoy.balance,
        pendingAdminPayout: deliveryBoy.pendingAdminPayout || 0,
      },
    });
  } catch (error: any) {
    console.error("Error getting wallet balance:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get wallet balance",
    });
  }
};

/**
 * Create Razorpay order for paying admin
 */
export const createAdminPayoutOrder = async (req: Request, res: Response) => {
  try {
    const deliveryBoyId = req.user!.userId;
    const requested = Math.round(Number(req.body.amount) * 100) / 100;

    if (!Number.isFinite(requested) || requested <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payout amount",
      });
    }

    const deliveryBoy = await Delivery.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    const pending = Math.round((deliveryBoy.pendingAdminPayout || 0) * 100) / 100;
    if (requested > pending + 0.01) {
      return res.status(400).json({
        success: false,
        message: `Payout amount (${requested}) exceeds the outstanding amount (${pending})`,
      });
    }

    const result = await createRazorpayOrder(
      `PAYOUT-${deliveryBoyId}`,
      requested,
    );
    if (!result.success || !result.data) {
      return res.status(400).json(result);
    }

    // Persist the issued intent so verification can bind the payment to this
    // courier and this amount. Without it, a signature from any other Razorpay
    // order would be accepted. (#C-03)
    await Delivery.updateOne(
      { _id: deliveryBoyId },
      {
        $set: {
          codPayoutIntent: {
            razorpayOrderId: result.data.razorpayOrderId,
            amount: requested,
            createdAt: new Date(),
          },
        },
      },
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error creating admin payout order:", error?.message || error);
    return res.status(500).json({
      success: false,
      message:
        error instanceof PaymentVerificationError
          ? error.message
          : "Failed to create payout order",
    });
  }
};

/**
 * Verify admin payout payment
 */
export const verifyAdminPayout = async (req: Request, res: Response) => {
  try {
    const deliveryBoyId = req.user!.userId;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Missing required payment verification parameters",
      });
    }

    const deliveryBoy = await Delivery.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    const intent = (deliveryBoy as any).codPayoutIntent;
    if (!intent?.razorpayOrderId) {
      return res.status(400).json({
        success: false,
        message: "No payout was started. Please start the payout again.",
      });
    }

    // The settled amount is derived from the gateway, never from the request
    // body. Previously `req.body.amount` was trusted, which let a courier clear
    // any debt with a token payment. (#C-03)
    const assertion = await assertGatewayPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      expectedAmount: Number(intent.amount),
      expectedRazorpayOrderId: intent.razorpayOrderId,
    });

    const result = await settleCourierCodDebt({
      deliveryBoyId,
      amount: assertion.amount,
      source: "RAZORPAY",
      reference: `PAYOUT-${assertion.razorpayPaymentId}`,
    });

    // Consume the intent so it cannot be reused.
    await Delivery.updateOne(
      { _id: deliveryBoyId },
      { $unset: { codPayoutIntent: "" } },
    );

    console.log(
      `[Pay to Admin] Courier ${deliveryBoyId} settled ${result.amountSettled}; ` +
        `remaining=${result.pendingAdminPayout}; orders released=${result.processedOrders}`,
    );

    return res.status(200).json({
      success: true,
      message: "Payout successful",
      data: {
        pendingAdminPayout: result.pendingAdminPayout,
        cashCollected: result.cashCollected,
        amountPaid: result.amountSettled,
        ordersSettled: result.processedOrders,
      },
    });
  } catch (error: any) {
    const status =
      error instanceof PaymentVerificationError ||
      error instanceof CodSettlementError
        ? error.statusCode
        : 500;
    console.error("Error verifying admin payout:", error?.message || error);
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to verify payout",
    });
  }
};

/**
 * Get delivery boy wallet transactions
 */
export const getTransactions = async (req: Request, res: Response) => {
  try {
    const deliveryBoyId = req.user!.userId;
    const { page = 1, limit = 20 } = req.query;

    const result = await getWalletTransactions(
      deliveryBoyId,
      "DELIVERY_BOY",
      Number(page),
      Number(limit),
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error getting wallet transactions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get wallet transactions",
    });
  }
};

/**
 * Request withdrawal
 */
export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    const deliveryBoyId = req.user!.userId;
    const { amount, paymentMethod } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal amount",
      });
    }

    if (!paymentMethod || !["Bank Transfer", "UPI"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    const result = await createWithdrawalRequest(
      deliveryBoyId,
      "DELIVERY_BOY",
      amount,
      paymentMethod,
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (error: any) {
    console.error("Error requesting withdrawal:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to request withdrawal",
    });
  }
};

/**
 * Get delivery boy withdrawal requests
 */
export const getWithdrawals = async (req: Request, res: Response) => {
  try {
    const deliveryBoyId = req.user!.userId;
    const { status } = req.query;

    const result = await getWithdrawalRequests(
      deliveryBoyId,
      "DELIVERY_BOY",
      status as string,
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error getting withdrawal requests:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get withdrawal requests",
    });
  }
};

/**
 * Get delivery boy commission earnings
 */
export const getCommissions = async (req: Request, res: Response) => {
  try {
    const deliveryBoyId = req.user!.userId;

    const result = await getCommissionSummary(deliveryBoyId, "DELIVERY_BOY");

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error getting commission earnings:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get commission earnings",
    });
  }
};
