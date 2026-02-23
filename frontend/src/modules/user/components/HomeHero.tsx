import { useNavigate, Link } from 'react-router-dom';
import { useLayoutEffect, useRef, useState, useEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getTheme } from '../../../utils/themes';
import { useLocation } from '../../../hooks/useLocation';
import { getCategories } from '../../../services/api/customerProductService';
import { Category } from '../../../types/domain';
import { getHeaderCategoriesPublic } from '../../../services/api/headerCategoryService';
import { getIconByName } from '../../../utils/iconLibrary';

gsap.registerPlugin(ScrollTrigger);

interface HomeHeroProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const ALL_TAB: Tab = {
  id: 'all',
  label: 'All',
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function HomeHero({ activeTab = 'all', onTabChange }: HomeHeroProps) {
  const [tabs, setTabs] = useState<Tab[]>([ALL_TAB]);

  useEffect(() => {
    const fetchHeaderCategories = async () => {
      try {
        const cats = await getHeaderCategoriesPublic();
        if (cats && cats.length > 0) {
          const mapped = cats.map(c => ({
            id: c.slug,
            label: c.name,
            icon: getIconByName(c.iconName)
          }));
          const uniqueTabs = mapped.filter((tab) => tab.id !== ALL_TAB.id);
          setTabs([ALL_TAB, ...uniqueTabs]);
        }
      } catch (error) {
        console.error('Failed to fetch header categories', error);
      }
    };
    fetchHeaderCategories();
  }, []);
  const navigate = useNavigate();
  const { location: userLocation } = useLocation();
  const heroRef = useRef<HTMLDivElement>(null);
  const topSectionRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [, setIsSticky] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const [isListening, setIsListening] = useState(false);

  // Voice Search Logic
  const startVoiceSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice search is not supported in your browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      if (transcript) {
        navigate(`/search?q=${encodeURIComponent(transcript)}`);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Format location display text - only show if user has provided location
  const locationDisplayText = useMemo(() => {
    if (userLocation?.address) {
      // Use the full address if available
      return userLocation.address;
    }
    // Fallback to city, state format if available
    if (userLocation?.city && userLocation?.state) {
      return `${userLocation.city}, ${userLocation.state}`;
    }
    // Fallback to city only
    if (userLocation?.city) {
      return userLocation.city;
    }
    // No default - return empty string if no location provided
    return '';
  }, [userLocation]);

  const [categories, setCategories] = useState<Category[]>([]);

  // Fetch categories for search suggestions
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await getCategories();
        if (response.success && response.data) {
          setCategories(response.data.map((c: any) => ({
            ...c,
            id: c._id || c.id
          })));
        }
      } catch (error) {
        console.error("Error fetching categories for suggestions:", error);
      }
    };
    fetchCategories();
  }, []);

  // Search suggestions based on active tab or fetched categories
  const searchSuggestions = useMemo(() => {
    if (activeTab === 'all' && categories.length > 0) {
      // Use real category names for 'all' tab suggestions
      return categories.slice(0, 8).map(c => c.name.toLowerCase());
    }

    switch (activeTab) {
      case 'wedding':
        return ['gift packs', 'dry fruits', 'sweets', 'decorative items', 'wedding cards', 'return gifts'];
      case 'dairy':
        return ['milk', 'curd', 'cheese', 'butter', 'paneer', 'cream', 'yogurt'];
      case 'winter':
        return ['woolen clothes', 'caps', 'gloves', 'blankets', 'heater', 'winter wear'];
      case 'electronics':
        return ['chargers', 'cables', 'power banks', 'earphones', 'phone cases', 'screen guards'];
      case 'beauty':
        return ['lipstick', 'makeup', 'skincare', 'kajal', 'face wash', 'moisturizer'];
      case 'grocery':
        return ['atta', 'milk', 'dal', 'rice', 'oil', 'vegetables'];
      case 'fashion':
        return ['clothing', 'shoes', 'accessories', 'watches', 'bags', 'jewelry'];
      case 'sports':
        return ['cricket bat', 'football', 'badminton', 'fitness equipment', 'sports shoes', 'gym wear'];
      default: // 'all'
        return ['atta', 'milk', 'dal', 'coke', 'bread', 'eggs', 'rice', 'oil'];
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        hero,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out',
        }
      );
    }, hero);

    return () => ctx.revert();
  }, []);

  // Animate search suggestions
  useEffect(() => {
    setCurrentSearchIndex(0);
    const interval = setInterval(() => {
      setCurrentSearchIndex((prev) => (prev + 1) % searchSuggestions.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [searchSuggestions.length, activeTab]);

  // Handle scroll to detect when "LOWEST PRICES EVER" section is out of view
  useEffect(() => {
    const handleScroll = () => {
      if (topSectionRef.current && stickyRef.current) {
        // Find the "LOWEST PRICES EVER" section
        const lowestPricesSection = document.querySelector('[data-section="lowest-prices"]');

        if (lowestPricesSection) {
          const sectionBottom = lowestPricesSection.getBoundingClientRect().bottom;
          // When the section has scrolled up past the viewport, transition to white
          const progress = Math.min(Math.max(1 - (sectionBottom / 200), 0), 1);
          setScrollProgress(progress);
          setIsSticky(sectionBottom <= 100);
        } else {
          // Fallback to original logic if section not found
          const topSectionBottom = topSectionRef.current.getBoundingClientRect().bottom;
          const topSectionHeight = topSectionRef.current.offsetHeight;
          const progress = Math.min(Math.max(1 - (topSectionBottom / topSectionHeight), 0), 1);
          setScrollProgress(progress);
          setIsSticky(topSectionBottom <= 0);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Update sliding indicator position when activeTab changes and scroll to active tab
  useEffect(() => {
    const updateIndicator = (shouldScroll = true) => {
      const activeTabButton = tabRefs.current.get(activeTab);
      const container = tabsContainerRef.current;

      if (activeTabButton && container) {
        try {
          // Use offsetLeft for position relative to container (not affected by scroll)
          // This ensures the indicator stays aligned even when container scrolls
          const left = activeTabButton.offsetLeft;
          const width = activeTabButton.offsetWidth;

          // Ensure valid values
          if (width > 0) {
            setIndicatorStyle({ left, width });
          }

          // Scroll the container to bring the active tab into view (only when tab changes)
          if (shouldScroll) {
            const containerScrollLeft = container.scrollLeft;
            const containerWidth = container.offsetWidth;
            const buttonLeft = left;
            const buttonWidth = width;
            const buttonRight = buttonLeft + buttonWidth;

            // Calculate scroll position to center the button or keep it visible
            const scrollPadding = 20; // Padding from edges
            let targetScrollLeft = containerScrollLeft;

            // If button is on the left side and partially or fully hidden
            if (buttonLeft < containerScrollLeft + scrollPadding) {
              targetScrollLeft = buttonLeft - scrollPadding;
            }
            // If button is on the right side and partially or fully hidden
            else if (buttonRight > containerScrollLeft + containerWidth - scrollPadding) {
              targetScrollLeft = buttonRight - containerWidth + scrollPadding;
            }

            // Smooth scroll to the target position
            if (targetScrollLeft !== containerScrollLeft) {
              container.scrollTo({
                left: Math.max(0, targetScrollLeft),
                behavior: 'smooth'
              });
            }
          }
        } catch (error) {
          console.warn('Error updating indicator:', error);
        }
      }
    };

    // Update immediately with scroll
    updateIndicator(true);

    // Also update after delays to handle any layout shifts and ensure smooth animation
    const timeout1 = setTimeout(() => updateIndicator(true), 50);
    const timeout2 = setTimeout(() => updateIndicator(true), 150);
    const timeout3 = setTimeout(() => updateIndicator(false), 300); // Last update without scroll to avoid conflicts

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, [activeTab]);

  const handleTabClick = (tabId: string) => {
    onTabChange?.(tabId);
    // Don't scroll - keep page at current position
  };

  const theme = getTheme(activeTab || 'all');
  const heroGradient = `linear-gradient(to bottom right, ${theme.primary[0]}, ${theme.primary[1]}, ${theme.primary[2]})`;

  // Helper to convert RGB to RGBA
  const rgbToRgba = (rgb: string, alpha: number) => {
    return rgb.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
  };

  return (
    <div
      ref={heroRef}
      style={{
        background: heroGradient,
        paddingBottom: 0,
        marginBottom: 0,
        transition: 'background 0.3s ease-out',
      }}
    >
      {/* Top section with delivery info and buttons - NOT sticky */}
      <div>
        <div ref={topSectionRef} className="px-4 md:px-6 lg:px-8 pt-3 md:pt-4 pb-1">
          <div className="relative flex items-center justify-between mb-2 md:mb-3 rounded-[24px] border border-white/40 px-4 py-3 bg-white/10 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] overflow-hidden group">
            {/* Subtle background glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/20 rounded-full blur-3xl pointer-events-none" />

            {/* Left: Text content */}
            <div className="flex-1 pr-3 relative z-10">
              {/* Service name with premium status badge */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 shadow-sm border border-white scale-[0.85] origin-left">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                  <span className="text-[9px] font-black text-neutral-800 uppercase tracking-tighter">LIVE</span>
                </div>
                <div className="text-neutral-950 font-extrabold text-[12px] md:text-base leading-none tracking-tight">
                  Hello Local <span className="font-medium text-neutral-800/80">Quick Commerce</span>
                </div>
              </div>

              {/* Location selector with enhanced visual feedback */}
              {locationDisplayText && (
                <div className="flex items-center gap-1.5">
                  <div className="text-neutral-900 text-[11px] md:text-sm flex items-center gap-1 font-bold bg-white/30 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/20 hover:bg-white/40 transition-all cursor-pointer shadow-sm">
                    <span className="line-clamp-1 max-w-[180px] md:max-w-md">{locationDisplayText}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-neutral-700">
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 relative z-10 md:hidden">
              <div className="p-0.5 rounded-2xl transform group-active:scale-95 transition-transform duration-200">
                <img
                  src="/logo.png?v=4"
                  alt="Hello Local"
                  className="w-11 h-11 object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky section: Search Bar and Category Tabs - Always sticky */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-50"
        style={{
          ...(scrollProgress >= 0.1 && {
            background: `linear-gradient(to bottom right,
              ${rgbToRgba(theme.primary[0], 1 - scrollProgress)},
              ${rgbToRgba(theme.primary[1], 1 - scrollProgress)},
              ${rgbToRgba(theme.primary[2], 1 - scrollProgress)}),
              rgba(255, 255, 255, ${scrollProgress})`,
            boxShadow: `0 4px 6px -1px rgba(0, 0, 0, ${scrollProgress * 0.1})`,
            transition: 'background 0.1s ease-out, box-shadow 0.1s ease-out',
          }),
        }}
      >
        <div className="px-4 md:px-6 lg:px-8 pt-2 md:pt-2 pb-2 md:pb-2">
          {/* Search Bar */}
          <div className="flex items-center gap-3 w-full md:max-w-xl md:mx-auto">

            <div
              onClick={() => navigate('/search')}
              className="flex-1 rounded-2xl px-3 py-2 md:px-3.5 md:py-2 flex items-center gap-2 cursor-pointer transition-all duration-300 mb-2 md:mb-1.5 border shadow-[0_8px_20px_rgba(15,23,42,0.14)]"
              style={{
                backgroundColor: scrollProgress > 0.1 ? `rgba(255, 255, 255, ${0.92 + scrollProgress * 0.08})` : 'rgba(255, 255, 255, 0.96)',
                borderColor: scrollProgress > 0.3 ? `rgba(229, 231, 235, ${0.5 + scrollProgress * 0.4})` : 'rgba(255,255,255,0.58)',
              }}
            >
              <div className="w-7 h-7 md:w-6 md:h-6 rounded-full bg-neutral-100/95 border border-neutral-200/70 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="md:w-[13px] md:h-[13px]">
                  <circle cx="11" cy="11" r="8" stroke={scrollProgress > 0.5 ? "#9ca3af" : "#6b7280"} strokeWidth="2" />
                  <path d="m21 21-4.35-4.35" stroke={scrollProgress > 0.5 ? "#9ca3af" : "#6b7280"} strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex-1 relative h-4 md:h-4 overflow-hidden">
                {isListening ? (
                  <div className="absolute inset-0 flex items-center">
                    <span className="text-xs md:text-xs font-bold text-rose-500 animate-pulse flex items-center gap-2">
                      <span className="flex gap-1">
                        <span className="w-1 h-1 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1 h-1 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1 h-1 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </span>
                      Listening...
                    </span>
                  </div>
                ) : (
                  searchSuggestions.map((suggestion, index) => {
                    const isActive = index === currentSearchIndex;
                    const prevIndex = (currentSearchIndex - 1 + searchSuggestions.length) % searchSuggestions.length;
                    const isPrev = index === prevIndex;

                    return (
                      <div
                        key={suggestion}
                        className={`absolute inset-0 flex items-center transition-all duration-500 ${isActive
                          ? 'translate-y-0 opacity-100'
                          : isPrev
                            ? '-translate-y-full opacity-0'
                            : 'translate-y-full opacity-0'
                          }`}
                      >
                        <span className={`text-xs md:text-xs font-medium`} style={{ color: scrollProgress > 0.5 ? '#9ca3af' : '#6b7280' }}>
                          Search &apos;{suggestion}&apos;
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={startVoiceSearch}
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-full border flex items-center justify-center transition-all duration-300 ${isListening
                    ? 'bg-rose-500 border-rose-600 shadow-[0_0_15px_rgba(244,63,94,0.5)] scale-110'
                    : 'bg-neutral-100/95 border-neutral-200/70 hover:bg-neutral-200 active:scale-90 shadow-sm'
                    }`}
                >
                  <svg
                    width={isListening ? "14" : "15"}
                    height={isListening ? "14" : "15"}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={isListening ? 'text-white' : 'text-neutral-600'}
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="border-b border-neutral-400/40 w-full" style={{ paddingBottom: 0 }}>
        <div
          ref={tabsContainerRef}
          className="relative flex gap-2 md:gap-3 overflow-x-auto scrollbar-hide -mx-4 md:mx-0 px-4 md:px-6 lg:px-8 md:justify-center scroll-smooth"
          style={{ paddingBottom: '12px' }}
          data-padding-bottom="md:8px"
        >
          {/* Sliding Indicator */}
          {indicatorStyle.width > 0 && (
            <div
              className="absolute bottom-0 h-1 bg-neutral-900 rounded-t-md transition-all duration-300 ease-out pointer-events-none"
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 0,
              }}
            />
          )}

          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const tabColor = isActive
              ? 'text-neutral-900'
              : scrollProgress > 0.5
                ? 'text-neutral-600'
                : 'text-neutral-800';

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  if (el) {
                    tabRefs.current.set(tab.id, el);
                  } else {
                    tabRefs.current.delete(tab.id);
                  }
                }}
                onClick={() => handleTabClick(tab.id)}
                className={`flex-shrink-0 flex flex-col md:flex-row items-center justify-center min-w-[50px] md:min-w-fit md:px-3 py-1 md:py-1.5 relative ${tabColor} z-10`}
                style={{
                  transition: 'color 0.3s ease-out',
                }}
                type="button"
              >
                <div className={`mb-0.5 md:hidden w-5 h-5 flex items-center justify-center ${tabColor}`} style={{
                  transition: 'color 0.3s ease-out, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                }}>
                  {tab.icon}
                </div>
                <span
                  className={`text-[10px] md:text-xs md:whitespace-nowrap ${isActive ? 'font-semibold' : 'font-medium'}`}
                  style={{
                    transition: 'font-weight 0.3s ease-out',
                  }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

