import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FloatingCartPill from './FloatingCartPill';
import AdPopupAutoWidget from '../modules/user/components/AdPopupAutoWidget';
import { useLocation as useLocationContext } from '../hooks/useLocation';
import LocationPermissionRequest from './LocationPermissionRequest';
import { useThemeContext } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { getCategoryGradient } from '../utils/themes';
import { getLenis } from '../utils/smoothScroll';
import {
  HomeNavIcon,
  CategoryNavIcon,
  OrdersNavIcon,
  ProfileNavIcon,
  LocationPinIcon,
  SearchIcon,
  MicIcon,
  ChevronDownIcon,
  CloseIcon,
} from '../modules/user/components/common/UserIcons';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mainRef = useRef<HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const { isLocationEnabled, isLocationLoading, location: userLocation } = useLocationContext();
  const [showLocationRequest, setShowLocationRequest] = useState(false);
  const [showLocationChangeModal, setShowLocationChangeModal] = useState(false);
  const { activeCategory } = useThemeContext();
  const { showToast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Chat message state
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! How can I help you today?", isBot: true },
  ]);
  const [inputText, setInputText] = useState("");

  // Voice Search Logic
  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast("Voice search is not supported in your browser", "info");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
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

    recognition.onerror = () => {
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

  const isActive = (path: string) => {
    if (path === '/' && (location.pathname === '/' || location.pathname === '/home')) return true;
    return location.pathname === path;
  };

  // Check if location is required for current route
  const requiresLocation = () => {
    const publicRoutes = ['/', '/landing', '/login', '/signup', '/seller/login', '/seller/signup', '/delivery/login', '/delivery/signup', '/admin/login'];
    if (publicRoutes.includes(location.pathname)) {
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (isLocationLoading) {
      return;
    }

    if (isLocationEnabled) {
      setShowLocationRequest(false);
      return;
    }

    if (!isLocationEnabled && requiresLocation()) {
      setShowLocationRequest(true);
    } else {
      setShowLocationRequest(false);
    }
  }, [isLocationLoading, isLocationEnabled, location.pathname]);

  // Update search query when URL params change
  useEffect(() => {
    const query = searchParams.get('q') || '';
    setSearchQuery(query);
  }, [searchParams]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (location.pathname === '/search') {
      if (value.trim()) {
        setSearchParams({ q: value });
      } else {
        setSearchParams({});
      }
    } else {
      if (value.trim()) {
        navigate(`/search?q=${encodeURIComponent(value)}`);
      }
    }
  };

  // Reset scroll position on route change
  useEffect(() => {
    const isHomePage = location.pathname === '/' || location.pathname === '/home';
    if (isHomePage) {
      return;
    }

    const resetScroll = () => {
      const lenis = getLenis();
      if (lenis) {
        lenis.scrollTo(0, { immediate: true });
      }

      window.scrollTo(0, 0);

      const mainElement = document.querySelector('main');
      if (mainElement) {
        mainElement.scrollTop = 0;
      }
    };

    resetScroll();
    const timer = setTimeout(resetScroll, 50);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const isSearchPage = location.pathname === '/search';
  const isCheckoutPage =
    location.pathname === '/checkout' ||
    location.pathname.startsWith('/checkout/') ||
    location.pathname === '/user/checkout' ||
    location.pathname.startsWith('/user/checkout/');
  const isCartPage = location.pathname === '/cart';
  const isProductDetailPage = location.pathname.startsWith('/product/');

  const showHeader = isSearchPage && !isCheckoutPage && !isCartPage;
  const showSearchBar = isSearchPage && !isCheckoutPage && !isCartPage;
  const showFooter = !isCheckoutPage && !isProductDetailPage;

  const isCategoriesActive =
    location.pathname === '/categories' ||
    location.pathname.startsWith('/category/') ||
    location.pathname.startsWith('/categories/');

  const isHomemadeActive =
    location.pathname === '/homemade' ||
    location.pathname.startsWith('/homemade/');

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#F8FAFC] overflow-x-hidden">
      <div className="w-full bg-[#F8FAFC] min-h-screen flex flex-col overflow-x-hidden">
        {/* 1. Desktop Navigation Bar — Reference-Fidelity Two-Tone Branding & Navigation */}
        {showFooter && (
          <nav className="hidden md:block sticky top-0 z-40 bg-white border-b border-slate-100 shadow-2xs">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              {/* Brand Logo */}
              <Link to="/" className="flex flex-col leading-none hover:opacity-95 transition-opacity">
                <div className="flex items-center">
                  <span className="text-2xl font-black text-[#FF8A00]">Hello</span>
                  <span className="text-2xl font-black text-[#FF2E7A]">Local</span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium tracking-tight mt-0.5">
                  Sab kuch, aapke Local mein
                </span>
              </Link>

              {/* Desktop Location Selector */}
              {userLocation && (userLocation.address || userLocation.city) && (
                <button
                  type="button"
                  onClick={() => setShowLocationChangeModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <LocationPinIcon size={16} className="text-[#FF2E7A]" />
                  <span className="font-bold truncate max-w-[180px]">
                    {userLocation.city || userLocation.address?.split(',')[0] || 'Local Setu'}
                  </span>
                  <ChevronDownIcon size={12} className="text-slate-400" />
                </button>
              )}
            </div>

            {/* Desktop Navigation Links */}
            <div className="flex items-center gap-2 lg:gap-3">
              <Link
                to="/"
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[38px] ${
                  isActive('/')
                    ? 'bg-[#FFF1F4] text-[#FF2E7A] border border-[#FFE4EA]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <HomeNavIcon size={18} className={isActive('/') ? 'text-[#FF2E7A]' : 'text-slate-500'} />
                <span>Home</span>
              </Link>

              <Link
                to="/categories"
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[38px] ${
                  isCategoriesActive
                    ? 'bg-[#FFF1F4] text-[#FF2E7A] border border-[#FFE4EA]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <CategoryNavIcon size={18} className={isCategoriesActive ? 'text-[#FF2E7A]' : 'text-slate-500'} />
                <span>Categories</span>
              </Link>

              <Link
                to="/orders"
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[38px] ${
                  isActive('/orders')
                    ? 'bg-[#FFF1F4] text-[#FF2E7A] border border-[#FFE4EA]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <OrdersNavIcon size={18} className={isActive('/orders') ? 'text-[#FF2E7A]' : 'text-slate-500'} />
                <span>Orders</span>
              </Link>

              <Link
                to="/account"
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[38px] ${
                  isActive('/account')
                    ? 'bg-[#FFF1F4] text-[#FF2E7A] border border-[#FFE4EA]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <ProfileNavIcon size={18} className={isActive('/account') ? 'text-[#FF2E7A]' : 'text-slate-500'} />
                <span>Profile</span>
              </Link>
            </div>
            </div>
          </nav>
        )}

        {/* 2. Sub-Header (For Search Page) */}
        {(showHeader || isSearchPage) && (
          <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-2xs border-b border-slate-100">
            {showSearchBar && (
              <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 w-full">
                <div className="relative flex-1 max-w-xl md:mx-auto">
                  <input
                    type="text"
                    value={isListening ? "Listening..." : searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search for 'milk', 'cake', 'shoe'..."
                    className={`w-full px-4 py-2 pl-10 pr-20 bg-slate-50 border border-slate-200 rounded-full text-base sm:text-xs font-medium text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-all min-h-[42px] ${
                      isListening ? 'ring-2 ring-[#FF2E7A] border-transparent text-[#FF2E7A] font-bold' : ''
                    }`}
                  />
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <SearchIcon size={16} />
                  </span>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={startVoiceSearch}
                      className={`p-1.5 rounded-full text-slate-400 hover:text-[#FF2E7A] transition-colors`}
                      aria-label="Voice Search"
                    >
                      <MicIcon size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={handleCameraClick}
                      className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 md:hidden"
                      aria-label="Camera Visual Search"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="13" r="3" />
                        <path d="M9 5l-1.5 2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2h-3.5L15 5H9z" />
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

        {/* 3. Main Content View */}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto overflow-x-hidden user-page-scroll-buffer w-full"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isLocationEnabled && userLocation ? 'content' : 'location-check'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* 4. Global Floating Cart Pill */}
        <FloatingCartPill />
        <AdPopupAutoWidget />

        {/* 5. Location Permission Request Modals */}
        {showLocationRequest && (
          <LocationPermissionRequest
            onLocationGranted={() => setShowLocationRequest(false)}
            skipable={true}
            title="Select Your Location"
            description="We need your location to show products and stores available near you."
          />
        )}

        {showLocationChangeModal && (
          <LocationPermissionRequest
            onLocationGranted={() => setShowLocationChangeModal(false)}
            skipable={true}
            title="Change Location"
            description="Update your location to see products available near you."
            forceOpen={true}
          />
        )}

        {/* 6. Signature Mobile Bottom Navigation with Elevated Local SETU Hub Button */}
        {showFooter && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-lg user-safe-bottom">
            <div className="relative max-w-lg mx-auto px-3 flex items-center justify-between h-14">
              {/* 1. Home */}
              <Link
                to="/"
                className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors min-h-[44px] ${
                  isActive('/') ? 'text-[#FF2E7A]' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <HomeNavIcon size={20} className={isActive('/') ? 'text-[#FF2E7A]' : 'text-slate-400'} />
                <span className={`text-[10px] mt-0.5 font-medium ${isActive('/') ? 'text-[#FF2E7A] font-bold' : 'text-slate-500'}`}>
                  Home
                </span>
              </Link>

              {/* 2. Categories */}
              <Link
                to="/categories"
                className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors min-h-[44px] ${
                  isCategoriesActive ? 'text-[#FF2E7A]' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <CategoryNavIcon size={20} className={isCategoriesActive ? 'text-[#FF2E7A]' : 'text-slate-400'} />
                <span className={`text-[10px] mt-0.5 font-medium ${isCategoriesActive ? 'text-[#FF2E7A] font-bold' : 'text-slate-500'}`}>
                  Categories
                </span>
              </Link>

              {/* 3. Central Signature "Homemade" Raised Button */}
              <div className="relative flex-1 flex flex-col items-center justify-center">
                <button
                  type="button"
                  onClick={() => navigate('/homemade')}
                  className={`absolute -top-5 w-13 h-13 rounded-full ${
                    isHomemadeActive ? 'bg-[#FF2E7A] scale-105 ring-2 ring-[#FF8A00] ring-offset-2' : 'bg-[#FF2E7A]'
                  } text-white flex items-center justify-center hl-setu-glow border-2 border-white active:scale-95 transition-all touch-target-min shadow-md`}
                  aria-label="Homemade Hub"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <path d="M9 22V12h6v10" />
                  </svg>
                </button>
                <span className={`text-[10px] mt-7 font-medium ${isHomemadeActive ? 'text-[#FF2E7A] font-bold' : 'text-slate-500'}`}>
                  Homemade
                </span>
              </div>

              {/* 4. Orders */}
              <Link
                to="/orders"
                className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors min-h-[44px] ${
                  isActive('/orders') ? 'text-[#FF2E7A]' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <OrdersNavIcon size={20} className={isActive('/orders') ? 'text-[#FF2E7A]' : 'text-slate-400'} />
                <span className={`text-[10px] mt-0.5 font-medium ${isActive('/orders') ? 'text-[#FF2E7A] font-bold' : 'text-slate-500'}`}>
                  Orders
                </span>
              </Link>

              {/* 5. Profile */}
              <Link
                to="/account"
                className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors min-h-[44px] ${
                  isActive('/account') ? 'text-[#FF2E7A]' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <ProfileNavIcon size={20} className={isActive('/account') ? 'text-[#FF2E7A]' : 'text-slate-400'} />
                <span className={`text-[10px] mt-0.5 font-medium ${isActive('/account') ? 'text-[#FF2E7A] font-bold' : 'text-slate-500'}`}>
                  Profile
                </span>
              </Link>
            </div>
          </nav>
        )}

        {/* 7. Chatbot Floating Assistant Drawer */}
        <div className="fixed bottom-20 right-3.5 z-40 md:bottom-6 md:right-6 flex flex-col items-end gap-2.5">
          <AnimatePresence>
            {isChatOpen && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.96 }}
                className="w-[310px] md:w-[360px] h-[430px] md:h-[480px] bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col mb-1.5"
              >
                {/* Header */}
                <div
                  className="p-3.5 flex items-center justify-between text-slate-900 border-b border-slate-100"
                  style={{ background: getCategoryGradient(activeCategory) }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center bg-white/80 border border-white/90 shadow-2xs text-[#FF2E7A]">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-xs text-slate-900 tracking-tight">HelloLocal Helper</h3>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-bold text-slate-600">Online & Ready</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    className="p-1 hover:bg-black/5 rounded-full transition-colors"
                    aria-label="Close chat"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-slate-50">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs shadow-2xs ${
                          msg.isBot
                            ? 'bg-white border border-slate-100 text-slate-800 rounded-tl-none font-medium'
                            : 'bg-[#FF2E7A] text-white rounded-tr-none font-bold'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input Area */}
                <div className="p-2.5 bg-white border-t border-slate-100">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!inputText.trim()) return;
                      const newMsg = { id: Date.now(), text: inputText, isBot: false };
                      setMessages([...messages, newMsg]);
                      setInputText('');
                      setTimeout(() => {
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: Date.now() + 1,
                            text: `Thanks for reaching out! A local store helper will assist you with "${newMsg.text}" right away.`,
                            isBot: true,
                          },
                        ]);
                      }, 1000);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-medium focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 outline-none transition-all"
                    />
                    <button
                      type="submit"
                      className="p-2 rounded-full bg-[#FF2E7A] text-white shadow-2xs active:scale-90 transition-all min-h-[34px] min-w-[34px] flex items-center justify-center"
                      aria-label="Send message"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                      </svg>
                    </button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chatbot Toggle Trigger */}
          <button
            type="button"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-all active:scale-95 bg-[#FF2E7A] text-white border-2 border-white touch-target-min"
            aria-label="Chatbot Assistant"
          >
            {isChatOpen ? (
              <CloseIcon size={18} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
