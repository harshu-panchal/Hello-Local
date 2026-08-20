import React from 'react';
import SellerButton from './SellerButton';
import SellerEmptyState from './SellerEmptyState';

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  sortKey?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  className?: string;
  hideOnMobile?: boolean;
}

export interface SellerDataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T, index: number) => string | number;
  isLoading?: boolean;
  loadingRowCount?: number;
  emptyState?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;

  // Sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (sortKey: string) => void;

  // Pagination
  currentPage?: number;
  totalPages?: number;
  totalEntries?: number;
  entriesPerPage?: number;
  onPageChange?: (page: number) => void;
  onEntriesPerPageChange?: (size: number) => void;
  entriesOptions?: number[];

  // Row Interactions
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string;

  // Mobile Representation
  renderMobileCard?: (row: T, index: number) => React.ReactNode;
  mobileBreakpoint?: 'sm' | 'md';

  className?: string;
  tableClassName?: string;
}

export function SellerDataTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  loadingRowCount = 5,
  emptyState,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching your criteria.',
  sortColumn,
  sortDirection,
  onSort,
  currentPage = 1,
  totalPages = 1,
  totalEntries,
  entriesPerPage = 10,
  onPageChange,
  onEntriesPerPageChange,
  entriesOptions = [10, 25, 50, 100],
  onRowClick,
  rowClassName,
  renderMobileCard,
  mobileBreakpoint = 'md',
  className = '',
  tableClassName = '',
}: SellerDataTableProps<T>) {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  const startEntry = (currentPage - 1) * entriesPerPage + 1;
  const endEntry = totalEntries
    ? Math.min(currentPage * entriesPerPage, totalEntries)
    : Math.min(currentPage * entriesPerPage, data.length);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${className}`}>
      {/* Mobile Card View (if renderMobileCard is provided) */}
      {renderMobileCard && (
        <div className={`block ${mobileBreakpoint === 'md' ? 'md:hidden' : 'sm:hidden'} p-3 space-y-3`}>
          {isLoading ? (
            Array.from({ length: loadingRowCount }).map((_, idx) => (
              <div
                key={idx}
                className="animate-pulse bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3"
              >
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-4 bg-slate-200 rounded w-2/3" />
                <div className="h-3 bg-slate-200 rounded w-1/2" />
              </div>
            ))
          ) : data.length === 0 ? (
            emptyState || (
              <SellerEmptyState
                title={emptyTitle}
                description={emptyDescription}
                className="py-8"
              />
            )
          ) : (
            data.map((row, index) => (
              <div key={keyExtractor(row, index)} onClick={() => onRowClick && onRowClick(row)}>
                {renderMobileCard(row, index)}
              </div>
            ))
          )}
        </div>
      )}

      {/* Desktop / Tablet Data Table */}
      <div
        data-lenis-prevent="true"
        className={`${renderMobileCard ? (mobileBreakpoint === 'md' ? 'hidden md:block' : 'hidden sm:block') : 'block'} overflow-x-auto seller-scrollbar`}
      >
        <table className={`w-full text-left text-xs border-collapse ${tableClassName}`}>
          <thead className="bg-slate-50/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
            <tr>
              {columns.map((col) => {
                const isSorted = sortColumn && col.sortKey === sortColumn;
                const canSort = col.sortable && col.sortKey && onSort;

                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={() => canSort && onSort(col.sortKey!)}
                    className={`px-4 py-3.5 select-none transition-colors ${
                      alignClasses[col.align || 'left']
                    } ${canSort ? 'cursor-pointer hover:bg-slate-100 hover:text-slate-900' : ''} ${
                      col.hideOnMobile ? 'hidden lg:table-cell' : ''
                    } ${col.className || ''}`}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'right'
                          ? 'justify-end w-full'
                          : col.align === 'center'
                          ? 'justify-center w-full'
                          : ''
                      }`}
                    >
                      <span>{col.header}</span>
                      {canSort && (
                        <span className="text-[10px] text-slate-400">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-600">
                                <path d="m18 15-6-6-6 6" />
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-600">
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            )
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40">
                              <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
                            </svg>
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              Array.from({ length: loadingRowCount }).map((_, rIdx) => (
                <tr key={rIdx} className="animate-pulse">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3.5 ${col.hideOnMobile ? 'hidden lg:table-cell' : ''}`}
                    >
                      <div className="h-4 bg-slate-100 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  {emptyState || (
                    <SellerEmptyState
                      title={emptyTitle}
                      description={emptyDescription}
                    />
                  )}
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const customRowClass = rowClassName ? rowClassName(row, index) : '';
                return (
                  <tr
                    key={keyExtractor(row, index)}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${customRowClass}`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3.5 ${alignClasses[col.align || 'left']} ${
                          col.hideOnMobile ? 'hidden lg:table-cell' : ''
                        } ${col.className || ''}`}
                      >
                        {col.render
                          ? col.render(row, index)
                          : (row as any)[col.key] !== undefined
                          ? String((row as any)[col.key])
                          : '—'}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Count Footer */}
      {(totalEntries !== undefined || (onPageChange && totalPages > 1)) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs">
          {/* Entries summary & page size */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-slate-500 font-medium">
              {totalEntries !== undefined ? (
                <>
                  Showing <strong className="text-slate-800">{data.length > 0 ? startEntry : 0}</strong> to{' '}
                  <strong className="text-slate-800">{endEntry}</strong> of{' '}
                  <strong className="text-slate-800">{totalEntries}</strong> records
                </>
              ) : (
                `Page ${currentPage} of ${totalPages}`
              )}
            </span>

            {onEntriesPerPageChange && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium hidden sm:inline">Rows:</span>
                <select
                  value={entriesPerPage}
                  onChange={(e) => onEntriesPerPageChange(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[36px]"
                  aria-label="Rows per page"
                >
                  {entriesOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Pagination controls */}
          {onPageChange && totalPages > 1 && (
            <div className="flex items-center gap-1.5 self-end sm:self-center">
              <SellerButton
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                className="px-3.5 min-h-[44px] text-xs font-bold"
              >
                Previous
              </SellerButton>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, pIdx) => {
                  let pNum: number;
                  if (totalPages <= 5) {
                    pNum = pIdx + 1;
                  } else if (currentPage <= 3) {
                    pNum = pIdx + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pNum = totalPages - 4 + pIdx;
                  } else {
                    pNum = currentPage - 2 + pIdx;
                  }

                  const isCurrent = pNum === currentPage;
                  return (
                    <button
                      key={pNum}
                      onClick={() => onPageChange(pNum)}
                      className={`min-h-[44px] min-w-[44px] rounded-xl text-xs font-bold transition-all flex items-center justify-center ${
                        isCurrent
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {pNum}
                    </button>
                  );
                })}
              </div>

              <SellerButton
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                className="px-3.5 min-h-[44px] text-xs font-bold"
              >
                Next
              </SellerButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SellerDataTable;
