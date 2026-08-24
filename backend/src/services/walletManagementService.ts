import WalletTransaction from "../models/WalletTransaction";
import WithdrawRequest from "../models/WithdrawRequest";
import Seller from "../models/Seller";
import Delivery from "../models/Delivery";
import AppSettings from "../models/AppSettings";
import mongoose from "mongoose";

export type WalletUserType = "SELLER" | "DELIVERY_BOY";

/**
 * Wallet failures must be loud.
 *
 * These functions used to return `{ success: false }` on error, and every
 * caller in commissionService ignored the return value — so a failed credit
 * left the commission marked Paid with no money moved, silently. (#H-19)
 */
export class WalletError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "WalletError";
    this.statusCode = statusCode;
  }
}

const model = (userType: WalletUserType) =>
  (userType === "SELLER" ? Seller : Delivery) as mongoose.Model<any>;

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

function assertAmount(amount: number): number {
  const a = round2(amount);
  if (!Number.isFinite(a) || a <= 0) {
    throw new WalletError(`Invalid wallet amount: ${amount}`);
  }
  return a;
}

/** Deterministic-ish unique reference when the caller does not supply one. */
function makeReference(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
}

/**
 * Credit a wallet.
 *
 * Throws on any failure. The balance update is a single atomic `$inc` and the
 * result is checked, so a credit against a missing user is an error rather than
 * a silent no-op.
 */
export const creditWallet = async (
  userId: string,
  userType: WalletUserType,
  amount: number,
  description: string,
  relatedOrderId?: string,
  relatedCommissionId?: string,
  session?: mongoose.ClientSession,
  reference?: string,
): Promise<{ transactionId: string; reference: string; amount: number }> => {
  const value = assertAmount(amount);
  const ref = reference || makeReference("CR");

  // Idempotency: the unique index on `reference` is the real guard, but check
  // first so a replay returns cleanly instead of throwing a duplicate-key error.
  const existing = await WalletTransaction.findOne({ reference }).session(session || null);
  if (reference && existing) {
    return { transactionId: String(existing._id), reference: ref, amount: existing.amount };
  }

  const [transaction] = await WalletTransaction.create(
    [
      {
        userId,
        userType,
        amount: value,
        type: "Credit",
        description,
        status: "Completed",
        reference: ref,
        relatedOrder: relatedOrderId,
        relatedCommission: relatedCommissionId,
      },
    ],
    session ? { session } : {},
  );

  const result = await model(userType).updateOne(
    { _id: userId },
    { $inc: { balance: value } },
    session ? { session } : {},
  );

  if (result.matchedCount === 0) {
    throw new WalletError(`Cannot credit: ${userType} ${userId} not found`, 404);
  }

  return { transactionId: String(transaction._id), reference: ref, amount: value };
};

/**
 * Debit a wallet.
 *
 * The balance check and the decrement happen in ONE conditional update, so two
 * concurrent debits cannot both observe a sufficient balance and both succeed.
 * The previous implementation read the balance, then issued an unconditional
 * `$inc`, which is a textbook read-modify-write race and could drive the
 * balance negative (`$inc` does not run the schema's `min` validator). (#H-18)
 *
 * @param allowNegative reversals/clawbacks may legitimately push a balance
 *        below zero — the money has already been paid out and is owed back.
 */
export const debitWallet = async (
  userId: string,
  userType: WalletUserType,
  amount: number,
  description: string,
  relatedOrderId?: string,
  session?: mongoose.ClientSession,
  options?: { allowNegative?: boolean; reference?: string },
): Promise<{ transactionId: string; reference: string; amount: number }> => {
  const value = assertAmount(amount);
  const ref = options?.reference || makeReference("DR");

  if (options?.reference) {
    const existing = await WalletTransaction.findOne({ reference: ref }).session(session || null);
    if (existing) {
      return { transactionId: String(existing._id), reference: ref, amount: existing.amount };
    }
  }

  // Atomic guarded decrement.
  const filter: Record<string, any> = { _id: userId };
  if (!options?.allowNegative) {
    filter.balance = { $gte: value };
  }

  const updated = await model(userType).findOneAndUpdate(
    filter,
    { $inc: { balance: -value } },
    { new: true, ...(session ? { session } : {}) },
  );

  if (!updated) {
    // Distinguish "no such user" from "not enough money".
    const exists = await model(userType).exists({ _id: userId });
    throw new WalletError(
      exists ? "Insufficient wallet balance" : `Cannot debit: ${userType} ${userId} not found`,
      exists ? 400 : 404,
    );
  }

  const [transaction] = await WalletTransaction.create(
    [
      {
        userId,
        userType,
        amount: value,
        type: "Debit",
        description,
        status: "Completed",
        reference: ref,
        relatedOrder: relatedOrderId,
      },
    ],
    session ? { session } : {},
  );

  return { transactionId: String(transaction._id), reference: ref, amount: value };
};

