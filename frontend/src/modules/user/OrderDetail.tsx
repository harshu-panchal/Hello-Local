import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { createReturnRequest } from "../../services/api/customerReturnService";
import { useToast } from "../../context/ToastContext";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOrders } from "../../hooks/useOrders";
import { OrderStatus } from "../../types/order";
import GoogleMapsTracking from "../../components/GoogleMapsTracking";
import { useDeliveryTracking } from "../../hooks/useDeliveryTracking";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import DeliveryPartnerCard from "../../components/DeliveryPartnerCard";
import {
  cancelOrder,
  updateOrderNotes,
  getSellerLocationsForOrder,
  refreshDeliveryOtp,
} from "../../services/api/customerOrderService";
import { UserImage } from "./components/common";
import { ArrowLeftIcon, LocationPinIcon, ClockIcon, ShieldCheckIcon, RefreshIcon, ShareIcon, TruckIcon } from "./components/common/UserIcons";

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const confirmed = searchParams.get("confirmed") === "true";
  const navigate = useNavigate();
  const { getOrderById, fetchOrderById } = useOrders();
  const [order, setOrder] = useState<any>(id ? getOrderById(id) : undefined);
  const [loading, setLoading] = useState(!order);

  const [showConfirmation, setShowConfirmation] = useState(confirmed);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>(
    order?.status || "Received"
  );
  const [estimatedTime, setEstimatedTime] = useState(29);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [showSpecialRequestsModal, setShowSpecialRequestsModal] = useState(false);

  useBodyScrollLock(
    showCancelModal ||
      showInstructionsModal ||
      showSpecialRequestsModal
  );

  // Form states
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");

  // Real-time delivery tracking via WebSocket
  const {
    deliveryLocation,
    eta,
    distance,
    status: trackingStatus,
    orderStatus: socketOrderStatus,
    isConnected,
    lastUpdate,
    error: trackingError,
    reconnectAttempts,
    reconnect,
  } = useDeliveryTracking(id);

  // Seller locations for the order
  const [sellerLocations, setSellerLocations] = useState<any[]>([]);
  const [loadingSellerLocations, setLoadingSellerLocations] = useState(false);

  // Fetch order if not in context
  useEffect(() => {
    const loadOrder = async () => {
      if (!id) return;

      const existingOrder = getOrderById(id);
      if (existingOrder) {
        setOrder(existingOrder);
        setOrderStatus(existingOrder.status);
        setLoading(false);
        return;
      }

      setLoading(true);
      const fetchedOrder = await fetchOrderById(id);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setOrderStatus(fetchedOrder.status);
      }
      setLoading(false);
    };

    loadOrder();
  }, [id, getOrderById, fetchOrderById]);

  // Fetch seller locations when order is loaded
  useEffect(() => {
    const fetchSellerLocations = async () => {
      if (!id || !order) return;

      const shouldFetch =
        order.status &&
        order.status !== "Delivered" &&
        order.status !== "Cancelled" &&
        order.status !== "Rejected" &&
        order.status !== "Picked up" &&
        order.status !== "Out for Delivery";

      if (shouldFetch) {
        try {
          setLoadingSellerLocations(true);
          const response = await getSellerLocationsForOrder(id);
          if (response.success && response.data) {
            setSellerLocations(response.data || []);
          }
        } catch (err) {
          console.error("Failed to fetch seller locations:", err);
        } finally {
          setLoadingSellerLocations(false);
        }
      }
    };

    fetchSellerLocations();
  }, [id, order?.status]);

  useEffect(() => {
    if (order) {
      setOrderStatus(order.status);
    }
  }, [order]);

  useEffect(() => {
    if (socketOrderStatus && socketOrderStatus !== orderStatus) {
      setOrderStatus(socketOrderStatus as OrderStatus);
      if (id) {
        fetchOrderById(id).then((fetchedOrder) => {
          if (fetchedOrder) {
            setOrder(fetchedOrder);
          }
        });
      }
    }
  }, [socketOrderStatus, orderStatus, id, fetchOrderById]);

  useEffect(() => {
    if (confirmed && order) {
      const timer1 = setTimeout(() => {
        setShowConfirmation(false);
        setOrderStatus("Accepted");
      }, 3000);
      return () => clearTimeout(timer1);
    }
  }, [confirmed, order]);

  useEffect(() => {
    if (orderStatus === "Accepted" || orderStatus === "On the way") {
      const timer = setInterval(() => {
        setEstimatedTime((prev) => Math.max(0, prev - 1));
      }, 60000);
      return () => clearInterval(timer);
    }
  }, [orderStatus]);

  const handleRefresh = async () => {
    if (!id) return;
    setIsRefreshing(true);
    const fetchedOrder = await fetchOrderById(id);
    if (fetchedOrder) {
      setOrder(fetchedOrder);
      setOrderStatus(fetchedOrder.status);
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleRefreshOtp = async () => {
    if (!id || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshDeliveryOtp(id);
      const fetchedOrder = await fetchOrderById(id);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setOrderStatus(fetchedOrder.status);
      }
    } catch (error) {
      console.error("Failed to refresh OTP:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `Order #${order?.id?.split("-").slice(-1)[0]}`,
      text: `Track my Hello Local order: Order #${order?.id?.split("-").slice(-1)[0]}`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("Link copied to clipboard!");
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const { showToast } = useToast();

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnItem, setReturnItem] = useState<any>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnQty, setReturnQty] = useState(1);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  const openReturnModal = (item: any) => {
    setReturnItem(item);
    setReturnQty(1);
    setReturnReason("");
    setReturnError(null);
    setShowReturnModal(true);
  };

  const handleSubmitReturn = async () => {
    if (!id || !returnItem) return;
    if (!returnReason.trim()) {
      setReturnError("Please tell us why you're returning this item.");
      return;
    }
    setReturnSubmitting(true);
    setReturnError(null);
    try {
      await createReturnRequest({
        orderId: id,
        orderItemId: returnItem._id || returnItem.id,
        quantity: returnQty,
        reason: returnReason.trim(),
      });
      setShowReturnModal(false);
      showToast("Return request submitted. We'll review it shortly.", "success");
      handleRefresh();
    } catch (err: any) {
      setReturnError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not submit the return request."
      );
    } finally {
      setReturnSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancellationReason.trim()) {
      alert("Please provide a cancellation reason");
      return;
    }
    if (!id) return;

    try {
      await cancelOrder(id, cancellationReason);
      setOrderStatus("Cancelled" as any);
      setShowCancelModal(false);
      alert("Order cancelled successfully");
      handleRefresh();
    } catch (error) {
      console.error("Error cancelling order:", error);
      alert("Failed to cancel order");
    }
  };

  const handleSaveInstructions = async () => {
    try {
      if (!id) return;
      await updateOrderNotes(id, { deliveryInstructions });
      setShowInstructionsModal(false);
      handleRefresh();
    } catch (error) {
      console.error("Failed to save instructions:", error);
      alert("Failed to save instructions");
    }
  };

  const handleSaveSpecialRequests = async () => {
    try {
      if (!id) return;
      await updateOrderNotes(id, { specialRequests });
      setShowSpecialRequestsModal(false);
      handleRefresh();
    } catch (error) {
      console.error("Failed to save special requests:", error);
      alert("Failed to save special requests");
    }
  };

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-[#FF5364] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs sm:text-sm font-bold text-slate-500">
            Loading order details...
          </p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md mx-auto text-center py-12 bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
          <div className="text-5xl mb-3">🔍</div>
          <h1 className="text-lg font-black text-slate-900 mb-2">Order Not Found</h1>
          <p className="text-xs text-slate-500 mb-6 font-medium">
            We couldn't locate this order. It may have been archived or removed.
          </p>
          <Link
            to="/orders"
            className="inline-block px-6 py-3 bg-gradient-to-r from-[#FF5364] to-[#FF2E7A] text-white font-black text-xs uppercase tracking-wider rounded-full shadow-xs"
          >
            Back to My Orders
          </Link>
        </div>
      </div>
    );
  }

  const shortOrderId = order.id?.split("-").slice(-1)[0] || order.id;
  const isTerminalOrder = ["Delivered", "Cancelled", "Rejected", "Returned"].includes(orderStatus);
  const isCancellable = ["Received", "Pending", "Accepted"].includes(orderStatus);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors touch-target-min"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Order #{shortOrderId}
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {order.items?.length || 0} items • ₹{(order.totalAmount || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleRefresh}
              className={`w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors touch-target-min ${
                isRefreshing ? "animate-spin" : ""
              }`}
              aria-label="Refresh status"
            >
              <RefreshIcon size={15} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors touch-target-min"
              aria-label="Share tracking"
            >
              <ShareIcon size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start space-y-3.5 lg:space-y-0">
          {/* Left Column: Tracking, Live Map, OTP, Delivery Partner & Items */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-3.5">
            {/* Status Header Banner */}
            <div className="bg-[#FF2E7A] rounded-2xl p-4 sm:p-5 text-white shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-rose-100 block mb-0.5">
                    Order Status
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                    {orderStatus}
                  </h2>
                  <p className="text-xs text-rose-100 font-medium mt-0.5">
                    {orderStatus === "Delivered"
                      ? "Order was delivered successfully"
                      : (orderStatus as string) === "Cancelled"
                      ? "This order was cancelled"
                      : `Estimated arrival in ~${estimatedTime} mins`}
                  </p>
                </div>
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white">
                  <TruckIcon size={22} />
                </div>
              </div>
            </div>

            {/* Live Delivery Tracking Map */}
            {!isTerminalOrder && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-2xs">
                <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LocationPinIcon size={16} className="text-[#FF2E7A]" />
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        Live Partner Tracking
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {isConnected ? "Live GPS Connected" : "Updating location..."}
                      </p>
                    </div>
                  </div>
                  {eta && (
                    <span className="text-xs font-bold text-[#FF2E7A] bg-[#FFF1F4] border border-[#FFE4EA] px-2.5 py-0.5 rounded-full">
                      ETA: {eta}
                    </span>
                  )}
                </div>

                <div className="h-[260px] sm:h-[300px] w-full relative">
                  <GoogleMapsTracking
                    customerLocation={{
                      lat: order.address?.latitude || 0,
                      lng: order.address?.longitude || 0,
                    }}
                    sellerLocations={sellerLocations.map((s: any) => ({
                      lat: s.latitude || s.lat || 0,
                      lng: s.longitude || s.lng || 0,
                      name: s.storeName || s.name,
                    }))}
                    deliveryLocation={deliveryLocation || undefined}
                    isTracking={isConnected}
                  />
                </div>
              </div>
            )}

            {/* Delivery OTP Card (if active delivery) */}
            {order.deliveryOtp && !isTerminalOrder && (
              <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A]">
                    <ShieldCheckIcon size={20} />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                      Delivery Confirmation OTP
                    </span>
                    <span className="text-lg font-bold text-slate-900 tracking-widest">
                      {order.deliveryOtp}
                    </span>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Share this OTP with partner upon doorstep delivery.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshOtp}
                  disabled={isRefreshing}
                  className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] bg-[#FFF1F4] px-2.5 py-1 rounded-full border border-[#FFE4EA] transition-colors touch-target-min"
                >
                  Refresh OTP
                </button>
              </div>
            )}

            {/* Delivery Partner Card */}
            {order.deliveryBoy && (
              <DeliveryPartnerCard
                partner={order.deliveryBoy || null}
                eta={typeof eta === "number" ? eta : 0}
                distance={distance || 0}
                isTracking={isConnected}
                deliveryOtp={order.deliveryOtp}
              />
            )}

            {/* Order Items Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 pb-2.5 border-b border-slate-100 flex items-center justify-between">
                <span>Ordered Items ({order.items?.length || 0})</span>
                <Link
                  to={`/invoice/${order.id}`}
                  className="text-xs font-bold text-[#FF2E7A] hover:underline"
                >
                  View Invoice ▸
                </Link>
              </h3>

              <div className="divide-y divide-slate-100 pt-0.5">
                {order.items?.map((item: any, idx: number) => {
                  const prod = item.product || item;
                  const unitPrice = item.price || prod.price || 0;
                  const quantity = item.quantity || 1;
                  const itemTotal = unitPrice * quantity;

                  return (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center p-1 flex-shrink-0">
                          <UserImage
                            src={prod.imageUrl || prod.mainImage}
                            alt={prod.name || "Product"}
                            categoryFallback="grocery"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                            {prod.name || prod.productName || "Product Item"}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {quantity} × ₹{unitPrice.toLocaleString("en-IN")} • {prod.pack || "Standard"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-bold text-slate-900 block">
                          ₹{itemTotal.toLocaleString("en-IN")}
                        </span>

                        {/* Return Action for delivered orders */}
                        {orderStatus === "Delivered" && (
                          <button
                            type="button"
                            onClick={() => openReturnModal(item)}
                            className="text-[10px] font-bold text-[#FF2E7A] hover:underline mt-0.5"
                          >
                            Return Item
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Address, Bill Details & Cancel Action */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-3.5 lg:sticky lg:top-20">
            {/* Address Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs">
              <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <LocationPinIcon size={14} className="text-[#FF2E7A]" />
                <span>Delivery Address</span>
              </h4>
              <div className="text-xs text-slate-600 space-y-0.5">
                <p className="font-bold text-slate-900">{order.address?.name}</p>
                <p className="text-slate-400 font-medium">{order.address?.phone}</p>
                <p className="leading-relaxed text-slate-600">
                  {order.address?.flat ? `${order.address.flat}, ` : ""}
                  {order.address?.street || order.address?.address}
                  {order.address?.landmark && `, Near ${order.address.landmark}`}
                  {order.address?.city && `, ${order.address.city}`}
                  {order.address?.pincode && ` - ${order.address.pincode}`}
                </p>
              </div>
            </div>

            {/* Payment & Bill Summary */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs space-y-1.5 text-xs">
              <h4 className="text-xs font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>Payment Details</span>
                <span className="font-bold text-slate-500 uppercase text-[9px]">
                  {order.paymentMethod || "Online"}
                </span>
              </h4>

              <div className="flex justify-between text-slate-600 font-medium">
                <span>Subtotal</span>
                <span className="font-bold text-slate-900">₹{(order.subtotal || 0).toLocaleString("en-IN")}</span>
              </div>

              {order.fees?.platformFee > 0 && (
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Platform Fee</span>
                  <span className="font-bold text-slate-900">₹{order.fees.platformFee}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600 font-medium">
                <span>Delivery Charge</span>
                <span className={`font-bold ${order.fees?.deliveryFee === 0 ? "text-[#16A34A]" : "text-slate-900"}`}>
                  {order.fees?.deliveryFee === 0 ? "FREE" : `₹${order.fees?.deliveryFee || 0}`}
                </span>
              </div>

              {order.tipAmount > 0 && (
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Delivery Tip</span>
                  <span className="font-bold text-slate-900">₹{order.tipAmount}</span>
                </div>
              )}

              {order.giftPackaging && (
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Gift Packaging</span>
                  <span className="font-bold text-slate-900">₹30</span>
                </div>
              )}

              <div className="border-t border-slate-100 pt-2 flex justify-between items-baseline font-bold text-xs text-slate-900">
                <span>Total Paid</span>
                <span className="text-sm font-bold text-[#FF2E7A]">
                  ₹{(order.totalAmount || 0).toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Order Actions: Cancel */}
            {isCancellable && (
              <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Need to cancel?</h4>
                  <p className="text-[10px] text-slate-400 font-medium">
                    You can cancel before store dispatch.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] bg-[#FFF1F4] px-3 py-1 rounded-full border border-[#FFE4EA] transition-colors touch-target-min"
                >
                  Cancel Order
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancellation Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl border border-slate-100"
            >
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Cancel Order #{shortOrderId}
              </h3>
              <p className="text-xs text-slate-500 mb-3 font-medium">
                Please tell us the reason for cancelling this order.
              </p>

              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Write reason here (e.g. ordered by mistake, change of delivery address)"
                className="w-full h-20 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 resize-none mb-3"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
                >
                  Keep Order
                </button>
                <button
                  type="button"
                  onClick={handleCancelOrder}
                  className="flex-1 py-2 text-xs font-bold text-white bg-[#FF2E7A] rounded-full shadow-xs hover:bg-[#E02269] transition-colors"
                >
                  Confirm Cancellation
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Return Request Modal */}
      <AnimatePresence>
        {showReturnModal && returnItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl border border-slate-100"
            >
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Request Item Return
              </h3>
              <p className="text-xs text-slate-500 mb-2.5 font-medium">
                {returnItem.product?.name || "Selected Item"}
              </p>

              <div className="space-y-2.5 mb-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Return Quantity
                  </label>
                  <input
                    type="number"
                    value={returnQty}
                    onChange={(e) =>
                      setReturnQty(Math.min(returnItem.quantity || 1, Math.max(1, Number(e.target.value))))
                    }
                    min="1"
                    max={returnItem.quantity || 1}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Reason for Return
                  </label>
                  <textarea
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="e.g. Quality issue, wrong item received, damaged packaging"
                    className="w-full h-18 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white resize-none"
                  />
                </div>

                {returnError && (
                  <p className="text-xs text-[#FF2E7A] bg-[#FFF1F4] p-1.5 rounded-lg">
                    {returnError}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  disabled={returnSubmitting}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitReturn}
                  disabled={returnSubmitting}
                  className="flex-1 py-2 text-xs font-bold text-white bg-[#FF2E7A] rounded-full shadow-xs hover:bg-[#E02269]"
                >
                  {returnSubmitting ? "Submitting..." : "Submit Return"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
