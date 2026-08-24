import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getWishlist, removeFromWishlist } from '../../services/api/customerWishlistService';
import { Product } from '../../types/domain';
import { useCart } from '../../context/CartContext';
import { useLocation } from '../../hooks/useLocation';
import { useToast } from '../../context/ToastContext';
import { calculateProductPrice } from '../../utils/priceUtils';
import { UserImage, UserEmptyState } from './components/common';
import { ArrowLeftIcon, HeartNavIcon, PlusIcon, MinusIcon } from './components/common/UserIcons';

export default function Wishlist() {
  const navigate = useNavigate();
  const { location } = useLocation();
  const { cart, addToCart, updateQuantity } = useCart();
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWishlist = async () => {
    try {
      setLoading(true);
      const res = await getWishlist({
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
      if (res.success && res.data) {
        setProducts(
          res.data.products.map((p) => ({
            ...p,
            id: p._id || (p as any).id,
            name: p.productName || (p as any).name,
            imageUrl: p.mainImageUrl || p.mainImage || (p as any).imageUrl,
            price: (p as any).price || (p as any).variations?.[0]?.price || 0,
            pack: (p as any).pack || (p as any).variations?.[0]?.name || 'Standard',
          })) as any
        );
      }
    } catch (error: any) {
      console.error('Failed to fetch wishlist:', error);
      showToast(error.message || 'Failed to fetch wishlist', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, [location?.latitude, location?.longitude]);

  const handleRemove = async (productId: string) => {
    try {
      await removeFromWishlist(productId);
      setProducts(products.filter((p) => p.id !== productId && p._id !== productId));
    } catch (error) {
      console.error('Failed to remove from wishlist:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors touch-target-min"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                My Wishlist
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {products.length} {products.length === 1 ? 'item' : 'items'} saved
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2.5">
            <div className="w-10 h-10 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">Loading your wishlist...</p>
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
            {products.map((product) => {
              const pId = ((product.id || product._id || '') as string);
              if (!pId) return null;
              const { displayPrice, mrp, hasDiscount, discount } = calculateProductPrice(product);
              const inCartItem = cart.items.find(
                (item) => (item.product?.id || (item.product as any)?._id) === pId
              );
              const inCartQty = inCartItem?.quantity || 0;

              return (
                <div
                  key={pId}
                  className="bg-white rounded-2xl border border-slate-100 p-2.5 sm:p-3 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative group"
                >
                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemove(pId)}
                    className="absolute top-2 right-2 z-10 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-[#FF2E7A] shadow-2xs border border-slate-100 hover:bg-[#FFF1F4] transition-colors touch-target-min"
                    aria-label="Remove from wishlist"
                  >
                    <HeartNavIcon size={14} className="fill-[#FF2E7A] text-[#FF2E7A]" />
                  </button>

                  {/* Thumbnail & Link */}
                  <Link
                    to={`/product/${pId}`}
                    className="w-full aspect-square bg-slate-50 rounded-xl flex items-center justify-center p-2 mb-2 overflow-hidden"
                  >
                    <UserImage
                      src={product.imageUrl || (product as any).mainImage}
                      alt={product.name}
                      categoryFallback="grocery"
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </Link>

                  {/* Product Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <Link to={`/product/${pId}`}>
                        <h3 className="text-xs font-bold text-slate-900 line-clamp-2 hover:text-[#FF2E7A] transition-colors leading-snug mb-0.5">
                          {product.name}
                        </h3>
                      </Link>
                      <p className="text-[10px] text-slate-400 font-medium mb-1.5">
                        {product.pack || 'Standard'}
                      </p>
                    </div>

                    {/* Price & Add to Cart */}
                    <div className="pt-1.5 border-t border-slate-50">
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-xs font-bold text-slate-900">
                          ₹{displayPrice.toLocaleString('en-IN')}
                        </span>
                        {hasDiscount && mrp > displayPrice && (
                          <span className="text-[9px] text-slate-400 line-through font-medium">
                            ₹{mrp.toLocaleString('en-IN')}
                          </span>
                        )}
                        {hasDiscount && discount > 0 && (
                          <span className="text-[8px] font-bold text-[#FF2E7A] bg-[#FFF1F4] px-1 py-0.2 rounded-full">
                            {discount}% OFF
                          </span>
                        )}
                      </div>

                      {inCartQty === 0 ? (
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="w-full py-1.5 bg-[#FFF1F4] hover:bg-[#FFE4EA] text-[#FF2E7A] border border-[#FFE4EA] rounded-full text-xs font-bold transition-colors touch-target-min"
                        >
                          Add to Cart
                        </button>
                      ) : (
                        <div className="flex items-center justify-between bg-[#FFF1F4] border border-[#FFE4EA] rounded-full px-2 py-0.5 text-[#FF2E7A]">
                          <button
                            type="button"
                            onClick={() => updateQuantity(pId, inCartQty - 1)}
                            className="w-5 h-5 flex items-center justify-center font-bold text-xs"
                          >
                            <MinusIcon size={10} />
                          </button>
                          <span className="text-xs font-bold min-w-[1rem] text-center">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(pId, inCartQty + 1)}
                            className="w-5 h-5 flex items-center justify-center font-bold text-xs"
                          >
                            <PlusIcon size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10">
            <UserEmptyState
              icon={<HeartNavIcon size={32} className="text-[#FF2E7A]" />}
              title="Your wishlist is empty"
              description="Save items you like and come back to them anytime."
              actionText="Discover Products"
              onAction={() => navigate('/')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
