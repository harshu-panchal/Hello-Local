import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getOrderById, updateOrderStatus, OrderDetail } from '../../../services/api/orderService';
import jsPDF from 'jspdf';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerCard } from '../components/common/SellerCard';
import { SellerButton } from '../components/common/SellerButton';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';
import { useToast } from '../../../context/ToastContext';

export default function SellerOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

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
          const msg = response.message || 'Failed to fetch order details';
          setError(msg);
          showToast(msg, 'error');
        }
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || 'Failed to fetch order details';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetail();
  }, [id, showToast]);

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    if (!orderDetail) return;

    setUpdating(true);
    try {
      const response = await updateOrderStatus(orderDetail.id, { status: newStatus as any });
      if (response.success) {
        setOrderStatus(newStatus);
        setOrderDetail({ ...orderDetail, status: newStatus as any });
        showToast(`Order #${orderDetail.orderNumber} updated to ${newStatus}`, 'success');
      } else {
        showToast(response.message || 'Failed to update order status', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Failed to update order status', 'error');
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
    doc.text('HelloLocal — 10-Minute Network', margin + 5, yPos + 10);

    yPos += 20;

    // Company & Store Details
    const sellerStore = orderDetail.items[0]?.soldBy || 'Verified Merchant Store';
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(sellerStore, margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Sold By: ${sellerStore}`, margin, yPos);
    yPos += 6;
    doc.text('Platform: HelloLocal 10-Minute Quick Commerce', margin, yPos);
    yPos += 12;

    // Invoice Details
    const rightX = pageWidth - margin;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${formatDate(orderDetail.orderDate)}`, rightX, yPos - 25, { align: 'right' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Invoice #${orderDetail.invoiceNumber}`, rightX, yPos - 16, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Order ID: ${orderDetail.orderNumber}`, rightX, yPos - 9, { align: 'right' });
    doc.text(`Delivery Date: ${formatDate(orderDetail.deliveryDate)}`, rightX, yPos - 3, { align: 'right' });

    yPos += 10;
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
    const headers = ['Sr.', 'Product', 'Price', 'Tax', 'Qty', 'Subtotal'];

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    headers.forEach((header, index) => {
      doc.text(header, xPos + 2, yPos + 7);
      xPos += colWidths[index];
    });

    yPos += 12;

    // Table Rows
    orderDetail.items.forEach((item, index) => {
      checkPageBreak(15);
      xPos = margin;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');

      // Alternating row background
      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPos - 2, contentWidth, 10, 'F');
      }

      doc.text(item.srNo, xPos + 2, yPos + 5);
      xPos += colWidths[0];

      // Wrap product name if too long
      const productName = item.product.length > 25 ? item.product.substring(0, 25) + '...' : item.product;
      doc.text(productName, xPos + 2, yPos + 5);
      xPos += colWidths[1];

      doc.text(`Rs.${item.price.toFixed(2)}`, xPos + 2, yPos + 5);
      xPos += colWidths[2];

      doc.text(`Rs.${item.tax.toFixed(2)} (${item.taxPercent}%)`, xPos + 2, yPos + 5);
      xPos += colWidths[3];

      doc.text(item.qty.toString(), xPos + 2, yPos + 5);
      xPos += colWidths[4];

      doc.text(`Rs.${item.subtotal.toFixed(2)}`, xPos + 2, yPos + 5);

      yPos += 8;
    });

    yPos += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Totals Section
    checkPageBreak(30);
    const totalsX = pageWidth - margin - 80;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', totalsX, yPos);
    doc.text(`Rs.${orderDetail.subtotal.toFixed(2)}`, rightX, yPos, { align: 'right' });
    yPos += 6;

    doc.text('Tax (GST):', totalsX, yPos);
    doc.text(`Rs.${orderDetail.tax.toFixed(2)}`, rightX, yPos, { align: 'right' });
    yPos += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Total Amount:', totalsX, yPos);
    doc.text(`Rs.${orderDetail.grandTotal.toFixed(2)}`, rightX, yPos, { align: 'right' });

    // Save PDF
    doc.save(`Invoice_${orderDetail.invoiceNumber}.pdf`);
    showToast(`Invoice_${orderDetail.invoiceNumber}.pdf downloaded!`, 'success');
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-lg w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-slate-200 rounded-2xl" />
          <div className="h-40 bg-slate-200 rounded-2xl" />
        </div>
        <div className="h-64 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  if (error || !orderDetail) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 max-w-md mx-auto my-12 space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h2 className="text-lg font-bold text-slate-900">Error Loading Order</h2>
        <p className="text-xs sm:text-sm text-slate-600">{error || 'Order not found'}</p>
        <SellerButton variant="primary" size="md" onClick={() => navigate('/seller/orders')} fullWidth className="min-h-[44px]">
          Back to Orders
        </SellerButton>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header */}
      <SellerPageHeader
        title={`Order Details: ${orderDetail.orderNumber}`}
        subtitle={`Invoice #${orderDetail.invoiceNumber} • Placed on ${formatDate(orderDetail.orderDate)}`}
        breadcrumbs={[
          { label: 'Orders List', path: '/seller/orders' },
          { label: orderDetail.orderNumber },
        ]}
        action={
          <div className="flex items-center gap-2">
            <SellerButton
              variant="outline"
              size="md"
              onClick={handleExportPDF}
              className="min-h-[44px]"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              }
            >
              Export PDF Invoice
            </SellerButton>
            <SellerButton
              variant="secondary"
              size="md"
              onClick={() => navigate('/seller/orders')}
              className="min-h-[44px]"
            >
              Back to Orders
            </SellerButton>
          </div>
        }
      />

      {/* Main Order Meta Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer Info Card */}
        <SellerCard title="Customer Information">
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-400 block">Customer Name</span>
              <span className="font-bold text-slate-900 text-sm">{orderDetail.customerName || 'Walk-in Customer'}</span>
            </div>
            {orderDetail.customerPhone && (
              <div>
                <span className="text-slate-400 block">Mobile Phone</span>
                <span className="font-semibold text-slate-700">{orderDetail.customerPhone}</span>
              </div>
            )}
            {orderDetail.customerEmail && (
              <div>
                <span className="text-slate-400 block">Email Address</span>
                <span className="text-slate-600">{orderDetail.customerEmail}</span>
              </div>
            )}
          </div>
        </SellerCard>

        {/* Delivery & Fulfillment Card */}
        <SellerCard title="Delivery & Courier Details">
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-400 block">Delivery Address</span>
              <p className="font-medium text-slate-800 leading-relaxed">
                {(orderDetail.deliveryAddress as any)?.address ||
                  (orderDetail.deliveryAddress as any)?.city ||
                  'In-Store Handover'}
              </p>
            </div>
            {orderDetail.deliveryBoyName && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 block">Assigned Delivery Partner</span>
                <p className="font-bold text-slate-900">{orderDetail.deliveryBoyName}</p>
                {orderDetail.deliveryBoyPhone && (
                  <p className="text-slate-500">{orderDetail.deliveryBoyPhone}</p>
                )}
              </div>
            )}
          </div>
        </SellerCard>

        {/* Status Transition Control Card */}
        <SellerCard title="Fulfillment Status">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Current Status</span>
              <SellerStatusBadge status={orderStatus} size="sm" />
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Update Order Stage</label>
              <div className="flex items-center gap-2">
                <select
                  value={orderStatus}
                  disabled={updating}
                  onChange={(e) => handleStatusUpdate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 disabled:opacity-50 min-h-[44px]"
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
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-r-transparent flex-shrink-0" />
                )}
              </div>
            </div>
          </div>
        </SellerCard>
      </div>

      {/* Itemized Product Picking Table */}
      <SellerCard title={`Items in this Order (${orderDetail.items.length})`} padding="none">
        <div data-lenis-prevent="true" className="overflow-x-auto seller-scrollbar">
          <table className="w-full text-left text-xs min-w-[650px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5 w-12">#</th>
                <th className="px-4 py-3.5">Product Name</th>
                <th className="px-4 py-3.5">Unit / Variant</th>
                <th className="px-4 py-3.5 text-center">Qty</th>
                <th className="px-4 py-3.5 text-right">Unit Price</th>
                <th className="px-4 py-3.5 text-right">Tax (GST)</th>
                <th className="px-4 py-3.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderDetail.items.map((item, index) => (
                <tr key={index} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3.5 text-slate-400 font-bold">{item.srNo || index + 1}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{item.product}</td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium">{item.unit || 'Standard'}</td>
                  <td className="px-4 py-3.5 text-center font-black text-slate-900">{item.qty}</td>
                  <td className="px-4 py-3.5 text-right text-slate-700">₹{item.price.toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    ₹{item.tax.toFixed(2)} {item.taxPercent > 0 ? `(${item.taxPercent}%)` : ''}
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-slate-900">₹{item.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pricing Summary Breakdown */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <div className="w-72 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal:</span>
              <span className="font-bold text-slate-900">₹{orderDetail.subtotal.toFixed(2)}</span>
            </div>
            {orderDetail.tax > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax (GST):</span>
                <span className="font-bold text-slate-900">₹{orderDetail.tax.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
              <span>Grand Total:</span>
              <span className="text-base text-purple-700 font-black">₹{orderDetail.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </SellerCard>
    </div>
  );
}
