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
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-gradient-to-b from-[#FF8A00] to-[#FF2E7A]" />
          <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {title}
          </h3>
        </div>
        {subtitle && (
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium ml-3.5 mt-0.5">{subtitle}</p>
        )}
      </div>

      {(viewAllLink || onViewAllClick) && (
        viewAllLink ? (
          <Link
            to={viewAllLink}
            className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF1F4] hover:bg-[#FFE4EA] text-xs font-black text-[#FF2E7A] transition-all duration-200 border border-[#FFE4EA]"
          >
            <span>{actionText}</span>
            <ChevronRightIcon size={13} className="text-[#FF2E7A] group-hover:translate-x-0.5 transition-transform" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onViewAllClick}
            className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF1F4] hover:bg-[#FFE4EA] text-xs font-black text-[#FF2E7A] transition-all duration-200 border border-[#FFE4EA]"
          >
            <span>{actionText}</span>
            <ChevronRightIcon size={13} className="text-[#FF2E7A] group-hover:translate-x-0.5 transition-transform" />
          </button>
        )
      )}
    </div>
  );
};
