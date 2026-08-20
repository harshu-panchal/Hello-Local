import React from 'react';
import SellerInput from './SellerInput';
import SellerButton from './SellerButton';

export interface DateRangeValue {
  startDate: string;
  endDate: string;
}

export interface SellerFilterBarProps {
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  dateRange?: DateRangeValue;
  onDateRangeChange?: (range: DateRangeValue) => void;
  onExport?: () => void;
  exportLabel?: string;
  isExporting?: boolean;
  onClear?: () => void;
  hasActiveFilters?: boolean;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const SellerFilterBar: React.FC<SellerFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  dateRange,
  onDateRangeChange,
  onExport,
  exportLabel = 'Export CSV',
  isExporting = false,
  onClear,
  hasActiveFilters = false,
  filters,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 shadow-xs space-y-3 ${className}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Search input */}
        {onSearchChange !== undefined && (
          <div className="w-full md:w-80 lg:w-96 flex-shrink-0">
            <SellerInput
              type="text"
              value={searchQuery || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              clearable
              onClear={() => onSearchChange('')}
              prefixIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              }
            />
          </div>
        )}

        {/* Right / Inline: Date filters, Custom Filters & Actions */}
        <div className="flex items-center gap-2 flex-wrap flex-1 justify-start md:justify-end">
          {/* Optional Date Range picker pair */}
          {dateRange && onDateRangeChange && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1 text-xs">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) =>
                  onDateRangeChange({ ...dateRange, startDate: e.target.value })
                }
                className="bg-transparent text-slate-700 text-xs px-2 py-1 outline-none min-h-[36px]"
                aria-label="Start date"
              />
              <span className="text-slate-400 font-bold">to</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) =>
                  onDateRangeChange({ ...dateRange, endDate: e.target.value })
                }
                className="bg-transparent text-slate-700 text-xs px-2 py-1 outline-none min-h-[36px]"
                aria-label="End date"
              />
            </div>
          )}

          {/* Slot for custom filter dropdowns */}
          {filters}

          {/* Clear Filters Button */}
          {hasActiveFilters && onClear && (
            <SellerButton
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold"
            >
              Clear
            </SellerButton>
          )}

          {/* Optional Export Button */}
          {onExport && (
            <SellerButton
              variant="outline"
              size="sm"
              onClick={onExport}
              isLoading={isExporting}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              }
            >
              {exportLabel}
            </SellerButton>
          )}

          {/* Extra Actions Slot */}
          {actions}
        </div>
      </div>
    </div>
  );
};

export default SellerFilterBar;
