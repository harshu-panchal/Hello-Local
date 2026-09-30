import React from 'react';

interface SellerStorePreviewBannerProps {
  storeSlug?: string;
}

export default function SellerStorePreviewBanner({ storeSlug = 'my-store' }: SellerStorePreviewBannerProps) {
  const handleOpenStorePreview = () => {
    const url = `/store/${storeSlug}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full bg-gradient-to-r from-[#FFF1F2]/80 via-[#FAF5FF]/90 to-[#EFF6FF]/80 border border-purple-100/80 rounded-2xl p-3 sm:p-3.5 shadow-2xs flex items-center justify-between gap-3 transition-all hover:border-purple-200">
      {/* Left: 3D Storefront graphic */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white border border-rose-100 shadow-2xs flex items-center justify-center text-2xl flex-shrink-0">
          🏬
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-snug truncate">
            View Your Store
          </h4>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium leading-tight line-clamp-1 sm:line-clamp-none mt-0.5">
            See how your online store looks to customers
          </p>
        </div>
      </div>

      {/* Right: Royal purple pill Preview button */}
      <button
        onClick={handleOpenStorePreview}
        className="bg-[#6D28D9] hover:bg-[#5B21B6] active:scale-95 text-white text-[11px] sm:text-xs font-black px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full flex items-center gap-1.5 shadow-xs transition-all flex-shrink-0 min-h-[36px] cursor-pointer"
      >
        <span>👁</span>
        <span>Preview</span>
        <span>→</span>
      </button>
    </div>
  );
}
