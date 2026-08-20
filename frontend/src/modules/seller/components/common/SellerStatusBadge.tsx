import React from 'react';

export type StatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'neutral';

export interface SellerStatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

export const SellerStatusBadge: React.FC<SellerStatusBadgeProps> = ({
  status,
  variant,
  size = 'md',
  showDot = true,
  className = '',
}) => {
  // Infer variant from status string if not explicitly passed
  const getInferredVariant = (st: string): StatusVariant => {
    const s = st.toLowerCase().trim();
    if (
      s === 'delivered' ||
      s === 'completed' ||
      s === 'published' ||
      s === 'in stock' ||
      s === 'active' ||
      s === 'approved' ||
      s === 'paid' ||
      s === 'success'
    ) {
      return 'success';
    }
    if (
      s === 'pending' ||
      s === 'processing' ||
      s === 'processed' ||
      s === 'preparing' ||
      s === 'low stock' ||
      s === 'awaiting approval'
    ) {
      return 'warning';
    }
    if (
      s === 'cancelled' ||
      s === 'canceled' ||
      s === 'rejected' ||
      s === 'unpublished' ||
      s === 'sold out' ||
      s === 'out of stock' ||
      s === 'failed' ||
      s === 'unpaid'
    ) {
      return 'danger';
    }
    if (
      s === 'shipped' ||
      s === 'out for delivery' ||
      s === 'on the way' ||
      s === 'refunded' ||
      s === 'return requested' ||
      s === 'accepted'
    ) {
      return 'info';
    }
    if (s === 'received' || s === 'new' || s === 'pos' || s === 'instant') {
      return 'purple';
    }
    return 'neutral';
  };

  const resolvedVariant = variant || getInferredVariant(status);

  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/80',
    danger: 'bg-rose-50 text-rose-700 border-rose-200/80',
    info: 'bg-sky-50 text-sky-700 border-sky-200/80',
    purple: 'bg-purple-50 text-purple-700 border-purple-200/80',
    neutral: 'bg-slate-50 text-slate-700 border-slate-200/80',
  };

  const dotStyles = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
    purple: 'bg-purple-500',
    neutral: 'bg-slate-400',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] font-bold',
    md: 'px-2.5 py-1 text-xs font-bold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border shadow-2xs select-none capitalize ${
        sizeStyles[size]
      } ${variantStyles[resolvedVariant]} ${className}`}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotStyles[resolvedVariant]}`}
        />
      )}
      <span className="truncate">{status}</span>
    </span>
  );
};

export default SellerStatusBadge;
