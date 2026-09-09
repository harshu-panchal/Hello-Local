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
    <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-1.5 sm:py-2.5">
      <div
        className={`relative overflow-hidden rounded-3xl p-4 sm:p-7 md:p-9 ${slide.bgGradient} border ${slide.borderClass} shadow-2xs hover:shadow-xs transition-all duration-700 flex items-center justify-between min-h-[160px] sm:min-h-[195px] md:min-h-[220px]`}
      >
        {/* Soft Ambient Radial Lighting */}
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-white/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-white/50 rounded-full blur-2xl pointer-events-none" />

        {/* Left Content */}
        <div className="flex-1 z-10 pr-3 max-w-[68%] sm:max-w-[62%] md:max-w-[58%]">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-black px-2.5 py-0.5 sm:py-1 rounded-full uppercase tracking-wider shadow-2xs ${slide.badgeColor}`}>
              <TagOfferIcon size={11} />
              <span>{slide.tag}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-slate-700 bg-white/90 backdrop-blur-xs px-2 sm:px-2.5 py-0.5 rounded-full border border-white/80 shadow-2xs">
              <ClockIcon size={11} className="text-[#FF2E7A]" />
              <span>15-min delivery</span>
            </span>
          </div>

          <h2 className="text-base sm:text-2xl md:text-3xl font-black text-slate-900 leading-tight tracking-tight mb-1 sm:mb-2">
            {slide.title}
          </h2>

          <p className="text-[11px] sm:text-xs md:text-sm text-slate-600 font-medium line-clamp-2 mb-3 sm:mb-4 leading-relaxed max-w-md">
            {slide.subtitle}
          </p>

          <button
            type="button"
            onClick={() => navigate(slide.route)}
            className="group inline-flex items-center gap-1.5 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-black bg-[#FF2E7A] hover:bg-[#E02269] text-white shadow-xs hover:shadow-sm active:scale-95 transition-all min-h-[38px] sm:min-h-[42px]"
          >
            <span>{slide.cta}</span>
            <ChevronRightIcon size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Right Product Graphic Composition — Clean Super Saver Grocery Basket Illustration */}
        <div className="relative flex items-center justify-center flex-shrink-0 z-10 pr-1 sm:pr-4">
          <div className="relative w-24 h-24 sm:w-36 sm:h-36 md:w-44 md:h-44 flex items-center justify-center">
            {/* Ambient Backdrop Glow */}
            <div className="absolute inset-0 bg-white/70 rounded-full blur-xl transform scale-90" />

            {/* Grocery Composition Vector Asset */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              <div className="w-22 h-22 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-2xl sm:rounded-3xl bg-white/95 backdrop-blur-xs border border-white p-2.5 sm:p-3 shadow-md flex flex-col items-center justify-center text-center group-hover:scale-105 transition-transform duration-300">
                {slide.theme === 'grocery' && (
                  <>
                    <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl bg-[#FFF1F4] flex items-center justify-center text-xl sm:text-2xl mb-1 shadow-inner border border-[#FFE4EA]">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF2E7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <path d="M16 10a4 4 0 0 1-8 0" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-xs font-black text-slate-900 leading-tight">Fresh Basket</span>
                    <span className="text-[9px] sm:text-[10px] font-extrabold text-[#FF2E7A] bg-[#FFF1F4] px-1.5 py-0.5 rounded-full mt-0.5 border border-[#FFE4EA]">
                      Up to 40% OFF
                    </span>
                  </>
                )}

                {slide.theme === 'veggies' && (
                  <>
                    <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl bg-[#EBFBF2] flex items-center justify-center text-xl sm:text-2xl mb-1 shadow-inner border border-[#BFF2CD]">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2z" />
                        <path d="M12 6v12M6 12h12" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-xs font-black text-slate-900 leading-tight">Farm Direct</span>
                    <span className="text-[9px] sm:text-[10px] font-extrabold text-[#16A34A] bg-[#EBFBF2] px-1.5 py-0.5 rounded-full mt-0.5 border border-[#BFF2CD]">
                      100% Fresh
                    </span>
                  </>
                )}

                {slide.theme === 'dairy' && (
                  <>
                    <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl bg-[#FFF8EB] flex items-center justify-center text-xl sm:text-2xl mb-1 shadow-inner border border-[#FEE0A5]">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF8A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3v3m0 12v3m9-9h-3M6 12H3" />
                        <circle cx="12" cy="12" r="4" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-xs font-black text-slate-900 leading-tight">Dairy & Bakes</span>
                    <span className="text-[9px] sm:text-[10px] font-extrabold text-[#FF8A00] bg-[#FFF8EB] px-1.5 py-0.5 rounded-full mt-0.5 border border-[#FEE0A5]">
                      Daily Fresh
                    </span>
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
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeSlide === idx ? 'w-6 bg-[#FF2E7A]' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
