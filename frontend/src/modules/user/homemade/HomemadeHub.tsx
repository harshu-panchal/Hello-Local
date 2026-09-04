import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLocation as useLocationContext } from '../../../hooks/useLocation';
import { useCart } from '../../../context/CartContext';
import { useToast } from '../../../context/ToastContext';
import {
  LocationPinIcon,
  SearchIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  StarFilledIcon,
  HeartOutlineIcon,
  HeartFilledIcon,
  PlusIcon,
} from '../components/common/UserIcons';
import {
  HOMEMADE_CATEGORIES,
  HOMEMADE_SELLERS,
  HOMEMADE_TRENDING_PRODUCTS,
  HomemadeProduct,
} from './data/homemadeData';

const CheckMarkIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function HomemadeHub() {
  const navigate = useNavigate();
  const { location: userLocation } = useLocationContext();
  const { cart, addToCart } = useCart();
  const { showToast } = useToast();

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});
  const [addedItems, setAddedItems] = useState<Record<string, boolean>>({});

  const cartItemCount = useMemo(() => {
    if (!cart) return 0;
    return cart.itemCount || cart.totalItemCount || cart.items?.length || 0;
  }, [cart]);

  const locationText = useMemo(() => {
    if (!userLocation) return 'Select Location';
    const city = userLocation.city || (typeof userLocation.address === 'string' ? userLocation.address : 'Indore');
    const state = userLocation.state || 'Madhya Pradesh';
    return `${city}, ${state}`;
  }, [userLocation]);

  const toggleWishlist = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    setWishlist((prev) => {
      const next = !prev[productId];
      showToast(next ? 'Added to Homemade Wishlist' : 'Removed from Wishlist', 'success');
      return { ...prev, [productId]: next };
    });
  };

  const handleAddToCart = async (e: React.MouseEvent, product: HomemadeProduct) => {
    e.stopPropagation();
    try {
      await addToCart({
        id: product.id,
        _id: product.id,
        productName: product.name,
        price: product.price,
        discPrice: product.price,
        mainImage: product.imageUrl,
        seller: product.sellerId as any,
        sellerName: product.sellerName,
        stock: 99,
        status: 'Active',
        publish: true,
      } as any);

      setAddedItems((prev) => ({ ...prev, [product.id]: true }));
      showToast(`Added ${product.name} to Cart`, 'success');
      setTimeout(() => {
        setAddedItems((prev) => ({ ...prev, [product.id]: false }));
      }, 1500);
    } catch {
      showToast('Could not add to cart', 'error');
    }
  };

  const filteredTrending = useMemo(() => {
    if (activeCategoryFilter === 'all') return HOMEMADE_TRENDING_PRODUCTS;
    return HOMEMADE_TRENDING_PRODUCTS.filter((p) => p.categorySlug === activeCategoryFilter);
  }, [activeCategoryFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/homemade/category/food?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] pb-28">
      {/* 1. TOP BAR: Deliver to | HelloLocal logo | Notification | Cart */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5">
          <div className="flex items-center justify-between gap-2.5">
            {/* Location Pill */}
            <button
              type="button"
              onClick={() => navigate('/addresses')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl text-left transition-all active:scale-98 max-w-[55%] sm:max-w-xs min-h-[40px]"
              aria-label="Change Delivery Location"
            >
              <div className="w-6 h-6 rounded-full bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A] flex-shrink-0">
                <LocationPinIcon size={14} className="text-[#FF2E7A]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold text-slate-900 leading-tight">Deliver to</span>
                <span className="text-[10px] text-slate-500 font-semibold truncate leading-tight flex items-center gap-0.5">
                  {locationText}
                  <ChevronDownIcon size={10} className="flex-shrink-0 text-slate-400" />
                </span>
              </div>
            </button>

            {/* HelloLocal Wordmark */}
            <div className="hidden sm:flex flex-col items-center">
              <div className="flex items-center leading-none">
                <span className="text-lg font-black text-[#FF8A00]">Hello</span>
                <span className="text-lg font-black text-[#FF2E7A]">Local</span>
                <span className="text-[11px] font-bold text-slate-400 ml-1.5 uppercase tracking-wider">Homemade</span>
              </div>
            </div>

            {/* Right Action Icons: Notification & Cart */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs active:scale-95 transition-all"
                aria-label="Notifications"
              >
                <BellIcon size={17} />
              </button>

              <button
                type="button"
                onClick={() => navigate('/cart')}
                className="relative w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs active:scale-95 transition-all"
                aria-label="Cart"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-[#FF2E7A] text-white text-[10px] font-extrabold rounded-full flex items-center justify-center px-1 shadow-2xs">
                    {cartItemCount}
                  </span>
                )}
              </button>
            </div>
          </div>

            {/* App Brand Tagline on Mobile */}
            <div className="flex sm:hidden items-center justify-between pt-1.5">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-xl font-black text-[#FF8A00]">Hello</span>
              <span className="text-xl font-black text-[#FF2E7A]">Local</span>
              <span className="text-xs font-bold text-[#FF8A00] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200/60 ml-1">
                Homemade
              </span>
            </div>
            <span className="text-[10px] font-semibold text-slate-400">Pure. Fresh. Local.</span>
          </div>
        </div>
      </header>

      {/* 2. SEARCH BAR WITH ORANGE CTA */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 pb-1">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search homemade products..."
              className="w-full pl-10 pr-12 py-3 bg-white border border-slate-200/90 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF8A00]/25 focus:border-[#FF8A00] shadow-2xs transition-all"
            />
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon size={18} />
            </div>
          </div>
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-[#FF8A00] hover:bg-[#E67C00] text-white flex items-center justify-center shadow-xs active:scale-95 transition-all"
            aria-label="Search"
          >
            <SearchIcon size={16} />
          </button>
        </form>
      </section>

      {/* 3. HORIZONTAL CATEGORY PILL FILTER CHIPS */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-3.5 px-3.5">
          <button
            type="button"
            onClick={() => setActiveCategoryFilter('all')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
              activeCategoryFilter === 'all'
                ? 'bg-[#FF2E7A] text-white shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <span>✨</span>
            <span>All</span>
          </button>

          {HOMEMADE_CATEGORIES.map((cat) => {
            const isActive = activeCategoryFilter === cat.slug;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryFilter(cat.slug)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                  isActive
                    ? 'bg-[#FF2E7A] text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.shortName}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. HERO BANNER: "Made with love. From our homes to yours." */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-1.5">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#FFF4EA] via-[#FFF1F4] to-[#FCE7F3] border border-orange-100/80 p-5 sm:p-7 shadow-xs">
          <div className="relative z-10 max-w-[65%] sm:max-w-md">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 leading-tight tracking-tight">
              Made with <span className="text-[#FF2E7A]">love.</span>
              <br />
              From our homes to yours.
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-1.5 leading-relaxed">
              Support local • Support home makers
            </p>
            <button
              type="button"
              onClick={() => navigate('/homemade/category/food')}
              className="mt-3.5 px-4 sm:px-5 py-2 rounded-xl bg-[#6B46C1] hover:bg-[#5835A8] text-white text-xs font-extrabold shadow-2xs active:scale-95 transition-all inline-flex items-center gap-1.5"
            >
              <span>Shop Homemade</span>
              <ChevronRightIcon size={14} />
            </button>
          </div>

          {/* Right Floating Homemade Hamper / Gift Photo */}
          <div className="absolute right-0 top-0 bottom-0 w-[42%] sm:w-[35%] overflow-hidden flex items-center justify-end">
            <img
              src="https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80"
              alt="Homemade special pack"
              className="h-full w-full object-cover object-center transform scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#FFF1F4] via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* 5. TRENDING NEAR YOU SHELF */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-5 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🔥</span>
            <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
              Trending Near You
            </h3>
          </div>
          <button
            type="button"
            onClick={() => navigate('/homemade/category/food')}
            className="text-xs font-bold text-[#FF8A00] hover:text-[#E67C00] flex items-center gap-0.5"
          >
            <span>See all</span>
            <ChevronRightIcon size={14} />
          </button>
        </div>

        {/* Horizontal Scroll Shelf */}
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-3.5 px-3.5">
          {filteredTrending.map((item) => {
            const isWish = !!wishlist[item.id];
            const isAdded = !!addedItems[item.id];

            return (
              <div
                key={item.id}
                onClick={() => navigate(`/homemade/category/${item.categorySlug}`)}
                className="w-40 sm:w-44 flex-shrink-0 bg-white rounded-2xl border border-slate-100 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  {/* Thumbnail */}
                  <div className="relative w-full h-32 bg-slate-100 overflow-hidden">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />

                    {/* Badge */}
                    {item.badge && (
                      <span
                        className={`absolute top-2 left-2 text-[9px] font-extrabold px-2 py-0.5 rounded-md text-white uppercase tracking-wide shadow-2xs ${
                          item.badge === 'Bestseller' ? 'bg-[#16A34A]' : 'bg-[#FF8A00]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {/* Wishlist toggle */}
                    <button
                      type="button"
                      onClick={(e) => toggleWishlist(e, item.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-slate-400 hover:text-[#FF2E7A] shadow-2xs transition-all"
                      aria-label="Wishlist"
                    >
                      {isWish ? (
                        <HeartFilledIcon size={14} className="text-[#FF2E7A]" />
                      ) : (
                        <HeartOutlineIcon size={14} />
                      )}
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-2 group-hover:text-[#FF2E7A] transition-colors leading-snug">
                      {item.name}
                    </h4>

                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 font-medium">
                      <span className="text-[#16A34A] font-bold flex items-center gap-0.5">
                        <StarFilledIcon size={10} className="text-[#16A34A]" />
                        {item.rating}
                      </span>
                      <span>({item.reviewsCount})</span>
                      <span>•</span>
                      <span>{item.distance}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Price & Add Button */}
                <div className="p-2.5 pt-0 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-900">₹{item.price}</span>
                    <span className="text-[10px] text-slate-400 font-medium ml-1">/ {item.unit}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleAddToCart(e, item)}
                    className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all active:scale-90 flex items-center gap-1 ${
                      isAdded
                        ? 'bg-[#16A34A] text-white shadow-2xs'
                        : 'bg-[#FF8A00] hover:bg-[#E67C00] text-white shadow-2xs'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <CheckMarkIcon size={12} />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <PlusIcon size={12} />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. SHOP BY CATEGORY (6 TILES MATCHING IMAGE 1) */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 pb-2">
        <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight mb-3">
          Shop by Category
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
          {HOMEMADE_CATEGORIES.map((cat) => (
            <motion.div
              key={cat.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`/homemade/category/${cat.slug}`)}
              className={`${cat.accentBg} ${cat.accentBorder} border rounded-2xl p-3 sm:p-4 flex items-center gap-3 cursor-pointer shadow-2xs hover:shadow-xs transition-all group`}
            >
              <div className="w-11 h-11 rounded-xl bg-white/90 border border-white flex items-center justify-center text-xl sm:text-2xl shadow-2xs group-hover:scale-110 transition-transform">
                {cat.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className={`text-xs sm:text-sm font-extrabold ${cat.accentText} leading-snug line-clamp-2`}>
                  {cat.name}
                </h4>
                <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                  {cat.subcategories.length} subcategories
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 7. SELLERS NEAR YOU (WITH 3 PREVIEW PHOTOS) */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
              Sellers Near You
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">Verified local home makers & cooks</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/homemade/category/food')}
            className="text-xs font-bold text-[#FF8A00] hover:text-[#E67C00] flex items-center gap-0.5"
          >
            <span>See all</span>
            <ChevronRightIcon size={14} />
          </button>
        </div>

        <div className="space-y-3">
          {HOMEMADE_SELLERS.slice(0, 3).map((seller) => (
            <div
              key={seller.id}
              onClick={() => navigate('/homemade/category/food')}
              className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
            >
              {/* Left Seller Profile */}
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-xs flex-shrink-0 bg-slate-100">
                  <img
                    src={seller.avatarUrl}
                    alt={seller.name}
                    className="w-full h-full object-cover"
                  />
                  {seller.isVerified && (
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#16A34A] rounded-full flex items-center justify-center text-white border border-white">
                      <CheckMarkIcon size={10} />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 group-hover:text-[#FF2E7A] transition-colors truncate">
                      {seller.name}
                    </h4>
                    {seller.isVerified && (
                      <span className="text-[#16A34A] flex items-center" title="Verified Home Maker">
                        <CheckMarkIcon size={14} className="text-[#16A34A]" />
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-500 font-medium truncate">
                    {seller.specialty} • {seller.distance}
                  </p>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#16A34A]">
                      <StarFilledIcon size={10} className="text-[#16A34A]" />
                      {seller.rating} ({seller.reviewsCount})
                    </span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-[#16A34A] border border-emerald-200/60">
                      {seller.deliveryTag}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: 3 Preview Product Thumbnails */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                {seller.productPreviews.map((img, i) => (
                  <div
                    key={i}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-100 shadow-2xs flex-shrink-0"
                  >
                    <img
                      src={img}
                      alt="Product preview"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 8. MAKER ONBOARDING CTA BANNER */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-3">
        <div className="bg-gradient-to-r from-[#FFF5F0] via-[#FFF1F4] to-[#FFF8E6] border border-orange-200/60 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
              Do you make awesome homemade products?
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-1">
              Join thousands of home makers on Hello Local and sell to your neighborhood.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/seller/signup')}
            className="px-6 py-2.5 rounded-2xl bg-[#FF8A00] hover:bg-[#E67C00] text-white text-xs font-black shadow-xs active:scale-95 transition-all whitespace-nowrap"
          >
            I Make & Sell
          </button>
        </div>
      </section>
    </div>
  );
}
