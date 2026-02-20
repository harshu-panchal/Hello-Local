import { useState, useEffect, useRef, useCallback } from "react";
import { getActiveShopAds, ShopAd } from "../../../services/api/admin/adminShopAdService";

export default function ShopAdCarousel() {
    const [ads, setAds] = useState<ShopAd[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const touchStartX = useRef<number>(0);
    const touchEndX = useRef<number>(0);

    useEffect(() => {
        const fetchAds = async () => {
            try {
                const response = await getActiveShopAds();
                if (response.success && response.data.length > 0) {
                    setAds(response.data);
                }
            } catch (err) {
                console.error("Failed to fetch shop ads:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAds();
    }, []);

    const goToSlide = useCallback((index: number) => {
        if (isTransitioning || ads.length === 0) return;
        setIsTransitioning(true);
        setCurrentIndex(index);
        setTimeout(() => setIsTransitioning(false), 500);
        // reset auto-play inline
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (ads.length > 1) {
            intervalRef.current = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % ads.length);
            }, 4000);
        }
    }, [isTransitioning, ads.length]);

    const nextSlide = useCallback(() => {
        if (ads.length === 0) return;
        goToSlide((currentIndex + 1) % ads.length);
    }, [ads.length, currentIndex, goToSlide]);

    const prevSlide = useCallback(() => {
        if (ads.length === 0) return;
        goToSlide((currentIndex - 1 + ads.length) % ads.length);
    }, [ads.length, currentIndex, goToSlide]);

    useEffect(() => {
        if (ads.length > 1) {
            intervalRef.current = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % ads.length);
            }, 4000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [ads.length]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.targetTouches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.targetTouches[0].clientX;
    };

    const handleTouchEnd = () => {
        const diff = touchStartX.current - touchEndX.current;
        if (Math.abs(diff) > 50) {
            if (diff > 0) nextSlide();
            else prevSlide();
        }
    };

    if (loading) {
        return (
            <div className="shop-ad-carousel-skeleton">
                <div className="skeleton-shimmer" />
            </div>
        );
    }

    if (ads.length === 0) return null;

    return (
        <div className="shop-ad-carousel-wrapper">
            <div
                className="shop-ad-carousel-container"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Slides */}
                <div className="shop-ad-slides-track">
                    {ads.map((ad, index) => (
                        <div
                            key={ad._id}
                            className={`shop-ad-slide ${index === currentIndex ? "active" : index === (currentIndex - 1 + ads.length) % ads.length ? "prev" : "next"}`}
                            style={{
                                transform: index === currentIndex
                                    ? "translateX(0) scale(1)"
                                    : index === (currentIndex - 1 + ads.length) % ads.length
                                        ? "translateX(-100%) scale(0.95)"
                                        : "translateX(100%) scale(0.95)",
                                opacity: index === currentIndex ? 1 : 0,
                                transition: "all 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                                position: index === currentIndex ? "relative" : "absolute",
                                top: 0, left: 0, right: 0,
                                zIndex: index === currentIndex ? 2 : 1,
                            }}
                        >
                            <div
                                className="shop-ad-card"
                                style={{
                                    backgroundImage: `url(${ad.imageUrl})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                }}
                            >
                                {/* Gradient overlay */}
                                <div className="shop-ad-gradient" />

                                {/* Badge */}
                                {ad.badge && (
                                    <div
                                        className="shop-ad-badge"
                                        style={{ backgroundColor: ad.badgeColor || "#FF4B6E" }}
                                    >
                                        {ad.badge}
                                    </div>
                                )}

                                {/* Content */}
                                <div className="shop-ad-content">
                                    <h3 className="shop-ad-title">{ad.shopName}</h3>
                                    <p className="shop-ad-tagline">{ad.tagline}</p>
                                    {ad.description && (
                                        <p className="shop-ad-description">{ad.description}</p>
                                    )}
                                    {ad.ctaText && (
                                        <a
                                            href={ad.ctaLink || "#"}
                                            className="shop-ad-cta"
                                            onClick={(e) => { if (!ad.ctaLink) e.preventDefault(); }}
                                        >
                                            {ad.ctaText}
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "6px", flexShrink: 0 }}>
                                                <path d="M5 12h14M12 5l7 7-7 7" />
                                            </svg>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Navigation arrows (only if multiple ads) */}
                {ads.length > 1 && (
                    <>
                        <button
                            className="shop-ad-nav-btn shop-ad-nav-prev"
                            onClick={prevSlide}
                            aria-label="Previous ad"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        </button>
                        <button
                            className="shop-ad-nav-btn shop-ad-nav-next"
                            onClick={nextSlide}
                            aria-label="Next ad"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                        </button>
                    </>
                )}

                {/* Dot indicators */}
                {ads.length > 1 && (
                    <div className="shop-ad-dots">
                        {ads.map((_, index) => (
                            <button
                                key={index}
                                className={`shop-ad-dot ${index === currentIndex ? "active" : ""}`}
                                onClick={() => goToSlide(index)}
                                aria-label={`Go to slide ${index + 1}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Ad counter badge */}
            {ads.length > 1 && (
                <div className="shop-ad-counter">
                    {currentIndex + 1} / {ads.length}
                </div>
            )}

            <style>{`
        .shop-ad-carousel-wrapper {
          position: relative;
          padding: 12px 16px 4px;
          background: transparent;
        }

        .shop-ad-carousel-skeleton {
          margin: 12px 16px;
          height: 160px;
          border-radius: 20px;
          overflow: hidden;
          background: linear-gradient(135deg, #f0f0f0, #e8e8e8);
        }

        .skeleton-shimmer {
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .shop-ad-carousel-container {
          position: relative;
          width: 100%;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(255,75,110,0.12);
        }

        .shop-ad-slides-track {
          position: relative;
          width: 100%;
          min-height: 160px;
        }

        .shop-ad-slide {
          width: 100%;
        }

        .shop-ad-card {
          position: relative;
          width: 100%;
          min-height: 160px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 20px;
          border-radius: 20px;
          overflow: hidden;
        }

        .shop-ad-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(0,0,0,0.1) 0%,
            rgba(0,0,0,0.35) 50%,
            rgba(0,0,0,0.72) 100%
          );
          border-radius: 20px;
        }

        .shop-ad-badge {
          position: absolute;
          top: 14px;
          left: 14px;
          padding: 4px 11px;
          border-radius: 50px;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          z-index: 3;
        }

        .shop-ad-content {
          position: relative;
          z-index: 3;
        }

        .shop-ad-title {
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          margin: 0 0 3px;
          line-height: 1.1;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }

        .shop-ad-tagline {
          font-size: 13px;
          color: rgba(255,255,255,0.88);
          margin: 0 0 10px;
          font-weight: 400;
          text-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }

        .shop-ad-description {
          font-size: 11px;
          color: rgba(255,255,255,0.72);
          margin: 0 0 10px;
        }

        .shop-ad-cta {
          display: inline-flex;
          align-items: center;
          padding: 8px 18px;
          background: rgba(255,255,255,0.95);
          color: #1a1a2e;
          border-radius: 50px;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          letter-spacing: 0.01em;
          transition: all 0.2s ease;
          box-shadow: 0 2px 12px rgba(0,0,0,0.2);
          border: none;
          cursor: pointer;
          backdrop-filter: blur(8px);
        }

        .shop-ad-cta:hover {
          background: #fff;
          transform: scale(1.04);
          box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        }

        .shop-ad-nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,0.9);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          transition: all 0.2s ease;
          color: #1a1a2e;
          backdrop-filter: blur(4px);
        }

        .shop-ad-nav-btn:hover {
          background: #fff;
          transform: translateY(-50%) scale(1.08);
        }

        .shop-ad-nav-prev { left: 10px; }
        .shop-ad-nav-next { right: 10px; }

        .shop-ad-dots {
          position: absolute;
          bottom: 14px;
          right: 16px;
          display: flex;
          gap: 5px;
          z-index: 10;
        }

        .shop-ad-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          background: rgba(255,255,255,0.5);
          transition: all 0.3s ease;
          padding: 0;
        }

        .shop-ad-dot.active {
          background: #fff;
          width: 18px;
          border-radius: 10px;
        }

        .shop-ad-counter {
          position: absolute;
          bottom: 18px;
          left: 30px;
          font-size: 11px;
          color: rgba(255,255,255,0.85);
          font-weight: 600;
          z-index: 10;
          letter-spacing: 0.03em;
          pointer-events: none;
        }
      `}</style>
        </div>
    );
}
