import mongoose from "mongoose";
import Delivery from "../models/Delivery";
import WalletTransaction from "../models/WalletTransaction";
import CashCollection from "../models/CashCollection";
import PlatformWallet from "../models/PlatformWallet";
import { processPendingCODPayouts } from "./commissionService";

/**
 * Single authoritative path for settling COD cash that a delivery partner
 * collected from customers and has now handed over to the platform.
 *
 * Previously there were two unreconciled implementations:
 *   - `verifyAdminPayout`  (courier pays admin online via Razorpay)
 *   - `collectCash`        (admin records a physical cash handover)
 *
 * `collectCash` credited the amount to `Delivery.balance` — the courier's
 * *withdrawable earnings* — so handing cash over increased what the courier
 * could withdraw, and left `pendingAdminPayout` untouched so the same debt
 * could be settled twice. It also wrote no audit record. (#C-04)
 *
 * Invariants enforced here:
 *   - `Delivery.balance` (earnings) is NEVER touched by a settlement.
 *   - `cashCollected` and `pendingAdminPayout` both decrease by the amount.
 *   - Neither field is driven below zero.
 *   - The platform wallet is credited exactly once.
 *   - An immutable audit row is written (WalletTransaction + CashCollection).
 *   - Seller commissions held pending for these orders are released.
 *   - The whole operation is atomic and idempotent on `reference`.
 */

export interface CodSettlementResult {
  amountSettled: number;
  pendingAdminPayout: number;
  cashCollected: number;
  processedOrders: number;
  reference: string;
}

export class CodSettlementError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CodSettlementError";
    this.statusCode = statusCode;
  }
}

export async function settleCourierCodDebt(params: {
  deliveryBoyId: string;
  /** Amount actually received, in rupees. MUST be server-derived, never client-declared. */
  amount: number;
  /** Where the money came from — drives the audit description. */
  source: "RAZORPAY" | "CASH";
  /** Globally unique settlement reference. Enforces idempotency. */
  reference: string;
  /** Admin who recorded a physical cash handover. Required when source === 'CASH'. */
  adminId?: string;
  /** Free-text note stored on the audit record. */
  remark?: string;
}): Promise<CodSettlementResult> {
  const { deliveryBoyId, source, reference, adminId, remark } = params;

  const amount = Math.round(Number(params.amount) * 100) / 100;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CodSettlementError("Settlement amount must be a positive number.");
  }
  if (!reference) {
    throw new CodSettlementError("Settlement reference is required.");
  }
  if (source === "CASH" && !adminId) {
    throw new CodSettlementError("Recording a cash handover requires an admin.");
  }

  // Idempotency guard outside the transaction: a repeated reference is a replay.
  const existing = await WalletTransaction.findOne({ reference });
  if (existing) {
    throw new CodSettlementError(
      "This settlement has already been recorded.",
      409,
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const deliveryBoy = await Delivery.findById(deliveryBoyId).session(session);
    if (!deliveryBoy) {
      throw new CodSettlementError("Delivery partner not found.", 404);
    }

    const currentPending =
      Math.round((deliveryBoy.pendingAdminPayout || 0) * 100) / 100;
    const currentCash =
      Math.round((deliveryBoy.cashCollected || 0) * 100) / 100;

    // Cannot settle more than is owed (1 paise tolerance for rounding).
    if (amount > currentPending + 0.01) {
      throw new CodSettlementError(
        `Settlement amount (${amount}) exceeds the outstanding payout (${currentPending}).`,
      );
    }

    // Debt and held cash both go down. Earnings (`balance`) are untouched. (#C-04)
    deliveryBoy.pendingAdminPayout = Math.max(0, currentPending - amount);
    deliveryBoy.cashCollected = Math.max(0, currentCash - amount);
    await deliveryBoy.save({ session });

    // Audit row. Debit = value leaving the courier's custody.
    await WalletTransaction.create(
      [
        {
          userId: deliveryBoyId,
          userType: "DELIVERY_BOY",
          amount,
          type: "Debit",
          description:
            source === "RAZORPAY"
              ? "COD settlement to admin via Razorpay"
              : "COD cash handed over to admin",
          status: "Completed",
          reference,
        },
      ],
      { session },
    );

    // Cash handovers additionally get a CashCollection record for admin reporting.
    if (source === "CASH") {
      await CashCollection.create(
        [
          {
            deliveryBoy: deliveryBoyId,
            amount,
            remark: remark || `Cash settlement ${reference}`,
            collectedBy: adminId,
            collectedAt: new Date(),
          },
        ],
        { session },
      );
    }

    // Platform wallet: money received, courier debt reduced.
    const platformWallet = await PlatformWallet.findOne().session(session);
    if (!platformWallet) {
      await PlatformWallet.create(
        [
          {
            totalPlatformEarning: amount,
            currentPlatformBalance: amount,
            totalAdminEarning: 0,
            pendingFromDeliveryBoy: 0,
            sellerPendingPayouts: 0,
            deliveryBoyPendingPayouts: 0,
          },
        ],
        { session },
      );
    } else {
      platformWallet.totalPlatformEarning =
        (platformWallet.totalPlatformEarning || 0) + amount;
      platformWallet.currentPlatformBalance =
        (platformWallet.currentPlatformBalance || 0) + amount;
      platformWallet.pendingFromDeliveryBoy = Math.max(
        0,
        (platformWallet.pendingFromDeliveryBoy || 0) - amount,
      );
      await platformWallet.save({ session });
    }

    // Release the seller commissions that were held pending this settlement.
    const payoutResult = await processPendingCODPayouts(
      deliveryBoyId,
      amount,
      session,
    );

    await session.commitTransaction();

    return {
      amountSettled: amount,
      pendingAdminPayout: deliveryBoy.pendingAdminPayout,
      cashCollected: deliveryBoy.cashCollected,
      processedOrders: payoutResult?.processedCount ?? 0,
      reference,
    };
  } catch (error) {
    if (session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error("Error aborting COD settlement transaction:", abortErr);
      }
    }
    throw error;
  } finally {
    session.endSession();
  }
}
