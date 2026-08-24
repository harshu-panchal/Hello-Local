import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import {
  getOrderById,
  updateOrderStatus,
  type Order,
} from "../../../services/api/admin/adminOrderService";
import { useToast } from "../../../context/ToastContext";
import AssignDeliveryBoyModal from "../components/AssignDeliveryBoyModal";

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [updating, setUpdating] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  // Fetch order detail from API
  const fetchOrderDetail = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError("");
    try {
      const response = await getOrderById(id);
      if (response.success && response.data) {
        setOrder(response.data);
      } else {
        setError(response.message || "Failed to fetch order details");
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to fetch order details"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrderDetail();
  }, [fetchOrderDetail]);

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    if (!order || newStatus === order.status) return;

    setUpdating(true);
    try {
      const response = await updateOrderStatus(order._id, { status: newStatus });
      if (response.success && response.data) {
        setOrder(response.data);
        showToast(`Order status updated to "${newStatus}" successfully!`, "success");
      } else {
        showToast(response.message || "Failed to update order status", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to update order status", "error");
    } finally {
      setUpdating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-rose-700 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs font-semibold text-neutral-500">
            Loading order details #{id}...
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-neutral-200/80 space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900">
              {error ? "Error Loading Order" : "Order Not Found"}
            </h2>
            <p className="text-xs text-neutral-500 mt-1">{error || "This order record could not be found."}</p>
          </div>
          <button
            onClick={() => navigate("/admin/orders/all")}
            className="w-full bg-rose-700 hover:bg-rose-800 text-white py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const deliveryBoy = typeof order.deliveryBoy === "object" ? order.deliveryBoy : null;
  const items = Array.isArray(order.items) ? order.items : [];

  const statusOptions = [
    "Received",
    "Pending",
    "Processed",
    "Shipped",
    "Out for Delivery",
    "Delivered",
    "Cancelled",
    "Rejected",
    "Returned",
  ];

  const getStatusBadge = (orderStatus: string) => {
    switch (orderStatus) {
      case "Received":
      case "Pending":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Processed":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Shipped":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "Out for Delivery":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Delivered":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Cancelled":
      case "Rejected":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-neutral-50 text-neutral-700 border-neutral-200";
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/admin/orders/all")}
              className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
              title="Back to Orders"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
              Order #{order.orderNumber}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadge(
                order.status
              )}`}
            >
              {order.status}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Placed on {formatDate(order.orderDate)} • Payment: {order.paymentMethod} ({order.paymentStatus})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[44px] shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Invoice</span>
          </button>
          <button
            type="button"
            onClick={() => setAssignModalOpen(true)}
            className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[44px] shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <span>{deliveryBoy ? "Reassign Courier" : "Assign Courier"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Items & Address */}
        <div className="lg:col-span-8 space-y-6">
          {/* Order Items Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
            <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                Order Items ({items.length})
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                    <th className="py-3 px-4">Item Details</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-xs">
                  {items.map((item: any, idx: number) => {
                    const product = typeof item.product === "object" ? item.product : null;
                    const seller = typeof item.seller === "object" ? item.seller : null;

                    return (
                      <tr key={item._id || idx} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-neutral-900 text-xs">
                            {item.productName || product?.productName || "Product Item"}
                          </div>
                          {seller && (
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                              🏪 Store: <span className="font-semibold text-neutral-700">{seller.storeName || seller.sellerName}</span>
                            </div>
                          )}
                          {item.variation && (
                            <span className="inline-block mt-1 text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-mono">
                              Variant: {item.variation}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-neutral-800">
                          ₹{(item.unitPrice || 0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-neutral-700">
                          {item.quantity || 1}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-neutral-900">
                          ₹{(item.total || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delivery & Customer Address */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5 space-y-4">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 flex items-center gap-2">
              <span>📍 Delivery Destination</span>
            </h2>
            <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200/70 text-xs text-neutral-700 space-y-1.5">
              <div className="font-bold text-neutral-900 text-sm">{order.customerName}</div>
              <div className="font-mono text-neutral-600">📞 {order.customerPhone}</div>
              <p className="pt-1">{order.deliveryAddress?.address}</p>
              <p>
                {order.deliveryAddress?.city}, {order.deliveryAddress?.state || "State"} -{" "}
                <span className="font-mono font-bold">{order.deliveryAddress?.pincode}</span>
              </p>
              {order.deliveryAddress?.landmark && (
                <p className="text-neutral-500 pt-1">Landmark: {order.deliveryAddress.landmark}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Status Transition, Courier, Payment & Financial Breakdown */}
        <div className="lg:col-span-4 space-y-6">
          {/* Order Lifecycle Status Controller */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5 space-y-4">
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
              Manage Order Status
            </h2>
            <div>
              <label htmlFor="orderDetailStatusSelect" className="block text-[11px] font-bold text-neutral-700 mb-1">
                Advance / Update Status
              </label>
              <select
                id="orderDetailStatusSelect"
                value={order.status}
                onChange={(e) => handleStatusUpdate(e.target.value)}
                disabled={updating}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                {statusOptions.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              {updating && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 mt-2">
                  <div className="w-3 h-3 border-2 border-rose-700 border-t-transparent rounded-full animate-spin" />
                  <span>Updating status on server...</span>
                </div>
              )}
            </div>
          </div>

          {/* Delivery Boy Dispatch Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
                Assigned Courier
              </h2>
              <button
                type="button"
                onClick={() => setAssignModalOpen(true)}
                className="text-xs text-rose-700 hover:text-rose-800 font-bold"
              >
                {deliveryBoy ? "Change" : "+ Assign"}
              </button>
            </div>

            {deliveryBoy ? (
              <div className="bg-purple-50/60 rounded-xl p-3 border border-purple-100 text-xs space-y-1">
                <div className="font-bold text-purple-950 text-sm">{deliveryBoy.name}</div>
                <div className="text-neutral-600 font-mono">📞 {deliveryBoy.mobile}</div>
                {order.deliveryBoyStatus && (
                  <div className="text-[10px] font-bold text-purple-700 uppercase pt-1">
                    Courier Status: {order.deliveryBoyStatus}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-500">
                No courier assigned yet
              </div>
            )}
          </div>

          {/* Financial Breakdown Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5 space-y-3">
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider border-b border-neutral-100 pb-2">
              Financial Summary
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal:</span>
                <span className="font-mono font-semibold">₹{(order.subtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Tax:</span>
                <span className="font-mono font-semibold">₹{(order.tax || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery / Shipping:</span>
                <span className="font-mono font-semibold">₹{(order.shipping || 0).toFixed(2)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Discount {order.couponCode ? `(${order.couponCode})` : ""}:</span>
                  <span className="font-mono">-₹{(order.discount || 0).toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-neutral-200 pt-2 flex justify-between font-bold text-sm text-neutral-900">
                <span>Total Amount:</span>
                <span className="font-mono text-rose-700">₹{(order.total || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 text-xs text-neutral-500 space-y-1">
              <div>
                <span className="font-semibold text-neutral-700">Payment:</span> {order.paymentMethod}
              </div>
              <div>
                <span className="font-semibold text-neutral-700">Payment Status:</span>{" "}
                <span className="font-bold uppercase text-neutral-800">{order.paymentStatus}</span>
              </div>
              {order.paymentId && (
                <div className="font-mono text-[10px] text-neutral-400 break-all">
                  Ref: {order.paymentId}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assign Courier Modal */}
      <AssignDeliveryBoyModal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        orderId={order._id}
        orderNumber={order.orderNumber}
        currentDeliveryBoy={
          deliveryBoy ? { name: deliveryBoy.name, _id: deliveryBoy._id } : undefined
        }
        onAssignSuccess={() => {
          showToast("Courier assigned successfully!", "success");
          fetchOrderDetail();
        }}
      />

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quick-Commerce Order Fulfillment Center
      </footer>
    </div>
  );
}
