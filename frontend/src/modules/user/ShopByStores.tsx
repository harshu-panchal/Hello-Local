import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHomeContent } from '../../services/api/customerHomeService';
import { useLocation } from '../../hooks/useLocation';
import { StoreCard } from './components/common/StoreCard';
import { UserEmptyState } from './components/common';
import LocationPermissionRequest from '../../components/LocationPermissionRequest';
import {
  ArrowLeftIcon,
  SearchIcon,
  StorefrontIcon,
  LocationPinIcon,
} from './components/common/UserIcons';

export default function ShopByStores() {
  const navigate = useNavigate();
  const { location: userLocation } = useLocation();

  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showLocationModal, setShowLocationModal] = useState(false);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await getHomeContent(
          undefined,
          userLocation?.latitude,
          userLocation?.longitude
        );

        if (response.success && response.data) {
          const localSellers = response.data.nearbySellers || [];
          const specialtyShops = response.data.curatedShops || response.data.shops || [];

          // Combine both local sellers and curated shops without duplicates
          const map = new Map<string, any>();
          [...localSellers, ...specialtyShops].forEach((item: any) => {
            const key = item.storeId || item.id || item._id;
            if (key && !map.has(key)) {
              map.set(key, item);
            }
          });
          setShops(Array.from(map.values()));
        } else {
          setShops([]);
        }
      } catch (err) {
        console.error('Failed to fetch stores:', err);
        setError('Failed to load stores. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchShops();
  }, [userLocation?.latitude, userLocation?.longitude]);

  // Extract unique categories from shops
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    shops.forEach((s) => {
      const catName = s.category?.name || (typeof s.category === 'string' ? s.category : '') || s.categories;
      if (catName && typeof catName === 'string') {
        catName.split(',').forEach((c) => {
          const trimmed = c.trim();
          if (trimmed) set.add(trimmed);
        });
      }
    });
    return ['all', ...Array.from(set)];
  }, [shops]);

  // Filtered shops
  const filteredShops = useMemo(() => {
    return shops.filter((shop) => {
      const name = (shop.storeName || shop.name || '').toLowerCase();
      const cat = (shop.category?.name || (typeof shop.category === 'string' ? shop.category : '') || shop.categories || '').toLowerCase();
      const area = (shop.area || shop.city || '').toLowerCase();
      const query = searchQuery.toLowerCase().trim();

      const matchesSearch = !query || name.includes(query) || cat.includes(query) || area.includes(query);
      const matchesCategory = selectedCategory === 'all' || cat.includes(selectedCategory.toLowerCase());

      return matchesSearch && matchesCategory;
    });
  }, [shops, searchQuery, selectedCategory]);

  const locationText = useMemo(() => {
    if (userLocation?.city && userLocation?.state) {
      return `${userLocation.city}, ${userLocation.state}`;
    }
    if (userLocation?.city) {
      return userLocation.city;
    }
    return 'Your Location';
  }, [userLocation]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 transition-colors min-h-[36px]"
                aria-label="Back"
              >
                <ArrowLeftIcon size={16} />
              </button>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  Partner Stores
                </h1>
                <div
                  onClick={() => setShowLocationModal(true)}
                  className="flex items-center gap-1 text-[11px] text-slate-500 font-medium cursor-pointer hover:text-[#FF2E7A] transition-colors"
                  title="Click to change location"
                >
                  <LocationPinIcon size={11} className="text-[#FF2E7A]" />
                  <span className="truncate max-w-[200px]">{locationText}</span>
                  <span className="text-[10px] text-[#FF2E7A] font-bold underline ml-0.5">Change</span>
                </div>
              </div>
            </div>

            {/* Total Count Badge */}
            <div className="px-2.5 py-1 bg-[#FFF1F4] text-[#FF2E7A] text-xs font-bold rounded-lg border border-[#FFE4EA]">
              {filteredShops.length} {filteredShops.length === 1 ? 'Store' : 'Stores'}
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-3 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stores by name, category, or area..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF2E7A]/20 focus:border-[#FF2E7A] transition-all"
            />
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <SearchIcon size={14} />
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          {categoriesList.length > 2 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pt-2.5 pb-0.5">
              {categoriesList.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all capitalize min-h-[30px] ${
                    selectedCategory === cat
                      ? 'bg-[#FF2E7A] text-white shadow-2xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {cat === 'all' ? 'All Stores' : cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-4">
        {loading ? (
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold text-slate-500">Discovering local stores...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
            <div className="w-14 h-14 bg-[#FFF1F4] rounded-2xl flex items-center justify-center mb-3 border border-[#FFE4EA]">
              <StorefrontIcon size={24} className="text-[#FF2E7A]" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1 tracking-tight">Oops! Something went wrong</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-xs">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-[#FF2E7A] text-white rounded-full text-xs font-bold shadow-xs hover:bg-[#E02269] transition-colors min-h-[40px]"
            >
              Try Refreshing
            </button>
          </div>
        ) : filteredShops.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {filteredShops.map((shop, idx) => {
              const shopId = shop.storeId || shop._id || shop.id;
              const shopName = shop.storeName || shop.name || 'Local Store';
              const shopCategory =
                shop.category?.name || (typeof shop.category === 'string' ? shop.category : '') || shop.categories || 'Department Store';
              const rating = shop.rating || 4.8;
              const distance = shop.distance !== undefined ? `${shop.distance} km` : (shop.type === 'shop' ? 'Verified Partner' : 'Near You');
              const area = shop.area || shop.city || shop.address?.city || 'Neighborhood';
              const time = shop.deliveryTime || (shop.distance ? `${Math.round(15 + shop.distance * 4)}-${Math.round(25 + shop.distance * 4)} mins` : '20-30 mins');
              const offer = shop.offer || (shop.distance && shop.distance <= 3 ? 'Free Delivery' : 'Fast Delivery');
              const imageUrl = shop.bannerImage || shop.image || shop.logo || (shop.productImages && shop.productImages[0]) || null;

              return (
                <StoreCard
                  key={shopId || idx}
                  id={shopId}
                  name={shopName}
                  category={shopCategory}
                  imageUrl={imageUrl}
                  rating={rating}
                  featured={shop.isShopOpen !== false}
                  distance={distance}
                  area={area}
                  eta={time}
                  offerText={offer}
                />
              );
            })}
          </div>
        ) : (
          <div className="py-12">
            <UserEmptyState
              icon={<StorefrontIcon size={28} className="text-[#FF2E7A]" />}
              title="No stores found"
              description={
                searchQuery
                  ? `No stores match "${searchQuery}". Try a different keyword.`
                  : 'No partner stores found in your service area yet. Please check back soon.'
              }
            />
          </div>
        )}
      </main>

      {/* Location Change Modal */}
      {showLocationModal && (
        <LocationPermissionRequest
          onLocationGranted={() => setShowLocationModal(false)}
          skipable={true}
          title="Search by Place"
          description="Search your area, neighborhood, or city to find stores near you."
          forceOpen={true}
        />
      )}
    </div>
  );
}
