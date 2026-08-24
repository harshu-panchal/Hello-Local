import React from 'react';

export interface UserCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: 'white' | 'subtle' | 'soft-pink' | 'soft-orange';
  rounded?: 'xl' | '2xl' | '3xl' | 'full';
  elevation?: 'none' | 'xs' | 'sm' | 'md';
  bordered?: boolean;
}

export const UserCard: React.FC<UserCardProps> = ({
  children,
  className = '',
  variant = 'white',
  rounded = '2xl',
  elevation = 'xs',
  bordered = true,
  ...props
}) => {
  const roundedClass = {
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
    full: 'rounded-full',
  }[rounded];

  const elevationClass = {
    none: '',
    xs: 'shadow-2xs',
    sm: 'shadow-xs',
    md: 'shadow-sm',
  }[elevation];

  const variantClass = {
    white: 'bg-white',
    subtle: 'bg-slate-50',
    'soft-pink': 'bg-[#FFF1F4]',
    'soft-orange': 'bg-[#FFF7ED]',
  }[variant];

  const borderClass = bordered ? 'border border-slate-100' : '';

  return (
    <div
      className={`${roundedClass} ${variantClass} ${borderClass} ${elevationClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
