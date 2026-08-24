import AdminOrdersByStatus from "./AdminOrdersByStatus";

export default function AdminPendingOrders() {
  return <AdminOrdersByStatus status="Pending" exportSlug="pending" />;
}
