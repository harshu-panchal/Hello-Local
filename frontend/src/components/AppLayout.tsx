import { ReactNode, useEffect, useRef, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FloatingCartPill from './FloatingCartPill';
import AdPopupAutoWidget from '../modules/user/components/AdPopupAutoWidget';
import { useLocation as useLocationContext } from '../hooks/useLocation';
import LocationPermissionRequest from './LocationPermissionRequest';
import { useThemeContext } from '../context/ThemeContext';
import { getCategoryGradient } from '../utils/themes';
import { getLenis } from '../utils/smoothScroll';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mainRef = useRef<HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [categoriesRotation, setCategoriesRotation] = useState(0);
  const [prevCategoriesActive, setPrevCategoriesActive] = useState(false);
  const { isLocationEnabled, isLocationLoading, location: userLocation } = useLocationContext();
  const [showLocationRequest, setShowLocationRequest] = useState(false);
  const [showLocationChangeModal, setShowLocationChangeModal] = useState(false);
  const { currentTheme, activeCategory } = useThemeContext();
  const [isListening, setIsListening] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Chat message state (for demo functionality)
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! How can I help you today?", isBot: true },
  ]);
  const [inputText, setInputText] = useState("");

  // Voice Search Logic
  const startVoiceSearch = () => {
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
        handleSearchChange(transcript);
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        sessionStorage.setItem('visualSearchImage', reader.result as string);
        navigate(`/search?visual=true`);
      };
      reader.readAsDataURL(file);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // ... (rest of the component logic)

  // Check if location is required for current route
  const requiresLocation = () => {
    const publicRoutes = ['/login', '/signup', '/seller/login', '/seller/signup', '/delivery/login', '/delivery/signup', '/admin/login'];
    // Don't require location on login/signup pages
    if (publicRoutes.includes(location.pathname)) {
      return false;
    }
    // Require location for ALL routes (not just authenticated users)
    // This ensures location is mandatory for everyone visiting the platform
    return true;
  };

  // ... (rest of the component logic)

  // ...

  // ALWAYS show location request modal on app load if location is not enabled
  // This ensures modal appears on every app open, regardless of browser permission state
  useEffect(() => {
    // Wait for initial loading to complete
    if (isLocationLoading) {
      return;
    }

    // If location is enabled, hide modal
    if (isLocationEnabled) {
      setShowLocationRequest(false);
      return;
    }

    // If location is NOT enabled and route requires location, ALWAYS show modal
    // This will trigger on every app open until user explicitly confirms location
    if (!isLocationEnabled && requiresLocation()) {
      setShowLocationRequest(true);
    } else {
      setShowLocationRequest(false);
    }
  }, [isLocationLoading, isLocationEnabled, location.pathname]);

  // ...



  // Update search query when URL params change
  useEffect(() => {
    const query = searchParams.get('q') || '';
    setSearchQuery(query);
  }, [searchParams]);

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (location.pathname === '/search') {
      // Update URL params when on search page
      if (value.trim()) {
        setSearchParams({ q: value });
      } else {
        setSearchParams({});
      }
    } else {
      // Navigate to search page with query
      if (value.trim()) {
        navigate(`/user/search?q=${encodeURIComponent(value)}`);
      }
    }
  };


  const SCROLL_POSITION_KEY = 'home-scroll-position';

  // Reset scroll position when navigating to any page (smooth, no flash)
  // BUT skip for Home page if there's a saved scroll position to restore
  useEffect(() => {
    const isHomePage = location.pathname === '/user' || location.pathname === '/user/home';

    // Home page handles its own scroll restoration and reset logic
    if (isHomePage) {
      return;
    }

    // Use requestAnimationFrame to prevent visual flash
    requestAnimationFrame(() => {
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
      // Also reset window scroll smoothly
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  }, [location.pathname]);

  // Track categories active state for rotation
  const isCategoriesActive = isActive('/user/categories') || location.pathname.startsWith('/user/category/');

  useEffect(() => {
    if (isCategoriesActive && !prevCategoriesActive) {
      // Rotate clockwise when clicked (becoming active)
      setCategoriesRotation(prev => prev + 360);
      setPrevCategoriesActive(true);
    } else if (!isCategoriesActive && prevCategoriesActive) {
      // Rotate counter-clockwise when unclicked (becoming inactive)
      setCategoriesRotation(prev => prev - 360);
      setPrevCategoriesActive(false);
    }
  }, [isCategoriesActive, prevCategoriesActive]);

  // Hide bottom nav on scroll down, show on scroll up
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const isScrollTicking = useRef(false);

  useEffect(() => {
    const SCROLL_DELTA = 8;
    const HIDE_AFTER = 70;

    const getCurrentScrollY = () => {
      const mainElement = mainRef.current;
      if (mainElement && mainElement.scrollTop > 0) {
        return mainElement.scrollTop;
      }
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const updateVisibility = () => {
      const currentScrollY = getCurrentScrollY();
      const diff = currentScrollY - lastScrollY.current;

      if (Math.abs(diff) >= SCROLL_DELTA) {
        if (diff > 0 && currentScrollY > HIDE_AFTER) {
          setIsNavVisible(false);
        } else {
          setIsNavVisible(true);
        }
        lastScrollY.current = currentScrollY;
      }

      isScrollTicking.current = false;
    };

    const handleScroll = () => {
      if (isScrollTicking.current) return;
      isScrollTicking.current = true;
      requestAnimationFrame(updateVisibility);
    };

    const mainElement = mainRef.current;
    lastScrollY.current = getCurrentScrollY();

    const lenis = getLenis();

    if (lenis) {
      lenis.on('scroll', handleScroll);
    } else {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }

    if (mainElement) {
      mainElement.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      if (lenis) {
        lenis.off('scroll', handleScroll);
      } else {
        window.removeEventListener('scroll', handleScroll);
      }

      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // Also reset nav visibility when location changes
  useEffect(() => {
    setIsNavVisible(true);
    lastScrollY.current = 0;
  }, [location.pathname]);

  const isProductDetailPage = location.pathname.startsWith('/product/');
  const isSearchPage = location.pathname === '/search';
  const isCheckoutPage = location.pathname === '/user/checkout' || location.pathname.startsWith('/user/checkout/') || location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const isCartPage = location.pathname === '/user/cart' || location.pathname === '/cart';
  const showHeader = isSearchPage && !isCheckoutPage && !isCartPage;
  const showSearchBar = isSearchPage && !isCheckoutPage && !isCartPage;
  const showFooter = !isCheckoutPage && !isProductDetailPage;

  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
      {/* Desktop Container Wrapper */}
      <div className="md:w-full md:bg-white md:min-h-screen overflow-x-hidden">
        <div className="md:w-full md:min-h-screen md:flex md:flex-col overflow-x-hidden">
          {/* Top Navigation Bar - Desktop Only */}
          {showFooter && (
            <nav
              className="hidden md:flex items-center justify-between px-6 lg:px-8 py-3 shadow-sm transition-colors duration-300"
              style={{
                background: `linear-gradient(to right, ${currentTheme.primary[0]}, ${currentTheme.primary[1]})`,
                borderBottom: `1px solid ${currentTheme.primary[0]}`
              }}
            >
              <Link to="/user" className="flex items-center hover:opacity-90 transition-opacity">
                <img src="/logo.png?v=4" alt="Hello Local" className="h-10 w-10 object-contain rounded-lg shadow-sm" />
              </Link>

              <div className="flex items-center gap-6 lg:gap-8">
                <Link
                  to="/user"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${(isActive('/user/home') || isActive('/user'))
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: (isActive('/user/home') || isActive('/user')) ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {(isActive('/user/home') || isActive('/user')) ? (
                      <>
                        <path d="M2 12L12 4L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" />
                        <rect x="4" y="12" width="16" height="8" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      </>
                    ) : (
                      <>
                        <path d="M2 12L12 4L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <rect x="4" y="12" width="16" height="8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
                      </>
                    )}
                  </svg>
                  <span className="font-medium text-sm">Home</span>
                </Link>

                <Link
                  to="/user/order-again"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/user/order-again')
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: isActive('/user/order-again') ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {isActive('/user/order-again') ? (
                      <path d="M5 8V6C5 4.34315 6.34315 3 8 3H16C17.6569 3 19 4.34315 19 6V8H21C21.5523 8 22 8.44772 22 9V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V9C2 8.44772 2.44772 8 3 8H5Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    ) : (
                      <path d="M5 8V6C5 4.34315 6.34315 3 8 3H16C17.6569 3 19 4.34315 19 6V8H21C21.5523 8 22 8.44772 22 9V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V9C2 8.44772 2.44772 8 3 8H5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
                    )}
                  </svg>
                  <span className="font-medium text-sm">Order Again</span>
                </Link>

                <Link
                  to="/user/categories"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${(isActive('/user/categories') || location.pathname.startsWith('/user/category/'))
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: (isActive('/user/categories') || location.pathname.startsWith('/user/category/')) ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {(isActive('/user/categories') || location.pathname.startsWith('/user/category/')) ? (
                      <>
                        <circle cx="7" cy="7" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                        <circle cx="17" cy="7" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                        <circle cx="7" cy="17" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                        <circle cx="17" cy="17" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                      </>
                    ) : (
                      <>
                        <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
                        <circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
                        <circle cx="7" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
                        <circle cx="17" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
                      </>
                    )}
                  </svg>
                  <span className="font-medium text-sm">Categories</span>
                </Link>

                <Link
                  to="/user/account"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/user/account')
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: isActive('/user/account') ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {isActive('/user/account') ? (
                      <>
                        <circle cx="12" cy="8" r="4" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                        <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="currentColor" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
                        <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                      </>
                    )}
                  </svg>
                  <span className="font-medium text-sm">Profile</span>
                </Link>
              </div>
            </nav>
          )}

          {/* Sticky Header - Show on search page and other non-home pages, excluding account page */}
          {(showHeader || isSearchPage) && (
            <header className="sticky top-0 z-50 bg-white shadow-sm md:shadow-md md:top-[60px]">
              {/* Location line - only show if user has provided location */}
              {userLocation && (userLocation.address || userLocation.city) && (
                <div className="px-4 md:px-6 lg:px-8 py-2 flex items-center justify-between text-sm">
                  <span className="text-neutral-700 line-clamp-1" title={userLocation?.address || ''}>
                    {userLocation?.address
                      ? userLocation.address.length > 50
                        ? `${userLocation.address.substring(0, 50)}...`
                        : userLocation.address
                      : userLocation?.city && userLocation?.state
                        ? `${userLocation.city}, ${userLocation.state}`
                        : userLocation?.city || ''}
                  </span>
                  <button
                    onClick={() => setShowLocationChangeModal(true)}
                    className="text-blue-600 font-medium hover:text-blue-700 transition-colors flex-shrink-0 ml-2"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Search bar - Hidden on Order Again page */}
              {showSearchBar && (
                <div className="px-4 md:px-6 lg:px-8 pb-3 flex items-center gap-3">
                  <div className="relative flex-1 max-w-2xl md:mx-auto group">
                    <input
                      type="text"
                      value={isListening ? "Listening..." : searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search for products..."
                      className={`w-full px-4 py-2.5 pl-10 pr-12 bg-neutral-50 border border-neutral-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent md:py-3 transition-all ${isListening ? 'ring-2 ring-rose-500 border-transparent text-rose-600 font-bold' : ''}`}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">🔍</span>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        onClick={startVoiceSearch}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isListening
                          ? 'bg-rose-500 text-white shadow-lg animate-pulse'
                          : 'text-neutral-500 hover:bg-neutral-100'
                          }`}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      <button
                        onClick={handleCameraClick}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-all md:hidden"
                        aria-label="Camera Search"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="2.5" />
                          <path d="M9 5l-1.5 2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2h-3.5L15 5H9z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="18" cy="9" r="1.2" fill="currentColor" />
                        </svg>
                      </button>
                      <button
                        className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-all"
                        aria-label="Language Option"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                          <path d="M2.5 12h19M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </header>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            capture="environment"
            className="hidden"
          />

          {/* Scrollable Main Content */}
          <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide pb-24 md:pb-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={isLocationEnabled && userLocation ? 'content' : 'location-check'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-full"
                style={{ minHeight: '100%' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Floating Cart Pill */}
          <FloatingCartPill />
          <AdPopupAutoWidget />

          {/* Location Permission Request Modal - Mandatory for all users */}
          {showLocationRequest && (
            <LocationPermissionRequest
              onLocationGranted={() => setShowLocationRequest(false)}
              skipable={false}
              title="Location Access Required"
              description="We need your location to show you products available near you and enable delivery services. Location access is required to continue."
            />
          )}

          {/* Location Change Modal */}
          {showLocationChangeModal && (
            <LocationPermissionRequest
              onLocationGranted={() => setShowLocationChangeModal(false)}
              skipable={true}
              title="Change Location"
              description="Update your location to see products available near you."
              forceOpen={true}
            />
          )}

          {/* Fixed Bottom Navigation - Mobile Only, Hidden on checkout pages */}
          {showFooter && (
            <motion.nav
              initial={{ y: 0 }}
              animate={{ y: isNavVisible ? 0 : 100 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="fixed bottom-3 left-0 right-0 z-50 md:hidden"
            >
              <div className="relative mx-3">
                <button
                  onClick={() => navigate('/user/local-setu')}
                  className="absolute left-1/2 -translate-x-1/2 -top-7 z-20 w-12 h-12 rounded-full text-black flex items-center justify-center shadow-[0_10px_22px_rgba(0,0,0,0.28)] border-2 border-white/15 active:scale-95 transition-all"
                  style={{
                    background: getCategoryGradient(activeCategory)
                  }}
                  aria-label="Local Setu Services"
                >
                  <div className="flex flex-col items-center justify-center -mt-1 leading-tight text-black drop-shadow-sm">
                    <span className="text-[10px] font-medium tracking-wide lowercase">local</span>
                    <span className="text-[14px] font-black tracking-widest uppercase mt-[1px]">SETU</span>
                  </div>
                </button>

                <div
                  className="h-16 rounded-2xl shadow-[0_10px_24px_rgba(0,0,0,0.32)] border border-white/10 px-2.5 flex items-end pb-2"
                  style={{
                    background: getCategoryGradient(activeCategory)
                  }}
                >
                  <div className="absolute left-1/2 -translate-x-1/2 -top-px w-16 h-8 bg-transparent overflow-hidden pointer-events-none">
                    <div className="w-16 h-16 -mt-9 rounded-full bg-white/95" />
                  </div>

                  <Link to="/user" className="flex-1 flex flex-col items-center justify-end">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={(isActive('/user') || isActive('/user/home')) ? 'text-black' : 'text-black/70'}>
                      <path d="M3 11L12 4L21 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 10V20H18V10" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
                    </svg>
                    <span className={`text-[11px] mt-1 ${(isActive('/user') || isActive('/user/home')) ? 'text-black font-semibold' : 'text-black/70 font-medium'}`}>Home</span>
                  </Link>

                  <Link to="/user/order-again" className="flex-1 flex flex-col items-center justify-end">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={isActive('/user/order-again') ? 'text-black' : 'text-black/70'}>
                      <path d="M6 8H18L17 19H7L6 8Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
                      <path d="M9 8V6C9 4.9 9.9 4 11 4H13C14.1 4 15 4.9 15 6V8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                    <span className={`text-[11px] mt-1 ${isActive('/user/order-again') ? 'text-black font-semibold' : 'text-black/70 font-medium'}`}>Order</span>
                  </Link>

                  <div className="w-12" />

                  <Link to="/user/categories" className="flex-1 flex flex-col items-center justify-end">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={isCategoriesActive ? 'text-black' : 'text-black/70'}>
                      <circle cx="7" cy="7" r="2.2" stroke="currentColor" strokeWidth="2.2" />
                      <circle cx="17" cy="7" r="2.2" stroke="currentColor" strokeWidth="2.2" />
                      <circle cx="7" cy="17" r="2.2" stroke="currentColor" strokeWidth="2.2" />
                      <circle cx="17" cy="17" r="2.2" stroke="currentColor" strokeWidth="2.2" />
                    </svg>
                    <span className={`text-[11px] mt-1 ${isCategoriesActive ? 'text-black font-semibold' : 'text-black/70 font-medium'}`}>Categories</span>
                  </Link>

                  <Link to="/user/account" className="flex-1 flex flex-col items-center justify-end">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={isActive('/user/account') ? 'text-black' : 'text-black/70'}>
                      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2.2" />
                      <path d="M5 20C5 16.7 8 14.5 12 14.5C16 14.5 19 16.7 19 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                    <span className={`text-[11px] mt-1 ${isActive('/user/account') ? 'text-black font-semibold' : 'text-black/70 font-medium'}`}>Profile</span>
                  </Link>
                </div>
              </div>
            </motion.nav>
          )}

          {/* Chatbot Floating Button & Window */}
          <div className="fixed bottom-24 right-4 z-50 md:bottom-10 md:right-10 flex flex-col items-end gap-4">
            {/* Chat Window */}
            <AnimatePresence>
              {isChatOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  className="w-[320px] md:w-[380px] h-[450px] md:h-[500px] bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col mb-2"
                >
                  {/* Header */}
                  <div 
                    className="p-4 flex items-center justify-between text-black shadow-sm"
                    style={{ background: getCategoryGradient(activeCategory) }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center border border-white/30">
                        <img src="/chatbot-icon.png" alt="Bot" className="w-full h-full object-cover scale-[1.3] mix-blend-screen" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">Hello Local Helper</h3>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse border border-white/20" />
                          <span className="text-[10px] font-medium opacity-80">Online & Ready</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsChatOpen(false)}
                      className="p-2 hover:bg-black/5 rounded-full transition-colors"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50/50">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
                        <div 
                          className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                            msg.isBot 
                              ? 'bg-white border border-neutral-100 text-neutral-800 rounded-tl-none' 
                              : 'bg-neutral-900 text-white rounded-tr-none'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Input Area */}
                  <div className="p-4 bg-white border-t border-neutral-100">
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!inputText.trim()) return;
                        const newMsg = { id: Date.now(), text: inputText, isBot: false };
                        setMessages([...messages, newMsg]);
                        setInputText("");
                        // Simple bot response simulation
                        setTimeout(() => {
                          setMessages(prev => [...prev, { 
                            id: Date.now() + 1, 
                            text: `Thanks for your message: "${newMsg.text}". An agent will be with you shortly!`, 
                            isBot: true 
                          }]);
                        }, 1000);
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-2 bg-neutral-100 border-none rounded-full text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                      <button 
                        type="submit"
                        className="p-2.5 rounded-full text-white shadow-md active:scale-90 transition-all"
                        style={{ background: getCategoryGradient(activeCategory) }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5">
                          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Toggle Button */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-xl hover:shadow-2xl transition-all active:scale-95 group overflow-hidden"
              aria-label="Chatbot"
            >
              <AnimatePresence mode="wait">
                {isChatOpen ? (
                  <motion.div 
                    key="close"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }}
                    className="w-full h-full flex items-center justify-center bg-white/20 backdrop-blur-md"
                    style={{ background: getCategoryGradient(activeCategory) }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="chat"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="w-full h-full"
                  >
                    <img src="/chatbot-icon.png" alt="Chat" className="w-full h-full object-cover scale-[1.4] transition-transform group-hover:scale-[1.5] mix-blend-screen" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </div>
    </div >
  );
}


