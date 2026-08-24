import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from './UserIcons';

export interface UserSectionHeaderProps {
  title: string;
  subtitle?: string;
  viewAllLink?: string;
  onViewAllClick?: () => void;
  actionText?: string;
  className?: string;
}

export const UserSectionHeader: React.FC<UserSectionHeaderProps> = ({
  title,
  subtitle,
  viewAllLink,
  onViewAllClick,
  actionText = 'View All',
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between mb-2.5 ${className}`}>
      <div>
        <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-slate-400 font-medium">{subtitle}</p>
        )}
      </div>

      {(viewAllLink || onViewAllClick) && (
        viewAllLink ? (
          <Link
            to={viewAllLink}
            className="inline-flex items-center gap-0.5 text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] transition-colors"
          >
            <span>{actionText}</span>
            <ChevronRightIcon size={14} className="text-[#FF2E7A]" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onViewAllClick}
            className="inline-flex items-center gap-0.5 text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] transition-colors"
          >
            <span>{actionText}</span>
            <ChevronRightIcon size={14} className="text-[#FF2E7A]" />
          </button>
        )
      )}
    </div>
  );
};
