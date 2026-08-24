import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { appConfig } from '../../services/configService';
import { calculateProductPrice } from '../../utils/priceUtils';
import { UserImage, UserEmptyState } from './components/common';
import { ArrowLeftIcon, TrashIcon, ShieldCheckIcon, TruckIcon, PlusIcon, MinusIcon, ChevronRightIcon } from './components/common/UserIcons';

export default function Cart() {
  const { cart, updateQuantity, removeFromCart, clearCart, loading } = useCart();
  const navigate = useNavigate();

  const deliveryFee = cart.total >= appConfig.freeDeliveryThreshold ? 0 : appConfig.deliveryFee;
  const platformFee = appConfig.platformFee;
  const totalAmount = cart.total + deliveryFee + platformFee;

  // Free delivery progress calculations using existing config
  const freeDeliveryThreshold = appConfig.freeDeliveryThreshold;
  const amountNeededForFreeDelivery = Math.max(0, freeDeliveryThreshold - cart.total);
  const deliveryProgressPercent = Math.min(100, Math.round((cart.total / freeDeliveryThreshold) * 100));

  const handleCheckout = () => {
    navigate('/checkout');
  };

  if (loading && cart.items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 bg-[#F8FAFC]">
        <div className="w-8 h-8 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-bold tracking-tight">Syncing your basket...</p>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 bg-[#F8FAFC]">
        <UserEmptyState
          icon={<TruckIcon size={32} className="text-[#FF2E7A]" />}
          title="Your basket is empty"
          description="Looks like you haven't added anything to your cart yet. Discover fresh produce and grocery items from nearby local shops."
          actionText="Start Shopping"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 md:pb-16">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors touch-target-min md:hidden"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <div>
              <h1 className="text-base md:text-xl font-bold text-slate-900 tracking-tight">
                Your Basket
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'} in cart
              </p>
            </div>
          </div>

          {cart.items.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] bg-[#FFF1F4] border border-[#FFE4EA] px-3 py-1 rounded-full transition-colors touch-target-min"
            >
              Clear Basket
            </button>
          )}
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        {/* Free Delivery Progress Banner */}
        <div className="bg-white rounded-2xl border border-slate-100 p-3.5 mb-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <TruckIcon size={16} className={deliveryFee === 0 ? "text-[#16A34A]" : "text-[#FF2E7A]"} />
              <span className="text-xs font-bold text-slate-800">
                {deliveryFee === 0
                  ? "You've unlocked FREE Delivery!"
                  : `Add ₹${amountNeededForFreeDelivery.toLocaleString('en-IN')} more for FREE delivery`}
              </span>
            </div>
            <span className="text-[11px] font-bold text-[#FF2E7A]">
              {deliveryProgressPercent}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                deliveryFee === 0 ? 'bg-[#16A34A]' : 'bg-[#FF2E7A]'
              }`}
              style={{ width: `${deliveryProgressPercent}%` }}
            />
          </div>
        </div>

        {/* 2-Column Responsive Shopping Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
          {/* Left Column: Cart Items */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-3">
            {cart.items.map((item) => {
              const { displayPrice, mrp, hasDiscount, discount } = calculateProductPrice(
                item.product,
                item.variant
              );
              const pId = item.product.id || (item.product as any)._id;

              return (
                <div
                  key={pId}
                  className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-2xs flex gap-3 group"
                >
                  {/* Thumbnail */}
                  <div
                    onClick={() => navigate(`/product/${pId}`)}
                    className="w-18 h-18 sm:w-20 sm:h-20 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0 p-1 cursor-pointer overflow-hidden border border-slate-100"
                  >
                    <UserImage
                      src={item.product.imageUrl || (item.product as any).mainImage}
                      alt={item.product.name}
                      categoryFallback="grocery"
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3
                          onClick={() => navigate(`/product/${pId}`)}
                          className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug cursor-pointer hover:text-[#FF2E7A] transition-colors"
                        >
                          {item.product.name}
                        </h3>

                        {/* Remove Action */}
                        <button
                          type="button"
                          onClick={() => removeFromCart(pId)}
                          className="p-1 text-slate-400 hover:text-[#FF2E7A] transition-colors flex-shrink-0 touch-target-min"
                          aria-label="Remove item"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>

                      {/* Variant / Pack */}
                      <p className="text-[10px] sm:text-xs text-slate-400 font-medium mt-0.5">
                        {item.product.pack || (item.product as any).variations?.[0]?.value || 'Standard'}
                      </p>
                    </div>

                    {/* Price & Stepper */}
                    <div className="flex items-end justify-between gap-2 pt-2 border-t border-slate-50">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-slate-900">
                          ₹{displayPrice.toLocaleString('en-IN')}
                        </span>
                        {hasDiscount && mrp > displayPrice && (
                          <span className="text-[10px] text-slate-400 line-through font-medium">
                            ₹{mrp.toLocaleString('en-IN')}
                          </span>
                        )}
                        {hasDiscount && discount > 0 && (
                          <span className="text-[9px] font-bold text-[#FF2E7A] bg-[#FFF1F4] px-1.5 py-0.5 rounded-md">
                            {discount}% OFF
                          </span>
                        )}
                      </div>

                      {/* Stepper Controls */}
                      <div className="flex items-center gap-1.5 bg-[#FFF1F4] border border-[#FFE4EA] rounded-full px-2 py-0.5 text-[#FF2E7A]">
                        <button
                          type="button"
                          onClick={() => updateQuantity(pId, item.quantity - 1, item.variant)}
                          className="w-5 h-5 flex items-center justify-center font-bold text-[#FF2E7A] hover:text-[#E02269] transition-colors active:scale-90 touch-target-min"
                          aria-label="Decrease quantity"
                        >
                          <MinusIcon size={12} />
                        </button>
                        <span className="text-xs font-bold text-[#FF2E7A] min-w-[1.2rem] text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(pId, item.quantity + 1, item.variant)}
                          className="w-5 h-5 flex items-center justify-center font-bold text-[#FF2E7A] hover:text-[#E02269] transition-colors active:scale-90 touch-target-min"
                          aria-label="Increase quantity"
                        >
                          <PlusIcon size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Order Summary */}
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20 space-y-3.5">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-2xs space-y-3.5">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight pb-2.5 border-b border-slate-100 flex items-center gap-2">
                <span>Bill Summary</span>
              </h2>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Item Subtotal</span>
                  <span className="font-bold text-slate-900">₹{cart.total.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex justify-between text-slate-600 font-medium">
                  <div className="flex items-center gap-1">
                    <span>Platform Fee</span>
                    <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.2 rounded">Standard</span>
                  </div>
                  <span className="font-bold text-slate-900">₹{platformFee.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex justify-between text-slate-600 font-medium">
                  <div className="flex items-center gap-1">
                    <span>Delivery Charges</span>
                    {deliveryFee === 0 && (
                      <span className="text-[9px] font-bold text-[#16A34A] bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                        FREE
                      </span>
                    )}
                  </div>
                  <span className={`font-bold ${deliveryFee === 0 ? 'text-[#16A34A]' : 'text-slate-900'}`}>
                    {deliveryFee === 0 ? '₹0' : `₹${deliveryFee.toLocaleString('en-IN')}`}
                  </span>
                </div>

                {cart.total < freeDeliveryThreshold && (
                  <div className="text-[11px] font-bold text-[#FF2E7A] bg-[#FFF1F4] border border-[#FFE4EA] px-2.5 py-1.5 rounded-xl">
                    Add ₹{amountNeededForFreeDelivery.toLocaleString('en-IN')} more to unlock FREE delivery
                  </div>
                )}
              </div>

              {/* Total & Checkout */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="text-xs font-bold text-slate-900">To Pay</span>
                    <p className="text-[10px] text-slate-400 font-medium">Inclusive of all taxes</p>
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    ₹{totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCheckout}
                  className="w-full py-2.5 bg-[#FF2E7A] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-xs hover:bg-[#E02269] active:scale-95 transition-all touch-target-min flex items-center justify-center gap-1.5"
                >
                  <span>Proceed to Checkout</span>
                  <ChevronRightIcon size={14} />
                </button>
              </div>
            </div>

            {/* Guarantee Pill */}
            <div className="p-3 bg-[#FFF1F4] border border-[#FFE4EA] rounded-2xl flex items-center gap-2.5 text-slate-700">
              <ShieldCheckIcon size={18} className="text-[#FF2E7A] flex-shrink-0" />
              <p className="text-[11px] font-medium leading-snug">
                Guaranteed safe & contactless delivery from verified local store partners.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Checkout CTA Bar (Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-100 shadow-lg lg:hidden user-safe-bottom">
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-slate-900">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
              {deliveryFee === 0 && (
                <span className="text-[9px] font-bold text-[#16A34A] bg-emerald-50 px-1.5 py-0.2 rounded-md">
                  FREE DELIVERY
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            className="px-5 py-2 bg-[#FF2E7A] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-xs hover:bg-[#E02269] active:scale-95 transition-all touch-target-min flex items-center gap-1"
          >
            <span>Checkout</span>
            <ChevronRightIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
