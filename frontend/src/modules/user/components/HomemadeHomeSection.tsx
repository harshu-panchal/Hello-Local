import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "../../../hooks/useLocation";
import { useCart } from "../../../context/CartContext";
import { useToast } from "../../../context/ToastContext";
import { getHomemadeHub, HomemadeProductItem } from "../../../services/api/homemadeService";
import { StarFilledIcon, ChevronRightIcon, PlusIcon } from "./common/UserIcons";

export default function HomemadeHomeSection() {
  const navigate = useNavigate();
  const { location } = useLocation();
  const { addToCart } = useCart();
  const { showToast } = useToast();

  const [products, setProducts] = useState<HomemadeProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedItems, setAddedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    const fetchHomemade = async () => {
      try {
        setLoading(true);
        const res = await getHomemadeHub({
          latitude: location?.latitude,
          longitude: location?.longitude,
        });
        if (res.success && res.data?.trendingProducts && isMounted) {
          setProducts(res.data.trendingProducts);
        }
      } catch {
        // Gracefully ignore on home page
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchHomemade();
    return () => {
      isMounted = false;
    };
  }, [location?.latitude, location?.longitude]);

  if (loading || products.length === 0) {
    return null;
  }

  const handleAdd = async (e: React.MouseEvent, item: HomemadeProductItem) => {
    e.stopPropagation();
    try {
      const pId = item._id || item.id;
      await addToCart({
        id: pId,
        _id: pId,
        productName: item.name,
        price: item.price,
        discPrice: item.price,
        mainImage: item.imageUrl,
        seller: item.sellerId as any,
        sellerName: item.sellerName,
        stock: item.stock ?? 99,
        status: "Active",
        publish: true,
      } as any);

      setAddedItems((prev) => ({ ...prev, [pId]: true }));
      showToast(`Added ${item.name} to Cart`, "success");
      setTimeout(() => {
        setAddedItems((prev) => ({ ...prev, [pId]: false }));
      }, 1500);
    } catch {
      showToast("Could not add to cart", "error");
    }
  };

  return (
    <section className="w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5">
      <div className="bg-gradient-to-r from-[#FFF5F8] via-white to-[#FFF8F2] border border-[#FFE4EA] rounded-3xl p-3.5 sm:p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍲</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                  From Home Makers & Chefs
                </h3>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FF2E7A] text-white uppercase tracking-wider">
                  Homemade
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                Freshly cooked meals, artisanal bakes & handcrafted treasures
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/homemade")}
            className="text-xs font-bold text-[#FF2E7A] hover:text-[#D81B60] flex items-center gap-0.5"
          >
            <span>See all</span>
            <ChevronRightIcon size={14} />
          </button>
        </div>

        {/* Horizontal Card Row */}
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-2 px-2">
          {products.slice(0, 8).map((prod) => {
            const pId = prod._id || prod.id;
            const isAdded = !!addedItems[pId];

            return (
              <div
                key={pId}
                onClick={() => navigate(`/homemade/category/${prod.categorySlug || "food"}`)}
                className="w-38 sm:w-44 flex-shrink-0 bg-white rounded-2xl border border-slate-100 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  <div className="relative w-full h-28 sm:h-32 bg-slate-100 overflow-hidden">
                    <img
                      src={prod.imageUrl}
                      alt={prod.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    {prod.badge && (
                      <span className="absolute top-1.5 left-1.5 text-[8px] sm:text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-[#FF2E7A] text-white uppercase tracking-wide">
                        {prod.badge}
                      </span>
                    )}
                  </div>

                  <div className="p-2 sm:p-2.5">
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-1 group-hover:text-[#FF2E7A] transition-colors">
                      {prod.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">
                      By {prod.sellerName}
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 font-medium">
                      <span className="text-[#16A34A] font-bold flex items-center gap-0.5">
                        <StarFilledIcon size={10} className="text-[#16A34A]" />
                        {prod.rating}
                      </span>
                      <span>•</span>
                      <span>{prod.distance}</span>
                    </div>
                  </div>
                </div>

                <div className="p-2 sm:p-2.5 pt-0 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-900">₹{prod.price}</span>
                    {prod.originalPrice && prod.originalPrice > prod.price && (
                      <span className="text-[10px] text-slate-400 line-through ml-1">
                        ₹{prod.originalPrice}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleAdd(e, prod)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold transition-all active:scale-90 flex items-center gap-0.5 ${
                      isAdded
                        ? "bg-[#16A34A] text-white"
                        : "bg-[#FF2E7A] hover:bg-[#E11D48] text-white"
                    }`}
                  >
                    {isAdded ? "Added" : (
                      <>
                        <PlusIcon size={11} />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
