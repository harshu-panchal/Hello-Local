import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getHomeContent } from "../../services/api/customerHomeService";
import { getCategories, Category as ApiCategory } from "../../services/api/customerProductService";
import { useLocation } from "../../hooks/useLocation";
import CategoryTileSection from "./components/CategoryTileSection";
import ProductCard from "./components/ProductCard";
import { UserEmptyState, UserImage } from "./components/common";
import { CategoryNavIcon, SearchIcon, ChevronRightIcon } from "./components/common/UserIcons";

export default function Categories() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { location } = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryTree, setCategoryTree] = useState<ApiCategory[]>([]);
  const [homeSections, setHomeSections] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const initialCategoryQuery = searchParams.get("category") || "";

  useEffect(() => {
    if (initialCategoryQuery) {
      setSearchQuery(initialCategoryQuery.replace(/-/g, " "));
    }
  }, [initialCategoryQuery]);

  useEffect(() => {
    const fetchAllCategoriesData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [treeRes, homeRes] = await Promise.allSettled([
          getCategories(true),
          getHomeContent(undefined, location?.latitude, location?.longitude),
        ]);

        if (treeRes.status === "fulfilled" && treeRes.value?.success && Array.isArray(treeRes.value.data)) {
          setCategoryTree(treeRes.value.data);
        }

        if (homeRes.status === "fulfilled" && homeRes.value?.success && homeRes.value.data) {
          setHomeSections(homeRes.value.data.homeSections || []);
        }

        if (treeRes.status === "rejected" && homeRes.status === "rejected") {
          setError("Failed to load categories. Please try again.");
        }
      } catch (err) {
        console.error("Failed to fetch categories data:", err);
        setError("Network error. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchAllCategoriesData();
  }, [location?.latitude, location?.longitude]);

  // Filtered categories based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categoryTree;
    const query = searchQuery.toLowerCase().trim();
    return categoryTree.filter((cat) => {
      const matchName = cat.name.toLowerCase().includes(query);
      const matchSlug = (cat.id || cat._id || "").toLowerCase().includes(query);
      const matchSubs = cat.subcategories?.some((sub: any) =>
        sub.name.toLowerCase().includes(query)
      );
      return matchName || matchSlug || matchSubs;
    });
  }, [categoryTree, searchQuery]);

  if (loading && !categoryTree.length && !homeSections.length) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Loading categories...</span>
        </div>
      </div>
    );
  }

  if (error && !categoryTree.length && !homeSections.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-[#F8FAFC]">
        <div className="w-14 h-14 bg-[#FFF1F4] rounded-2xl flex items-center justify-center mb-3 border border-[#FFE4EA]">
          <CategoryNavIcon size={24} className="text-[#FF2E7A]" />
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

  return (
    <div className="pb-24 md:pb-12 bg-[#F8FAFC] min-h-screen">
      {/* Top Header */}
      <div className="px-4 py-3.5 sm:px-6 lg:px-8 bg-white border-b border-slate-100 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-base md:text-xl font-bold text-slate-900 tracking-tight">
              Explore All Categories
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Browse aisles and discover products</p>
          </div>

          {/* Search Category Input */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter categories or subcategories..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF2E7A]/20 focus:border-[#FF2E7A] transition-all"
            />
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <SearchIcon size={14} />
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto pt-4 space-y-6 px-3.5 sm:px-6 lg:px-8">
        {/* 1. Category Tree Catalog Cards */}
        {filteredCategories.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                All Departments ({filteredCategories.length})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
              {filteredCategories.map((cat: any) => {
                const catSlug = cat.slug || cat._id || cat.id;
                const subcategories = cat.subcategories || [];

                return (
                  <div
                    key={cat._id || cat.id || catSlug}
                    className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between group"
                  >
                    <div>
                      {/* Category Header */}
                      <Link
                        to={`/category/${catSlug}`}
                        className="flex items-center gap-3 pb-3 border-b border-slate-100 hover:opacity-90 transition-opacity"
                      >
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0 overflow-hidden group-hover:scale-105 transition-transform">
                          <UserImage
                            src={cat.image || cat.icon}
                            alt={cat.name}
                            className="w-full h-full object-contain"
                            categoryFallback={cat.name}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-[#FF2E7A] transition-colors">
                            {cat.name}
                          </h2>
                          <p className="text-[11px] text-slate-400">
                            {subcategories.length > 0
                              ? `${subcategories.length} subcategories`
                              : "Explore products"}
                          </p>
                        </div>
                        <ChevronRightIcon size={16} className="text-slate-300 group-hover:text-[#FF2E7A] transition-colors shrink-0" />
                      </Link>

                      {/* Subcategories Chips */}
                      {subcategories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-3">
                          {subcategories.slice(0, 6).map((sub: any) => (
                            <Link
                              key={sub._id || sub.id}
                              to={`/category/${catSlug}?subcategory=${sub._id || sub.id}`}
                              className="px-2.5 py-1 bg-slate-50 hover:bg-[#FFF1F4] hover:text-[#FF2E7A] border border-slate-100 hover:border-[#FFD0DE] rounded-lg text-[11px] font-medium text-slate-600 transition-colors"
                            >
                              {sub.name}
                            </Link>
                          ))}
                          {subcategories.length > 6 && (
                            <Link
                              to={`/category/${catSlug}`}
                              className="px-2 py-1 text-[11px] font-semibold text-[#FF2E7A] hover:underline"
                            >
                              +{subcategories.length - 6} more
                            </Link>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Link */}
                    <div className="pt-3 mt-3 border-t border-slate-50 flex items-center justify-between">
                      <Link
                        to={`/category/${catSlug}`}
                        className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] flex items-center gap-1"
                      >
                        View All
                        <ChevronRightIcon size={12} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-10">
            <UserEmptyState
              icon={<CategoryNavIcon size={28} className="text-[#FF2E7A]" />}
              title="No categories match your search"
              description="Try adjusting your filter keywords to find what you are looking for."
            />
          </div>
        )}

        {/* 2. Admin Home Sections (if configured) */}
        {homeSections && homeSections.length > 0 && (
          <div className="pt-4 border-t border-slate-200/60">
            {homeSections.map((section: any) => {
              const columnCount = Number(section.columns) || 4;

              if (section.displayType === "products" && section.data && section.data.length > 0) {
                const gridClass = {
                  2: "grid-cols-2",
                  3: "grid-cols-3",
                  4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
                  6: "grid-cols-2 sm:grid-cols-3 md:grid-cols-6",
                  8: "grid-cols-2 sm:grid-cols-4 md:grid-cols-8",
                }[columnCount] || "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

                const isCompact = columnCount >= 4;
                const gapClass = "gap-2.5 sm:gap-4";

                return (
                  <div key={section.id || section._id} className="mt-3 mb-4 px-1">
                    {section.title && (
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="h-4 w-1 bg-[#FF2E7A] rounded-full" />
                        <h2 className="text-sm md:text-base font-bold text-slate-900 tracking-tight capitalize">
                          {section.title}
                        </h2>
                      </div>
                    )}
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
                );
              }

              // Categories/Subcategories display
              return (
                <CategoryTileSection
                  key={section.id || section._id}
                  title={section.title}
                  tiles={section.data || []}
                  columns={columnCount as 2 | 3 | 4 | 6 | 8}
                  showProductCount={false}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
