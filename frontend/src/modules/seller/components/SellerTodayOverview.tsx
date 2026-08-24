import React from 'react';
import { SellerStatCard } from './common/SellerStatCard';

interface SellerTodayOverviewProps {
  ordersCount?: number;
  revenueAmount?: number;
  viewsCount?: number;
  newCustomersCount?: number;
}

export default function SellerTodayOverview({
  ordersCount = 0,
  revenueAmount = 0,
  viewsCount = 0,
  newCustomersCount = 0,
}: SellerTodayOverviewProps) {
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="w-full space-y-3">
      {/* Header with Date */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-black text-slate-900 tracking-tight">
          Today's Overview
        </h3>
        <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-full border border-slate-200/60">
          <span>{currentDate}</span>
          <span>📅</span>
        </div>
      </div>

      {/* 2x2 on Mobile, 4x1 on Desktop Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* 1. Orders */}
        <SellerStatCard
          label="Orders"
          value={ordersCount}
          variant="purple"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          }
        />

        {/* 2. Revenue */}
        <SellerStatCard
          label="Revenue"
          value={`₹${Number(revenueAmount || 0).toLocaleString('en-IN')}`}
          variant="emerald"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
              <path d="M12 18V6" />
            </svg>
          }
        />

        {/* 3. Views */}
        <SellerStatCard
          label="Views"
          value={viewsCount}
          variant="amber"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          }
        />

        {/* 4. Customers */}
        <SellerStatCard
          label="Customers"
          value={newCustomersCount}
          variant="default"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
