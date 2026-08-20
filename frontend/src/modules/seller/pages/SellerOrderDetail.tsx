import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getOrderById, updateOrderStatus, OrderDetail } from '../../../services/api/orderService';
import jsPDF from 'jspdf';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerCard } from '../components/common/SellerCard';
import { SellerButton } from '../components/common/SellerButton';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';
import { SellerSelect } from '../components/common/SellerSelect';

export default function SellerOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [orderStatus, setOrderStatus] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  // Fetch order detail from API
  useEffect(() => {
    const fetchOrderDetail = async () => {
      if (!id) return;

      setLoading(true);
      setError('');
      try {
        const response = await getOrderById(id);
        if (response.success && response.data) {
          setOrderDetail(response.data);
          setOrderStatus(response.data.status);
        } else {
          setError(response.message || 'Failed to fetch order details');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch order details');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetail();
  }, [id]);

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    if (!orderDetail) return;

    setUpdating(true);
    try {
      const response = await updateOrderStatus(orderDetail.id, { status: newStatus as any });
      if (response.success) {
        setOrderStatus(newStatus);
        setOrderDetail({ ...orderDetail, status: newStatus as any });
      } else {
        alert(response.message || 'Failed to update order status');
      }
    } catch (err: any) {
      console.error('Error updating order status:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update order status';
      alert(errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
    const day = date.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    let suffix = 'th';
    if (day === 1 || day === 21 || day === 31) suffix = 'st';
    else if (day === 2 || day === 22) suffix = 'nd';
    else if (day === 3 || day === 23) suffix = 'rd';
    return `${day}${suffix} ${month}, ${year}`;
  };

  const handleExportPDF = () => {
    if (!orderDetail) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;

    const checkPageBreak = (requiredHeight: number) => {
      if (yPos + requiredHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };

    // Header - Company Info
    doc.setFillColor(79, 57, 246); // Purple color
    doc.rect(margin, yPos, contentWidth, 15, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Hello Local - 10 Minute App', margin + 5, yPos + 10);

    yPos += 20;

    // Company Details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Hello Local - 10 Minute App', margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('From: Hello Local - 10 Minute App', margin, yPos);
    yPos += 6;
    doc.text('Phone: 8956656429', margin, yPos);
    yPos += 6;
    doc.text('Email: info@Hello Local.com', margin, yPos);
    yPos += 6;
    doc.text('Website: https://Hello Local.com', margin, yPos);
    yPos += 12;

    // Invoice Details
    const rightX = pageWidth - margin;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${formatDate(orderDetail.orderDate)}`, rightX, yPos - 30, { align: 'right' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Invoice #${orderDetail.invoiceNumber}`, rightX, yPos - 20, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Order ID: ${orderDetail.orderNumber}`, rightX, yPos - 14, { align: 'right' });
    doc.text(`Delivery Date: ${formatDate(orderDetail.deliveryDate)}`, rightX, yPos - 8, { align: 'right' });
    if (orderDetail.timeSlot && orderDetail.timeSlot !== 'N/A') {
      doc.text(`Time Slot: ${orderDetail.timeSlot}`, rightX, yPos - 2, { align: 'right' });
    }

    yPos += 15;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Table Header
    checkPageBreak(20);
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, yPos, contentWidth, 10, 'F');

    const colWidths = [
      contentWidth * 0.08,
      contentWidth * 0.40,
      contentWidth * 0.15,
      contentWidth * 0.15,
      contentWidth * 0.10,
      contentWidth * 0.12,
    ];

    let xPos = margin;
    const headers = ['Sr. No.', 'Product', 'Price', 'Tax Rs. (%)', 'Qty', 'Subtotal'];

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    headers.forEach((header, index) => {
      doc.text(header, xPos + 2, yPos + 7);
      xPos += colWidths[index];
    });

    yPos += 12;

    // Table Rows
    orderDetail.items.forEach((item) => {
      checkPageBreak(15);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      xPos = margin;
      const rowData = [
        item.srNo.toString(),
        item.product,
        `Rs.${item.price.toFixed(2)}`,
        `${item.tax.toFixed(2)} (${item.taxPercent.toFixed(2)}%)`,
        item.qty.toString(),
        `Rs.${item.subtotal.toFixed(2)}`,
      ];

      rowData.forEach((data, index) => {
        const maxWidth = colWidths[index] - 4;
        let text = data;
        if (doc.getTextWidth(text) > maxWidth && index === 1) {
          while (doc.getTextWidth(text + '...') > maxWidth && text.length > 0) {
            text = text.slice(0, -1);
          }
          text += '...';
        }
        doc.text(text, xPos + 2, yPos + 5);
        xPos += colWidths[index];
      });

      doc.setDrawColor(220, 220, 220);
      doc.line(margin, yPos + 8, pageWidth - margin, yPos + 8);
      yPos += 10;
    });

    // Totals
    const totalSubtotal = orderDetail.items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalTax = orderDetail.items.reduce((sum, item) => sum + item.tax, 0);
    const grandTotal = totalSubtotal + totalTax;

    yPos += 5;
    checkPageBreak(30);

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', pageWidth - margin - 60, yPos, { align: 'right' });
    doc.text(`Rs.${totalSubtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 7;

    doc.text('Tax:', pageWidth - margin - 60, yPos, { align: 'right' });
    doc.text(`Rs.${totalTax.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Grand Total:', pageWidth - margin - 60, yPos, { align: 'right' });
    doc.text(`Rs.${grandTotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 15;

    doc.save(`invoice_${orderDetail.invoiceNumber}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  const shortId = (val?: string) => {
    if (!val) return '—';
    if (val.length <= 10) return val;
    return `${val.slice(0, 6)}...${val.slice(-4)}`;
  };

  const formatUnit = (unitStr?: string) => {
    if (!unitStr) return '1 Unit';
    return unitStr;
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-slate-200 rounded-2xl w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-44 bg-slate-200 rounded-2xl" />
          <div className="h-44 bg-slate-200 rounded-2xl" />
          <div className="h-44 bg-slate-200 rounded-2xl" />
        </div>
        <div className="h-64 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  if (error || !orderDetail) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 text-center bg-white rounded-3xl border border-slate-200 space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h2 className="text-lg font-bold text-slate-900">Error Loading Order</h2>
        <p className="text-xs sm:text-sm text-slate-600">{error || "Order not found"}</p>
        <SellerButton variant="primary" size="md" onClick={() => navigate('/seller/orders')} fullWidth>
          Back to Orders
        </SellerButton>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title={`Order ${orderDetail.orderNumber}`}
        subtitle={`Placed on ${formatDate(orderDetail.orderDate)}`}
        breadcrumbs={[
          { label: "Orders", path: "/seller/orders" },
          { label: orderDetail.orderNumber },
        ]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <SellerButton
              variant="outline"
              size="md"
              onClick={handleExportPDF}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              }
            >
              Export PDF
            </SellerButton>
            <SellerButton
              variant="primary"
              size="md"
              onClick={handlePrint}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
              }
            >
              Print Invoice
            </SellerButton>
          </div>
        }
      />

      {/* 3-Column Order Summary & Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Order Status Card */}
        <SellerCard title="Fulfillment Status">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Current Status:</span>
              <SellerStatusBadge status={orderStatus} size="md" />
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Change Status:</label>
              <div className="flex items-center gap-2">
                <select
                  value={orderStatus}
                  disabled={updating}
                  onChange={(e) => handleStatusUpdate(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-purple-600 min-h-[44px]"
                >
                  <option value="Received">Received</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Processed">Processed</option>
                  <option value="On the way">On the way</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
                {updating && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-r-transparent" />
                )}
              </div>
            </div>
          </div>
        </SellerCard>

        {/* 2. Customer & Address Details */}
        <SellerCard title="Customer & Delivery">
          <div className="text-xs space-y-1.5 text-slate-700">
            <p className="font-bold text-sm text-slate-900">
              {orderDetail.customerName || (orderDetail as any).customer?.name || "Customer"}
            </p>
            {(orderDetail.customerPhone || (orderDetail as any).customer?.phone) && (
              <p className="text-slate-600">📞 {orderDetail.customerPhone || (orderDetail as any).customer?.phone}</p>
            )}
            {orderDetail.deliveryAddress && (
              <p className="text-slate-600 mt-1 leading-relaxed">
                📍 {orderDetail.deliveryAddress.address || (orderDetail.deliveryAddress as any).addressLine1 || ""}{" "}
                {orderDetail.deliveryAddress.city || ""} {orderDetail.deliveryAddress.pincode || ""}
              </p>
            )}
            <p className="text-slate-500 pt-1 text-[11px]">
              Delivery Date: <strong className="text-slate-800">{formatDate(orderDetail.deliveryDate)}</strong>
            </p>
          </div>
        </SellerCard>

        {/* 3. Invoice & Payment Summary */}
        <SellerCard title="Payment & Invoice">
          <div className="text-xs space-y-1.5 text-slate-700">
            <p className="text-slate-600">
              Invoice #{' '}
              <strong className="text-slate-900" title={orderDetail.invoiceNumber}>
                {shortId(orderDetail.invoiceNumber)}
              </strong>
            </p>
            <p className="text-slate-600">
              Payment Method:{' '}
              <strong className="text-slate-900 capitalize">
                {orderDetail.paymentMethod || 'Online'}
              </strong>
            </p>
            <p className="text-slate-600">
              Total Items:{' '}
              <strong className="text-slate-900">{orderDetail.items.length} items</strong>
            </p>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="font-bold text-slate-900">Grand Total:</span>
              <span className="text-base font-black text-purple-700">
                ₹{orderDetail.items.reduce((s, it) => s + it.subtotal + it.tax, 0).toFixed(2)}
              </span>
            </div>
          </div>
        </SellerCard>
      </div>

      {/* Product Items Table */}
      <SellerCard title={`Order Line Items (${orderDetail.items.length})`} padding="none">
        <div data-lenis-prevent="true" className="overflow-x-auto seller-scrollbar">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5 w-12">#</th>
                <th className="px-4 py-3.5">Product Name</th>
                <th className="px-4 py-3.5">Unit</th>
                <th className="px-4 py-3.5 text-right">Price</th>
                <th className="px-4 py-3.5 text-right">Tax ₹ (%)</th>
                <th className="px-4 py-3.5 text-center">Qty</th>
                <th className="px-4 py-3.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderDetail.items.map((item) => (
                <tr key={item.srNo} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3.5 text-slate-400 font-bold">{item.srNo}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{item.product}</td>
                  <td className="px-4 py-3.5 text-slate-600">{formatUnit(item.unit)}</td>
                  <td className="px-4 py-3.5 text-right text-slate-700">₹{item.price.toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    ₹{item.tax.toFixed(2)} ({item.taxPercent.toFixed(2)}%)
                  </td>
                  <td className="px-4 py-3.5 text-center font-black text-slate-900">{item.qty}</td>
                  <td className="px-4 py-3.5 text-right font-black text-slate-900">₹{item.subtotal.toFixed(2)}</td>
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
              <span className="font-bold text-slate-900">
                ₹{orderDetail.items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Tax:</span>
              <span className="font-bold text-slate-900">
                ₹{orderDetail.items.reduce((sum, item) => sum + item.tax, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
              <span>Grand Total:</span>
              <span className="text-base text-purple-700">
                ₹{(
                  orderDetail.items.reduce((sum, item) => sum + item.subtotal, 0) +
                  orderDetail.items.reduce((sum, item) => sum + item.tax, 0)
                ).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </SellerCard>
    </div>
  );
}
