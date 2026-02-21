import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getActiveShopAds, ShopAd } from "../../../services/api/admin/adminShopAdService";

const FALLBACK_ADS: ShopAd[] = [
    {
        _id: "dummy-1",
        shopName: "Gourmet Garden",
        tagline: "Fresh Organic Produce",
        description: "100% chemical-free vegetables directly from local farms.",
        imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1000",
        badge: "FRESH",
        badgeColor: "#10b981",
        ctaText: "Shop Now",
        ctaLink: "/products?category=Vegetables",
        order: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        _id: "dummy-2",
        shopName: "Kitchen Masters",
        tagline: "Modern Cookware Essentials",
        description: "Upgrade your kitchen with our premium non-stick collection.",
        imageUrl: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&q=80&w=1000",
        badge: "PREMIUM",
        badgeColor: "#f59e0b",
        ctaText: "View Collection",
        ctaLink: "/products?category=Kitchen",
        order: 2,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];

export default function ShopAdCarousel() {
    const [ads, setAds] = useState<ShopAd[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [direction, setDirection] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchAds = useCallback(async () => {
        try {
            const response = await getActiveShopAds();
            if (response.success && response.data.length > 0) {
                setAds(response.data);
            } else {
                setAds(FALLBACK_ADS);
            }
        } catch (err) {
            console.error("Failed to fetch shop ads:", err);
            setAds(FALLBACK_ADS);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAds();
    }, [fetchAds]);

    const paginate = useCallback((newDirection: number) => {
        setDirection(newDirection);
        setCurrentIndex((prevIndex) => (prevIndex + newDirection + ads.length) % ads.length);
    }, [ads.length]);

    useEffect(() => {
        if (ads.length > 1) {
            intervalRef.current = setInterval(() => {
                paginate(1);
            }, 6000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [ads.length, paginate]);

    const handleNext = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        paginate(1);
    };

    const handlePrev = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        paginate(-1);
    };

    if (loading && ads.length === 0) {
        return (
            <div className="px-4 py-3">
                <div className="h-44 md:h-56 w-full rounded-3xl bg-neutral-100 animate-pulse overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                </div>
            </div>
        );
    }

    if (ads.length === 0) return null;

    const currentAd = ads[currentIndex];

    return (
        <div className="relative group px-4 py-3 select-none">
            <div className="relative h-44 md:h-60 w-full rounded-[2.5rem] overflow-hidden shadow-2xl shadow-rose-500/10 border border-white/10 bg-neutral-900">
                <AnimatePresence initial={false} custom={direction}>
                    <motion.div
                        key={currentIndex}
                        custom={direction}
                        initial={{ opacity: 0, x: direction > 0 ? 300 : -300 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: direction > 0 ? -300 : 300 }}
                        transition={{
                            x: { type: "spring", stiffness: 300, damping: 30 },
                            opacity: { duration: 0.2 }
                        }}
                        className="absolute inset-0"
                    >
                        {/* Background Image with optimized loading */}
                        <div className="absolute inset-0">
                            <img
                                src={currentAd.imageUrl}
                                alt=""
                                className="w-full h-full object-cover scale-105"
                            />
                            {/* Sophisticated Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-black/40 to-transparent" />
                        </div>

                        {/* Content Area */}
                        <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10">
                            <div className="max-w-[70%] space-y-2">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                >
                                    {currentAd.badge && (
                                        <span
                                            className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase text-white shadow-lg"
                                            style={{ backgroundColor: currentAd.badgeColor || '#e11d48' }}
                                        >
                                            {currentAd.badge}
                                        </span>
                                    )}
                                </motion.div>

                                <motion.h3
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-2xl md:text-3xl font-black text-white leading-tight"
                                >
                                    {currentAd.shopName}
                                </motion.h3>

                                <motion.p
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-white/80 text-sm md:text-base font-medium line-clamp-1"
                                >
                                    {currentAd.tagline}
                                </motion.p>

                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    className="pt-2"
                                >
                                    <a
                                        href={currentAd.ctaLink || "#"}
                                        className="inline-flex items-center gap-2 bg-white text-rose-600 px-6 py-2.5 rounded-2xl text-xs font-bold hover:bg-rose-50 transition-all hover:scale-105 active:scale-95 shadow-xl"
                                        onClick={(e) => { if (!currentAd.ctaLink) e.preventDefault(); }}
                                    >
                                        {currentAd.ctaText || "Visit Shop"}
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M5 12h14M12 5l7 7-7 7" />
                                        </svg>
                                    </a>
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Glassmorphism Navigation Controls */}
                {ads.length > 1 && (
                    <>
                        <div className="absolute top-1/2 -translate-y-1/2 left-4 z-20">
                            <button
                                onClick={handlePrev}
                                className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M15 18l-6-6 6-6" />
                                </svg>
                            </button>
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 right-4 z-20">
                            <button
                                onClick={handleNext}
                                className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 18l6-6-6-6" />
                                </svg>
                            </button>
                        </div>

                        {/* Pagination Dots */}
                        <div className="absolute bottom-6 right-8 flex gap-2 z-20">
                            {ads.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        if (intervalRef.current) clearInterval(intervalRef.current);
                                        setDirection(i > currentIndex ? 1 : -1);
                                        setCurrentIndex(i);
                                    }}
                                    className={`h-1.5 transition-all duration-300 rounded-full ${i === currentIndex
                                        ? "bg-white w-6 shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                                        : "bg-white/40 w-1.5 hover:bg-white/60"
                                        }`}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            <style>{`
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </div>
    );
}
