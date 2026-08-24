import { useEffect, useState } from "react";
import { getHomeContent } from "../../services/api/customerHomeService";
import { useLocation } from "../../hooks/useLocation";
import CategoryTileSection from "./components/CategoryTileSection";
import ProductCard from "./components/ProductCard";
import { UserEmptyState } from "./components/common";
import { CategoryNavIcon } from "./components/common/UserIcons";

export default function Categories() {
  const { location } = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeData, setHomeData] = useState<any>({
    homeSections: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getHomeContent(
          undefined,
          location?.latitude,
          location?.longitude
        );
        if (response.success && response.data) {
          setHomeData(response.data);
        } else {
          setError("Failed to load categories. Please try again.");
        }
      } catch (error) {
        console.error("Failed to fetch home content:", error);
        setError("Network error. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [location?.latitude, location?.longitude]);

  if (loading && !homeData.homeSections.length) {
    return null;
  }

  if (error && !homeData.homeSections.length) {
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
      {/* Header */}
      <div className="px-4 py-3 sm:px-6 lg:px-8 bg-white border-b border-slate-100 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base md:text-xl font-bold text-slate-900 tracking-tight">
              Explore Categories
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Find products across all departments</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto pt-2 space-y-4 md:space-y-6 px-3.5 sm:px-6 lg:px-8">
        {/* Render all admin-created home sections */}
        {homeData.homeSections && homeData.homeSections.length > 0 ? (
          <>
            {homeData.homeSections.map((section: any) => {
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
                  <div key={section.id || section._id} className="mt-3 mb-4 px-3.5 sm:px-6">
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
          </>
        ) : (
          <div className="py-10">
            <UserEmptyState
              icon={<CategoryNavIcon size={28} className="text-[#FF2E7A]" />}
              title="No categories found"
              description="Categories will appear here once configured by the store administrators."
            />
          </div>
        )}
      </div>
    </div>
  );
}
