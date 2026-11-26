/**
 * Seller fulfilment stage helpers, shared by the order lifecycle and the
 * internal shipment service. Moved verbatim out of orderLifecycleService so
 * shipments can derive seller progress without a circular import; the
 * lifecycle service re-exports them unchanged.
 */
export const stages = ["Received", "Accepted", "Processed", "Shipped"];

export function sellerStage(items: any[], order: any): string {
  const active = items.filter(item => item.status !== "Cancelled");
  if (!active.length) return "Cancelled";
  if (!stages.includes(order.status) && order.status !== "Pending") return order.status;
  return stages[Math.min(...active.map(item => {
    const stage = item.fulfillmentStatus || (stages.includes(order.status) ? order.status : "Received");
    return Math.max(0, stages.indexOf(stage));
  }))];
}
