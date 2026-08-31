import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '../../hooks/useOrders';
import { useCart } from '../../context/CartContext';
import { useLocation } from '../../hooks/useLocation';
import { getProducts } from '../../services/api/customerProductService';
import { calculateProductPrice } from '../../utils/priceUtils';
import { UserImage, UserEmptyState } from './components/common';
import { ArrowLeftIcon, RefreshIcon, PlusIcon, MinusIcon } from './components/common/UserIcons';

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};

export default function OrderAgain() {
  const { orders } = useOrders();
  const { cart, addToCart, updateQuantity } = useCart();
  const { location } = useLocation();
  const navigate = useNavigate();
  const [addedOrders, setAddedOrders] = useState<Set<string>>(new Set());
  const [bestsellerProducts, setBestsellerProducts] = useState<any[]>([]);

  const handleOrderAgain = (order: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setAddedOrders((prev) => new Set(prev).add(order.id));

    (order.items || [])
      .filter((item: any) => item?.product)
      .forEach((item: any) => {
        const prodId = item.product.id || item.product._id;
        const existingCartItem = cart.items.find(
          (cartItem) => cartItem?.product && (cartItem.product.id === prodId || (cartItem.product as any)._id === prodId)
        );

        if (existingCartItem) {
          updateQuantity(prodId, existingCartItem.quantity + item.quantity, item.variant);
        } else {
          addToCart(item.product);
          if (item.quantity > 1) {
            setTimeout(() => {
              updateQuantity(prodId, item.quantity, item.variant);
            }, 10);
          }
        }
      });
  };

  useEffect(() => {
    const fetchBestsellers = async () => {
      try {
        const response = await getProducts({
          sort: 'popular',
          limit: 8,
          latitude: location?.latitude,
          longitude: location?.longitude,
        });
        if (response.success && response.data) {
          const mapped = (response.data as any[]).map((p) => {
            let productName = p.productName || p.name || '';
            productName = productName
              .replace(/\s*-\s*(Fresh|Quality|Assured|Premium|Best|Top|Hygienic|Carefully|Selected).*$/i, '')
              .trim();

            const { displayPrice, mrp } = calculateProductPrice(p);

            return {
              ...p,
              id: p._id || p.id,
              name: productName,
              imageUrl: p.mainImage || p.imageUrl,
              price: displayPrice,
              mrp: mrp,
              pack: p.variations?.[0]?.title || p.smallDescription || 'Standard',
            };
          });
          setBestsellerProducts(mapped);
        }
      } catch (error) {
        console.error('Failed to fetch bestsellers:', error);
      }
    };
    fetchBestsellers();
  }, [location?.latitude, location?.longitude]);

  const hasOrders = orders && orders.length > 0;

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
                Order Again
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                Quickly re-order your favorite staples & grocery orders
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6 space-y-6">
        {/* Past Orders Section */}
        {hasOrders ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                Your Past Orders
              </h2>
              <span className="text-[11px] text-slate-400 font-medium">
                Tap to re-add items
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {orders.map((order) => {
                const shortId = order.id.split('-').slice(-1)[0];
                const isAdded = addedOrders.has(order.id);
                const previewItems = (order.items || []).slice(0, 4);

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-slate-900">
                              Order #{shortId}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              • {formatDate(order.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            {order.items?.length || 0} items • ₹{(order.totalAmount || (order as any).total || 0).toLocaleString('en-IN')}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleOrderAgain(order, e)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-2xs touch-target-min flex-shrink-0 ${
                            isAdded
                              ? 'bg-[#16A34A] text-white'
                              : 'bg-[#FF2E7A] text-white hover:bg-[#E02269] active:scale-95'
                          }`}
                        >
                          {isAdded ? '✓ Added' : 'Reorder All'}
                        </button>
                      </div>

                      {/* Product Thumbnails */}
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                        {previewItems.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center p-1 flex-shrink-0 overflow-hidden"
                          >
                            <UserImage
                              src={item.product?.imageUrl || item.product?.mainImage}
                              alt={item.product?.name || 'Item'}
                              categoryFallback="grocery"
                              className="w-full h-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-6">
            <UserEmptyState
              icon={<RefreshIcon size={32} className="text-[#FF2E7A]" />}
              title="No previous orders found"
              description="Once you place an order, your items will appear here for 1-tap reordering."
              actionText="Browse Categories"
              onAction={() => navigate('/')}
            />
          </div>
        )}

        {/* Bestseller Essentials Grid */}
        {bestsellerProducts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                Popular Daily Essentials
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
              {bestsellerProducts.map((product) => {
                const inCartItem = cart.items.find(
                  (i) => i.product?.id === product.id || (i.product as any)?._id === product.id
                );
                const inCartQty = inCartItem?.quantity || 0;

                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-2xl border border-slate-100 p-2.5 sm:p-3 shadow-2xs flex flex-col justify-between"
                  >
                    <div className="w-full aspect-square bg-slate-50 rounded-xl flex items-center justify-center p-1.5 mb-1.5 overflow-hidden">
                      <UserImage
                        src={product.imageUrl}
                        alt={product.name}
                        categoryFallback="grocery"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-slate-900 line-clamp-1 mb-0.5">
                        {product.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium mb-1.5">
                        {product.pack}
                      </p>

                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-50">
                        <span className="text-xs font-bold text-slate-900">
                          ₹{product.price?.toLocaleString('en-IN')}
                        </span>

                        {inCartQty === 0 ? (
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="px-2.5 py-1 bg-[#FFF1F4] hover:bg-[#FFE4EA] text-[#FF2E7A] border border-[#FFE4EA] rounded-full text-xs font-bold transition-colors touch-target-min"
                          >
                            + ADD
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 bg-[#FFF1F4] border border-[#FFE4EA] rounded-full px-1.5 py-0.5 text-[#FF2E7A]">
                            <button
                              type="button"
                              onClick={() => updateQuantity(product.id, inCartQty - 1)}
                              className="w-4 h-4 flex items-center justify-center font-bold text-xs"
                            >
                              <MinusIcon size={10} />
                            </button>
                            <span className="text-xs font-bold min-w-[1rem] text-center">
                              {inCartQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(product.id, inCartQty + 1)}
                              className="w-4 h-4 flex items-center justify-center font-bold text-xs"
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
          </div>
        )}
      </div>
    </div>
  );
}
