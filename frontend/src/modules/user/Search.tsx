import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import ProductCard from './components/ProductCard';
import { getProducts } from '../../services/api/customerProductService';
import { getHomeContent } from '../../services/api/customerHomeService';
import { Product } from '../../types/domain';
import { useLocation } from '../../hooks/useLocation';
import { UserEmptyState, UserImage } from './components/common';
import { SearchIcon, ChevronRightIcon, SparklesIcon, CategoryNavIcon } from './components/common/UserIcons';

export default function Search() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { location } = useLocation();
  const searchQuery = searchParams.get('q') || '';
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [trendingItems, setTrendingItems] = useState<any[]>([]);
  const [cookingIdeas, setCookingIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(true);

  const isVisualSearch = searchParams.get('visual') === 'true';
  const [visualImage, setVisualImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Fetch products based on search query
  useEffect(() => {
    const fetchProducts = async () => {
      // If visual search, skip text search and handle scanning
      if (isVisualSearch) {
        const storedImage = sessionStorage.getItem('visualSearchImage');
        if (storedImage) {
          setVisualImage(storedImage);
          setIsScanning(true);
          // Simulate AI scanning
          setTimeout(() => {
            setIsScanning(false);
            const mockVisualResults = [
              {
                id: 'v1',
                name: 'Fresh Organic Tomatoes',
                price: 120,
                unit: 'kg',
                isLive: true,
                stockStatus: 'In Stock',
                rating: 4.8,
              },
              {
                id: 'v2',
                name: 'Premium Red Apples',
                price: 180,
                unit: 'kg',
                isLive: true,
                stockStatus: 'In Stock',
                rating: 4.5,
              },
              {
                id: 'v3',
                name: 'Bell Peppers Trio',
                price: 90,
                unit: 'pack',
                isLive: true,
                stockStatus: 'In Stock',
                rating: 4.7,
              },
            ];
            setSearchResults(mockVisualResults as any);
          }, 3000);
        }
        return;
      }

      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        const params: any = { search: searchQuery };
        if (location?.latitude && location?.longitude) {
          params.latitude = location.latitude;
          params.longitude = location.longitude;
        }
        const response = await getProducts(params);
        setSearchResults((response.data as unknown as Product[]) || []);
      } catch (error) {
        console.error('Error searching products:', error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [searchQuery, isVisualSearch, location]);

  // Fetch trending/home content for initial view
  useEffect(() => {
    const fetchInitialContent = async () => {
      try {
        const response = await getHomeContent(
          undefined,
          location?.latitude,
          location?.longitude
        );
        if (response.success && response.data) {
          setTrendingItems(response.data.trending || []);
          setCookingIdeas(response.data.cookingIdeas || []);
        }
      } catch (error) {
        console.error('Error fetching search initial content', error);
      } finally {
        setContentLoading(false);
      }
    };

    if (!searchQuery.trim() && !isVisualSearch) {
      fetchInitialContent();
    }
  }, [searchQuery, isVisualSearch, location?.latitude, location?.longitude]);

  return (
    <div className="pb-24 md:pb-12 bg-[#F8FAFC] min-h-screen">
      {/* 1. Visual Search Scanning View */}
      {isVisualSearch && visualImage && (
        <div className="px-3.5 sm:px-6 lg:px-8 py-4 max-w-[1440px] mx-auto">
          <div className="relative max-w-sm mx-auto rounded-2xl overflow-hidden shadow-md bg-slate-900 aspect-[3/4] mb-6 border border-slate-200">
            <img
              src={visualImage}
              className="w-full h-full object-cover opacity-85"
              alt="Scanning"
            />

            {isScanning && (
              <>
                <motion.div
                  initial={{ top: '0%' }}
                  animate={{ top: '100%' }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="absolute left-0 right-0 h-1 bg-[#FF2E7A] shadow-[0_0_12px_rgba(255,46,122,0.9)] z-10"
                />
                <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                  <div className="text-center px-4">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 text-white mb-2 border border-white/20">
                      <span className="w-2 h-2 rounded-full bg-[#FF2E7A] animate-ping" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Analyzing Image...
                      </span>
                    </div>
                    <p className="text-white/80 text-xs font-medium">
                      Identifying fresh groceries & items
                    </p>
                  </div>
                </div>
              </>
            )}

            {!isScanning && (
              <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                <div className="px-3 py-1 rounded-full bg-[#FF2E7A] text-white text-[11px] font-bold uppercase tracking-wider shadow-xs">
                  Item Identified
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/search')}
                  className="w-7 h-7 rounded-full bg-white/40 text-white flex items-center justify-center hover:bg-white/60 transition-all text-xs"
                  aria-label="Close visual search"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {!isScanning && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-1 bg-[#FF2E7A] rounded-full" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Visual Matches Found
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {searchResults.map((product: any) => (
                  <ProductCard
                    key={product.id || product._id}
                    product={product}
                    categoryStyle={true}
                    showBadge={true}
                    showPackBadge={false}
                    showStockInfo={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Text Search Results */}
      {searchQuery.trim() && !isVisualSearch && (
        <div className="px-3.5 sm:px-6 lg:px-8 py-4 max-w-[1440px] mx-auto">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              Search Results {searchResults.length > 0 && `(${searchResults.length})`}
            </h2>
            <span className="text-xs text-slate-400 font-medium">for "{searchQuery}"</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                <div
                  key={i}
                  className="h-52 bg-white rounded-2xl border border-slate-100 p-2.5 flex flex-col justify-between"
                >
                  <div className="w-full h-28 rounded-xl user-image-shimmer" />
                  <div className="w-3/4 h-3.5 rounded-full user-image-shimmer mt-2" />
                  <div className="w-1/2 h-3 rounded-full user-image-shimmer" />
                </div>
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {searchResults.map((product: any) => (
                <ProductCard
                  key={product.id || product._id}
                  product={product}
                  categoryStyle={true}
                  showBadge={true}
                  showPackBadge={false}
                  showStockInfo={true}
                />
              ))}
            </div>
          ) : (
            <UserEmptyState
              icon={<SearchIcon size={28} className="text-[#FF2E7A]" />}
              title="No products found"
              description={`We couldn't find any items matching "${searchQuery}". Try checking spelling or search a broader term.`}
              actionText="Browse Categories"
              onAction={() => navigate('/categories')}
            />
          )}
        </div>
      )}

      {/* 3. Initial Empty / Trending State */}
      {!searchQuery.trim() && !isVisualSearch && (
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-4 space-y-5">
          {contentLoading && (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#FF2E7A]" />
            </div>
          )}

          {/* Quick Categories shortcut banner */}
          <div
            onClick={() => navigate('/category/all')}
            className="p-3.5 sm:p-4 bg-[#FFF1F4] border border-[#FFE4EA] rounded-2xl flex items-center justify-between cursor-pointer hover:bg-[#FFE4EA]/70 transition-colors active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#FF2E7A] shadow-2xs border border-[#FFE4EA]">
                <CategoryNavIcon size={20} />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                  Explore full product catalog
                </h4>
                <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                  Browse all local items across all categories
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-[#FF2E7A] flex items-center gap-0.5">
              <span>Browse</span>
              <ChevronRightIcon size={14} />
            </span>
          </div>

          {!contentLoading && trendingItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <SparklesIcon size={16} className="text-[#FF8A00]" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  Trending in your neighborhood
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
                {trendingItems.map((item: any) => (
                  <div
                    key={item.id || item._id}
                    className="bg-white rounded-2xl border border-slate-100 p-2.5 cursor-pointer hover:shadow-xs transition-all active:scale-98 flex flex-col items-center text-center group shadow-2xs"
                    onClick={() =>
                      navigate(
                        item.type === 'category'
                          ? `/category/${item.id || item._id}`
                          : `/product/${item.id || item._id}`
                      )
                    }
                  >
                    <div className="w-full h-20 rounded-xl mb-1.5 overflow-hidden bg-slate-50 flex items-center justify-center">
                      <UserImage
                        src={item.image || item.imageUrl}
                        alt={item.name || item.title}
                        categoryFallback="grocery"
                        className="w-full h-full object-contain p-1.5 group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-800 line-clamp-1 leading-tight">
                      {item.name || item.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cooking ideas */}
          {!contentLoading && cookingIdeas.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  Cooking ideas & recipes
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {cookingIdeas.map((idea: any, idx: number) => (
                  <div
                    key={idea.id || idea._id || idx}
                    className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-slate-900 cursor-pointer group shadow-2xs hover:shadow-xs transition-all active:scale-98"
                    onClick={() => navigate(`/product/${idea.productId || idea.id}`)}
                  >
                    <UserImage
                      src={idea.image}
                      alt={idea.title}
                      categoryFallback="food"
                      className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white text-[11px] font-bold line-clamp-2 drop-shadow-sm leading-snug">
                      {idea.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
