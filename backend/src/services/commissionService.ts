import Commission from "../models/Commission";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import Delivery from "../models/Delivery";
import AppSettings from "../models/AppSettings";
import { creditWallet } from "./walletManagementService";
import mongoose from "mongoose";
import Category from "../models/Category";
import SubCategory from "../models/SubCategory";
import Product from "../models/Product";
import WalletTransaction from "../models/WalletTransaction";

/**
 * Get the effective commission rate for a product/item
 * Priority: 1. SubSubCategory -> 2. SubCategory -> 3. Category -> 4. Seller -> 5. Global
 */
export const getOrderItemCommissionRate = async (
  productId: string,
  sellerId?: string
): Promise<number> => {
  try {
    const product = await Product.findById(productId);
    if (!product) return 10; // Default fallback

    // 1. Check SubSubCategory
    if (product.subSubCategory) {
      const subSubCat = await Category.findById(product.subSubCategory);
      if (subSubCat?.commissionRate && subSubCat.commissionRate > 0) {
        return subSubCat.commissionRate;
      }
    }

    // 2. Check SubCategory
    if (product.subcategory) {
      const subCat = await SubCategory.findById(product.subcategory);
      if (subCat?.commissionRate && subCat.commissionRate > 0) {
        return subCat.commissionRate;
      }
    }

    // 3. Check Category
    if (product.category) {
      const cat = await Category.findById(product.category);
      if (cat?.commissionRate && cat.commissionRate > 0) {
        return cat.commissionRate;
      }
    }

    // 4. Check Seller specific rate
    const finalSellerId = sellerId || product.seller.toString();
    const seller = await Seller.findById(finalSellerId);
    if (seller?.commission && seller.commission > 0) {
      return seller.commission;
    }

    // 5. Global Default
    const settings = await AppSettings.findOne();
    return settings?.globalCommissionRate !== undefined
      ? settings.globalCommissionRate
      : 10;
  } catch (error) {
    console.error("Error calculating commission rate:", error);
    return 10;
  }
};

/**
 * Get commission rate for a seller
 */
/**
 * Get commission rate for a seller
 */
export const getSellerCommissionRate = async (
  sellerId: string,
): Promise<number> => {
  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      throw new Error("Seller not found");
    }

    // Use individual rate if set, otherwise use global default
    if (seller.commissionRate !== undefined && seller.commissionRate !== null) {
      return seller.commissionRate;
    }

    const settings = await AppSettings.findOne();
    // @ts-ignore
    return settings && settings.globalCommissionRate !== undefined
      ? settings.globalCommissionRate
      : 10;
  } catch (error) {
    console.error("Error getting seller commission rate:", error);
    return 10; // Default fallback
  }
};

/**
 * Get commission rate for a delivery boy
 */
export const getDeliveryBoyCommissionRate = async (
  deliveryBoyId: string,
): Promise<number> => {
  try {
    const deliveryBoy = await Delivery.findById(deliveryBoyId);
    if (!deliveryBoy) {
      throw new Error("Delivery boy not found");
    }

    // Use individual rate if set, otherwise use global default
    if (
      deliveryBoy.commissionRate !== undefined &&
      deliveryBoy.commissionRate !== null
    ) {
      return deliveryBoy.commissionRate;
    }

    return 5; // Default 5%
  } catch (error) {
    console.error("Error getting delivery boy commission rate:", error);
    return 5; // Default fallback
  }
};

/**
 * Calculate commissions for an order
 */
export const calculateOrderCommissions = async (orderId: string) => {
  try {
    const order = await Order.findById(orderId).populate("items");
    if (!order) {
      throw new Error("Order not found");
    }

    const commissions: {
      seller?: {
        sellerId: string;
        amount: number;
        rate: number;
        orderAmount: number;
      }[];
      deliveryBoy?: {
        deliveryBoyId: string;
        amount: number;
        rate: number;
        orderAmount: number;
        baseDeliveryEarning?: number;
        tipAmount?: number;
      };
    } = {};

    // Calculate seller commissions (per item/seller)
    const sellerCommissions = new Map<
      string,
      { amount: number; rate: number; orderAmount: number }
    >();

    for (const itemId of order.items) {
      const orderItem = await OrderItem.findById(itemId);
      if (!orderItem) continue;

      const sellerId = orderItem.seller.toString();
      const isSellerFunded = (order as any).couponFunding === "SELLER";
      const itemDiscount = (isSellerFunded && (orderItem as any).discountAmount) ? Number((orderItem as any).discountAmount) : 0;
      const effectiveItemTotal = Math.max(0, Math.round((orderItem.total - itemDiscount) * 100) / 100);

      // Get commission rate for this seller
      const commissionRate = await getSellerCommissionRate(sellerId);
      const commissionAmount = Math.round(((effectiveItemTotal * commissionRate) / 100) * 100) / 100;

      if (sellerCommissions.has(sellerId)) {
        const existing = sellerCommissions.get(sellerId)!;
        existing.amount += commissionAmount;
        existing.orderAmount += effectiveItemTotal;
      } else {
        sellerCommissions.set(sellerId, {
          amount: commissionAmount,
          rate: commissionRate,
          orderAmount: effectiveItemTotal,
        });
      }
    }

    // Convert to array
    commissions.seller = Array.from(sellerCommissions.entries()).map(
      ([sellerId, data]) => ({
        sellerId,
        ...data,
      }),
    );

    // Calculate delivery boy commission (on order subtotal OR distance based)
    if (order.deliveryBoy) {
      const deliveryBoyId = order.deliveryBoy.toString();

      // Check for distance based commission
      let commissionAmount = 0;
      let commissionRate = 0;
      let usedDistanceBased = false;

      try {
        // @ts-ignore - getSettings is static on model
        const settings = await AppSettings.getSettings();
        if (
          settings &&
          settings.deliveryConfig?.isDistanceBased === true &&
          settings.deliveryConfig?.deliveryBoyKmRate &&
          order.deliveryDistanceKm &&
          order.deliveryDistanceKm > 0
        ) {
          commissionRate = settings.deliveryConfig.deliveryBoyKmRate;
          commissionAmount = order.deliveryDistanceKm * commissionRate;
          usedDistanceBased = true;
          console.log(
            `DEBUG: Distance Commission: Dist=${order.deliveryDistanceKm}km, Rate=${commissionRate}/km, Amt=${commissionAmount}`,
          );
        }
      } catch (err) {
        console.error("Error checking settings for commission:", err);
      }

      if (!usedDistanceBased) {
        // Fallback to percentage based logic
        commissionRate = await getDeliveryBoyCommissionRate(deliveryBoyId);
        commissionAmount = (order.subtotal * commissionRate) / 100;
      }

      const baseDeliveryEarning = Math.round(commissionAmount * 100) / 100;
      const tipAmount = Math.round((Number(order.tipAmount) || 0) * 100) / 100;
      const totalRiderEarning = Math.round((baseDeliveryEarning + tipAmount) * 100) / 100;

      commissions.deliveryBoy = {
        deliveryBoyId,
        amount: totalRiderEarning, // Total earning: base delivery fee + customer tip
        rate: commissionRate,
        orderAmount: usedDistanceBased
          ? order.deliveryDistanceKm || 0
          : order.subtotal,
        baseDeliveryEarning,
        tipAmount,
      };
    }

    return {
      success: true,
      data: commissions,
    };
  } catch (error: any) {
    console.error("Error calculating order commissions:", error);
    return {
      success: false,
      message: error.message || "Failed to calculate commissions",
    };
  }
};

