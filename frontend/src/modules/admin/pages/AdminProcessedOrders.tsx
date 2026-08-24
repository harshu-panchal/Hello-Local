import AdminOrdersByStatus from "./AdminOrdersByStatus";

export default function AdminProcessedOrders() {
  return <AdminOrdersByStatus status="Processed" exportSlug="processed" />;
}
