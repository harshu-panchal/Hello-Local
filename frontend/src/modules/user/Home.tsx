import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import HomeHero from "./components/HomeHero";
import { getHomeContent } from "../../services/api/customerHomeService";
import { getHeaderCategoriesPublic } from "../../services/api/headerCategoryService";
import { useLocation } from "../../hooks/useLocation";
import { useLoading } from "../../context/LoadingContext";
import PageLoader from "../../components/PageLoader";

const ShopAdCarousel = React.lazy(() => import("./components/ShopAdCarousel"));
const LowestPricesEver = React.lazy(() => import("./components/LowestPricesEver"));
const CategoryTileSection = React.lazy(() => import("./components/CategoryTileSection"));
const FeaturedThisWeek = React.lazy(() => import("./components/FeaturedThisWeek"));
const ProductCard = React.lazy(() => import("./components/ProductCard"));

import { useThemeContext } from "../../context/ThemeContext";

export default function Home() {
  const navigate = useNavigate();
  const { location } = useLocation();
  const { activeCategory, setActiveCategory } = useThemeContext();
  const { startRouteLoading, stopRouteLoading } = useLoading();
  const activeTab = activeCategory; // mapping for existing code compatibility
  const setActiveTab = setActiveCategory;
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollHandledRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const SCROLL_POSITION_KEY = 'home-scroll-position';

  const [activeTabName, setActiveTabName] = useState('All');

  const handleTabChange = (tabId: string, tabName?: string) => {
    setActiveTab(tabId);
    if (tabName) setActiveTabName(tabName);
  };

  const isFoodCategory = activeTab === 'food' || activeTab === 'dark' || activeTabName.toLowerCase() === 'food' || activeTabName.toLowerCase().includes('food') || activeTab?.toLowerCase().includes('food');

  const [dietPreference, setDietPreference] = useState<'all' | 'veg' | 'non-veg'>('all');

  const isProductMatchDiet = (product: any, diet: string) => {
    if (diet === 'all') return true;

    const productDietStr = (
      (product?.tags || []).join(' ') + ' ' +
      (product?.productName || '') + ' ' +
      (product?.name || '') + ' ' +
      (product?.description || '') + ' ' +
      (product?.category?.name || '') + ' ' +
      (product?.category?.slug || '') + ' ' +
      (product?.categoryId || '')
    ).toLowerCase();

    // Keywords determining non-veg
    const hasNonVeg = productDietStr.includes('non-veg') ||
      productDietStr.includes('non veg') ||
      productDietStr.includes('chicken') ||
      productDietStr.includes('mutton') ||
      productDietStr.includes('fish') ||
      productDietStr.includes('egg') ||
      productDietStr.includes('meat');

    if (diet === 'non-veg') {
      return hasNonVeg;
    }
    if (diet === 'veg') {
      return !hasNonVeg;
    }
    return true;
  };

  // Reset diet preference when switching tabs
  useEffect(() => {
    setDietPreference('all');
  }, [activeTab]);

  // State for dynamic data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeData, setHomeData] = useState<any>({
    bestsellers: [],
    categories: [],
    homeSections: [], // Dynamic sections created by admin
    shops: [],
    promoBanners: [],
    trending: [],
    cookingIdeas: [],
  });

  const [products, setProducts] = useState<any[]>([]);

  // Function to save scroll position before navigation
  const saveScrollPosition = () => {
    const mainElement = document.querySelector('main');
    const scrollPos = Math.max(
      mainElement ? mainElement.scrollTop : 0,
      window.scrollY || 0,
      document.documentElement.scrollTop || 0
    );
    if (scrollPos > 0) {
      sessionStorage.setItem(SCROLL_POSITION_KEY, scrollPos.toString());
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const isTabSwitch = !isInitialLoadRef.current;
      if (!isTabSwitch) {
        startRouteLoading();
      }
      setLoading(true);
      setError(null);
      try {
        const slug = activeTab === "all" ? undefined : activeTab;
        const response = await getHomeContent(
          slug,
          location?.latitude,
          location?.longitude
        );
        if (response.success && response.data) {
          setHomeData(response.data);
          if (response.data.bestsellers) {
            setProducts(response.data.bestsellers);
          }
        } else {
          setError("Failed to load content. Please try again.");
        }
      } catch (error) {
        console.error("Failed to fetch home content", error);
        setError("Network error. Please check your connection.");
      } finally {
        setLoading(false);
        if (!isTabSwitch) {
          stopRouteLoading();
          isInitialLoadRef.current = false;
        }
      }
    };

    fetchData();

    // Preload Logic (kept same)
    const preloadHeaderCategories = async () => {
      try {
        // ... (rest of preload logic same as before, no changes needed here but including for context if needed, 
        // but easier to just keep the original preload logic if it's separate. 
        // Wait, the ReplacementContent must replace the targeting block entirely.)
        // To avoid large duplicate block, I will just include the fetchData call and dependencies update.
      } catch (error) {
        console.debug("Failed to preload header categories:", error);
      }
    };

    // We only want to preload once on mount, so we can keep the preload logic in a separate effect or just here
    // But since this effect now runs on activeTab change, we shouldn't preload every time.
    // Let's separate preload to a mount-only effect or use a ref.

  }, [location?.latitude, location?.longitude, activeTab]);

  // Separate effect for preloading only on mount/location change, NOT activeTab
  useEffect(() => {
    const preloadHeaderCategories = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const headerCategories = await getHeaderCategoriesPublic(true);
        const slugsToPreload = ['all', ...headerCategories.map(cat => cat.slug)];

        const batchSize = 2;
        for (let i = 0; i < slugsToPreload.length; i += batchSize) {
          const batch = slugsToPreload.slice(i, i + batchSize);
          await Promise.all(
            batch.map(slug =>
              getHomeContent(
                slug,
                location?.latitude,
                location?.longitude,
                true,
                5 * 60 * 1000,
                true
              ).catch(err => {
                console.debug(`Failed to preload data for ${slug}:`, err);
              })
            )
          );
          if (i + batchSize < slugsToPreload.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      } catch (error) {
        console.debug("Failed to preload header categories:", error);
      }
    };

    preloadHeaderCategories();
  }, [location?.latitude, location?.longitude]);

  // Restore scroll position when returning to this page
  useEffect(() => {
    // Only restore scroll after data has loaded
    if (!loading && homeData.shops) {
      // Use a ref to ensure we only handle initial scroll once per mount
      if (scrollHandledRef.current) return;
      scrollHandledRef.current = true;

      const savedScrollPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
      if (savedScrollPosition) {
        const scrollY = parseInt(savedScrollPosition, 10);

        const performScroll = () => {
          const mainElement = document.querySelector('main');
          if (mainElement) {
            mainElement.scrollTop = scrollY;
          }
          window.scrollTo(0, scrollY);
        };

        // Try multiple times to ensure scroll is applied even if content is still rendering
        requestAnimationFrame(() => {
          performScroll();
          requestAnimationFrame(() => {
            performScroll();
            // Final fallback after a small delay for any late-rendering content
            setTimeout(performScroll, 100);
            setTimeout(performScroll, 300);
          });
        });

        // Clear the saved position after some time to ensure AppLayout can also see it if needed
        // but Home.tsx is the primary restorer now.
        setTimeout(() => {
          sessionStorage.removeItem(SCROLL_POSITION_KEY);
        }, 1000);
      } else {
        // No saved position, ensure we start at the top
        const performReset = () => {
          const mainElement = document.querySelector('main');
          if (mainElement) {
            mainElement.scrollTop = 0;
          }
          window.scrollTo(0, 0);
        };
        requestAnimationFrame(performReset);
        setTimeout(performReset, 100);
      }
    }
  }, [loading, homeData.shops]);

  // Global click/touch listener to save scroll position before any navigation
  useEffect(() => {
    const handleNavigationEvent = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      // If clicking a link, button, or any element with cursor-pointer (like product cards/store tiles)
      if (target.closest('a') || target.closest('button') || target.closest('[role="button"]') || target.closest('.cursor-pointer')) {
        saveScrollPosition();
      }
    };

    window.addEventListener('click', handleNavigationEvent, { capture: true });
    window.addEventListener('touchstart', handleNavigationEvent, { capture: true, passive: true });
    return () => {
      window.removeEventListener('click', handleNavigationEvent, { capture: true });
      window.removeEventListener('touchstart', handleNavigationEvent, { capture: true });
    };
  }, []);

  // Removed duplicate saveScrollPosition
  const getFilteredProducts = (tabId: string) => {
    if (tabId === "all") {
      return products;
    }
    return products.filter(
      (p) =>
        p.categoryId === tabId ||
        (p.category && (p.category._id === tabId || p.category.slug === tabId))
    );
  };

  const filteredProducts = useMemo(() => {
    const defaultFiltered = getFilteredProducts(activeTab);
    return defaultFiltered.filter(p => isProductMatchDiet(p, dietPreference));
  }, [activeTab, products, dietPreference]);

  const filteredHomeSections = useMemo(() => {
    if (!homeData.homeSections) return [];
    if (dietPreference === 'all') return homeData.homeSections;

    return homeData.homeSections.map((section: any) => {
      if (section.displayType === "products" && section.data) {
        return {
          ...section,
          data: section.data.filter((p: any) => isProductMatchDiet(p, dietPreference))
        };
      }
      return section;
    });
  }, [homeData.homeSections, dietPreference]);

  const filteredLowestPrices = useMemo(() => {
    if (!homeData.lowestPrices) return [];
    return homeData.lowestPrices.filter((p: any) => isProductMatchDiet(p, dietPreference));
  }, [homeData.lowestPrices, dietPreference]);

  if (loading && !products.length) {
    return <PageLoader />; // Let the global IconLoader handle the initial loading state
  }

  if (error && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Oops! Something went wrong</h3>
        <p className="text-gray-600 mb-6 max-w-xs">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-green-600 text-white rounded-full font-medium hover:bg-green-700 transition-colors"
        >
          Try Refreshing
        </button>
      </div>
    );
  }

  const unlimitedFashionSection = filteredHomeSections?.find((s: any) => s.title?.toLowerCase() === 'unlimited fashion');
  const otherHomeSections = filteredHomeSections?.filter((s: any) => s.title?.toLowerCase() !== 'unlimited fashion');

  const renderHomeSection = (section: any) => {
    const columnCount = Number(section.columns) || 4;

    if (section.displayType === "products" && section.data && section.data.length > 0) {
      // Strict column mapping as requested - applies to ALL screen sizes including mobile
      const gridClasses: Record<number, string> = {
        2: "grid-cols-2",
        3: "grid-cols-3",
        4: "grid-cols-4",
        6: "grid-cols-6",
        8: "grid-cols-8"
      };
      const gridClass = gridClasses[columnCount] || "grid-cols-4";

      // Use compact mode for 4 or more columns to fit content on mobile
      const isCompact = columnCount >= 4;
      const gapClass = columnCount >= 4 ? "gap-2" : "gap-3 md:gap-4";

      return (
        <div key={section.id || section._id || section.title} className="mt-6 mb-6 md:mt-8 md:mb-8">
          {section.title && (
            <h2 className="text-lg md:text-2xl font-semibold text-neutral-900 mb-3 md:mb-6 px-4 md:px-6 lg:px-8 tracking-tight capitalize">
              {section.title}
            </h2>
          )}
          <div className="px-4 md:px-6 lg:px-8">
            <div className={`grid ${gridClass} ${gapClass}`}>
              {section.data.map((product: any) => (
                <ProductCard
                  key={product.id || product._id}
                  product={product}
                  categoryStyle={true}
                  showBadge={true}
                  showPackBadge={false}
                  showStockInfo={false}
                  compact={isCompact}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <CategoryTileSection
        key={section.id || section._id || section.title}
        title={section.title}
        tiles={section.data || []}
        columns={columnCount as 2 | 3 | 4 | 6 | 8}
        showProductCount={false}
      />
    );
  };

  return (
    <div className="bg-white min-h-screen pb-20 md:pb-0" ref={contentRef}>
      {/* Hero Header with Gradient and Tabs */}
      <HomeHero activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Empty space since toggle was moved */}

      {/* Shop Ad Carousel - Sponsored Shop Ads */}
      <Suspense fallback={<div className="h-40 bg-neutral-100 animate-pulse rounded-lg mx-4"></div>}>
        <ShopAdCarousel />
      </Suspense>

      {/* LOWEST PRICES EVER Section */}
      <Suspense fallback={<div className="h-40 bg-neutral-100 animate-pulse rounded-lg mx-4"></div>}>
        <LowestPricesEver activeTab={activeTab} products={filteredLowestPrices} />
      </Suspense>

      {/* Unlimited Fashion Section */}
      {unlimitedFashionSection && (
        <div className="bg-white">
          {renderHomeSection(unlimitedFashionSection)}
        </div>
      )}

      {/* Veg / Non-veg Filter Toggle - Only for food section */}
      {isFoodCategory && (
        <div className={`flex justify-center items-center px-4 pt-6 pb-2 relative z-10 transition-colors duration-500 ${!isFoodCategory ? 'bg-neutral-50' : ''}`} style={{ backgroundColor: isFoodCategory ? '#FFCCCC' : undefined }}>
          <div className="bg-white rounded-full p-[6px] shadow-sm border border-neutral-200/80 flex items-center gap-1 w-[90%] md:w-auto overflow-hidden">
            <button
              onClick={() => setDietPreference('all')}
              className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-full text-xs md:text-sm font-extrabold transition-all duration-300 transform whitespace-nowrap ${dietPreference === 'all' ? 'bg-neutral-800 text-white shadow-md scale-100' : 'text-neutral-600 hover:bg-neutral-100 scale-95'}`}
            >
              All Items
            </button>
            <button
              onClick={() => setDietPreference('veg')}
              className={`flex-1 md:flex-none px-3 md:px-5 py-2 rounded-full flex justify-center items-center gap-2 text-xs md:text-sm font-bold transition-all duration-300 transform ${dietPreference === 'veg' ? 'bg-green-100/90 text-green-800 border border-green-300 shadow-sm scale-105' : 'text-neutral-600 hover:bg-green-50/50 hover:text-green-700 border border-transparent scale-95'}`}
            >
              <div className={`w-4 h-4 border ${dietPreference === 'veg' ? 'border-green-700' : 'border-green-600'} rounded-sm flex items-center justify-center bg-white p-[2px] transition-colors`}>
                <div className={`w-2 h-2 rounded-full ${dietPreference === 'veg' ? 'bg-green-700' : 'bg-green-600'}`}></div>
              </div>
              <span className={dietPreference === "veg" ? "text-green-800" : "text-neutral-700"}>Veg</span>
            </button>
            <button
              onClick={() => setDietPreference('non-veg')}
              className={`flex-1 md:flex-none px-3 md:px-5 py-2 rounded-full flex justify-center items-center gap-2 text-xs md:text-sm font-bold transition-all duration-300 transform ${dietPreference === 'non-veg' ? 'bg-red-100/90 text-red-800 border border-red-300 shadow-sm scale-105' : 'text-neutral-600 hover:bg-red-50/50 hover:text-red-700 border border-transparent scale-95'}`}
            >
              <div className={`w-4 h-4 border ${dietPreference === 'non-veg' ? 'border-red-700' : 'border-red-600'} rounded-sm flex items-center justify-center bg-white p-[2px] transition-colors`}>
                <div className={`w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-${dietPreference === 'non-veg' ? 'red-700' : 'red-600'} mt-[1px]`}></div>
              </div>
              <span className={dietPreference === "non-veg" ? "text-red-800" : "text-neutral-700"}>Non-Veg</span>
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        className={`${!isFoodCategory ? 'bg-neutral-50' : ''} -mt-2 pt-1 space-y-5 md:space-y-8 md:pt-4 transition-colors duration-500`}
        style={{ backgroundColor: isFoodCategory ? '#FFCCCC' : undefined }}>
        {/* Dynamic Home Sections - Render sections created by admin */}
        {filteredHomeSections && filteredHomeSections.length > 0 && (
          <>
            {otherHomeSections.map(renderHomeSection)}
          </>
        )}

        {/* Filtered Products Section */}
        {/* Filtered Products Section */}
        {activeTab !== "all" && filteredProducts.length > 0 && (
          <div data-products-section className="mt-6 mb-6 md:mt-8 md:mb-8">
            <h2 className="text-lg md:text-2xl font-semibold text-neutral-900 mb-3 md:mb-6 px-4 md:px-6 lg:px-8 tracking-tight capitalize">
              {activeTab === "grocery" ? "Grocery Items" : activeTab}
            </h2>
            <div className="px-4 md:px-6 lg:px-8">
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-4">
                {filteredProducts.map((product) => (
                  <Suspense fallback={<div className="h-40 bg-white border border-neutral-100 rounded-lg"></div>} key={product.id}>
                    <ProductCard
                      product={product}
                      categoryStyle={true}
                      showBadge={true}
                      showPackBadge={false}
                      showStockInfo={true}
                    />
                  </Suspense>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bestsellers Section */}
        {activeTab === "all" && (
          <>
            <div className="mt-2 md:mt-4">
              <CategoryTileSection
                title="Bestsellers"
                tiles={
                  homeData.bestsellers && homeData.bestsellers.length > 0
                    ? homeData.bestsellers
                      .slice(0, 6)
                      .map((card: any) => {
                        // Bestseller cards have categoryId and productImages array from backend
                        return {
                          id: card.id,
                          categoryId: card.categoryId,
                          name: card.name || "Category",
                          productImages: card.productImages || [],
                          productCount: card.productCount || 0,
                        };
                      })
                    : []
                }
                columns={3}
                showProductCount={true}
              />
            </div>

            {/* Featured this week Section */}
            <Suspense fallback={<div className="h-60 bg-neutral-100 animate-pulse rounded-lg mx-4"></div>}>
              <FeaturedThisWeek />
            </Suspense>

            {/* Shop by Store Section */}
            <div className="mb-6 mt-6 md:mb-8 md:mt-8">
              <h2 className="text-lg md:text-2xl font-semibold text-neutral-900 mb-3 md:mb-6 px-4 md:px-6 lg:px-8 tracking-tight">
                Shop by Store
              </h2>
              <div className="px-4 md:px-6 lg:px-8">
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 md:gap-4">
                  {(homeData.shops || []).map((tile: any) => {
                    const hasImages =
                      tile.image ||
                      (tile.productImages &&
                        tile.productImages.filter(Boolean).length > 0);

                    return (
                      <div key={tile.id} className="flex flex-col">
                        <div
                          onClick={() => {
                            const storeSlug =
                              tile.slug || tile.id.replace("-store", "");
                            saveScrollPosition();
                            navigate(`/store/${storeSlug}`);
                          }}
                          className="block bg-white rounded-xl shadow-sm border border-neutral-200 hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
                          {hasImages ? (
                            <img
                              src={
                                tile.image ||
                                (tile.productImages
                                  ? tile.productImages[0]
                                  : "")
                              }
                              alt={tile.name}
                              className="w-full h-16 object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className={`w-full h-16 flex items-center justify-center text-3xl text-neutral-300 ${tile.bgColor || "bg-neutral-50"
                                }`}>
                              {tile.name.charAt(0)}
                            </div>
                          )}
                        </div>

                        {/* Tile name - outside card */}
                        <div className="mt-1.5 text-center">
                          <span className="text-xs font-semibold text-neutral-900 line-clamp-2 leading-tight">
                            {tile.name}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
