import AdminOrdersByStatus from "./AdminOrdersByStatus";

export default function AdminShippedOrders() {
  return <AdminOrdersByStatus status="Shipped" exportSlug="shipped" />;
}
