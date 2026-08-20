import React, { forwardRef } from 'react';

export interface SellerInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  clearable?: boolean;
  onClear?: () => void;
  containerClassName?: string;
}

export const SellerInput = forwardRef<HTMLInputElement, SellerInputProps>(
  (
    {
      label,
      error,
      helperText,
      prefixIcon,
      suffixIcon,
      clearable,
      onClear,
      className = '',
      containerClassName = '',
      id,
      value,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={`w-full ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            {label}
            {props.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {prefixIcon && (
            <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center justify-center">
              {prefixIcon}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            value={value}
            disabled={disabled}
            className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none min-h-[44px] ${
              prefixIcon ? 'pl-10' : ''
            } ${suffixIcon || (clearable && value) ? 'pr-10' : ''} ${
              error
                ? 'border-rose-400 focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                : 'border-slate-200 focus:border-purple-600 focus:ring-2 focus:ring-purple-100'
            } ${disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''} ${className}`}
            {...props}
          />

          {clearable && value && !disabled && (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
              aria-label="Clear input"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}

          {suffixIcon && (!clearable || !value) && (
            <div className="absolute right-3 text-slate-400 pointer-events-none flex items-center justify-center">
              {suffixIcon}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            {error}
          </p>
        )}

        {!error && helperText && (
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

SellerInput.displayName = 'SellerInput';

export default SellerInput;
