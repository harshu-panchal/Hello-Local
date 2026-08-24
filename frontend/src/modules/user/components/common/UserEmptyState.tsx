import React from 'react';
import { UserButton } from './UserButton';

export interface UserEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const UserEmptyState: React.FC<UserEmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div className={`w-full py-10 px-4 flex flex-col items-center justify-center text-center space-y-3.5 ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-3xl text-[#FF2E7A] shadow-2xs">
        {icon || '🛍️'}
      </div>

      <div className="max-w-xs space-y-1">
        <h4 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">{title}</h4>
        {description && <p className="text-xs text-slate-500 font-medium leading-relaxed">{description}</p>}
      </div>

      {actionText && onAction && (
        <UserButton variant="primary" size="sm" roundedPill onClick={onAction} className="mt-1 px-5">
          {actionText}
        </UserButton>
      )}
    </div>
  );
};
