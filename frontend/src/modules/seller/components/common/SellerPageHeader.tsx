import React from 'react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

export interface SellerPageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export const SellerPageHeader: React.FC<SellerPageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  action,
  children,
}) => {
  return (
    <div className="mb-4 sm:mb-6 space-y-2">
      {/* Top row: Title + Breadcrumbs + Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          {/* Breadcrumb row */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 mb-1 flex-wrap">
              <Link to="/seller" className="hover:text-purple-600 font-medium transition-colors">
                Home
              </Link>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  <span className="text-slate-300">/</span>
                  {crumb.path ? (
                    <Link to={crumb.path} className="hover:text-purple-600 font-medium transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-slate-700 font-semibold truncate max-w-[200px]">
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          {/* Page Title & Subtitle */}
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {/* Action Button Area */}
        {action && (
          <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-center w-full sm:w-auto">
            {action}
          </div>
        )}
      </div>

      {/* Optional Child Area (e.g. Sub-header bars, quick filter tabs) */}
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
};

export default SellerPageHeader;
