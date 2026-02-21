import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { getActiveShopAds, ShopAd } from "../../../services/api/admin/adminShopAdService";

type PopupAd = ShopAd & {
  status?: string;
  startDateTime?: string;
  endDateTime?: string;
  startDate?: string;
  endDate?: string;
};

const SESSION_KEY = "ad-popup-widget-closed";
const SHOW_DELAY_MS = 4000;
const ROTATION_MS = 12000;

function parseDate(input?: string): number | null {
  if (!input) return null;
  const ts = new Date(input).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function isAdLive(ad: PopupAd, nowMs: number): boolean {
  if (typeof ad.status === "string" && ad.status.toLowerCase() !== "approved") {
    return false;
  }

  if (ad.isActive === false) return false;

  const startMs = parseDate(ad.startDateTime) ?? parseDate(ad.startDate) ?? parseDate(ad.approvedAt);
  const endMs = parseDate(ad.endDateTime) ?? parseDate(ad.endDate) ?? parseDate(ad.expiresAt);

  if (startMs !== null && nowMs < startMs) return false;
  if (endMs !== null && nowMs > endMs) return false;

  return true;
}

export default function AdPopupWidget() {
  const [ads, setAds] = useState<PopupAd[]>([]);
  const [index, setIndex] = useState(0);
  const [isReadyToShow, setIsReadyToShow] = useState(false);
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const rotationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const blockedRoutes = useMemo(
    () => ["/checkout", "/checkout/address", "/cart"],
    []
  );
  const isBlockedRoute = blockedRoutes.some((path) => location.pathname.startsWith(path));

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setDismissedForSession(true);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReadyToShow(true);
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchAds = async () => {
      try {
        const response = await getActiveShopAds();
        const now = Date.now();
        const liveAds = (response?.data || []).filter((ad) => isAdLive(ad as PopupAd, now));
        if (mounted) {
          setAds(liveAds);
          setIndex(0);
        }
      } catch (err) {
        if (mounted) setAds([]);
        console.error("Ad popup: failed to fetch ads", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchAds();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (rotationRef.current) {
      clearInterval(rotationRef.current);
      rotationRef.current = null;
    }

    if (!dismissedForSession && ads.length > 1) {
      rotationRef.current = setInterval(() => {
        setIndex((prev) => (prev + 1) % ads.length);
      }, ROTATION_MS);
    }

    return () => {
      if (rotationRef.current) {
        clearInterval(rotationRef.current);
        rotationRef.current = null;
      }
    };
  }, [ads.length, dismissedForSession]);

  const shouldShow = !isLoading && !dismissedForSession && isReadyToShow && !isBlockedRoute && ads.length > 0;
  const currentAd = shouldShow ? ads[index] : null;

  const handleClose = () => {
    setDismissedForSession(true);
    sessionStorage.setItem(SESSION_KEY, "1");
  };

  const handleCtaClick = () => {
    if (!currentAd?.ctaLink) return;
    const isExternal = /^https?:\/\//i.test(currentAd.ctaLink);
    if (isExternal) {
      window.open(currentAd.ctaLink, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(currentAd.ctaLink);
  };

  return (
    <div className="pointer-events-none fixed z-40 right-3 left-3 bottom-20 md:left-auto md:right-5 md:bottom-5">
      <AnimatePresence mode="wait">
        {currentAd && (
          <motion.aside
            key={currentAd._id}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="pointer-events-auto relative w-full max-w-[320px] md:max-w-[286px] ml-auto rounded-2xl border border-neutral-200/90 bg-white/95 backdrop-blur-sm shadow-[0_10px_24px_rgba(15,23,42,0.16)] overflow-hidden"
            aria-live="polite"
            role="complementary"
            aria-label="Sponsored promotion"
          >
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-emerald-50/60 via-white/0 to-sky-50/50" />

            <div className="relative flex items-center gap-2.5 p-2.5 pr-10">
              <img
                src={currentAd.imageUrl}
                alt={currentAd.shopName || "Advertisement"}
                loading="lazy"
                decoding="async"
                className="w-16 h-16 md:w-[72px] md:h-[72px] object-cover rounded-xl border border-neutral-200 flex-shrink-0"
              />

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.08em]">Sponsored</p>
                <h3 className="text-[13px] font-bold text-neutral-900 leading-tight line-clamp-1 mt-0.5">
                  {currentAd.shopName || currentAd.tagline || "Featured Offer"}
                </h3>
                <p className="text-[11px] text-neutral-600 leading-4 line-clamp-2 mt-0.5">
                  {currentAd.description || currentAd.tagline || "Discover more from this store."}
                </p>
                <button
                  type="button"
                  onClick={handleCtaClick}
                  className="mt-1.5 inline-flex items-center justify-center rounded-md bg-emerald-600 text-white text-[11px] font-semibold px-2.5 py-1.5 hover:bg-emerald-700 transition-colors"
                >
                  {currentAd.ctaText || "Shop Now"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-neutral-900/65 text-white text-xs leading-none flex items-center justify-center hover:bg-neutral-900/80 transition-colors"
              aria-label="Close ad popup"
            >
              X
            </button>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
