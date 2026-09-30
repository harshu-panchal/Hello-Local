import React from 'react';

export interface SellerStatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  subtitle?: string;
  subtext?: string;
  variant?: 'default' | 'purple' | 'emerald' | 'amber' | 'rose';
  onClick?: () => void;
  className?: string;
}

export const SellerStatCard: React.FC<SellerStatCardProps> = ({
  label,
  value,
  icon,
  trend,
  subtitle,
  subtext,
  variant = 'default',
  onClick,
  className = '',
}) => {
  const iconBgStyles = {
    default: 'bg-slate-100 text-slate-600',
    purple: 'bg-[#F3E8FF] text-[#9333EA]',
    emerald: 'bg-[#DCFCE7] text-[#16A34A]',
    amber: 'bg-[#FEF3C7] text-[#D97706]',
    rose: 'bg-[#FFE4E6] text-[#E11D48]',
  };

  const displaySubtitle = subtitle || subtext;

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-slate-100/90 bg-white p-3.5 sm:p-4 shadow-xs transition-all flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-purple-200' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block truncate">
            {label}
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 truncate">
              {value}
            </span>
          </div>

          {displaySubtitle && (
            <p className="text-xs text-slate-500 font-medium mt-1 truncate">
              {displaySubtitle}
            </p>
          )}
        </div>

        {icon && (
          <div
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-2xs ${iconBgStyles[variant]}`}
          >
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center gap-1.5 text-xs">
          <span
            className={`font-bold flex items-center ${
              trend.isPositive ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {trend.isPositive ? '↑' : '↓'} {trend.value}
          </span>
          {trend.label && (
            <span className="text-slate-400 font-medium truncate">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default SellerStatCard;
