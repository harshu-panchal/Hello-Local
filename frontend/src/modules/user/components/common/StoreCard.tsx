import React from 'react';
import { Link } from 'react-router-dom';
import { UserImage } from './UserImage';
import { StarFilledIcon, ClockIcon, LocationPinIcon } from './UserIcons';

export interface StoreCardProps {
  id: string;
  name: string;
  category?: string;
  imageUrl?: string;
  rating?: number;
  featured?: boolean;
  distance?: string | number;
  area?: string;
  eta?: string;
  offerText?: string;
  className?: string;
}

export const StoreCard: React.FC<StoreCardProps> = ({
  id,
  name,
  category = 'Grocery, Daily Needs',
  imageUrl,
  rating = 4.5,
  featured = true,
  distance = '0.5 km',
  area = 'Local Area',
  eta = '25-35 mins',
  offerText,
  className = '',
}) => {
  return (
    <Link
      to={`/store/${id}`}
      className={`block bg-white rounded-2xl border border-slate-100 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between group ${className}`}
    >
      <div>
        {/* Store Image Banner */}
        <div className="w-full h-28 sm:h-32 bg-slate-100 relative overflow-hidden">
          <UserImage
            src={imageUrl}
            alt={name}
            categoryFallback="shop"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />

          {/* Floating Rating Pill */}
          <div className="absolute top-2 left-2 z-10 bg-[#16A34A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-2xs">
            <span>{rating.toFixed(1)}</span>
            <StarFilledIcon size={9} />
          </div>

          {/* Floating Featured Badge */}
          {featured && (
            <div className="absolute top-2 right-2 z-10 bg-[#FF2E7A] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shadow-2xs">
              Featured
            </div>
          )}
        </div>

        {/* Store Metadata */}
        <div className="p-2.5 sm:p-3">
          <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1 group-hover:text-[#FF2E7A] transition-colors">
            {name}
          </h4>
          <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
            {category}
          </p>

          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium mt-1.5">
            <LocationPinIcon size={11} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">{typeof distance === 'number' ? `${distance} km` : distance} • {area}</span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium mt-0.5">
            <ClockIcon size={11} className="text-slate-400 flex-shrink-0" />
            <span>{eta}</span>
          </div>
        </div>
      </div>

      {/* Offer Pill Banner */}
      <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3">
        <div className="bg-[#FFF1F4] text-[#FF2E7A] text-[10px] font-bold py-1 px-2 rounded-lg text-center border border-[#FFE4EA] truncate">
          {offerText || 'Free Delivery'}
        </div>
      </div>
    </Link>
  );
};