/**
 * Distribute commissions for an order
 */
/**
 * Create Pending Commissions (called on Order Payment)
 */
export const createPendingCommissions = async (orderId: string) => {
  try {
    const order = await Order.findById(orderId).populate("items");
    if (!order) throw new Error("Order not found");

    // Check if commissions already exist
    const existingCommissions = await Commission.find({ order: orderId });
    if (existingCommissions.length > 0) {
      console.log(`Commissions already exist for order ${orderId}`);
      return;
    }

    const items = order.items;
    // Group items by seller to aggregate earnings (though we store per item mostly)
    // We'll calculate per item as per original logic

    for (const itemId of items) {
      const item = await OrderItem.findById(itemId);
      if (!item) continue;

      const seller = await Seller.findById(item.seller);
      if (!seller) continue;

      const isSellerFunded = (order as any).couponFunding === "SELLER";
      const itemDiscount = (isSellerFunded && (item as any).discountAmount) ? Number((item as any).discountAmount) : 0;
      const effectiveItemAmount = Math.max(0, Math.round((item.total - itemDiscount) * 100) / 100);

      const commissionRate = await getOrderItemCommissionRate(
        item.product.toString(),
        item.seller.toString()
      );
      const commissionAmount = Math.round(((effectiveItemAmount * commissionRate) / 100) * 100) / 100;
      const netEarning = Math.round((effectiveItemAmount - commissionAmount) * 100) / 100;

      console.log(
        `[Commission] Item: ${item.product}, Rate: ${commissionRate}%, Amount: ${commissionAmount}, Net: ${netEarning}`,
      );

      // Record the commission as PENDING.
      //
      // This runs at payment time. It used to create the record as "Paid" and
      // credit the seller's withdrawable wallet immediately — so a seller was
      // paid in full before the goods were even shipped, and a cancellation
      // could not claw it back. Sellers are credited on delivery, by
      // distributeCommissions / processPendingCODPayouts. (#H-39)
      await Commission.create({
        order: item.order,
        orderItem: item._id,
        seller: item.seller,
        type: "SELLER",
        orderAmount: effectiveItemAmount,
        commissionRate,
        commissionAmount,
        status: "Pending",
        paidAt: null,
      });
    }

    console.log(`Pending commissions recorded for order ${orderId}`);
  } catch (error) {
    console.error("Error creating commissions:", error);
    throw error;
  }
};

/**
 * Distribute commissions for an order (Pending -> Paid)
 */
