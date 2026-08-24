import AdminOrdersByStatus from "./AdminOrdersByStatus";

export default function AdminCancelledOrders() {
  return <AdminOrdersByStatus status="Cancelled" exportSlug="cancelled" />;
}
