import React from 'react';
import { useNavigate } from 'react-router-dom';

interface SellerStoreBannerCardProps {
  storeName?: string;
  address?: string;
  logo?: string;
  isShopOpen: boolean;
  onToggleShop: () => void;
  statusLoading?: boolean;
}

export default function SellerStoreBannerCard({
  storeName = 'Sharma Kirana Store',
  address = 'Sector 21, Nerul, Navi Mumbai',
  logo,
  isShopOpen,
  onToggleShop,
  statusLoading = false,
}: SellerStoreBannerCardProps) {
  const navigate = useNavigate();

  return (
    <div className="w-full bg-gradient-to-r from-[#2D1B69] via-[#371E7D] to-[#1F104F] text-white rounded-3xl p-4 sm:p-6 shadow-md relative overflow-hidden">
      {/* Ambient glow decoration */}
      <div className="absolute -right-8 -bottom-8 w-44 h-44 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Store Avatar + Details */}
        <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
          {/* Store Logo/Thumbnail */}
          <div
            onClick={() => navigate('/seller/profile')}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 overflow-hidden flex items-center justify-center flex-shrink-0 cursor-pointer shadow-md hover:border-white/40 transition-colors"
          >
            {logo ? (
              <img src={logo} alt={storeName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-amber-300">🏪</span>
            )}
          </div>

          {/* Store Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-xl font-black text-white truncate tracking-tight">
                {storeName}
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase tracking-wider">
                <span>★</span>
                <span>Verified Seller</span>
              </span>
            </div>

            {/* Address */}
            <p className="text-xs text-purple-200/80 truncate flex items-center gap-1 mt-1 font-medium">
              <span>📍</span>
              <span className="truncate">{address}</span>
            </p>

            {/* Status Pill & Hours */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider shadow-2xs ${
                  isShopOpen
                    ? 'bg-emerald-500 text-white'
                    : 'bg-rose-500 text-white'
                }`}
              >
                {isShopOpen ? 'Shop Open' : 'Shop Closed'}
              </span>
              <span className="text-xs text-purple-200/90 font-medium">
                {isShopOpen ? 'Accepting online orders' : 'Currently not taking orders'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick Toggle Switch with 44px min touch target */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0 gap-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs sm:text-[11px] text-purple-200 font-bold uppercase tracking-wider">
              {isShopOpen ? 'Store Online' : 'Store Offline'}
            </span>
            <button
              onClick={onToggleShop}
              disabled={statusLoading}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-[#2D1B69] min-h-[44px] min-w-[44px] justify-center ${
                isShopOpen ? 'bg-emerald-500' : 'bg-white/20'
              } ${statusLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              aria-label="Toggle Shop Open or Closed"
            >
              <span
                className={`${
                  isShopOpen ? 'translate-x-3.5' : '-translate-x-3.5'
                } inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
