import AdminOrdersByStatus from "./AdminOrdersByStatus";

export default function AdminReceivedOrders() {
  return <AdminOrdersByStatus status="Received" exportSlug="received" />;
}
