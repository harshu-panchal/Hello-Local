import React from 'react';
import { useNavigate } from 'react-router-dom';

interface SellerQuickActionsGridProps {
  onOpenMoreMenu?: () => void;
}

export default function SellerQuickActionsGrid({ onOpenMoreMenu }: SellerQuickActionsGridProps) {
  const navigate = useNavigate();

  const shortcuts = [
    {
      label: 'Add Product',
      path: '/seller/product/add',
      bgColor: 'bg-[#FAF5FF] border-[#E9D5FF] text-[#9333EA]',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
    },
    {
      label: 'Orders',
      path: '/seller/orders',
      bgColor: 'bg-[#EEF2FF] border-[#C7D2FE] text-[#4F46E5]',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      label: 'Inventory',
      path: '/seller/product/stock',
      bgColor: 'bg-[#F5F3FF] border-[#DDD6FE] text-[#7C3AED]',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ),
    },
    {
      label: 'Payments',
      path: '/seller/wallet',
      bgColor: 'bg-[#ECFEFF] border-[#A5F3FC] text-[#0891B2]',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="5" rx="3" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      ),
    },
    {
      label: 'Store Profile',
      path: '/seller/profile',
      bgColor: 'bg-[#FDF2F8] border-[#FBCFE8] text-[#DB2777]',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
        </svg>
      ),
    },
    {
      label: 'Advertise...',
      path: '/seller/ad-requests',
      bgColor: 'bg-[#FFF1F2] border-[#FECDD3] text-[#E11D48]',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
          Quick Actions
        </h3>
        <span className="text-xs text-slate-400 font-semibold tracking-wide">Shortcuts</span>
      </div>

      {/* Tier 1: Two Featured Hero Cards (POS Billing and Bill & Invoice) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* 1. POS Billing Hero Card */}
        <div
          onClick={() => navigate('/seller/pos')}
          className="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-[#EDE9FE] via-[#F3E8FF] to-[#FAE8FF] border border-purple-200/80 shadow-2xs hover:shadow-md transition-all active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#7C3AED] text-white flex items-center justify-center shadow-xs flex-shrink-0 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="7" y1="8" x2="17" y2="8" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs sm:text-sm font-black text-[#2E1065] tracking-tight uppercase truncate">
                POS BILLING
              </h4>
              <p className="text-[10px] sm:text-xs text-purple-700/80 font-medium truncate mt-0.5">
                Fast & easy billing
              </p>
            </div>
          </div>
          <span className="text-purple-600 font-black text-sm sm:text-base ml-1.5 flex-shrink-0 group-hover:translate-x-0.5 transition-transform">
            →
          </span>
        </div>

        {/* 2. Bill & Invoice Hero Card */}
        <div
          onClick={() => navigate('/seller/bills')}
          className="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-[#E0F2FE] via-[#E0E7FF] to-[#EDE9FE] border border-sky-200/80 shadow-2xs hover:shadow-md transition-all active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center shadow-xs flex-shrink-0 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs sm:text-sm font-black text-[#1E3A8A] tracking-tight uppercase truncate">
                BILL & INVOICE
              </h4>
              <p className="text-[10px] sm:text-xs text-blue-700/80 font-medium truncate mt-0.5">
                Create & manage invoices
              </p>
            </div>
          </div>
          <span className="text-blue-600 font-black text-sm sm:text-base ml-1.5 flex-shrink-0 group-hover:translate-x-0.5 transition-transform">
            →
          </span>
        </div>
      </div>

      {/* Tier 2: 6 Circular/Squircle Shortcut Buttons in 3-column Grid */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-1">
        {shortcuts.map((sc, idx) => (
          <button
            key={idx}
            onClick={() => navigate(sc.path)}
            className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl hover:bg-slate-50 transition-all text-center select-none active:scale-95 min-h-[44px]"
          >
            <div
              className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform ${sc.bgColor}`}
            >
              {sc.icon}
            </div>
            <span className="text-xs font-bold text-slate-700 mt-2 tracking-tight group-hover:text-purple-600 transition-colors truncate max-w-full">
              {sc.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
