import React from 'react';

export interface UserInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  onSuffixClick?: () => void;
  fullWidth?: boolean;
  roundedPill?: boolean;
}

export const UserInput: React.FC<UserInputProps> = ({
  label,
  error,
  helperText,
  prefixIcon,
  suffixIcon,
  onSuffixClick,
  fullWidth = true,
  roundedPill = false,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const radiusClass = roundedPill ? 'rounded-full' : 'rounded-xl';

  return (
    <div className={`${fullWidth ? 'w-full' : ''} space-y-1.5`}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-bold text-slate-700">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {prefixIcon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
            {prefixIcon}
          </div>
        )}

        <input
          id={inputId}
          className={`w-full bg-slate-50 border ${radiusClass} px-3.5 py-2.5 text-base sm:text-xs text-slate-900 placeholder:text-slate-400 font-medium transition-all focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 min-h-[42px] ${
            prefixIcon ? 'pl-10' : ''
          } ${suffixIcon ? 'pr-10' : ''} ${
            error
              ? 'border-rose-400 focus:border-rose-500 bg-rose-50/20'
              : 'border-slate-200 focus:border-[#FF2E7A]'
          } ${className}`}
          {...props}
        />

        {suffixIcon && (
          <button
            type="button"
            onClick={onSuffixClick}
            className="absolute right-2.5 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            tabIndex={onSuffixClick ? 0 : -1}
          >
            {suffixIcon}
          </button>
        )}
      </div>

      {error && <p className="text-[11px] font-bold text-rose-600 pl-1">{error}</p>}
      {!error && helperText && <p className="text-[11px] text-slate-500 pl-1">{helperText}</p>}
    </div>
  );
};