export const distributeCommissions = async (orderId: string) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      throw new Error("Order not found");
    }

    // Check if order is delivered
    if (order.status !== "Delivered") {
      throw new Error(
        "Commissions can only be distributed for delivered orders",
      );
    }

    // Find Pending commissions
    const pendingCommissions = await Commission.find({
      order: orderId,
      status: "Pending",
    }).session(session);

    // If no pending commissions, maybe we missed creating them (e.g. legacy/error), try to create them now?
    // Or if they are already Paid?

    // Do not block here. We will check specifically for each type later.

    let commissionsToProcess = pendingCommissions;

    if (pendingCommissions.length === 0) {
      console.warn(
        `No pending commissions found for order ${orderId}, attempting to calculate now...`,
      );
      // Fallback: If for some reason they weren't created on payment, create them now directly as Paid?
      // Or create as Pending and then Process.
      // Since we are inside a transaction, calling the async createPendingCommissions (which doesn't take session) is risky.
      // Better to fail or handle gracefully. For now, let's assume strict flow.
      // Actually, let's allow "Lazy Creation" logic here if needed, but for now strict.
      // Reverting to throw error might block delivery if data is missing.
      // Let's implement inline calculation if missing (copy of logic) or just return if truly nothing to do.
      console.log(
        "Skipping commission distribution as no pending records found.",
      );
      // return { success: true, message: "No pending commissions to distribute" };
      // Wait, if we return here, seller gets nothing. We SHOULD calculate if missing.
      // But for this task, let's assume they will be created.
      // Ideally we should call `createPendingCommissions` here but pass the session.
    }

    const processedCommissions: any[] = [];

    // Group by Seller to credit wallet once per seller
    const sellerEarnings = new Map<
      string,
      { netAmount: number; commissionIds: string[] }
    >();

    for (const comm of commissionsToProcess) {
      // Update status to Paid
      comm.status = "Paid";
      comm.paidAt = new Date();
      await comm.save({ session });
      processedCommissions.push(comm);

      // Group for wallet credit
      if (comm.type === "SELLER" && comm.seller) {
        const sellerId = comm.seller.toString();
        const netAmount = comm.orderAmount - comm.commissionAmount;

        if (!sellerEarnings.has(sellerId)) {
          sellerEarnings.set(sellerId, { netAmount: 0, commissionIds: [] });
        }
        const data = sellerEarnings.get(sellerId)!;
        data.netAmount += netAmount;
        data.commissionIds.push(comm._id.toString());
      }
    }

    // Credit Seller Wallets
    for (const [sellerId, data] of sellerEarnings.entries()) {
      // For COD orders, we don't credit the seller yet.
      // The seller will be credited when the delivery boy pays the admin.
      if (order.paymentMethod === "COD") {
        console.log(
          `[COD] Delaying seller credit for order ${order.orderNumber}. Will be credited when delivery boy pays admin.`,
        );
        // Mark these commissions as Pending instead of Paid
        await Commission.updateMany(
          { _id: { $in: data.commissionIds } },
          { $set: { status: "Pending", paidAt: null } },
          { session },
        );
        continue;
      }

      await creditWallet(
        sellerId,
        "SELLER",
        data.netAmount,
        `Sale proceeds for order ${order.orderNumber}`,
        orderId,
        data.commissionIds[0], // Link to first commission for ref
        session,
      );
    }

    // For COD orders, delegate to the specialized COD processing logic
    if (order.paymentMethod && order.paymentMethod.toUpperCase() === "COD") {
      console.log(`[Commission] Delegating COD order ${order.orderNumber} to processCODOrderDelivery`);
      // End the current session as processCODOrderDelivery might start its own
      await session.commitTransaction();
      await processCODOrderDelivery(orderId);


      // Fetch the commissions created by processCODOrderDelivery to return them
      const codCommissions = await Commission.find({ order: orderId });

      return {
        success: true,
        message: "COD Commissions processed or already exists",
        data: {
          commissions: codCommissions,
        },
      };
    }

    // Handle Delivery Boy Commission (For Prepaid/Online Orders)
    if (order.deliveryBoy) {
      const deliveryBoyId = order.deliveryBoy.toString();
      const existingDeliveryComm = await Commission.findOne({
        order: orderId,
        type: "DELIVERY_BOY",
      }).session(session);

      if (!existingDeliveryComm) {
        console.log(
          `Creating missing commission for Delivery Boy ${deliveryBoyId}`,
        );

        // Calculate Commission Logic (Copied from calculateOrderCommissions)
        let commissionAmount = 0;
        let commissionRate = 0;
        let usedDistanceBased = false;

        try {
          // @ts-ignore
          const settings = await AppSettings.getSettings();
          if (
            settings &&
            settings.deliveryConfig?.isDistanceBased === true &&
            settings.deliveryConfig?.deliveryBoyKmRate &&
            order.deliveryDistanceKm &&
            order.deliveryDistanceKm > 0
          ) {
            commissionRate = settings.deliveryConfig.deliveryBoyKmRate;
            commissionAmount = order.deliveryDistanceKm * commissionRate;
            usedDistanceBased = true;
          }
        } catch (err) {
          console.error("Error checking settings for commission:", err);
        }

        if (!usedDistanceBased) {
          // Fallback to percentage based logic
          const { getDeliveryBoyCommissionRate } =
            await import("./commissionService");
          commissionRate = await getDeliveryBoyCommissionRate(deliveryBoyId);
          commissionAmount = (order.subtotal * commissionRate) / 100;
        }

        const baseDeliveryEarning = Math.round(commissionAmount * 100) / 100;
        const tipAmount = Math.round((Number(order.tipAmount) || 0) * 100) / 100;
        const totalRiderEarning = Math.round((baseDeliveryEarning + tipAmount) * 100) / 100;

        // Create Commission Record
        const newComm = await Commission.create(
          [
            {
              order: order._id,
              deliveryBoy: order.deliveryBoy,
              type: "DELIVERY_BOY",
              orderAmount: usedDistanceBased
                ? order.deliveryDistanceKm || 0
                : order.subtotal,
              commissionRate,
              commissionAmount: totalRiderEarning,
              tipAmount,
              status: "Paid",
              paidAt: new Date(),
            },
          ],
          { session },
        );

        const comm = newComm[0];
        processedCommissions.push(comm);

        const description = tipAmount > 0
          ? `Delivery earning for order ${order.orderNumber} (Base: ₹${baseDeliveryEarning}, Tip: ₹${tipAmount})`
          : `Delivery earning for order ${order.orderNumber}`;

        // Credit Wallet Immediately with deterministic reference for idempotency
        await creditWallet(
          deliveryBoyId,
          "DELIVERY_BOY",
          comm.commissionAmount,
          description,
          orderId,
          comm._id.toString(),
          session,
          `DEL-EARN-${order._id}`,
        );
      } else if (
        existingDeliveryComm &&
        existingDeliveryComm.status === "Pending"
      ) {
        const tipAmount = Math.round((Number(order.tipAmount) || 0) * 100) / 100;
        if (tipAmount > 0 && !(existingDeliveryComm.tipAmount && existingDeliveryComm.tipAmount > 0)) {
          existingDeliveryComm.tipAmount = tipAmount;
          existingDeliveryComm.commissionAmount = Math.round((existingDeliveryComm.commissionAmount + tipAmount) * 100) / 100;
        }

        // If it existed as pending, mark as paid and credit
        existingDeliveryComm.status = "Paid";
        existingDeliveryComm.paidAt = new Date();
        await existingDeliveryComm.save({ session });
        processedCommissions.push(existingDeliveryComm);

        const baseAmt = Math.round((existingDeliveryComm.commissionAmount - (existingDeliveryComm.tipAmount || 0)) * 100) / 100;
        const description = (existingDeliveryComm.tipAmount || 0) > 0
          ? `Delivery earning for order ${order.orderNumber} (Base: ₹${baseAmt}, Tip: ₹${existingDeliveryComm.tipAmount})`
          : `Delivery earning for order ${order.orderNumber}`;

        await creditWallet(
          deliveryBoyId,
          "DELIVERY_BOY",
          existingDeliveryComm.commissionAmount,
          description,
          orderId,
          existingDeliveryComm._id.toString(),
          session,
          `DEL-EARN-${order._id}`,
        );
      }
    }

    await session.commitTransaction();

    return {
      success: true,
      message: "Commissions distributed successfully",
      data: {
        commissions: processedCommissions,
      },
    };

  } catch (error: any) {
    await session.abortTransaction();
    console.error("Error distributing commissions:", error);
    return {
      success: false,
      message: error.message || "Failed to distribute commissions",
    };
  } finally {
    session.endSession();
  }
};

