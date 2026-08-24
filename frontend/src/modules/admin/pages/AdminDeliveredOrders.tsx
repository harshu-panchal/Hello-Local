import AdminOrdersByStatus from "./AdminOrdersByStatus";

export default function AdminDeliveredOrders() {
  return <AdminOrdersByStatus status="Delivered" exportSlug="delivered" />;
}
