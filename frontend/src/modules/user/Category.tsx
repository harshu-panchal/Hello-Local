import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import ProductCard from "./components/ProductCard";
import { motion, AnimatePresence } from "framer-motion";
import {
  getProducts,
  getCategoryById,
  Category as ApiCategory,
} from "../../services/api/customerProductService";
import { useLocation as useLocationContext } from "../../hooks/useLocation";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { UserEmptyState, UserImage } from "./components/common";
import { FilterIcon, ArrowLeftIcon, CloseIcon, LocationPinIcon } from "./components/common/UserIcons";

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { location: userLocation } = useLocationContext();

  const [category, setCategory] = useState<ApiCategory | null>(null);
  const [subcategories, setSubcategories] = useState<ApiCategory[]>([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState("all");
  const [dietFilter, setDietFilter] = useState<'all' | 'Veg' | 'Non-Veg'>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  useBodyScrollLock(isFiltersOpen);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [filterSearchQuery, setFilterSearchQuery] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch Category Details
  useEffect(() => {
    const fetchCategoryDetails = async () => {
      setCategoryLoading(true);
      setError(null);
      try {
        const response = await getCategoryById(id!);
        if (response.success && response.data) {
          const {
            category: cat,
            subcategories: subs,
            currentSubcategory,
          } = response.data;

          setCategory(cat);
          setSubcategories([
            {
              _id: "all",
              id: "all",
              name: "All",
              icon: "📦",
              isActive: true,
            } as any,
            ...(subs || []),
          ]);

          const subcategoryFromUrl = searchParams.get("subcategory");
          if (subcategoryFromUrl) {
            setSelectedSubcategory(subcategoryFromUrl);
          } else if (currentSubcategory) {
            setSelectedSubcategory(
              currentSubcategory._id || currentSubcategory.id
            );
          }
        } else {
          setError("Category not found or failed to load details.");
        }
      } catch (error) {
        console.error("Error fetching category details:", error);
        setError("Failed to load category information.");
      } finally {
        setCategoryLoading(false);
      }
    };

    if (id) {
      fetchCategoryDetails();
    }
  }, [id, searchParams]);

  // Reset diet filter when switching category
  useEffect(() => {
    setDietFilter('all');
  }, [id]);

  // Fetch Products when category or subcategory changes
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: any = { category: category?._id || id };
        if (selectedSubcategory !== "all") {
          params.subcategory = selectedSubcategory;
        }
        if (userLocation?.latitude && userLocation?.longitude) {
          params.latitude = userLocation.latitude;
          params.longitude = userLocation.longitude;
        }
        if (dietFilter !== 'all') {
          params.foodType = dietFilter;
        }

        const response = await getProducts(params);
        if (response.success) {
          const safeProducts = response.data.map((p: any) => ({
            ...p,
            tags: Array.isArray(p.tags) ? p.tags : [],
            nameParts: p.name ? p.name.toLowerCase().split(" ") : [],
          }));
          setProducts(safeProducts);
        } else {
          setError("Failed to fetch products for this category.");
        }
      } catch (error) {
        console.error("Error fetching products:", error);
        setError("Network error while loading products.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchProducts();
    }
  }, [id, selectedSubcategory, category?._id, userLocation, dietFilter]);

  const categoryProducts = products;

  if ((categoryLoading || loading) && !products.length && !category) {
    return null;
  }

  if (error && !products.length && !category) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-[#F8FAFC]">
        <div className="w-14 h-14 bg-[#FFF1F4] rounded-2xl flex items-center justify-center mb-3 border border-[#FFE4EA]">
          <span className="text-xl">⚠️</span>
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
    );
  }

  const getFilterOptions = () => {
    const filterMap = new Map<string, number>();

    products.forEach((product) => {
      const cleanName = (product.name || "").toLowerCase();
      const commonTypes = [
        { keywords: ["tomato", "tomatoes"], display: "Tomato" },
        { keywords: ["potato", "potatoes"], display: "Potato" },
        { keywords: ["onion", "onions"], display: "Onion" },
        { keywords: ["apple", "apples"], display: "Apple" },
        { keywords: ["banana", "bananas"], display: "Banana" },
        { keywords: ["orange", "oranges"], display: "Orange" },
        { keywords: ["milk"], display: "Milk" },
        { keywords: ["bread"], display: "Bread" },
        { keywords: ["cheese", "butter", "paneer"], display: "Dairy" },
      ];

      for (const type of commonTypes) {
        if (type.keywords.some((keyword) => cleanName.includes(keyword))) {
          filterMap.set(type.display, (filterMap.get(type.display) || 0) + 1);
          break;
        }
      }
    });

    return Array.from(filterMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const filterOptions = getFilterOptions();
  const filteredOptions = filterOptions.filter((option) =>
    option.name.toLowerCase().includes(filterSearchQuery.toLowerCase())
  );

  const handleFilterToggle = (filterName: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filterName)
        ? prev.filter((f) => f !== filterName)
        : [...prev, filterName]
    );
  };

  const handleClearFilters = () => {
    setSelectedFilters([]);
  };

  const handleApplyFilters = () => {
    setIsFiltersOpen(false);
  };

  return (
    <div className="flex bg-[#F8FAFC] h-screen overflow-hidden">
      {/* 1. Left Sidebar - Subcategories Strip */}
      <div className="w-20 sm:w-24 bg-white border-r border-slate-100 overflow-y-auto scrollbar-hide flex-shrink-0 py-2">
        <div className="space-y-1 px-1">
          {subcategories.map((subcat) => {
            const subId = subcat.id || subcat._id;
            const isSelected = selectedSubcategory === subId;
            return (
              <button
                key={subId}
                type="button"
                onClick={() => setSelectedSubcategory(subId)}
                className={`w-full flex flex-col items-center justify-center py-2 rounded-xl relative transition-all group touch-target-min ${
                  isSelected ? "bg-[#FFF1F4]" : "hover:bg-slate-50"
                }`}
                style={{ minHeight: "72px" }}
              >
                {/* Active Indicator Bar */}
                {isSelected && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-[#FF2E7A] rounded-r-full" />
                )}

                {/* Subcategory Image */}
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-base mb-1 flex-shrink-0 overflow-hidden transition-all ${
                    isSelected
                      ? "ring-2 ring-[#FF2E7A] bg-white shadow-2xs"
                      : "bg-slate-50 border border-slate-100 group-hover:bg-white"
                  }`}
                >
                  {subcat.image ? (
                    <UserImage
                      src={subcat.image}
                      alt={subcat.name}
                      categoryFallback={subcat.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-lg select-none">{subcat.name === 'All' ? '📦' : '🛍️'}</span>
                  )}
                </div>

                {/* Text Label */}
                <span
                  className={`text-[10px] text-center leading-tight px-1 font-bold line-clamp-2 ${
                    isSelected ? "text-[#FF2E7A]" : "text-slate-600 group-hover:text-slate-900"
                  }`}
                >
                  {subcat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC]">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white border-b border-slate-100 flex-shrink-0 shadow-2xs">
          <div className="px-4 md:px-6 py-2.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-full transition-colors touch-target-min"
                aria-label="Go back"
              >
                <ArrowLeftIcon size={18} />
              </button>
              <div>
                <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight tracking-tight">
                  {category?.name}
                </h1>
                <p className="text-[10px] text-slate-400 font-medium">
                  {categoryProducts.length} items available
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Diet Strip */}
        <div className="px-4 py-2 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-0.5">
            {/* Filters Button */}
            <button
              type="button"
              onClick={() => setIsFiltersOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-colors flex-shrink-0 whitespace-nowrap min-h-[34px]"
            >
              <FilterIcon size={13} className="text-slate-500" />
              <span>Filters</span>
            </button>

            {/* Veg Diet Filter */}
            <button
              type="button"
              onClick={() => setDietFilter(dietFilter === 'Veg' ? 'all' : 'Veg')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full transition-all flex-shrink-0 whitespace-nowrap border min-h-[34px] ${
                dietFilter === 'Veg'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="w-3 h-3 border border-emerald-600 rounded-sm flex items-center justify-center p-[2px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              </span>
              <span>Veg</span>
            </button>

            {/* Non-Veg Diet Filter */}
            <button
              type="button"
              onClick={() => setDietFilter(dietFilter === 'Non-Veg' ? 'all' : 'Non-Veg')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full transition-all flex-shrink-0 whitespace-nowrap border min-h-[34px] ${
                dietFilter === 'Non-Veg'
                  ? 'bg-rose-50 border-rose-400 text-rose-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="w-3 h-3 border border-rose-600 rounded-sm flex items-center justify-center p-[2px]">
                <span className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-rose-600" />
              </span>
              <span>Non-Veg</span>
            </button>
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pb-24 md:pb-12 px-3 sm:px-4 md:px-6 py-3.5">
          {categoryProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
              {categoryProducts.map((product) => (
                <ProductCard
                  key={product.id || product._id}
                  product={product}
                  showHeartIcon={true}
                  showStockInfo={false}
                  showBadge={true}
                  showOptionsText={true}
                  categoryStyle={false}
                />
              ))}
            </div>
          ) : !userLocation ? (
            <div className="py-10">
              <UserEmptyState
                icon={<LocationPinIcon size={28} className="text-[#FF2E7A]" />}
                title="Location Access Required"
                description="Please enable location access to see products available from local stores in your area."
              />
            </div>
          ) : (
            <div className="py-10">
              <UserEmptyState
                icon={<FilterIcon size={28} className="text-slate-400" />}
                title="No products found"
                description="We couldn't find any products in this subcategory matching your filters."
                actionText="View All Items"
                onAction={() => setSelectedSubcategory('all')}
              />
            </div>
          )}
        </div>
      </div>

      {/* Filters Modal / Bottom Sheet */}
      <AnimatePresence>
        {isFiltersOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFiltersOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-10 flex flex-col max-h-[80dvh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <div className="text-sm font-bold text-slate-900 tracking-tight">
                  Filter Products
                </div>
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Close filters"
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              {/* Filter Search */}
              <div className="px-5 py-2 border-b border-slate-100">
                <input
                  type="text"
                  value={filterSearchQuery}
                  onChange={(e) => setFilterSearchQuery(e.target.value)}
                  placeholder="Search filters..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 outline-none"
                />
              </div>

              {/* Filter Options List */}
              <div className="flex-1 overflow-y-auto px-5 py-2.5 space-y-1.5">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((opt) => {
                    const isChecked = selectedFilters.includes(opt.name);
                    return (
                      <label
                        key={opt.name}
                        onClick={() => handleFilterToggle(opt.name)}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 border border-slate-100 cursor-pointer transition-colors"
                      >
                        <span className="text-xs font-medium text-slate-800">{opt.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-bold">({opt.count})</span>
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                              isChecked
                                ? 'bg-[#FF2E7A] border-transparent text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isChecked && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 text-center py-5">No matching filters found</p>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 user-safe-bottom">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={handleApplyFilters}
                  className="px-5 py-2 bg-[#FF2E7A] text-white rounded-full text-xs font-bold shadow-xs hover:bg-[#E02269] transition-colors min-h-[36px]"
                >
                  Apply Filters
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