/**
 * Process pending COD commissions when delivery boy pays admin
 */
export const processPendingCODPayouts = async (
  deliveryBoyId: string,
  amountPaid: number,
  session?: mongoose.ClientSession,
) => {
  try {
    // Round amount paid for precision
    let remainingAmount = Math.round(amountPaid * 100) / 100;

    // Find all orders delivered by this delivery boy that have pending SELLER commissions
    const pendingCommissions = await Commission.find({
      type: "SELLER",
      status: "Pending",
    })
      .populate({
        path: "order",
        match: { deliveryBoy: deliveryBoyId, paymentMethod: "COD" },
      })
      .session(session || null)
      .sort({ createdAt: 1 }); // FIFO

    // Filter out commissions where order didn't match the populate criteria
    const validCommissions = pendingCommissions.filter(
      (comm) => comm.order !== null,
    );

    // Group pending seller commissions by order
    const orderCommissionsMap = new Map<string, typeof validCommissions>();
    for (const comm of validCommissions) {
      const oId = (comm.order as any)._id.toString();
      if (!orderCommissionsMap.has(oId)) {
        orderCommissionsMap.set(oId, []);
      }
      orderCommissionsMap.get(oId)!.push(comm);
    }

    const processedOrders = new Set<string>();
    const PlatformWallet = (await import("../models/PlatformWallet")).default;
    let platformWallet = await PlatformWallet.findOne().session(session || null);

    // If deliveryBoy exists, check cumulative settled amount across pending orders
    const deliveryBoy = await Delivery.findById(deliveryBoyId).session(session || null);
    if (deliveryBoy) {
      let totalPendingDebt = 0;
      for (const oComms of orderCommissionsMap.values()) {
        const o = oComms[0].order as any;
        const dComm = await Commission.findOne({
          order: o._id,
          type: "DELIVERY_BOY",
        }).session(session || null);
        if (dComm) {
          totalPendingDebt += Math.round((o.total - dComm.commissionAmount) * 100) / 100;
        }
      }
      const currentDebt = Math.round((deliveryBoy.pendingAdminPayout || 0) * 100) / 100;
      const settledAvailable = Math.max(0, Math.round((totalPendingDebt - currentDebt) * 100) / 100);
      remainingAmount = Math.max(remainingAmount, settledAvailable);
    }

    for (const oComms of orderCommissionsMap.values()) {
      if (remainingAmount <= 0.01) break; // Use small epsilon

      const order = oComms[0].order as any;

      // Calculate how much this order contributes to the admin payout
      const deliveryComm = await Commission.findOne({
        order: order._id,
        type: "DELIVERY_BOY",
      }).session(session || null);

      if (!deliveryComm) continue;

      // Amount delivery boy owes for this order = Total - Delivery Commission
      const orderAdminPayoutPart = Math.round((order.total - deliveryComm.commissionAmount) * 100) / 100;

      // We process the commission if the amount paid covers this order's part (with small epsilon)
      if (remainingAmount >= orderAdminPayoutPart - 0.01) {
        remainingAmount = Math.max(0, Math.round((remainingAmount - orderAdminPayoutPart) * 100) / 100);
        processedOrders.add(order.orderNumber);

        // Update platform admin earnings once for this order
        if (platformWallet) {
          const { calculateCODOrderBreakdown } = await import("./commissionService");
          const breakdown = await calculateCODOrderBreakdown(order._id.toString());
          platformWallet.totalAdminEarning = Math.round(
            ((platformWallet.totalAdminEarning || 0) + breakdown.totalAdminEarning) * 100
          ) / 100;
        }

        // Process all seller commissions belonging to this order
        for (const comm of oComms) {
          comm.status = "Paid";
          comm.paidAt = new Date();
          await comm.save({ session });

          // Credit Seller Wallet
          const netEarning = Math.round((comm.orderAmount - comm.commissionAmount) * 100) / 100;
          if (comm.seller) {
            await creditWallet(
              comm.seller.toString(),
              "SELLER",
              netEarning,
              `Sale proceeds for COD order ${order.orderNumber} (Delivery boy payout confirmed)`,
              order._id.toString(),
              comm._id.toString(),
              session,
            );

            // Update platform wallet counters for this specifically processed order
            if (platformWallet) {
              // Paying the seller REDUCES what the platform still owes them.
              // This used to add, so the liability grew every time it was settled. (#H-43)
              platformWallet.sellerPendingPayouts = Math.max(
                0,
                (platformWallet.sellerPendingPayouts || 0) - netEarning,
              );
              // Releasing seller payout transfers the seller's money out of the platform's
              // available balance into the seller's wallet, preventing double-counted balance inflation.
              platformWallet.currentPlatformBalance = Math.max(
                0,
                (platformWallet.currentPlatformBalance || 0) - netEarning,
              );
            }
          }
        }
      }
    }

    if (platformWallet) {
      await platformWallet.save({ session });
    }

    console.log(
      `[COD Payout] Processed ${processedOrders.size} orders for delivery boy ${deliveryBoyId}. Remaining payment: ${remainingAmount}`,
    );

    return {
      success: true,
      processedCount: processedOrders.size,
      remainingAmount: Math.max(0, remainingAmount),
    };
  } catch (error) {
    console.error("Error processing pending COD payouts:", error);
    throw error;
  }
};


/**
 * Get commission summary for a user
 */
