import React from 'react';

export interface SellerFormFieldProps {
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  labelAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SellerFormField: React.FC<SellerFormFieldProps> = ({
  label,
  required,
  hint,
  error,
  labelAction,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {(label || labelAction) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="block text-xs font-bold text-slate-700">
              {label}
              {required && <span className="text-rose-500 ml-1">*</span>}
            </label>
          )}
          {labelAction && <div className="text-xs">{labelAction}</div>}
        </div>
      )}

      {children}

      {error && (
        <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {error}
        </p>
      )}

      {!error && hint && (
        <p className="text-xs text-slate-500 font-medium">{hint}</p>
      )}
    </div>
  );
};

export default SellerFormField;
