import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon, SparklesIcon, TagOfferIcon, ClockIcon } from './common/UserIcons';

export default function SuperSaverHeroBanner() {
  const navigate = useNavigate();
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    {
      tag: 'SUPER SAVER',
      title: 'Fresh Groceries Delivered Fast!',
      subtitle: 'Best quality, best prices from your local shops.',
      cta: 'Order Now',
      route: '/shop-by-stores',
      bgGradient: 'bg-gradient-to-r from-[#FFF0F3] via-[#FFE4EA] to-[#FFF5F7]',
      borderClass: 'border-[#FFD3DC]',
      badgeColor: 'bg-[#FF2E7A] text-white',
      theme: 'grocery',
    },
    {
      tag: 'DAILY ESSENTIALS',
      title: 'Farm Fresh Fruits & Vegetables',
      subtitle: 'Handpicked daily from verified local markets.',
      cta: 'Shop Fresh',
      route: '/categories',
      bgGradient: 'bg-gradient-to-r from-[#EBFBF2] via-[#DCF9E5] to-[#F2FCF5]',
      borderClass: 'border-[#BFF2CD]',
      badgeColor: 'bg-[#16A34A] text-white',
      theme: 'veggies',
    },
    {
      tag: 'BEST DEALS',
      title: 'Bakery, Dairy & Sweet Treats',
      subtitle: 'Up to 25% OFF on morning staples today.',
      cta: 'Explore Deals',
      route: '/shop-by-stores',
      bgGradient: 'bg-gradient-to-r from-[#FFF8EB] via-[#FEF0D4] to-[#FFFBF2]',
      borderClass: 'border-[#FEE0A5]',
      badgeColor: 'bg-[#FF8A00] text-white',
      theme: 'dairy',
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const slide = slides[activeSlide];

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2">
      <div
        className={`relative overflow-hidden rounded-2xl p-4 sm:p-7 md:p-8 ${slide.bgGradient} border ${slide.borderClass} shadow-2xs transition-all duration-500 flex items-center justify-between min-h-[160px] sm:min-h-[190px] md:min-h-[210px]`}
      >
        {/* Left Content */}
        <div className="flex-1 z-10 pr-4 max-w-[65%] sm:max-w-[60%] md:max-w-[55%]">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-2xs ${slide.badgeColor}`}>
              <TagOfferIcon size={12} />
              <span>{slide.tag}</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-white/80 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-white">
              <ClockIcon size={11} className="text-[#FF2E7A]" />
              <span>15-min delivery</span>
            </span>
          </div>

          <h2 className="text-base sm:text-2xl md:text-3xl font-black text-slate-900 leading-tight tracking-tight mb-1 sm:mb-2">
            {slide.title}
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 font-medium line-clamp-2 mb-3 sm:mb-4 leading-relaxed max-w-lg">
            {slide.subtitle}
          </p>

          <button
            type="button"
            onClick={() => navigate(slide.route)}
            className="inline-flex items-center gap-1.5 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold bg-[#FF2E7A] hover:bg-[#E02269] text-white shadow-xs active:scale-95 transition-all min-h-[40px] sm:min-h-[44px]"
          >
            <span>{slide.cta}</span>
            <ChevronRightIcon size={16} />
          </button>
        </div>

        {/* Right Product Graphic Composition — Clean Super Saver Grocery Basket Illustration */}
        <div className="relative flex items-center justify-center flex-shrink-0 z-0 pr-2 sm:pr-6">
          <div className="relative w-28 h-28 sm:w-40 sm:h-40 md:w-48 md:h-48 flex items-center justify-center">
            {/* Soft Ambient Backdrop Glow */}
            <div className="absolute inset-0 bg-white/60 rounded-full blur-xl transform scale-90" />

            {/* Grocery Composition Vector Asset */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-2xl bg-white/90 border border-white p-3 shadow-md flex flex-col items-center justify-center text-center">
                {slide.theme === 'grocery' && (
                  <>
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-[#FFF1F4] flex items-center justify-center text-2xl sm:text-3xl mb-1 shadow-inner">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF2E7A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <path d="M16 10a4 4 0 0 1-8 0" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-800 leading-tight">Fresh Basket</span>
                    <span className="text-[9px] font-bold text-[#FF2E7A]">Up to 40% OFF</span>
                  </>
                )}

                {slide.theme === 'veggies' && (
                  <>
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-[#EBFBF2] flex items-center justify-center text-2xl sm:text-3xl mb-1 shadow-inner">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2z" />
                        <path d="M12 6v12M6 12h12" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-800 leading-tight">Farm Direct</span>
                    <span className="text-[9px] font-bold text-[#16A34A]">100% Organic</span>
                  </>
                )}

                {slide.theme === 'dairy' && (
                  <>
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-[#FFF8EB] flex items-center justify-center text-2xl sm:text-3xl mb-1 shadow-inner">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF8A00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3v3m0 12v3m9-9h-3M6 12H3" />
                        <circle cx="12" cy="12" r="4" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-800 leading-tight">Dairy & Bakes</span>
                    <span className="text-[9px] font-bold text-[#FF8A00]">Daily Fresh</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Pagination Dots */}
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
          {slides.map((_, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => setActiveSlide(idx)}
              className={`h-1.5 rounded-full transition-all ${
                activeSlide === idx ? 'w-6 bg-[#FF2E7A]' : 'w-1.5 bg-slate-300'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
