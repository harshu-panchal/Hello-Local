import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SellerStatusBadge } from './common/SellerStatusBadge';

interface SellerRecentOrdersFeedProps {
  orders?: any[];
}

export default function SellerRecentOrdersFeed({ orders = [] }: SellerRecentOrdersFeedProps) {
  const navigate = useNavigate();

  const displayOrders = orders && orders.length > 0 ? orders.slice(0, 5) : [];

  return (
    <div className="w-full space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-black text-slate-900 tracking-tight">
          Recent Orders
        </h3>
        {displayOrders.length > 0 && (
          <button
            onClick={() => navigate('/seller/orders')}
            className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-0.5 min-h-[36px] py-1 px-2 rounded-lg hover:bg-purple-50 transition-colors"
          >
            <span>View All</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Orders List / Empty State */}
      {displayOrders.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-3 shadow-2xs">
          <span className="text-3xl">🛍️</span>
          <h4 className="text-sm font-bold text-slate-800">No recent orders yet</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            When nearby customers place orders or you create in-store POS bills, they will appear here in real time.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={() => navigate('/seller/pos')}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all min-h-[40px]"
            >
              ⚡ Open POS Billing
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayOrders.map((ord: any, idx: number) => {
            const orderId = ord.orderId || ord._id || ord.orderNumber || `#HL${78560 + idx}`;
            const formattedId = ord.orderNumber || (orderId.startsWith('#') ? orderId : `#${orderId.slice(-6).toUpperCase()}`);
            const customerName = ord.customerName || ord.userName || (ord.user ? `${ord.user.firstName || ''} ${ord.user.lastName || ''}`.trim() : 'Customer');
            const time = ord.time || (ord.createdAt ? new Date(ord.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Today');
            const itemsCount = ord.itemsCount || (ord.items ? ord.items.length : 1);
            const totalAmount = ord.totalAmount || ord.total || 0;
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
                    {(customerName || 'C').charAt(0).toUpperCase()}
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
                <div className="text-right flex-shrink-0 space-y-0.5">
                  <span className="text-xs sm:text-sm font-black text-slate-900">
                    ₹{Number(totalAmount).toLocaleString('en-IN')}
                  </span>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
