import React from 'react';
import { useNavigate } from 'react-router-dom';

interface SellerQuickActionsGridProps {
  onOpenMoreMenu?: () => void;
}

export default function SellerQuickActionsGrid({ onOpenMoreMenu }: SellerQuickActionsGridProps) {
  const navigate = useNavigate();

  const actions = [
    {
      label: 'POS Billing',
      badge: 'Fast',
      icon: (
        <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center text-lg border border-purple-100 shadow-2xs">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
            <line x1="7" y1="8" x2="17" y2="8"></line>
          </svg>
        </div>
      ),
      onClick: () => navigate('/seller/pos'),
    },
    {
      label: 'Bills & Invoices',
      icon: (
        <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-lg border border-indigo-100 shadow-2xs">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
        </div>
      ),
      onClick: () => navigate('/seller/bills'),
    },
    {
      label: 'Add Product',
      icon: (
        <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg border border-purple-100 shadow-2xs">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </div>
      ),
      onClick: () => navigate('/seller/product/add'),
    },
    {
      label: 'Orders',
      icon: (
        <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg border border-indigo-100 shadow-2xs">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
      ),
      onClick: () => navigate('/seller/orders'),
    },
    {
      label: 'Inventory',
      icon: (
        <div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center text-lg border border-violet-100 shadow-2xs">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
        </div>
      ),
      onClick: () => navigate('/seller/product/stock'),
    },
    {
      label: 'Payments',
      icon: (
        <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center text-lg border border-sky-100 shadow-2xs">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="14" x="2" y="5" rx="2" />
            <line x1="2" x2="22" y1="10" y2="10" />
          </svg>
        </div>
      ),
      onClick: () => navigate('/seller/wallet'),
    },
    {
      label: 'Store Profile',
      icon: (
        <div className="w-11 h-11 rounded-2xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center text-lg border border-fuchsia-100 shadow-2xs">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
          </svg>
        </div>
      ),
      onClick: () => navigate('/seller/profile'),
    },
    {
      label: 'Advertise / Ads',
      icon: (
        <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg border border-rose-100 shadow-2xs">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>
      ),
      onClick: () => navigate('/seller/ad-requests'),
    },
  ];

  return (
    <div className="w-full bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-black text-slate-900 tracking-tight">
          Quick Actions
        </h3>
        <span className="text-xs text-slate-400 font-semibold">Shortcuts</span>
      </div>

      {/* 4x2 Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-4 gap-2 sm:gap-3">
        {actions.map((act, idx) => (
          <button
            key={idx}
            onClick={act.onClick}
            className="group relative flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200/70 transition-all text-center select-none active:scale-95 min-h-[44px]"
          >
            {act.badge && (
              <span className="absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-md bg-purple-600 text-[9px] font-black text-white shadow-xs">
                {act.badge}
              </span>
            )}
            <div className="group-hover:scale-105 transition-transform duration-200">
              {act.icon}
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-slate-700 mt-2 tracking-tight group-hover:text-purple-600 transition-colors leading-tight line-clamp-1">
              {act.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
