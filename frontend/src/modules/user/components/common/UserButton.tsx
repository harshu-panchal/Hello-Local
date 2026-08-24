import React from 'react';

export type UserButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft-pink' | 'gold' | 'danger';
export type UserButtonSize = 'sm' | 'md' | 'lg';

export interface UserButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UserButtonVariant;
  size?: UserButtonSize;
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  roundedPill?: boolean;
  children: React.ReactNode;
}

export const UserButton: React.FC<UserButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  roundedPill = false,
  className = '',
  disabled,
  children,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-bold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#FF2E7A]/40 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] select-none';

  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5 min-h-[36px] gap-1.5',
    md: 'text-xs sm:text-sm px-4 py-2 min-h-[42px] gap-2',
    lg: 'text-sm sm:text-base px-6 py-2.5 min-h-[48px] gap-2.5',
  }[size];

  const variantClasses = {
    primary:
      'bg-[#FF2E7A] text-white hover:bg-[#E02269] shadow-xs active:bg-[#C91A5E]',
    secondary:
      'bg-slate-900 text-white hover:bg-slate-800 shadow-xs',
    'soft-pink':
      'bg-[#FFF1F4] text-[#FF2E7A] hover:bg-[#FFE4EA] border border-[#FFE4EA]',
    gold:
      'bg-[#FF8A00] text-white hover:bg-[#E67C00] shadow-xs',
    outline:
      'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300',
    ghost:
      'bg-transparent text-slate-700 hover:bg-slate-100',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 shadow-xs',
  }[variant];

  const radiusClass = roundedPill ? 'rounded-full' : 'rounded-xl';
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${radiusClass} ${widthClass} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>{children}</span>
        </span>
      ) : (
        <>
          {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
          <span>{children}</span>
          {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
        </>
      )}
    </button>
  );
};
