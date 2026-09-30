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
  storeName = 'Hello Local Vendor Store',
  address = 'South Tukoganj, Indore, Madhya Pradesh 452001',
  logo,
  isShopOpen,
  onToggleShop,
  statusLoading = false,
}: SellerStoreBannerCardProps) {
  const navigate = useNavigate();

  return (
    <div className="w-full bg-gradient-to-r from-[#22104B] via-[#2B1564] to-[#1C0D43] text-white rounded-3xl p-4 sm:p-5 shadow-md relative overflow-hidden border border-purple-900/40">
      {/* Ambient glow decoration */}
      <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Row: Store Avatar + Details */}
      <div className="relative z-10 flex items-start gap-3.5 min-w-0">
        {/* Store Logo/Thumbnail with 24/7 Store Icon fallback */}
        <div
          onClick={() => navigate('/seller/profile')}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 overflow-hidden flex items-center justify-center flex-shrink-0 cursor-pointer shadow-md hover:border-white/40 transition-colors"
          title="Click to view Store Profile"
        >
          {logo ? (
            <img src={logo} alt={storeName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-indigo-700 via-purple-600 to-pink-500 p-1">
              <span className="text-xl sm:text-2xl drop-shadow-sm leading-none">🏪</span>
              <span className="text-[8px] font-black tracking-widest text-amber-300 uppercase mt-0.5">24/7</span>
            </div>
          )}
        </div>

        {/* Store Info */}
        <div className="min-w-0 flex-1 space-y-1">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white truncate tracking-tight">
              {storeName}
            </h2>
          </div>
          <div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
              <span>★</span>
              <span>VERIFIED SELLER</span>
            </span>
          </div>

          {/* Address */}
          <p className="text-xs text-purple-200/80 truncate flex items-center gap-1 font-medium">
            <span>📍</span>
            <span className="truncate">{address}</span>
          </p>

          {/* Status Pill & Message */}
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider shadow-2xs ${
                isShopOpen ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              }`}
            >
              {isShopOpen ? 'SHOP OPEN' : 'SHOP CLOSED'}
            </span>
            <span className="text-xs text-purple-200/90 font-medium">
              {isShopOpen ? 'Accepting online orders' : 'Currently not taking orders'}
            </span>
          </div>
        </div>
      </div>

      {/* Subtle Horizontal Divider Line */}
      <div className="border-t border-purple-800/60 my-3.5 relative z-10" />

      {/* Dedicated Bottom Bar: STORE ONLINE text on left, Green Toggle on right */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-xs sm:text-sm font-extrabold tracking-wider text-white uppercase">
          {isShopOpen ? 'STORE ONLINE' : 'STORE OFFLINE'}
        </span>
        <button
          onClick={onToggleShop}
          disabled={statusLoading}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[#22104B] min-h-[44px] min-w-[44px] justify-center ${
            isShopOpen ? 'bg-emerald-500' : 'bg-white/20'
          } ${statusLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          aria-label="Toggle Shop Open or Closed"
        >
          <span
            className={`${
              isShopOpen ? 'translate-x-3.5' : '-translate-x-3.5'
            } inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-md`}
          />
        </button>
      </div>
    </div>
  );
}
