import React from 'react';

export type UserBadgeVariant =
  | 'coral'
  | 'gold'
  | 'green'
  | 'slate'
  | 'rating'
  | 'featured'
  | 'discount'
  | 'super-saver';

export type UserBadgeSize = 'xs' | 'sm' | 'md';

export interface UserBadgeProps {
  children: React.ReactNode;
  variant?: UserBadgeVariant;
  size?: UserBadgeSize;
  icon?: React.ReactNode;
  className?: string;
}

export const UserBadge: React.FC<UserBadgeProps> = ({
  children,
  variant = 'coral',
  size = 'sm',
  icon,
  className = '',
}) => {
  const sizeClasses = {
    xs: 'text-[9px] px-1.5 py-0.5 font-bold',
    sm: 'text-[11px] px-2 py-0.5 font-bold',
    md: 'text-xs px-2.5 py-1 font-bold',
  }[size];

  const variantClasses = {
    coral: 'bg-[#FFF1F4] text-[#FF2E7A] border border-[#FFE4EA]',
    gold: 'bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]',
    green: 'bg-[#F0FDF4] text-[#16A34A] border border-[#DCFCE7]',
    slate: 'bg-slate-100 text-slate-700 border border-slate-200',
    rating: 'bg-[#16A34A] text-white font-bold rounded-md px-1.5 py-0.5 shadow-2xs',
    featured: 'bg-[#FF2E7A] text-white font-bold rounded-md px-2 py-0.5 shadow-2xs uppercase tracking-wider',
    discount: 'bg-[#FFF1F4] text-[#FF2E7A] font-bold border border-[#FFE4EA] rounded-md',
    'super-saver': 'bg-white text-[#FF2E7A] font-extrabold rounded-full px-2.5 py-0.5 shadow-2xs uppercase tracking-wider text-[10px]',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${sizeClasses} ${variantClasses} ${className}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