export const getCommissionSummary = async (
  userId: string,
  userType: "SELLER" | "DELIVERY_BOY",
) => {
  try {
    const query =
      userType === "SELLER" ? { seller: userId } : { deliveryBoy: userId };

    const commissions = await Commission.find(query).sort({ createdAt: -1 });

    const summary = {
      total: 0,
      paid: 0,
      pending: 0,
      count: commissions.length,
      commissions: commissions.map((c) => ({
        id: c._id,
        orderId: c.order,
        amount: c.commissionAmount,
        rate: c.commissionRate,
        orderAmount: c.orderAmount,
        status: c.status,
        paidAt: c.paidAt,
        createdAt: c.createdAt,
      })),
    };

    commissions.forEach((c) => {
      // For Sellers, earning is Order Amount - Commission Amount
      // For Delivery Boys, earning is the Commission Amount itself
      const earningAmount =
        userType === "SELLER"
          ? c.orderAmount - c.commissionAmount
          : c.commissionAmount;

      summary.total += earningAmount;
      if (c.status === "Paid") {
        summary.paid += earningAmount;
      } else if (c.status === "Pending") {
        summary.pending += earningAmount;
      }
    });

    return {
      success: true,
      data: summary,
    };
  } catch (error: any) {
    console.error("Error getting commission summary:", error);
    return {
      success: false,
      message: error.message || "Failed to get commission summary",
    };
  }
};

/**
 * Reverse commission for a single returned order item / partial quantity
 */
export interface ReverseOrderItemCommissionParams {
  orderId: string;
  orderItemId: string;
  returnId?: string;
  returnedQuantity: number;
  session?: mongoose.ClientSession;
}

