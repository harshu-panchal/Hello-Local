import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SellerPromoCardsProps {
  storeSlug?: string;
}

export default function SellerPromoCards({ storeSlug = 'my-store' }: SellerPromoCardsProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleShareStore = async () => {
    const shareUrl = `${window.location.origin}/store/${storeSlug}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Shop from our store on HelloLocal',
          text: 'Order fresh groceries and daily essentials directly from our local shop!',
          url: shareUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* 1. Boost Your Business Card */}
      <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-r from-purple-100 via-indigo-50 to-purple-200/70 border border-purple-200/80 shadow-xs flex items-center justify-between">
        <div className="z-10 max-w-[65%] space-y-2.5">
          <div>
            <h4 className="text-base font-black text-purple-950 tracking-tight leading-tight">
              Boost Your Business
            </h4>
            <p className="text-xs text-purple-800/80 font-medium leading-tight mt-0.5">
              Get more visibility & local orders
            </p>
          </div>
          <button
            onClick={() => navigate('/seller/ad-requests')}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-bold shadow-xs shadow-purple-600/20 active:scale-95 transition-all min-h-[44px]"
          >
            Upgrade Now
          </button>
        </div>

        {/* Rocket Graphic */}
        <div className="relative flex items-center justify-center flex-shrink-0 z-0">
          <div className="w-20 h-20 rounded-2xl bg-white/70 backdrop-blur-xs flex items-center justify-center shadow-xs border border-white/60">
            <span className="text-4xl select-none animate-bounce">🚀</span>
          </div>
        </div>
      </div>

      {/* 2. Share Your Store Card */}
      <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-r from-emerald-100 via-teal-50 to-green-100 border border-emerald-200/80 shadow-xs flex items-center justify-between">
        <div className="z-10 max-w-[65%] space-y-2.5">
          <div>
            <h4 className="text-base font-black text-emerald-950 tracking-tight leading-tight">
              Share Your Store
            </h4>
            <p className="text-xs text-emerald-800/80 font-medium leading-tight mt-0.5">
              Invite more customers & earn rewards
            </p>
          </div>
          <button
            onClick={handleShareStore}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-xs shadow-emerald-600/20 active:scale-95 transition-all min-h-[44px]"
          >
            {copied ? 'Link Copied! ✓' : 'Share Store Link'}
          </button>
        </div>

        {/* Gift Box Graphic */}
        <div className="relative flex items-center justify-center flex-shrink-0 z-0">
          <div className="w-20 h-20 rounded-2xl bg-white/70 backdrop-blur-xs flex items-center justify-center shadow-xs border border-white/60">
            <span className="text-4xl select-none">🎁</span>
          </div>
        </div>
      </div>
    </div>
  );
}
