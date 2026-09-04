import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { getIconByName } from "../../../utils/iconLibrary";

interface CategoryTile {
  id: string;
  name: string;
  productImages?: (string | undefined)[];
  image?: string; // Support single image property
  productCount?: number;
  categoryId?: string;
  subcategoryId?: string;
  productId?: string;
  sellerId?: string;
  bgColor?: string;
  slug?: string;
  type?: "subcategory" | "product" | "category";
}

interface CategoryTileSectionProps {
  title: string;
  tiles: CategoryTile[];
  columns?: 2 | 3 | 4 | 6 | 8; // Support all column options
  showProductCount?: boolean; // Show product count only for bestsellers
}

export default function CategoryTileSection({
  title,
  tiles,
  columns = 4,
  showProductCount = false,
}: CategoryTileSectionProps) {
  const navigate = useNavigate();
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const handleTileClick = (tile: CategoryTile) => {
    if (tile.subcategoryId || tile.type === "subcategory") {
      // Navigate to subcategory page or category with subcategory filter
      if (tile.categoryId) {
        navigate(
          `/category/${tile.categoryId}?subcategory=${tile.subcategoryId || tile.id
          }`
        );
      } else if (tile.slug) {
        navigate(`/category/${tile.slug}`);
      } else {
        navigate(`/category/subcategory/${tile.subcategoryId || tile.id}`);
      }
      return;
    }
    if (tile.categoryId) {
      navigate(`/category/${tile.categoryId}`);
      return;
    }
    if (tile.productId) {
      navigate(`/product/${tile.productId}`);
      return;
    }
    if ((tile as any).sellerId) {
      // Navigate to seller's products page or category
      navigate(`/seller/${(tile as any).sellerId}`);
      return;
    }
    // Otherwise just log for now
    console.log("Clicked tile", tile.id);
  };

  // Dynamic responsive grid classes based on column count
  const getGridCols = () => {
    switch (columns) {
      case 2:
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
      case 3:
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
      case 4:
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8";
      case 6:
        return "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8";
      case 8:
        return "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8";
      default:
        return "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8";
    }
  };

  const gridCols = getGridCols();
  const gapClass = "gap-2.5 sm:gap-3 md:gap-4";

  return (
    <div className="mt-2 md:mt-3 mb-6 md:mb-8 overflow-visible max-w-[1440px] mx-auto">
      <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 mb-4 md:mb-7">
        <h2 className="text-xl md:text-2xl font-extrabold text-neutral-900 tracking-tight capitalize relative">
          {title}
          <span className="absolute -bottom-1.5 left-0 w-8 h-1 bg-gradient-to-r from-[#D4543E] to-[#E84B8A] rounded-full"></span>
        </h2>
      </div>
      <div className="px-4 md:px-6 lg:px-8 overflow-visible">
        <div className={`grid ${gridCols} ${gapClass} overflow-visible auto-rows-fr`}>
          {tiles.map((tile) => {
            const rawImages =
              tile.productImages || (tile.image ? [tile.image] : []);
            const validImages = rawImages.filter(
              (img): img is string =>
                Boolean(
                  img &&
                    typeof img === "string" &&
                    !img.includes("dv1l9sb4p") &&
                    !img.includes("undefined") &&
                    img.trim().length > 0
                )
            );
            const isBroken = imageErrors[tile.id] || false;
            const hasValidImages = validImages.length > 0 && !isBroken;

            return (
              <motion.div
                key={tile.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex flex-col items-center w-full">
                <Link
                  to={
                    tile.subcategoryId || tile.type === "subcategory"
                      ? tile.categoryId
                        ? `/category/${tile.categoryId}?subcategory=${tile.subcategoryId || tile.id
                        }`
                        : tile.slug
                          ? `/category/${tile.slug}`
                          : `/category/subcategory/${tile.subcategoryId || tile.id
                          }`
                      : tile.productId
                        ? `/product/${tile.productId}`
                        : tile.type === "category"
                          ? tile.slug
                            ? `/category/${tile.slug}`
                            : tile.categoryId
                              ? `/category/${tile.categoryId}`
                              : "#"
                          : tile.categoryId
                            ? `/category/${tile.categoryId}`
                            : (tile as any).sellerId
                              ? `/seller/${(tile as any).sellerId}`
                              : "#"
                  }
                  onClick={(e) => {
                    if (
                      !tile.categoryId &&
                      !tile.productId &&
                      !tile.subcategoryId &&
                      !(tile as any).sellerId
                    ) {
                      e.preventDefault();
                      handleTileClick(tile);
                    }
                  }}
                  className={`block bg-white rounded-xl shadow-2xs border border-neutral-200/80 hover:shadow-md hover:border-neutral-300 transition-all h-full w-full ${
                    showProductCount ? "max-w-[200px] px-2.5 py-2" : "max-w-[150px] p-1.5"
                  }`}>
                  {/* Image - Multi-image collage or single image with semantic vector icon fallback */}
                  <div
                    className={`w-full rounded-lg overflow-hidden aspect-square ${
                      showProductCount ? "h-28 sm:h-32 mb-2" : ""
                    } ${tile.bgColor || "bg-slate-50"}`}>
                    {hasValidImages ? (
                      (showProductCount || validImages.length >= 2) ? (
                        // Multi-image collage (2x2 grid)
                        <div className="w-full h-full grid grid-cols-2 gap-0.5 p-0.5 bg-slate-100">
                          {validImages.slice(0, 4).map((img, idx) => (
                            <img
                              key={idx}
                              src={img}
                              alt=""
                              className="w-full h-full object-cover bg-white rounded-sm"
                              onError={() => {
                                setImageErrors((prev) => ({ ...prev, [tile.id]: true }));
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        // Single image
                        <img
                          src={validImages[0]}
                          alt={tile.name}
                          className="w-full h-full object-cover rounded-lg"
                          onError={() => {
                            setImageErrors((prev) => ({ ...prev, [tile.id]: true }));
                          }}
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2 text-center bg-gradient-to-br from-rose-50/60 via-slate-50 to-indigo-50/50">
                        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white shadow-2xs flex items-center justify-center text-[#FF2E7A] border border-slate-200/60">
                          {getIconByName(tile.slug || tile.name)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Product count - shown first (only for bestsellers with actual count > 0) */}
                  {showProductCount && (tile.productCount ?? 0) > 0 ? (
                    <div className="mb-1.5 flex justify-center">
                      <span className="inline-block bg-neutral-100 text-neutral-600 text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight">
                        +{tile.productCount} more
                      </span>
                    </div>
                  ) : null}

                  {/* Tile name - inside card only for bestsellers */}
                  {showProductCount && (
                    <div className="text-xs md:text-sm font-semibold text-neutral-800 line-clamp-2 leading-snug text-center w-full block tracking-tight pb-1">
                      {tile.name}
                    </div>
                  )}
                </Link>

                {/* Category name - outside card for non-bestsellers */}
                {!showProductCount && (
                  <div className="mt-1.5 text-center px-1 max-w-[150px]">
                    <span className="text-[12px] sm:text-[13px] font-medium text-neutral-800 line-clamp-2 leading-tight tracking-tight">
                      {tile.name}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
