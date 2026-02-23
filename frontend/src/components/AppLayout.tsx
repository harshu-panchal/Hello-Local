import { ReactNode, useEffect, useRef, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FloatingCartPill from './FloatingCartPill';
import AdPopupAutoWidget from '../modules/user/components/AdPopupAutoWidget';
import { useLocation as useLocationContext } from '../hooks/useLocation';
import LocationPermissionRequest from './LocationPermissionRequest';
import { useThemeContext } from '../context/ThemeContext';

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
  const { currentTheme } = useThemeContext();

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
        navigate(`/search?q=${encodeURIComponent(value)}`);
      }
    }
  };


  const SCROLL_POSITION_KEY = 'home-scroll-position';

  // Reset scroll position when navigating to any page (smooth, no flash)
  // BUT skip for Home page if there's a saved scroll position to restore
  useEffect(() => {
    const isHomePage = location.pathname === '/' || location.pathname === '/user/home';

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
  const isCategoriesActive = isActive('/categories') || location.pathname.startsWith('/category/');

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

    if (mainElement) {
      mainElement.addEventListener('scroll', handleScroll, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Also reset nav visibility when location changes
  useEffect(() => {
    setIsNavVisible(true);
    lastScrollY.current = 0;
  }, [location.pathname]);

  const isProductDetailPage = location.pathname.startsWith('/product/');
  const isSearchPage = location.pathname === '/search';
  const isCheckoutPage = location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const isCartPage = location.pathname === '/cart';
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
              <Link to="/" className="flex items-center hover:opacity-90 transition-opacity">
                <img src="/logo.png?v=4" alt="Hello Local" className="h-10 w-10 object-contain rounded-lg shadow-sm" />
              </Link>

              <div className="flex items-center gap-6 lg:gap-8">
                {/* Home */}
                <Link
                  to="/"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/')
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: isActive('/') ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {isActive('/') ? (
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

                {/* Order Again */}
                <Link
                  to="/order-again"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/order-again')
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: isActive('/order-again') ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {isActive('/order-again') ? (
                      <path d="M5 8V6C5 4.34315 6.34315 3 8 3H16C17.6569 3 19 4.34315 19 6V8H21C21.5523 8 22 8.44772 22 9V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V9C2 8.44772 2.44772 8 3 8H5Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    ) : (
                      <path d="M5 8V6C5 4.34315 6.34315 3 8 3H16C17.6569 3 19 4.34315 19 6V8H21C21.5523 8 22 8.44772 22 9V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V9C2 8.44772 2.44772 8 3 8H5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
                    )}
                  </svg>
                  <span className="font-medium text-sm">Order Again</span>
                </Link>

                {/* Categories */}
                <Link
                  to="/categories"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${(isActive('/categories') || location.pathname.startsWith('/category/'))
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: (isActive('/categories') || location.pathname.startsWith('/category/')) ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {(isActive('/categories') || location.pathname.startsWith('/category/')) ? (
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

                {/* Profile */}
                <Link
                  to="/account"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/account')
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: isActive('/account') ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {isActive('/account') ? (
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

                  <div className="relative flex-1 max-w-2xl md:mx-auto">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search for products..."
                      className="w-full px-4 py-2.5 pl-10 bg-neutral-50 border border-neutral-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent md:py-3"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">🔍</span>
                  </div>
                </div>
              )}
            </header>
          )}

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
                <Link
                  to="/categories"
                  className="absolute left-1/2 -translate-x-1/2 -top-7 z-20 w-12 h-12 rounded-full text-white flex items-center justify-center shadow-[0_10px_22px_rgba(0,0,0,0.28)] border-2 border-white/15"
                  style={{
                    background: `linear-gradient(135deg, ${currentTheme.primary[0]}, ${currentTheme.primary[1]})`
                  }}
                  aria-label="Categories"
                >
                  <motion.svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    animate={{ rotate: categoriesRotation }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                  >
                    <path d="M12 5V19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </motion.svg>
                </Link>

                <div
                  className="h-16 rounded-2xl shadow-[0_10px_24px_rgba(0,0,0,0.32)] border border-white/10 px-2.5 flex items-end pb-2"
                  style={{
                    background: `linear-gradient(to right, ${currentTheme.primary[0]}, ${currentTheme.primary[1]})`
                  }}
                >
                  <div className="absolute left-1/2 -translate-x-1/2 -top-px w-16 h-8 bg-transparent overflow-hidden pointer-events-none">
                    <div className="w-16 h-16 -mt-9 rounded-full bg-white/95" />
                  </div>

                  <Link to="/" className="flex-1 flex flex-col items-center justify-end">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className={isActive('/') ? 'text-white' : 'text-white/75'}>
                      <path d="M3 11L12 4L21 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 10V20H18V10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                    <span className={`text-[10px] mt-0.5 ${isActive('/') ? 'text-white font-semibold' : 'text-white/75 font-medium'}`}>Home</span>
                  </Link>

                  <Link to="/order-again" className="flex-1 flex flex-col items-center justify-end">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className={isActive('/order-again') ? 'text-white' : 'text-white/75'}>
                      <path d="M6 8H18L17 19H7L6 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M9 8V6C9 4.9 9.9 4 11 4H13C14.1 4 15 4.9 15 6V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span className={`text-[10px] mt-0.5 ${isActive('/order-again') ? 'text-white font-semibold' : 'text-white/75 font-medium'}`}>Order</span>
                  </Link>

                  <div className="w-12" />

                  <Link to="/categories" className="flex-1 flex flex-col items-center justify-end">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className={isCategoriesActive ? 'text-white' : 'text-white/75'}>
                      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="2" />
                      <circle cx="17" cy="7" r="2" stroke="currentColor" strokeWidth="2" />
                      <circle cx="7" cy="17" r="2" stroke="currentColor" strokeWidth="2" />
                      <circle cx="17" cy="17" r="2" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <span className={`text-[10px] mt-0.5 ${isCategoriesActive ? 'text-white font-semibold' : 'text-white/75 font-medium'}`}>Categories</span>
                  </Link>

                  <Link to="/account" className="flex-1 flex flex-col items-center justify-end">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className={isActive('/account') ? 'text-white' : 'text-white/75'}>
                      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
                      <path d="M5 20C5 16.7 8 14.5 12 14.5C16 14.5 19 16.7 19 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span className={`text-[10px] mt-0.5 ${isActive('/account') ? 'text-white font-semibold' : 'text-white/75 font-medium'}`}>Profile</span>
                  </Link>
                </div>
              </div>
            </motion.nav>
          )}
        </div>
      </div>
    </div>
  );
}


