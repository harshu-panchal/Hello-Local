import { Link, useNavigate } from 'react-router-dom';
import { useOrders } from '../../hooks/useOrders';
import { UserImage, UserEmptyState } from './components/common';
import { ArrowLeftIcon, OrdersNavIcon, ChevronRightIcon } from './components/common/UserIcons';

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'Delivered':
      return { label: 'Delivered', bg: 'bg-emerald-50 text-[#16A34A] border-emerald-200' };
    case 'On the way':
    case 'Out for Delivery':
    case 'Shipped':
      return { label: 'Out for Delivery', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'Accepted':
    case 'Processed':
      return { label: 'Preparing', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'Cancelled':
    case 'Rejected':
      return { label: 'Cancelled', bg: 'bg-[#FFF1F4] text-[#FF2E7A] border-[#FFE4EA]' };
    case 'Received':
    case 'Pending':
    default:
      return { label: 'Order Placed', bg: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
};

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

export default function Orders() {
  const { orders } = useOrders();
  const navigate = useNavigate();

  if (orders.length === 0) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 bg-[#F8FAFC]">
        <UserEmptyState
          icon={<OrdersNavIcon size={32} className="text-[#FF2E7A]" />}
          title="No orders yet"
          description="Looks like you haven't placed any orders yet. Discover fresh local products from nearby stores."
          actionText="Start Shopping"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

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
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                My Orders
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          {orders.map((order) => {
            const shortId = order.id.split('-').slice(-1)[0];
            const badge = getStatusBadge(order.status);
            const previewItems = (order.items || []).slice(0, 4);

            return (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
              >
                {/* Order Header */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          Order #{shortId}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          • {order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Thumbnail Row */}
                  <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar py-0.5">
                    {previewItems.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center p-1 flex-shrink-0 overflow-hidden"
                      >
                        <UserImage
                          src={item.product?.imageUrl || item.product?.mainImage}
                          alt={item.product?.name || 'Ordered product'}
                          categoryFallback="grocery"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ))}
                    {(order.items?.length || 0) > 4 && (
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-[11px] font-bold text-slate-600 flex-shrink-0">
                        +{(order.items?.length || 0) - 4}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider block">
                      Total Amount
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-slate-900">
                      ₹{(order.totalAmount || (order as any).total || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-bold text-[#FF2E7A] group-hover:translate-x-0.5 transition-transform">
                    <span>View Details</span>
                    <ChevronRightIcon size={12} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
