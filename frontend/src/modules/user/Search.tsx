import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ProductCard from './components/ProductCard';
import { getProducts } from '../../services/api/customerProductService';
import { getHomeContent } from '../../services/api/customerHomeService';
import { Product } from '../../types/domain';
import { useLocation } from '../../hooks/useLocation';

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
            // Mock visual results based on common objects
            const mockVisualResults = [
              { id: 'v1', name: 'Fresh Organic Tomatoes', price: 120, unit: 'kg', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500', isLive: true, stockStatus: 'In Stock', rating: 4.8 },
              { id: 'v2', name: 'Premium Red Apples', price: 180, unit: 'kg', image: 'https://images.unsplash.com/photo-1560807707-8cc77767d783?w=500', isLive: true, stockStatus: 'In Stock', rating: 4.5 },
              { id: 'v3', name: 'Bell Peppers Trio', price: 90, unit: 'pack', image: 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1233c?w=500', isLive: true, stockStatus: 'In Stock', rating: 4.7 }
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
        // Include user location for seller service radius filtering
        if (location?.latitude && location?.longitude) {
          params.latitude = location.latitude;
          params.longitude = location.longitude;
        }
        const response = await getProducts(params);
        setSearchResults(response.data as unknown as Product[]);
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
        console.error("Error fetching search initial content", error);
      } finally {
        setContentLoading(false);
      }
    };

    if (!searchQuery.trim() && !isVisualSearch) {
      fetchInitialContent();
    }
  }, [searchQuery, isVisualSearch, location?.latitude, location?.longitude]);

  return (
    <div className="pb-24 md:pb-8 bg-white min-h-screen">

      {/* Visual Search Scanning View */}
      {isVisualSearch && visualImage && (
        <div className="px-4 md:px-6 lg:px-8 py-4">
          <div className="relative max-w-sm mx-auto rounded-3xl overflow-hidden shadow-2xl bg-neutral-900 aspect-[3/4] mb-8 group">
            <img src={visualImage} className="w-full h-full object-cover opacity-80" alt="Scanning" />

            {isScanning && (
              <>
                {/* AI Scanning Line Animation */}
                  <motion.div
                    initial={{ top: '0%' }}
                    animate={{ top: '100%' }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FF2E7A] to-transparent shadow-[0_0_15px_rgba(255,46,122,0.8)] z-10"
                  />
                <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white mb-4 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-[#FF2E7A] shadow-[0_0_8px_rgba(255,46,122,0.8)]"></span>
                      <span className="text-sm font-bold tracking-tight uppercase">Analyzing Image...</span>
                    </div>
                    <p className="text-white/60 text-xs font-medium">Identifying fresh produce & local products</p>
                  </div>
                </div>
              </>
            )}

            {!isScanning && (
              <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                <div className="px-3 py-1.5 rounded-full bg-[#FF2E7A]/90 backdrop-blur-md text-white text-[11px] font-black uppercase tracking-widest shadow-lg">
                  Object Found
                </div>
                <button
                  onClick={() => navigate('/search')}
                  className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/30 transition-all shadow-lg"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {!isScanning && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex items-center gap-2 mb-6">
                <div className="h-8 w-1.5 bg-[#FF2E7A] rounded-full"></div>
                <h2 className="text-xl md:text-2xl font-black text-neutral-900 tracking-tight">
                  Visual Matches Found
                </h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                {searchResults.map((product: any) => (
                  <ProductCard
                    key={product.id}
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

      {/* Text Search Results */}
      {searchQuery.trim() && !isVisualSearch && (
        <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6">
          <h2 className="text-lg md:text-2xl font-semibold text-neutral-900 mb-3 md:mb-6">
            Search Results {searchResults.length > 0 && `(${searchResults.length})`}
          </h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF2E7A]"></div>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {searchResults.map((product: any) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categoryStyle={true}
                  showBadge={true}
                  showPackBadge={false}
                  showStockInfo={true}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 md:py-16 text-neutral-500">
              <p className="text-lg md:text-xl mb-2">No products found</p>
              <p className="text-sm md:text-base">Try a different search term</p>
            </div>
          )}
        </div>
      )}

      {/* Trending in your city */}
      {!searchQuery.trim() && (
        <>
          {contentLoading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF2E7A]"></div>
            </div>
          )}

          {!contentLoading && trendingItems.length > 0 && (
            <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6">
              <h2 className="text-lg md:text-2xl font-semibold text-neutral-900 mb-3 md:mb-6">Trending in your city</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                {trendingItems.map((item: any) => (
                  <div
                    key={item.id || item._id}
                    className="bg-white rounded-lg border-2 border-[#FF2E7A] p-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(item.type === 'category' ? `/category/${item.id || item._id}` : `/product/${item.id || item._id}`)}
                  >
                    <div className="w-full h-24 rounded-lg mb-2 overflow-hidden bg-neutral-50 flex items-center justify-center">
                      {item.image || item.imageUrl ? (
                        <img
                          src={item.image || item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-contain bg-white rounded-sm"
                        />
                      ) : (
                        <div className="text-4xl">🔥</div>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-neutral-900 text-center line-clamp-2">
                      {item.name || item.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* See all products - Placeholder or link to popular items */}
          <div className="px-4 md:px-6 lg:px-8 py-2 md:py-4">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2 cursor-pointer" onClick={() => navigate('/user/category/all')}>
              <span className="text-sm md:text-base text-neutral-700 font-medium whitespace-nowrap">Browse all categories ▸</span>
            </div>
          </div>

          {/* Cooking ideas */}
          {!contentLoading && cookingIdeas.length > 0 && (
            <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6">
              <h2 className="text-lg md:text-2xl font-semibold text-neutral-900 mb-3 md:mb-6">Cooking ideas</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {cookingIdeas.map((idea: any, idx: number) => (
                  <div key={idea.id || idea._id || idx} className="relative rounded-lg overflow-hidden aspect-[4/3] bg-neutral-100 cursor-pointer" onClick={() => navigate(`/product/${idea.productId || idea.id}`)}>
                    {idea.image && <img src={idea.image} alt={idea.title} className="w-full h-full object-cover" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                    <div className="absolute bottom-2 left-2 right-2 text-white text-xs font-bold line-clamp-2">{idea.title}</div>
                    <button className="absolute top-2 right-2 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
