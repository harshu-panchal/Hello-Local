import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useOrders } from "../../hooks/useOrders";
import { UserImage } from "./components/common";
import { ArrowLeftIcon, PrinterIcon } from "./components/common/UserIcons";

export default function Invoice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getOrderById, fetchOrderById } = useOrders();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrder = async () => {
      if (!id) return;

      const existingOrder = getOrderById(id);
      if (existingOrder) {
        setOrder(existingOrder);
        setLoading(false);
        return;
      }

      setLoading(true);
      const fetchedOrder = await fetchOrderById(id);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
      }
      setLoading(false);
    };

    loadOrder();
  }, [id, getOrderById, fetchOrderById]);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-10 h-10 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-500">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md mx-auto text-center py-10 bg-white rounded-2xl p-6 border border-slate-100 shadow-2xs">
          <h1 className="text-base font-bold text-slate-900 mb-1.5">Invoice Not Found</h1>
          <p className="text-xs text-slate-500 mb-5 font-medium">
            Could not retrieve invoice for this order.
          </p>
          <Link
            to="/orders"
            className="inline-block px-5 py-2.5 bg-[#FF2E7A] text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-xs hover:bg-[#E02269]"
          >
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = order.subtotal || 0;
  const deliveryFee = order.fees?.deliveryFee || 0;
  const platformFee = order.fees?.platformFee || 0;
  const totalAmount = order.totalAmount || subtotal + deliveryFee + platformFee;
  const shortId = order.id?.split("-").slice(-1)[0] || order.id || "N/A";

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Sticky Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-30 print:hidden shadow-2xs">
        <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors touch-target-min"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              Invoice #{shortId}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 touch-target-min"
            >
              <PrinterIcon size={14} />
              <span>Print</span>
            </button>
            <Link
              to={`/orders/${order.id}`}
              className="px-3.5 py-1.5 bg-[#FF2E7A] text-white rounded-full text-xs font-bold shadow-xs hover:bg-[#E02269] transition-colors touch-target-min"
            >
              View Order
            </Link>
          </div>
        </div>
      </div>

      {/* Invoice Paper Document */}
      <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-5 print:p-0">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs print:shadow-none print:border-none p-5 sm:p-8">
          {/* Brand Header */}
          <div className="border-b border-slate-100 pb-5 mb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1">
                <span className="text-xl font-bold tracking-tight text-[#FF8A00]">Hello</span>
                <span className="text-xl font-bold tracking-tight text-[#FF2E7A]">Local</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Hyperlocal Community Marketplace
              </p>
              <span className="inline-block mt-2 text-[9px] font-bold uppercase tracking-wider bg-[#FFF1F4] text-[#FF2E7A] px-2 py-0.5 rounded-full border border-[#FFE4EA]">
                Tax Invoice / Bill of Supply
              </span>
            </div>

            <div className="sm:text-right text-xs space-y-0.5 text-slate-600 font-medium">
              <p>
                <span className="text-slate-400">Invoice No:</span>{" "}
                <strong className="text-slate-900 font-bold">#{shortId}</strong>
              </p>
              <p>
                <span className="text-slate-400">Date:</span>{" "}
                <span className="text-slate-900">{order.createdAt ? formatDate(order.createdAt) : "N/A"}</span>
              </p>
              <p>
                <span className="text-slate-400">Payment:</span>{" "}
                <span className="text-slate-900 uppercase font-bold">{order.paymentMethod || "Online"}</span>
              </p>
            </div>
          </div>

          {/* Customer Bill To & Order Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-xs">
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
              <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px] mb-1.5">
                Billed To
              </h3>
              <p className="font-bold text-slate-900">{order.address?.name || "Customer"}</p>
              <p className="text-slate-500">{order.address?.phone || ""}</p>
              <p className="text-slate-600 mt-1 leading-relaxed">
                {order.address?.flat ? `${order.address.flat}, ` : ""}
                {order.address?.street || order.address?.address || ""}
                {order.address?.landmark && `, Near ${order.address.landmark}`}
                {order.address?.city && `, ${order.address.city}`}
                {order.address?.pincode && ` - ${order.address.pincode}`}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-1">
              <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px] mb-1.5">
                Order Metadata
              </h3>
              <p className="text-slate-600">
                <span className="text-slate-400 font-medium">Order ID:</span>{" "}
                <span className="font-mono text-slate-900">{order.id}</span>
              </p>
              <p className="text-slate-600">
                <span className="text-slate-400 font-medium">Status:</span>{" "}
                <span className="font-bold text-[#16A34A]">{order.status || "Placed"}</span>
              </p>
              {order.gstin && (
                <p className="text-slate-600">
                  <span className="text-slate-400 font-medium">Customer GSTIN:</span>{" "}
                  <span className="font-bold font-mono text-slate-900">{order.gstin}</span>
                </p>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-bold text-[9px] tracking-wider">
                  <th className="py-2.5 px-2.5">Item Details</th>
                  <th className="py-2.5 px-2.5 text-center">Qty</th>
                  <th className="py-2.5 px-2.5 text-right">Unit Price</th>
                  <th className="py-2.5 px-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items?.map((item: any, idx: number) => {
                  const prod = item.product || item;
                  const unitPrice = item.price || prod.price || 0;
                  const quantity = item.quantity || 1;
                  const itemTotal = item.total || unitPrice * quantity;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center p-0.5 flex-shrink-0">
                            <UserImage
                              src={prod.imageUrl || prod.mainImage}
                              alt={prod.name || "Product"}
                              categoryFallback="grocery"
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">
                              {prod.name || prod.productName || "Product"}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              {prod.pack || item.variant || "Standard"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-bold text-slate-700">
                        {quantity}
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-slate-600">
                        {formatCurrency(unitPrice)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-bold text-slate-900">
                        {formatCurrency(itemTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bill Summary */}
          <div className="flex justify-end mb-6">
            <div className="w-full sm:w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Subtotal</span>
                <span className="font-bold text-slate-900">{formatCurrency(subtotal)}</span>
              </div>
              {platformFee > 0 && (
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Platform Fee</span>
                  <span className="font-bold text-slate-900">{formatCurrency(platformFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Delivery Charge</span>
                <span className={`font-bold ${deliveryFee === 0 ? "text-[#16A34A]" : "text-slate-900"}`}>
                  {deliveryFee === 0 ? "FREE" : formatCurrency(deliveryFee)}
                </span>
              </div>
              {order.tipAmount > 0 && (
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Delivery Tip</span>
                  <span className="font-bold text-slate-900">{formatCurrency(order.tipAmount)}</span>
                </div>
              )}
              {order.giftPackaging && (
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Gift Packaging</span>
                  <span className="font-bold text-slate-900">{formatCurrency(30)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline font-bold text-xs text-slate-900">
                <span>Grand Total</span>
                <span className="text-sm font-bold text-[#FF2E7A]">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="border-t border-slate-100 pt-4 text-center text-[10px] text-slate-400 space-y-0.5">
            <p className="font-bold text-slate-600">Thank you for shopping local!</p>
            <p>This is a computer-generated invoice and requires no physical signature.</p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            margin: 1cm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
