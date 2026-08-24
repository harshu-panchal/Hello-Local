import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getActiveShopAds, ShopAd } from "../../../services/api/admin/adminShopAdService";
import { useNavigate } from "react-router-dom";

const FALLBACK_ADS: ShopAd[] = [
    {
        _id: "grocery-1",
        shopName: "Farm Fresh Market",
        tagline: "100% Organic & Chemical-Free",
        description: "Fresh vegetables and fruits sourced directly from local farmers.",
        imageUrl: "",
        badge: "FARM FRESH",
        badgeColor: "#16A34A",
        ctaText: "Shop Fresh",
        ctaLink: "/categories",
        order: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        _id: "grocery-2",
        shopName: "Daily Dairy & Bakery",
        tagline: "Morning Milk, Bread & Eggs",
        description: "Delivered to your doorstep within 15 minutes every morning.",
        imageUrl: "",
        badge: "DAILY ESSENTIAL",
        badgeColor: "#FF2E7A",
        ctaText: "Order Now",
        ctaLink: "/shop-by-stores",
        order: 2,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
};

export default function ShopAdCarousel() {
    const navigate = useNavigate();
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
            <div className="w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2">
                <div className="h-32 sm:h-40 w-full bg-slate-100 animate-pulse rounded-2xl" />
            </div>
        );
    }

    if (ads.length === 0) return null;

    const currentAd = ads[currentIndex];

    return (
        <div className="relative group w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2 select-none">
            <div className="relative h-[130px] sm:h-[160px] md:h-[180px] w-full overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xs border border-slate-100">
                <AnimatePresence initial={false} custom={direction}>
                    <motion.div
                        key={currentIndex}
                        custom={direction}
                        initial={{ opacity: 0, x: direction > 0 ? 300 : -300 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: direction > 0 ? -300 : 300 }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={1}
                        onDragEnd={(_, { offset, velocity }) => {
                            const swipe = swipePower(offset.x, velocity.x);
                            if (swipe < -swipeConfidenceThreshold) {
                                handleNext();
                            } else if (swipe > swipeConfidenceThreshold) {
                                handlePrev();
                            }
                        }}
                        transition={{
                            x: { type: "spring", stiffness: 300, damping: 30 },
                            opacity: { duration: 0.2 }
                        }}
                        className="absolute inset-0 w-full h-full flex items-center justify-between p-4 sm:p-6 md:p-8 cursor-pointer"
                        onClick={() => {
                            if (currentAd.ctaLink) {
                                navigate(currentAd.ctaLink);
                            }
                        }}
                    >
                        {/* Background Image if available */}
                        {currentAd.imageUrl && (
                            <img
                                src={currentAd.imageUrl}
                                alt={currentAd.shopName}
                                className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-luminosity"
                            />
                        )}

                        {/* Content */}
                        <div className="relative z-10 max-w-[70%] sm:max-w-[60%]">
                            {currentAd.badge && (
                                <span
                                    className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full text-white uppercase tracking-wider mb-1 shadow-2xs"
                                    style={{ backgroundColor: currentAd.badgeColor || '#FF2E7A' }}
                                >
                                    {currentAd.badge}
                                </span>
                            )}
                            <h3 className="text-sm sm:text-lg md:text-xl font-bold text-white leading-tight">
                                {currentAd.shopName}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-300 font-medium line-clamp-1 mt-0.5">
                                {currentAd.tagline || currentAd.description}
                            </p>
                        </div>

                        {/* CTA */}
                        <div className="relative z-10">
                            <span className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#FF2E7A] hover:bg-[#E02269] text-white shadow-xs">
                                <span>{currentAd.ctaText || "Explore"}</span>
                            </span>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
