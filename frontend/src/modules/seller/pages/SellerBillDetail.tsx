import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBillById, BillData } from "../../../services/api/orderService";
import { PrintableBillModal } from "../components/PrintableBillModal";
import { SellerPageHeader } from "../components/common/SellerPageHeader";
import { SellerCard } from "../components/common/SellerCard";
import { SellerButton } from "../components/common/SellerButton";
import { SellerStatusBadge } from "../components/common/SellerStatusBadge";
import { useToast } from "../../../context/ToastContext";

export default function SellerBillDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [bill, setBill] = useState<BillData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    const fetchBill = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getBillById(id);
        if (res.success && res.data) {
          setBill(res.data);
        } else {
          const msg = res.message || "Failed to fetch bill details";
          setError(msg);
          showToast(msg, "error");
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || "Failed to fetch bill details";
        setError(msg);
        showToast(msg, "error");
      } finally {
        setLoading(false);
      }
    };
    fetchBill();
  }, [id, showToast]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-slate-200 rounded-2xl w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-slate-200 rounded-2xl" />
          <div className="h-40 bg-slate-200 rounded-2xl" />
        </div>
        <div className="h-64 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 max-w-md mx-auto my-12 space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h2 className="text-lg font-bold text-slate-900">Error Loading Bill</h2>
        <p className="text-xs sm:text-sm text-slate-600">{error || "Bill not found"}</p>
        <SellerButton variant="primary" size="md" onClick={() => navigate("/seller/bills")} fullWidth className="min-h-[44px]">
          Back to Bills
        </SellerButton>
      </div>
    );
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <SellerPageHeader
        title={`Bill #${bill.billNumber || (bill as any).orderId?.slice(-6).toUpperCase() || (bill as any)._id?.slice(-6).toUpperCase() || 'Bill'}`}
        subtitle={`Created: ${formatDate((bill as any).orderDate || (bill as any).date || (bill as any).createdAt)}`}
        breadcrumbs={[
          { label: "Bills & Invoices", path: "/seller/bills" },
          { label: `#${bill.billNumber || "Bill"}` },
        ]}
        action={
          <SellerButton
            variant="primary"
            size="md"
            onClick={() => setIsPrintModalOpen(true)}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
            }
          >
            Print / Download Bill
          </SellerButton>
        }
      />

      {/* Store & Customer Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Store Info */}
        <SellerCard title="Seller Store Details">
          <div className="text-xs space-y-1.5 text-slate-800">
            <p className="font-bold text-sm text-slate-900">{bill.seller?.storeName || "Store"}</p>
            {bill.seller?.address && <p className="text-slate-600">📍 {bill.seller.address}</p>}
            {bill.seller?.phone && <p className="text-slate-600">📞 Phone: {bill.seller.phone}</p>}
            {bill.seller?.email && <p className="text-slate-600">✉️ Email: {bill.seller.email}</p>}
            {bill.seller?.gstin && <p className="font-bold text-purple-700">GSTIN: {bill.seller.gstin}</p>}
          </div>
        </SellerCard>

        {/* Customer Info */}
        <SellerCard title="Customer & Payment">
          <div className="text-xs space-y-2 text-slate-800">
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm text-slate-900">{bill.customer?.name || "Walk-in Customer"}</p>
              <SellerStatusBadge status={bill.payment.status || "Paid"} size="sm" />
            </div>
            {bill.customer?.phone && <p className="text-slate-600">📞 Phone: {bill.customer.phone}</p>}
            <p className="text-slate-700">
              Payment Mode: <span className="font-bold text-slate-900">{bill.payment.method}</span>
            </p>
            {bill.payment.method === "Cash" && (bill.payment.receivedAmount || 0) > 0 && (
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
                Cash Received: ₹{(bill.payment.receivedAmount || 0).toFixed(2)} | Change: ₹
                {(bill.payment.changeReturned || 0).toFixed(2)}
              </div>
            )}
          </div>
        </SellerCard>
      </div>

      {/* Line Items Table */}
      <SellerCard title={`Purchased Items (${bill.items.length})`} padding="none">
        <div data-lenis-prevent="true" className="overflow-x-auto seller-scrollbar">
          <table className="w-full text-left text-xs min-w-[650px]">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5 w-12">#</th>
                <th className="px-4 py-3.5">Product Name</th>
                <th className="px-4 py-3.5">Variant</th>
                <th className="px-4 py-3.5 text-center">Qty</th>
                <th className="px-4 py-3.5 text-right">Unit Price</th>
                <th className="px-4 py-3.5 text-right">Tax Rate</th>
                <th className="px-4 py-3.5 text-right">Tax Amount</th>
                <th className="px-4 py-3.5 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bill.items.map((it, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-slate-400 font-bold">{it.srNo || idx + 1}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{it.product || it.productName}</td>
                  <td className="px-4 py-3 text-slate-600">{it.unit || it.variantTitle || "Standard"}</td>
                  <td className="px-4 py-3 text-center font-black text-slate-800">{it.qty || it.quantity}</td>
                  <td className="px-4 py-3 text-right text-slate-700">₹{(it.price || it.unitPrice || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{it.taxRate ? `${it.taxRate}%` : "0%"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">₹{(it.taxAmount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900">₹{(it.total || it.subtotal || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pricing Summary Footer */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-200 flex justify-end">
          <div className="w-72 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-bold text-slate-900">₹{bill.pricing.subtotal.toFixed(2)}</span>
            </div>
            {bill.pricing.tax > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Total Tax (GST):</span>
                <span className="font-bold text-slate-900">₹{bill.pricing.tax.toFixed(2)}</span>
              </div>
            )}
            {(bill.pricing.discount || 0) > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Discount:</span>
                <span>-₹{(bill.pricing.discount || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
              <span>Grand Total:</span>
              <span className="text-base text-purple-700">₹{bill.pricing.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </SellerCard>

      <PrintableBillModal
        bill={bill}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />
    </div>
  );
}