export const getWalletBalance = async (
  userId: string,
  userType: WalletUserType,
): Promise<number> => {
  const user = await model(userType).findById(userId).select("balance");
  if (!user) throw new WalletError(`${userType} ${userId} not found`, 404);
  return user.balance || 0;
};

export const getWalletTransactions = async (
  userId: string,
  userType: WalletUserType,
  page: number = 1,
  limit: number = 20,
) => {
  // Bounded pagination — an unbounded `limit` lets one request pull the whole
  // ledger. (#M-09)
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ userId, userType })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("relatedOrder", "orderNumber")
      .populate("relatedCommission", "commissionAmount"),
    WalletTransaction.countDocuments({ userId, userType }),
  ]);

  return {
    success: true as const,
    data: {
      transactions,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    },
  };
};

/**
 * Validate a withdrawal request. Called inside the request transaction.
 */
export const validateWithdrawal = async (
  userId: string,
  userType: WalletUserType,
  amount: number,
) => {
  const settings = await AppSettings.findOne();
  const minAmount = settings?.minimumWithdrawalAmount || 100;

  if (amount < minAmount) {
    return { success: false as const, message: `Minimum withdrawal amount is Rs.${minAmount}` };
  }

  const pendingRequests = await WithdrawRequest.countDocuments({
    userId,
    userType,
    status: { $in: ["Pending", "Approved"] },
  });
  if (pendingRequests > 0) {
    return {
      success: false as const,
      message:
        "You have a pending withdrawal request. Please wait for it to be processed.",
    };
  }

  const user = await model(userType).findById(userId);
  if (!user) return { success: false as const, message: "User not found" };

  const ifsc = (user as any).ifsc || (user as any).ifscCode;
  if (!user.accountNumber || !ifsc || !user.bankName) {
    return {
      success: false as const,
      message: "Please complete your bank account details before requesting withdrawal",
    };
  }

  return { success: true as const, message: "Withdrawal request is valid" };
};

/**
 * Create a withdrawal request AND reserve the funds.
 *
 * The amount is debited at request time rather than at completion, so the same
 * balance cannot be promised twice and the seller's visible balance reflects
 * what is actually available. Rejecting a request returns the funds. (#M-12)
 */
export const createWithdrawalRequest = async (
  userId: string,
  userType: WalletUserType,
  amount: number,
  paymentMethod: "Bank Transfer" | "UPI",
) => {
  const value = assertAmount(amount);

  const validation = await validateWithdrawal(userId, userType, value);
  if (!validation.success) return validation;

  const user = await model(userType).findById(userId);
  if (!user) throw new WalletError("User not found", 404);

  const ifsc = (user as any).ifsc || (user as any).ifscCode;
  const accountDetails = `${user.bankName} - ${user.accountNumber} (${ifsc})`;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [withdrawRequest] = await WithdrawRequest.create(
      [
        {
          userId,
          userType,
          amount: value,
          status: "Pending",
          paymentMethod,
          accountDetails,
        },
      ],
      { session },
    );

    // Reserve the funds. Throws WalletError('Insufficient wallet balance') if
    // the balance moved between validation and here.
    await debitWallet(
      userId,
      userType,
      value,
      `Withdrawal requested (${withdrawRequest._id})`,
      undefined,
      session,
      { reference: `WDR-HOLD-${withdrawRequest._id}` },
    );

    await session.commitTransaction();
    return { success: true as const, message: "Withdrawal request created successfully", data: withdrawRequest };
  } catch (error) {
    if (session.inTransaction()) {
      try { await session.abortTransaction(); } catch { /* ignore */ }
    }
    if (error instanceof WalletError) {
      return { success: false as const, message: error.message };
    }
    throw error;
  } finally {
    session.endSession();
  }
};

/** Return reserved funds when a withdrawal is rejected. */
export const releaseWithdrawalHold = async (
  request: { _id: unknown; userId: unknown; userType: WalletUserType; amount: number },
  reason: string,
  session?: mongoose.ClientSession,
) => {
  return creditWallet(
    String(request.userId),
    request.userType,
    request.amount,
    `Withdrawal returned: ${reason}`,
    undefined,
    undefined,
    session,
    `WDR-RELEASE-${request._id}`,
  );
};

export const getWithdrawalRequests = async (
  userId: string,
  userType: WalletUserType,
  status?: string,
) => {
  const query: any = { userId, userType };
  if (status) query.status = status;

  const requests = await WithdrawRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("processedBy", "name email");

  return { success: true as const, data: requests };
};
