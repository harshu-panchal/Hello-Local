import React, { useState } from 'react';

export interface SellerCardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const SellerCard: React.FC<SellerCardProps> = ({
  title,
  subtitle,
  description,
  headerAction,
  children,
  className = '',
  bodyClassName = '',
  padding = 'md',
  footer,
  isCollapsible = false,
  defaultCollapsed = false,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const displaySubtitle = subtitle || description;

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-5 lg:p-6',
    lg: 'p-5 sm:p-6 lg:p-8',
  };

  const hasHeader = Boolean(title || displaySubtitle || headerAction || isCollapsible);

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-shadow ${className}`}
    >
      {hasHeader && (
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-white ${
            isCollapsible ? 'cursor-pointer select-none hover:bg-slate-50/50' : ''
          }`}
          onClick={() => isCollapsible && setCollapsed(!collapsed)}
        >
          <div className="min-w-0 pr-2">
            {typeof title === 'string' ? (
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                {title}
              </h3>
            ) : (
              title
            )}
            {displaySubtitle && (
              <p className="text-xs text-slate-500 font-medium mt-0.5 leading-tight">
                {displaySubtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {headerAction}
            {isCollapsible && (
              <button
                type="button"
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={collapsed ? 'Expand section' : 'Collapse section'}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform duration-200 ${
                    collapsed ? '' : 'rotate-180'
                  }`}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {!collapsed && (
        <div className={`${paddingClasses[padding]} ${bodyClassName}`}>
          {children}
        </div>
      )}

      {footer && !collapsed && (
        <div className="px-4 sm:px-6 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end gap-2">
          {footer}
        </div>
      )}
    </div>
  );
};

export default SellerCard;
