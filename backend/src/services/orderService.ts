import Order from "../models/Order";
import { IOrderItem } from "../models/OrderItem";
import { clearOrderCache } from "../socket/socketService";

/**
 * Process order status transition
 */
export const processOrderStatusTransition = async (
  orderId: string,
  newStatus: string,
  _previousStatus?: string
) => {
  const order = await Order.findById(orderId).populate("items");

  if (!order) {
    throw new Error("Order not found");
  }

  // Clear tracking cache if order is completed, cancelled, or rejected
  if (["Delivered", "Cancelled", "Returned", "Failed", "Rejected"].includes(newStatus)) {
    clearOrderCache(orderId);
  }

  // Stock is reserved when the order is created and released when it is
  // cancelled, both handled by stockService against Product/variation stock.
  // The separate Inventory collection was never populated and its
  // reserve/restore branches here were unreachable: this function is only ever
  // invoked with "Delivered". (#H-42)
  if (newStatus === "Delivered") {
    await createCommissions(order.items as any[]);
  }

  return order;
};

/**
 * Create commissions for sellers when order is delivered
 * Also updates seller balances and creates wallet transactions
 */
/**
 * Create commissions for sellers when order is delivered
 * Now delegating to commissionService.distributeCommissions
 */
const createCommissions = async (items: IOrderItem[]) => {
  if (!items || items.length === 0) return;

  try {
    const orderId = items[0].order.toString();
    const order = await Order.findById(orderId);

    if (!order) return;

    if (order.paymentMethod && order.paymentMethod.toUpperCase() === "COD") {
      // For COD orders, use the comprehensive COD processing logic
      const { processCODOrderDelivery } = await import("./commissionService");
      await processCODOrderDelivery(orderId);
    } else {
      // For online/prepaid orders, distribute commissions immediately
      const { distributeCommissions } = await import("./commissionService");
      await distributeCommissions(orderId);
    }
  } catch (err) {
    console.error("Error creating commissions in orderService:", err);
    throw err;
  }
};


/**
 * Order status transitions now live in services/orderStatusService.ts, which is
 * the single table shared by the customer, seller, courier and admin paths.
 * The validator that used to sit here had a different vocabulary from the Order
 * enum and had no call sites at all. (#H-05)
 */

/**
 * Order totals are computed by services/orderPricingService.ts, which is
 * server-authoritative and handles tax, coupons and distance-based delivery.
 * The helper that used to live here hardcoded 18% GST and a Rs.50 flat shipping
 * fee and was never called. (#H-04)
 */