export const reverseOrderItemCommission = async (
  params: ReverseOrderItemCommissionParams,
) => {
  const { orderId, orderItemId, returnId, returnedQuantity } = params;
  const useExternalSession = !!params.session;
  const session = params.session || (await mongoose.startSession());
  if (!useExternalSession) {
    session.startTransaction();
  }

  try {
    const qty = Number(returnedQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Invalid returned quantity: ${returnedQuantity}`);
    }

    const orderItem = await OrderItem.findById(orderItemId).session(session);
    if (!orderItem) {
      throw new Error(`Order item ${orderItemId} not found`);
    }

    // Idempotency guard: if a wallet reversal already exists for this return, do not re-debit
    const reference = returnId
      ? `REV-RET-${returnId}`
      : `REV-ITEM-${orderItemId}-${Date.now()}`;
    const WalletTransaction = (await import("../models/WalletTransaction")).default;
    const existingTx = await WalletTransaction.findOne({ reference }).session(session);
    if (existingTx) {
      console.log(`Return ${returnId} already reversed with reference ${reference}`);
      if (!useExternalSession) await session.commitTransaction();
      return {
        success: true,
        message: "Commission already reversed for this return",
        data: { amountReversed: existingTx.amount },
      };
    }

    // Find the seller commission for this item
    let commission = await Commission.findOne({
      order: orderId,
      orderItem: orderItemId,
      type: "SELLER",
    }).session(session);

    if (!commission) {
      // Fallback: search by order and seller if orderItem was unlinked
      commission = await Commission.findOne({
        order: orderId,
        seller: orderItem.seller,
        type: "SELLER",
      }).session(session);
    }

    if (!commission) {
      console.warn(
        `No commission record found for order item ${orderItemId} in order ${orderId}`,
      );
      if (!useExternalSession) await session.commitTransaction();
      return {
        success: true,
        message: "No commission record found to reverse",
      };
    }

    // Authoritative calculation based on the stored Commission record
    const originalQuantity = Math.max(1, orderItem.quantity || 1);
    const commissionRate =
      commission.commissionRate ?? (orderItem.commissionRate || 0);

    // Calculate total returned quantity across all completed returns for this item
    const Return = (await import("../models/Return")).default;
    const otherReturns = await Return.find({
      orderItem: orderItemId,
      status: "Completed",
      ...(returnId ? { _id: { $ne: returnId } } : {}),
    }).session(session);
    const priorReturned =
      otherReturns.reduce((sum, r) => sum + (r.quantity || 0), 0);
    const totalReturned = priorReturned + qty;
    const isFullyReturned = totalReturned >= originalQuantity;

    let returnedGross: number;
    let returnedCommission: number;
    let amountToReverse: number;

    if (isFullyReturned) {
      // Final return: sweep 100% of the remaining stored commission allocation.
      // This guarantees zero rounding discrepancy and prevents cumulative paise drift.
      returnedGross = commission.orderAmount;
      returnedCommission = commission.commissionAmount;
      amountToReverse = Math.max(
        0,
        Math.round((commission.orderAmount - commission.commissionAmount) * 100) / 100,
      );

      commission.orderAmount = 0;
      commission.commissionAmount = 0;
      commission.status = "Cancelled";
    } else {
      // Partial return: derive proportionally based on returned quantity fraction
      const remainingQty = Math.max(1, originalQuantity - priorReturned);
      const unitGross = commission.orderAmount > 0
        ? Math.round((commission.orderAmount / remainingQty) * 100) / 100
        : (orderItem.unitPrice || 0);
      const calculatedGross = Math.round(unitGross * qty * 100) / 100;
      returnedGross = Math.min(commission.orderAmount, calculatedGross);
      returnedCommission = Math.min(
        commission.commissionAmount,
        Math.round(((returnedGross * commissionRate) / 100) * 100) / 100,
      );
      const netToReverse =
        Math.round((returnedGross - returnedCommission) * 100) / 100;
      const remainingNet =
        Math.round((commission.orderAmount - commission.commissionAmount) * 100) / 100;
      amountToReverse = Math.max(0, Math.min(netToReverse, remainingNet));

      commission.orderAmount = Math.max(
        0,
        Math.round((commission.orderAmount - returnedGross) * 100) / 100,
      );
      commission.commissionAmount = Math.max(
        0,
        Math.round((commission.commissionAmount - returnedCommission) * 100) / 100,
      );
    }

    // If commission was already Paid, debit the seller wallet
    if (
      commission.status === "Paid" &&
      amountToReverse > 0 &&
      commission.seller
    ) {
      const { debitWallet } = await import("./walletManagementService");
      await debitWallet(
        commission.seller.toString(),
        "SELLER",
        amountToReverse,
        `Reversal for return ${returnId || ""} (${orderItem.productName || "Item"}, Qty: ${qty}) in order ${orderId}`,
        orderId,
        session,
        {
          allowNegative: true,
          reference,
        },
      );
    }

    await commission.save({ session });

    if (!useExternalSession) {
      await session.commitTransaction();
    }

    return {
      success: true,
      message: "Item commission reversed successfully",
      data: {
        orderItemId,
        returnedQuantity: qty,
        returnedGross,
        returnedCommission,
        amountToReverse,
        isFullyReturned,
      },
    };
  } catch (error: any) {
    if (!useExternalSession) {
      await session.abortTransaction();
    }
    console.error("Error reversing order item commission:", error);
    return {
      success: false,
      message: error.message || "Failed to reverse order item commission",
    };
  } finally {
    if (!useExternalSession) {
      session.endSession();
    }
  }
};

/**
 * Reverse commissions for a cancelled/returned order
 */
export const reverseCommissions = async (
  orderId: string,
  options?: {
    orderItemId?: string;
    returnId?: string;
    returnedQuantity?: number;
  },
) => {
  if (options?.orderItemId && options?.returnedQuantity) {
    return reverseOrderItemCommission({
      orderId,
      orderItemId: options.orderItemId,
      returnId: options.returnId,
      returnedQuantity: options.returnedQuantity,
    });
  }
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const commissions = await Commission.find({ order: orderId }).session(
      session,
    );

    if (commissions.length === 0) {
      await session.commitTransaction();
      return {
        success: true,
        message: "No commissions to reverse",
      };
    }

    const { debitWallet } = await import("./walletManagementService");

    for (const commission of commissions) {
      // A Pending commission was never credited, so cancelling it is enough.
      if (commission.status !== "Paid") {
        if (commission.status === "Pending") {
          commission.status = "Cancelled";
          await commission.save({ session });
        }
        continue;
      }

      commission.status = "Cancelled";
      await commission.save({ session });

      const userId =
        commission.type === "SELLER" ? commission.seller : commission.deliveryBoy;
      if (!userId) continue;

      // Reverse what was actually PAID OUT, not the platform's cut.
      //
      // A seller is credited `orderAmount - commissionAmount` (their net
      // proceeds); a courier is credited `commissionAmount` (their fee). This
      // used to debit `commissionAmount` in both cases, so reversing a seller
      // clawed back the platform's commission instead of the seller's earnings
      // — the wrong amount, from the wrong party. (#H-07)
      const amountToReverse =
        commission.type === "SELLER"
          ? Math.round((commission.orderAmount - commission.commissionAmount) * 100) / 100
          : Math.round(commission.commissionAmount * 100) / 100;

      if (amountToReverse <= 0) continue;

      await debitWallet(
        userId.toString(),
        commission.type,
        amountToReverse,
        `Reversal for cancelled/returned order ${orderId}`,
        orderId,
        session,
        {
          // A clawback can legitimately take a balance below zero: the money is
          // already gone and is owed back.
          allowNegative: true,
          reference: `REV-${commission._id}`,
        },
      );
    }

    await session.commitTransaction();

    return {
      success: true,
      message: "Commissions reversed successfully",
    };
  } catch (error: any) {
    await session.abortTransaction();
    console.error("Error reversing commissions:", error);
    return {
      success: false,
      message: error.message || "Failed to reverse commissions",
    };
  } finally {
    session.endSession();
  }
};

/**
 * Derive a schema-valid commission rate without ever dividing by zero.
 * Returns a percentage clamped to the model's 0..100 range.
 */
export function safeCommissionRate(
  commissionAmount: number,
  distanceKm?: number,
  deliveryCharge?: number,
): number {
  const amount = Number(commissionAmount) || 0;
  if (distanceKm && distanceKm > 0) {
    const perKm = amount / distanceKm;
    return Number.isFinite(perKm) ? Math.min(Math.max(perKm, 0), 100) : 0;
  }
  if (deliveryCharge && deliveryCharge > 0) {
    const pct = (amount / deliveryCharge) * 100;
    return Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : 0;
  }
  return 0;
}

/**
 * COD Order Breakdown Interface
 */
export interface ICODOrderBreakdown {
  orderId: string;
  orderNumber: string;

  // Product breakdown
  productCost: number; // Subtotal of all products
  adminProductCommission: number; // Admin's commission on products
  sellerEarnings: Map<string, number>; // Seller ID -> their earning (product cost - admin commission)

  // Fees
  platformFee: number;

  // Delivery breakdown
  totalDeliveryCharge: number;
  deliveryBoyCommission: number; // Delivery boy's earning from delivery (base fee + tip)
  baseDeliveryCommission?: number; // Base delivery fee excluding tip
  tipAmount?: number; // Customer tip passed through to rider
  adminDeliveryCommission: number; // Admin's portion of delivery charge

  // Totals
  totalAdminEarning: number; // adminProductCommission + platformFee + adminDeliveryCommission
  totalOrderAmount: number; // Grand total customer pays
  amountDeliveryBoyOwesAdmin: number; // Total - deliveryBoyCommission
  couponDiscount?: number;
  couponFunding?: "PLATFORM" | "SELLER";
  platformDiscountSubsidy?: number;

  // Metadata
  deliveryBoyId?: string;
  deliveryDistanceKm?: number;
}

/**
 * Calculate complete COD order breakdown
 * This function calculates how money flows for a COD order:
 * - Product commission (admin vs seller)
 * - Platform fee (goes to admin)
 * - Delivery charge split (delivery boy commission vs admin commission)
 */
export const calculateCODOrderBreakdown = async (
  orderId: string
): Promise<ICODOrderBreakdown> => {
  try {
    const order = await Order.findById(orderId).populate("items");
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.paymentMethod !== "COD") {
      throw new Error("This function is only for COD orders");
    }

    const tipAmount = Math.round((Number(order.tipAmount) || 0) * 100) / 100;
    const isSellerFunded = (order as any).couponFunding === "SELLER";
    const isPlatformFunded = !(order as any).couponFunding || (order as any).couponFunding === "PLATFORM";
    const platformDiscountSubsidy = (isPlatformFunded && order.discount) ? Math.round(Number(order.discount) * 100) / 100 : 0;

    const breakdown: ICODOrderBreakdown = {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      productCost: order.subtotal,
      adminProductCommission: 0,
      sellerEarnings: new Map<string, number>(),
      platformFee: order.platformFee || 0,
      totalDeliveryCharge: order.shipping || 0,
      deliveryBoyCommission: 0,
      baseDeliveryCommission: 0,
      tipAmount,
      adminDeliveryCommission: 0,
      totalAdminEarning: 0,
      totalOrderAmount: order.total,
      amountDeliveryBoyOwesAdmin: 0,
      deliveryBoyId: order.deliveryBoy?.toString(),
      deliveryDistanceKm: order.deliveryDistanceKm,
      couponDiscount: order.discount || 0,
      couponFunding: (order as any).couponFunding || "PLATFORM",
      platformDiscountSubsidy,
    };

    // 1. Calculate Product Commissions (Admin vs Seller)
    for (const itemId of order.items) {
      const item = await OrderItem.findById(itemId);
      if (!item) continue;

      const product = await Product.findById(item.product);
      if (!product) continue;

      const commissionRate = item.commissionRate || await getOrderItemCommissionRate(
        item.product.toString(),
        item.seller.toString()
      );

      const itemDiscount = (isSellerFunded && (item as any).discountAmount) ? Number((item as any).discountAmount) : 0;
      const effectiveItemAmount = Math.max(0, Math.round((item.total - itemDiscount) * 100) / 100);

      // Calculate commission and seller earning for this item
      const itemCommission = Math.round(((effectiveItemAmount * commissionRate) / 100) * 100) / 100;
      const itemSellerEarning = Math.round((effectiveItemAmount - itemCommission) * 100) / 100;

      breakdown.adminProductCommission = Math.round((breakdown.adminProductCommission + itemCommission) * 100) / 100;

      // Aggregate seller earnings
      const sellerId = item.seller.toString();
      const currentEarning = breakdown.sellerEarnings.get(sellerId) || 0;
      breakdown.sellerEarnings.set(sellerId, Math.round((currentEarning + itemSellerEarning) * 100) / 100);
    }

    // 2. Calculate Delivery Commission Split
    if (order.deliveryBoy) {
      const settings = await AppSettings.getSettings();

      // Check if distance-based delivery is enabled
      if (
        settings?.deliveryConfig?.isDistanceBased &&
        settings.deliveryConfig.deliveryBoyKmRate &&
        order.deliveryDistanceKm &&
        order.deliveryDistanceKm > 0
      ) {
        // Distance-based calculation
        const deliveryBoyKmRate = settings.deliveryConfig.deliveryBoyKmRate;
        const baseComm = order.deliveryDistanceKm * deliveryBoyKmRate;
        breakdown.baseDeliveryCommission = Math.round(baseComm * 100) / 100;
        breakdown.deliveryBoyCommission = Math.round((baseComm + tipAmount) * 100) / 100;

        // Admin gets the rest of the delivery charge (or absorbs delivery subsidy if negative)
        breakdown.adminDeliveryCommission = Math.round((breakdown.totalDeliveryCharge - baseComm) * 100) / 100;
      } else {
        // Fallback: If no distance-based config, use percentage of order subtotal (matches prepaid logic)
        // Get delivery boy commission rate (default 5%)
        const deliveryBoy = await Delivery.findById(order.deliveryBoy);
        const deliveryBoyRate = deliveryBoy?.commissionRate || 5;

        // Use subtotal instead of shipping charge to avoid zero commission on free delivery.
        // This ensures the delivery boy always gets paid even if shipping is free.
        const baseComm = (order.subtotal * deliveryBoyRate) / 100;
        breakdown.baseDeliveryCommission = Math.round(baseComm * 100) / 100;
        breakdown.deliveryBoyCommission = Math.round((baseComm + tipAmount) * 100) / 100;

        // Admin's portion of the shipping charge
        breakdown.adminDeliveryCommission = Math.max(0, breakdown.totalDeliveryCharge);
      }

    } else {
      // No delivery boy assigned, all delivery charge goes to admin
      breakdown.baseDeliveryCommission = 0;
      breakdown.adminDeliveryCommission = breakdown.totalDeliveryCharge;
    }

    // 3. Calculate Total Admin Earning
    // Admin Earning = Product Commission + Platform Fee + Admin's portion of Delivery Charge
    // Minus Platform Discount Subsidy if platform-funded
    const grossAdminEarning = Math.round(
      (breakdown.adminProductCommission +
        breakdown.platformFee +
        breakdown.adminDeliveryCommission) * 100
    ) / 100;

    breakdown.totalAdminEarning = Math.round(
      (grossAdminEarning - platformDiscountSubsidy) * 100
    ) / 100;

    // 4. Calculate Amount Delivery Boy Owes Admin
    // Delivery boy collects full order amount but keeps only their commission (including tip)
    // They owe: Total Order Amount - Their Commission
    breakdown.amountDeliveryBoyOwesAdmin =
      Math.round((breakdown.totalOrderAmount - breakdown.deliveryBoyCommission) * 100) / 100;

    console.log(`[COD Breakdown] Order ${order.orderNumber}:`, {
      productCost: breakdown.productCost,
      adminProductCommission: breakdown.adminProductCommission,
      platformFee: breakdown.platformFee,
      deliveryCharge: breakdown.totalDeliveryCharge,
      deliveryBoyCommission: breakdown.deliveryBoyCommission,
      adminDeliveryCommission: breakdown.adminDeliveryCommission,
      totalAdminEarning: breakdown.totalAdminEarning,
      amountDeliveryBoyOwes: breakdown.amountDeliveryBoyOwesAdmin,
    });

    return breakdown;
  } catch (error: any) {
    console.error("Error calculating COD order breakdown:", error);
    throw error;
  }
};

/**
 * Process COD Order Delivery
 * Called when a COD order is marked as delivered
 * Updates delivery boy wallet, platform wallet, and creates commission records
 */
export const processCODOrderDelivery = async (
  orderId: string,
  session?: mongoose.ClientSession
): Promise<void> => {
  const useExternalSession = !!session;
  if (!session) {
    session = await mongoose.startSession();
    session.startTransaction();
  }

  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.paymentMethod !== "COD") {
      throw new Error("This function is only for COD orders");
    }

    if (!order.deliveryBoy) {
      throw new Error("Order must have a delivery boy assigned");
    }

    // Calculate complete breakdown
    const breakdown = await calculateCODOrderBreakdown(orderId);

    // Import PlatformWallet
    const PlatformWallet = (await import("../models/PlatformWallet")).default;

    // Check if already processed to avoid double-counting
    const existingTx = await WalletTransaction.findOne({
      $or: [
        { reference: `DEL-COD-EARN-${orderId}` },
        {
          userId: order.deliveryBoy.toString(),
          relatedOrder: orderId,
          description: { $regex: /Delivery earning for COD order/i },
        },
      ],
    }).session(session);

    if (existingTx) {
      console.log(`[COD Delivery] Order ${order.orderNumber} already processed. Skipping all financial updates.`);
    } else {
      // 1. Update Delivery Boy Wallet
      const deliveryBoy = await Delivery.findById(order.deliveryBoy).session(session);
      if (!deliveryBoy) {
        throw new Error("Delivery boy not found");
      }

      // Delivery boy owes admin the rest. Use safety addition to prevent NaN
      const currentPayout = deliveryBoy.pendingAdminPayout || 0;
      deliveryBoy.pendingAdminPayout = currentPayout + breakdown.amountDeliveryBoyOwesAdmin;

      // Track cash collected
      const currentCash = deliveryBoy.cashCollected || 0;
      deliveryBoy.cashCollected = currentCash + breakdown.totalOrderAmount;

      await deliveryBoy.save({ session });

      const tipText = (breakdown.tipAmount || 0) > 0
        ? ` (Base: ₹${breakdown.baseDeliveryCommission || Math.round((breakdown.deliveryBoyCommission - (breakdown.tipAmount || 0)) * 100) / 100}, Tip: ₹${breakdown.tipAmount})`
        : "";

      // Create wallet transaction for delivery boy commission with idempotent reference
      await creditWallet(
        order.deliveryBoy.toString(),
        "DELIVERY_BOY",
        breakdown.deliveryBoyCommission,
        `Delivery earning for COD order ${order.orderNumber}${tipText}`,
        orderId,
        undefined,
        session,
        `DEL-COD-EARN-${order._id}`,
      );

      // Calculate total pending seller payout for this order
      let totalOrderSellerEarnings = 0;
      for (const earning of breakdown.sellerEarnings.values()) {
        totalOrderSellerEarnings += earning;
      }
      totalOrderSellerEarnings = Math.round(totalOrderSellerEarnings * 100) / 100;

      // 2. Update Platform Wallet
      const platformWallet = await PlatformWallet.findOne().session(session);

      if (!platformWallet) {
        // Create new platform wallet if it doesn't exist
        await PlatformWallet.create([{
          totalPlatformEarning: 0,
          currentPlatformBalance: 0,
          totalAdminEarning: 0,
          pendingFromDeliveryBoy: breakdown.amountDeliveryBoyOwesAdmin,
          sellerPendingPayouts: totalOrderSellerEarnings,
          deliveryBoyPendingPayouts: breakdown.deliveryBoyCommission,
        }], { session });
      } else {
        // Update existing platform wallet
        platformWallet.pendingFromDeliveryBoy += breakdown.amountDeliveryBoyOwesAdmin;
        platformWallet.sellerPendingPayouts = (platformWallet.sellerPendingPayouts || 0) + totalOrderSellerEarnings;
        platformWallet.deliveryBoyPendingPayouts += breakdown.deliveryBoyCommission;
        await platformWallet.save({ session });
      }

      // 3. Create Commission Records (marked as Pending for sellers, Paid for delivery boy)

      // Create delivery boy commission record
      const deliveryCommission = new Commission({
        order: orderId,
        deliveryBoy: order.deliveryBoy,
        type: "DELIVERY_BOY",
        orderAmount: breakdown.deliveryDistanceKm || breakdown.totalDeliveryCharge,
        // Free delivery makes totalDeliveryCharge 0, which produced Infinity /
        // NaN here and then failed the schema's 0..100 validation, aborting the
        // whole COD settlement. (#H-44)
        commissionRate: safeCommissionRate(
          breakdown.deliveryBoyCommission,
          breakdown.deliveryDistanceKm,
          breakdown.totalDeliveryCharge,
        ),
        commissionAmount: breakdown.deliveryBoyCommission,
        tipAmount: breakdown.tipAmount || 0,
        status: "Paid", // Delivery boy gets paid immediately
        paidAt: new Date(),
      });
      await deliveryCommission.save({ session });

      // Create seller commission records (marked as Pending - will be paid when delivery boy pays admin)
      const sellerEarningsArray = Array.from(breakdown.sellerEarnings.entries());
      for (const [sellerId] of sellerEarningsArray) {
        // Find order items for this seller to get commission details
        const orderItems = await OrderItem.find({
          order: orderId,
          seller: sellerId
        }).session(session);

        for (const item of orderItems) {
          const commRate = item.commissionRate || await getOrderItemCommissionRate(item.product.toString(), item.seller.toString());
          const itemCommission = (item.total * commRate) / 100;

          const sellerCommission = new Commission({
            order: orderId,
            orderItem: item._id,
            seller: sellerId,
            type: "SELLER",
            orderAmount: item.total,
            commissionRate: commRate,
            commissionAmount: itemCommission,
            status: "Pending", // Seller will be paid when delivery boy pays admin
            paidAt: null,
          });
          await sellerCommission.save({ session });
        }
      }

      console.log(`[COD Delivery] Order ${order.orderNumber} fully processed.`);
    }


    if (!useExternalSession) {
      await session.commitTransaction();
    }
  } catch (error: any) {
    if (!useExternalSession) {
      await session.abortTransaction();
    }
    console.error("Error processing COD order delivery:", error);
    throw error;
  } finally {
    if (!useExternalSession) {
      session.endSession();
    }
  }
};
