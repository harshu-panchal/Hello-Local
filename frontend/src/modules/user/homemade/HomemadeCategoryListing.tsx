import React, { useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation as useLocationContext } from '../../../hooks/useLocation';
import { useCart } from '../../../context/CartContext';
import { useToast } from '../../../context/ToastContext';
import {
  ArrowLeftIcon,
  StarFilledIcon,
  HeartOutlineIcon,
  HeartFilledIcon,
  ChevronDownIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '../components/common/UserIcons';
import {
  HOMEMADE_CATEGORIES,
  HOMEMADE_FOOD_PRODUCTS,
  HomemadeProduct,
} from './data/homemadeData';

const CheckMarkIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function HomemadeCategoryListing() {
  const navigate = useNavigate();
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const [searchParams] = useSearchParams();
  const searchParamQuery = searchParams.get('q') || '';

  const { cart, addToCart } = useCart();
  const { showToast } = useToast();

  const cartItemCount = useMemo(() => {
    if (!cart) return 0;
    return cart.itemCount || cart.totalItemCount || cart.items?.length || 0;
  }, [cart]);

  const currentCategory = useMemo(() => {
    const slug = categorySlug || 'food';
    return (
      HOMEMADE_CATEGORIES.find((c) => c.slug === slug) ||
      HOMEMADE_CATEGORIES[0]
    );
  }, [categorySlug]);

  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc' | 'rating'>('popular');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'non-veg'>('all');
  const [isDietFilterOpen, setIsDietFilterOpen] = useState(false);
  const [nearMeOnly, setNearMeOnly] = useState(false);
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});
  const [addedItems, setAddedItems] = useState<Record<string, boolean>>({});

  const toggleWishlist = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    setWishlist((prev) => {
      const next = !prev[productId];
      showToast(next ? 'Added to Wishlist' : 'Removed from Wishlist', 'success');
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

  const filteredProducts = useMemo(() => {
    let list = [...HOMEMADE_FOOD_PRODUCTS];

    // Filter by search query
    if (searchParamQuery) {
      const q = searchParamQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sellerName.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    // Filter by subcategory
    if (selectedSubcategory !== 'all') {
      list = list.filter((p) => p.subcategorySlug === selectedSubcategory);
    }

    // Filter by diet
    if (dietFilter === 'veg') {
      list = list.filter((p) => p.foodType === 'Veg');
    } else if (dietFilter === 'non-veg') {
      list = list.filter((p) => p.foodType === 'Non-Veg');
    }

    // Filter by Near Me (<= 1.5 km)
    if (nearMeOnly) {
      list = list.filter((p) => p.distanceKm <= 1.5);
    }

    // Sort products
    if (sortBy === 'price_asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'rating') {
      list.sort((a, b) => b.rating - a.rating);
    } else {
      // Default: Bestseller / Popular first
      list.sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
    }

    return list;
  }, [selectedSubcategory, sortBy, dietFilter, nearMeOnly, searchParamQuery]);

  return (
    <div className="min-h-screen bg-[#FAFAF9] pb-28">
      {/* 1. STICKY TOP HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/homemade')}
              className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
              aria-label="Back to Homemade Hub"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {currentCategory.name}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => navigate('/cart')}
            className="relative w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
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
      </header>

      {/* 2. CATEGORY HERO BANNER */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 pb-1">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#FFF4EA] via-[#FFF9F2] to-[#FFF1F4] border border-amber-200/60 p-4 sm:p-6 shadow-2xs flex items-center justify-between">
          <div className="relative z-10 max-w-[62%] sm:max-w-md">
            <h2 className="text-base sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
              {currentCategory.name}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-600 font-medium mt-1 leading-relaxed">
              {currentCategory.tagline}
            </p>
          </div>

          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-xs border border-white flex-shrink-0 bg-slate-100">
            <img
              src={currentCategory.heroImage}
              alt={currentCategory.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* 3. SUBCATEGORY CIRCULAR PILLS (MATCHING IMAGE 1 RIGHT) */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-3.5 px-3.5">
          {currentCategory.subcategories.map((sub) => {
            const isActive = selectedSubcategory === sub.slug;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedSubcategory(sub.slug)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 group active:scale-95 transition-transform"
              >
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all ${
                    isActive
                      ? 'bg-[#FF2E7A] text-white shadow-xs scale-105 border-2 border-[#FF2E7A]'
                      : 'bg-white text-slate-700 border border-slate-200/90 shadow-2xs group-hover:bg-slate-50'
                  }`}
                >
                  <span>{sub.icon}</span>
                </div>
                <span
                  className={`text-[10px] sm:text-xs font-bold text-center max-w-[72px] leading-tight line-clamp-2 ${
                    isActive ? 'text-[#FF2E7A]' : 'text-slate-600'
                  }`}
                >
                  {sub.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. SORT / FILTER / NEAR ME CONTROLS BAR */}
      <section className="sticky top-[53px] z-20 bg-[#FAFAF9]/95 backdrop-blur-md border-y border-slate-200/70 py-2.5 max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2">
          {/* Sort Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsSortOpen(!isSortOpen);
                setIsDietFilterOpen(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all active:scale-95"
            >
              <span>Sort</span>
              <ChevronDownIcon size={12} className="text-slate-400" />
            </button>

            <AnimatePresence>
              {isSortOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute left-0 top-full mt-1.5 w-44 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 z-30"
                >
                  {[
                    { id: 'popular', label: 'Popular' },
                    { id: 'price_asc', label: 'Price: Low to High' },
                    { id: 'price_desc', label: 'Price: High to Low' },
                    { id: 'rating', label: 'Highest Rated' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSortBy(opt.id as any);
                        setIsSortOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                        sortBy === opt.id ? 'bg-[#FFF1F4] text-[#FF2E7A] font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Diet Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsDietFilterOpen(!isDietFilterOpen);
                setIsSortOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 ${
                dietFilter !== 'all'
                  ? 'bg-[#FFF1F4] border-[#FF2E7A]/40 text-[#FF2E7A]'
                  : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Filter</span>
              {dietFilter !== 'all' && <span className="w-1.5 h-1.5 rounded-full bg-[#FF2E7A]" />}
              <ChevronDownIcon size={12} className="text-slate-400" />
            </button>

            <AnimatePresence>
              {isDietFilterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute left-0 top-full mt-1.5 w-36 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 z-30"
                >
                  {[
                    { id: 'all', label: 'All Items' },
                    { id: 'veg', label: 'Veg Only 🟢' },
                    { id: 'non-veg', label: 'Non-Veg 🔴' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDietFilter(opt.id as any);
                        setIsDietFilterOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                        dietFilter === opt.id ? 'bg-[#FFF1F4] text-[#FF2E7A] font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Near Me Toggle */}
          <button
            type="button"
            onClick={() => setNearMeOnly(!nearMeOnly)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 border rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 ${
              nearMeOnly
                ? 'bg-[#FF8A00] text-white border-[#FF8A00]'
                : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>⌖</span>
            <span>Near Me</span>
          </button>
        </div>
      </section>

      {/* 5. PRODUCT LISTING CARDS (MATCHING IMAGE 1 RIGHT SCREEN) */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 pb-4 space-y-3">
        {filteredProducts.length > 0 ? (
          filteredProducts.map((product) => {
            const isWish = !!wishlist[product.id];
            const isAdded = !!addedItems[product.id];

            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-2xs hover:shadow-xs transition-all flex gap-3 sm:gap-4 group"
              >
                {/* Left Product Image with Badge */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 flex-shrink-0">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  {product.badge && (
                    <span
                      className={`absolute top-2 left-2 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md text-white uppercase tracking-wide shadow-2xs ${
                        product.badge === 'Bestseller' ? 'bg-[#16A34A]' : 'bg-[#FF8A00]'
                      }`}
                    >
                      {product.badge}
                    </span>
                  )}
                </div>

                {/* Right Product Details */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-xs sm:text-sm font-black text-slate-900 line-clamp-1 group-hover:text-[#FF2E7A] transition-colors">
                        {product.name}
                      </h3>

                      <button
                        type="button"
                        onClick={(e) => toggleWishlist(e, product.id)}
                        className="w-7 h-7 -mr-1 -mt-1 flex items-center justify-center text-slate-400 hover:text-[#FF2E7A] transition-colors"
                        aria-label="Wishlist"
                      >
                        {isWish ? (
                          <HeartFilledIcon size={16} className="text-[#FF2E7A]" />
                        ) : (
                          <HeartOutlineIcon size={16} />
                        )}
                      </button>
                    </div>

                    {/* Maker Info with Verified Check */}
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold mt-0.5">
                      <span>By {product.sellerName}</span>
                      {product.isSellerVerified && (
                        <CheckMarkIcon size={12} className="text-[#16A34A]" />
                      )}
                    </div>

                    {/* Rating & Distance */}
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-medium">
                      <span className="inline-flex items-center gap-0.5 font-bold text-[#16A34A]">
                        <StarFilledIcon size={10} className="text-[#16A34A]" />
                        {product.rating}
                      </span>
                      <span>({product.reviewsCount})</span>
                      <span>•</span>
                      <span>{product.distance}</span>
                    </div>
                  </div>

                  {/* Price & Add Button */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm sm:text-base font-black text-slate-900">
                        ₹{product.price}
                      </span>
                      {product.unit && (
                        <span className="text-[10px] sm:text-xs text-slate-400 font-medium">
                          / {product.unit}
                        </span>
                      )}
                      {product.originalPrice && (
                        <span className="text-[10px] text-slate-400 line-through ml-1">
                          ₹{product.originalPrice}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleAddToCart(e, product)}
                      className={`px-4 sm:px-5 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1 ${
                        isAdded
                          ? 'bg-[#16A34A] text-white shadow-2xs'
                          : 'bg-[#FF8A00] hover:bg-[#E67C00] text-white shadow-xs'
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <CheckMarkIcon size={13} />
                          <span>Added</span>
                        </>
                      ) : (
                        <span>Add</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 bg-white rounded-3xl border border-slate-100 text-center space-y-2.5 my-4">
            <span className="text-3xl">🍲</span>
            <h4 className="text-sm font-bold text-slate-800">No homemade dishes found</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Try changing your filter options or exploring other subcategories.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedSubcategory('all');
                setDietFilter('all');
                setNearMeOnly(false);
              }}
              className="mt-2 px-4 py-1.5 rounded-xl bg-[#FF2E7A] text-white text-xs font-bold"
            >
              Reset Filters
            </button>
          </div>
        )}
      </section>

      {/* 6. TRUST & QUALITY ASSURANCE BANNER (MATCHING IMAGE 1 RIGHT) */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2">
        <div className="bg-[#EDFDF3] border border-[#DCFCE7] rounded-2xl p-3 sm:p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/80 border border-emerald-200 flex items-center justify-center text-[#16A34A] flex-shrink-0 shadow-2xs">
            <ShieldCheckIcon size={20} className="text-[#16A34A]" />
          </div>
          <div>
            <h4 className="text-xs font-black text-[#16A34A] tracking-tight">
              100% Homemade • Local Ingredients
            </h4>
            <p className="text-[10px] text-emerald-800 font-medium">
              Trusted Home Makers • Quality Assured & Freshly Prepared
            </p>
          </div>
        </div>
      </section>

      {/* 7. HOMEMAKER ONBOARDING BANNER (MATCHING IMAGE 1 RIGHT) */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-3">
        <div className="bg-gradient-to-r from-[#FFF5F0] via-[#FFF9F2] to-[#FFF1F4] border border-orange-200/70 rounded-3xl p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="w-12 h-12 rounded-2xl bg-white border border-orange-100 flex items-center justify-center text-2xl shadow-2xs flex-shrink-0">
              👩‍🍳
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900">
                Are you a home maker?
              </h4>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">
                Sell your homemade food and earn with Hello Local.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/seller/signup')}
            className="px-5 py-2 rounded-xl bg-[#FF8A00] hover:bg-[#E67C00] text-white text-xs font-black shadow-2xs active:scale-95 transition-all whitespace-nowrap"
          >
            I Make & Sell
          </button>
        </div>
      </section>
    </div>
  );
}
