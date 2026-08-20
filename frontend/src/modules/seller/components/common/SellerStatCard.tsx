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
  const variantStyles = {
    default: 'border-slate-200/80 bg-white text-slate-900',
    purple: 'border-purple-200/80 bg-purple-50/40 text-purple-950',
    emerald: 'border-emerald-200/80 bg-emerald-50/40 text-emerald-950',
    amber: 'border-amber-200/80 bg-amber-50/40 text-amber-950',
    rose: 'border-rose-200/80 bg-rose-50/40 text-rose-950',
  };

  const iconBgStyles = {
    default: 'bg-slate-100 text-slate-600',
    purple: 'bg-purple-100 text-purple-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    rose: 'bg-rose-100 text-rose-600',
  };

  const displaySubtitle = subtitle || subtext;

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border p-4 sm:p-5 shadow-xs transition-all flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-purple-300' : ''
      } ${variantStyles[variant]} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block truncate">
            {label}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
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
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBgStyles[variant]}`}
          >
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-3 pt-2.5 border-t border-slate-100/80 flex items-center gap-1.5 text-xs">
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
