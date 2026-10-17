import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useActiveShopAds } from "../../../hooks/useActiveShopAds";
import { openAd } from "../../../utils/shopAds";

const POPUP_INTERVAL_MS = 50000;
const POPUP_VISIBLE_MS = 9000;

export default function AdPopupAutoWidget({ suppressed = false }: { suppressed?: boolean }) {
  const { ads, loading: isLoading } = useActiveShopAds();
  const shownAdRef = useRef<string | null>(null);
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [remainingVisibleMs, setRemainingVisibleMs] = useState(POPUP_VISIBLE_MS);

  const location = useLocation();
  const navigate = useNavigate();

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleDeadlineRef = useRef<number | null>(null);

  const blockedRoutes = useMemo(() => ["/user/checkout", "/user/checkout/address", "/user/cart", "/checkout", "/checkout/address", "/cart", "/orders", "/user/orders"], []);
  const isBlockedRoute = suppressed || blockedRoutes.some((path) => location.pathname.startsWith(path));

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleNextShow = useCallback((delayMs = POPUP_INTERVAL_MS) => {
    clearShowTimer();
    if (isBlockedRoute || ads.length === 0) return;
    showTimerRef.current = setTimeout(() => {
      setIsVisible(true);
      setRemainingVisibleMs(POPUP_VISIBLE_MS);
      visibleDeadlineRef.current = Date.now() + POPUP_VISIBLE_MS;
    }, delayMs);
  }, [ads.length, clearShowTimer, isBlockedRoute]);

  const hidePopupAndRotate = useCallback((scheduleDelayMs = POPUP_INTERVAL_MS) => {
    setIsVisible(false);
    setIsHovered(false);
    setRemainingVisibleMs(POPUP_VISIBLE_MS);
    visibleDeadlineRef.current = null;
    setIndex((prev) => (ads.length > 0 ? (prev + 1) % ads.length : 0));
    scheduleNextShow(scheduleDelayMs);
  }, [ads.length, scheduleNextShow]);

  useEffect(() => {
    if (isLoading) return;

    clearShowTimer();
    clearHideTimer();

    if (ads.length === 0) {
      setIsVisible(false);
      return;
    }

    scheduleNextShow(POPUP_INTERVAL_MS);

    return () => {
      clearShowTimer();
      clearHideTimer();
    };
  }, [ads.length, clearHideTimer, clearShowTimer, isLoading, scheduleNextShow]);

  useEffect(() => {
    if (!isVisible) {
      clearHideTimer();
      return;
    }

    if (isHovered) {
      clearHideTimer();
      if (visibleDeadlineRef.current) {
        setRemainingVisibleMs(Math.max(0, visibleDeadlineRef.current - Date.now()));
      }
      return;
    }

    const timeout = Math.max(0, remainingVisibleMs);
    visibleDeadlineRef.current = Date.now() + timeout;

    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hidePopupAndRotate(POPUP_INTERVAL_MS);
    }, timeout);

    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer, hidePopupAndRotate, isHovered, isVisible, remainingVisibleMs]);

  useEffect(() => {
    if (!isVisible) return;
    if (!isBlockedRoute) return;
    hidePopupAndRotate(5000);
  }, [hidePopupAndRotate, isBlockedRoute, isVisible]);

  useEffect(() => {
    return () => {
      clearShowTimer();
      clearHideTimer();
    };
  }, [clearHideTimer, clearShowTimer]);

  const currentAd = !isLoading && ads.length > 0 ? ads[index % ads.length] : null;

  const handleClose = () => {
    clearHideTimer();
    hidePopupAndRotate(POPUP_INTERVAL_MS);
  };

  useEffect(() => {
    if (isVisible && shownAdRef.current && shownAdRef.current !== currentAd?._id) hidePopupAndRotate();
    shownAdRef.current = isVisible ? currentAd?._id ?? null : null;
  }, [currentAd?._id, hidePopupAndRotate, isVisible]);

  const handleCtaClick = () => {
    if (!currentAd) return;
    openAd(currentAd.ctaLink, navigate);
    handleClose();
  };

  return (
    <div className="pointer-events-none fixed z-40 right-3 left-3 bottom-40 md:left-auto md:right-5 md:bottom-24 max-h-[calc(100dvh-11rem)] overflow-y-auto">
      <AnimatePresence>
        {isVisible && currentAd && (
          <motion.aside
            key={currentAd._id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="pointer-events-auto relative w-full max-w-[350px] md:max-w-[330px] ml-auto rounded-[18px] border border-white/60 bg-white/90 backdrop-blur-md shadow-[0_14px_34px_rgba(15,23,42,0.18)] overflow-hidden"
            aria-live="polite"
            role="complementary"
            aria-label="Sponsored popup advertisement"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-emerald-100/50 via-white/0 to-sky-100/45" />
            <div className="h-[116px] relative">
              <img
                src={currentAd.imageUrl}
                alt={currentAd.shopName || "Advertisement"}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
              <span className="absolute left-2.5 top-2.5 px-2 py-1 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-white/90 text-neutral-700 border border-white/80">
                Sponsored
              </span>
            </div>

            <div className="relative p-3">
              <h3 className="text-[14px] font-bold text-neutral-900 leading-tight line-clamp-1">
                {currentAd.shopName || currentAd.tagline || "Featured Offer"}
              </h3>
              <p className="text-[12px] text-neutral-600 leading-[1.35] mt-1 line-clamp-2">
                {currentAd.description || currentAd.tagline || "Discover this featured promotion now."}
              </p>
              <button
                type="button"
                onClick={handleCtaClick}
                className="mt-2.5 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[12px] font-semibold px-3 py-1.5 hover:from-emerald-700 hover:to-teal-700 transition-colors"
              >
                {currentAd.ctaText || "Shop Now"}
              </button>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-neutral-900/65 text-white text-xs leading-none flex items-center justify-center hover:bg-neutral-900/80 transition-colors"
              aria-label="Close popup ad"
            >
              X
            </button>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

