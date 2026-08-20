import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SellerStatusBadge } from './common/SellerStatusBadge';

interface SellerRecentOrdersFeedProps {
  orders?: any[];
}

export default function SellerRecentOrdersFeed({ orders = [] }: SellerRecentOrdersFeedProps) {
  const navigate = useNavigate();

  const defaultOrders = [
    {
      _id: 'HL78562',
      orderNumber: '#HL78562',
      customerName: 'Rohit Kumar',
      time: '10 Aug, 11:30 AM',
      itemsCount: 3,
      totalAmount: 560,
      status: 'Completed',
    },
    {
      _id: 'HL78561',
      orderNumber: '#HL78561',
      customerName: 'Neha Singh',
      time: '10 Aug, 10:15 AM',
      itemsCount: 2,
      totalAmount: 320,
      status: 'Preparing',
    },
    {
      _id: 'HL78560',
      orderNumber: '#HL78560',
      customerName: 'Amit Patel',
      time: '10 Aug, 09:45 AM',
      itemsCount: 5,
      totalAmount: 980,
      status: 'Completed',
    },
  ];

  const displayOrders = orders && orders.length > 0 ? orders.slice(0, 5) : defaultOrders;

  return (
    <div className="w-full space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-black text-slate-900 tracking-tight">
          Recent Orders
        </h3>
        <button
          onClick={() => navigate('/seller/orders')}
          className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-0.5 min-h-[36px] py-1 px-2 rounded-lg hover:bg-purple-50 transition-colors"
        >
          <span>View All</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Orders List */}
      <div className="space-y-2.5">
        {displayOrders.map((ord: any, idx: number) => {
          const orderId = ord.orderId || ord._id || ord.orderNumber || `#HL${78560 + idx}`;
          const formattedId = ord.orderNumber || (orderId.startsWith('#') ? orderId : `#${orderId.slice(-6).toUpperCase()}`);
          const customerName = ord.customerName || ord.userName || (ord.user ? `${ord.user.firstName || ''} ${ord.user.lastName || ''}`.trim() : 'Customer');
          const time = ord.time || (ord.createdAt ? new Date(ord.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Today');
          const itemsCount = ord.itemsCount || (ord.items ? ord.items.length : 2);
          const totalAmount = ord.totalAmount || ord.total || 450;
          const status = ord.status || 'Received';

          return (
            <div
              key={ord._id || idx}
              onClick={() => navigate('/seller/orders')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs hover:shadow-xs hover:border-purple-200 transition-all active:scale-[0.99] cursor-pointer flex items-center justify-between gap-3 group"
            >
              {/* Left: Avatar + Info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-100 to-indigo-50 border border-purple-200 flex items-center justify-center text-sm font-black text-purple-700 flex-shrink-0">
                  {customerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-900 truncate">
                      {formattedId}
                    </span>
                    <SellerStatusBadge status={status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-600 font-medium truncate">
                    {customerName}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {time}
                  </p>
                </div>
              </div>

              {/* Right: Amount & Item Count */}
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-black text-slate-900">
                  ₹{Number(totalAmount).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                  {itemsCount} {itemsCount === 1 ? 'Item' : 'Items'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
