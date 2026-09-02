import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Product } from '../../../types/domain';
import { useCart } from '../../../context/CartContext';
import { useAuth } from '../../../context/AuthContext';
import { useLocation } from '../../../hooks/useLocation';
import { useToast } from '../../../context/ToastContext';
import { addToWishlist, removeFromWishlist, getWishlist } from '../../../services/api/customerWishlistService';
import { calculateProductPrice } from '../../../utils/priceUtils';
import { UserImage } from './common/UserImage';
import { HeartOutlineIcon, HeartFilledIcon, PlusIcon, MinusIcon, ClockIcon } from './common/UserIcons';

interface ProductCardProps {
  product: Product;
  showBadge?: boolean;
  badgeText?: string;
  showPackBadge?: boolean;
  showStockInfo?: boolean;
  showHeartIcon?: boolean;
  showRating?: boolean;
  showVegetarianIcon?: boolean;
  showOptionsText?: boolean;
  optionsCount?: number;
  compact?: boolean;
  categoryStyle?: boolean;
}

export default function ProductCard({
  product,
  showBadge = false,
  badgeText,
  showPackBadge = false,
  showStockInfo = false,
  showHeartIcon = true,
  showRating = true,
  showVegetarianIcon = false,
  showOptionsText = false,
  optionsCount = 2,
  compact = false,
  categoryStyle = false,
}: ProductCardProps) {
  const navigate = useNavigate();
  const { cart, addToCart, updateQuantity } = useCart();
  const { isAuthenticated } = useAuth();
  const { location } = useLocation();
  const { showToast } = useToast();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const isOperationPendingRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsWishlisted(false);
      return;
    }

    const checkWishlist = async () => {
      try {
        const res = await getWishlist({
          latitude: location?.latitude,
          longitude: location?.longitude,
        });
        if (res.success && res.data && res.data.products) {
          const targetId = String((product as any).id || product._id);
          const exists = res.data.products.some(
            (p: any) => String(p._id || (p as any).id) === targetId
          );
          setIsWishlisted(exists);
        }
      } catch (e) {
        setIsWishlisted(false);
      }
    };
    checkWishlist();
  }, [product.id, product._id, isAuthenticated, location?.latitude, location?.longitude]);

  const toggleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const targetId = String((product as any).id || product._id);
    const previousState = isWishlisted;

    try {
      if (isWishlisted) {
        setIsWishlisted(false);
        await removeFromWishlist(targetId);
        showToast('Removed from wishlist');
      } else {
        if (!location?.latitude || !location?.longitude) {
          showToast('Location is required to add items to wishlist', 'error');
          return;
        }
        setIsWishlisted(true);
        await addToWishlist(targetId, location?.latitude, location?.longitude);
        showToast('Added to wishlist');
      }
    } catch (e: any) {
      console.error('Failed to toggle wishlist:', e);
      setIsWishlisted(previousState);
      const errorMessage =
        e.response?.data?.message || e.message || 'Failed to update wishlist';
      showToast(errorMessage, 'error');
    }
  };

  const cartItem = cart.items.find((item) => {
    if (!item?.product) return false;
    const itemProdId = String(item.product.id || item.product._id);
    const prodId = String((product as any).id || product._id);
    return itemProdId === prodId;
  });
  const inCartQty = cartItem?.quantity || 0;

  const { displayPrice, mrp, discount } = calculateProductPrice(product);

  const handleCardClick = () => {
    navigate(`/product/${((product as any).id || product._id) as string}`);
  };

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (product.isAvailable === false || isOperationPendingRef.current) {
      return;
    }

    isOperationPendingRef.current = true;
    try {
      await addToCart(product, addButtonRef.current);
    } finally {
      isOperationPendingRef.current = false;
    }
  };

  const handleDecrease = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isOperationPendingRef.current || inCartQty <= 0) {
      return;
    }

    isOperationPendingRef.current = true;
    try {
      const vId =
        (cartItem?.product as any)?.variantId ||
        (cartItem?.product as any)?.selectedVariant?._id ||
        cartItem?.variant;
      await updateQuantity(
        ((product as any).id || product._id) as string,
        inCartQty - 1,
        vId
      );
    } finally {
      isOperationPendingRef.current = false;
    }
  };

  const handleIncrease = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (product.isAvailable === false || isOperationPendingRef.current) {
      return;
    }

    isOperationPendingRef.current = true;
    try {
      if (inCartQty > 0) {
        const vId =
          (cartItem?.product as any)?.variantId ||
          (cartItem?.product as any)?.selectedVariant?._id ||
          cartItem?.variant;
        await updateQuantity(
          ((product as any).id || product._id) as string,
          inCartQty + 1,
          vId
        );
      } else {
        await addToCart(product, addButtonRef.current);
      }
    } finally {
      isOperationPendingRef.current = false;
    }
  };

  const isSoldOut =
    (product.stock !== undefined && product.stock <= 0) ||
    product.status === 'Sold out';
  const isOutOfRange = product.isAvailable === false;
  const isActionDisabled = isOutOfRange || isSoldOut;

  const imageUrl = product.imageUrl || product.mainImage;
  const productName = product.name || product.productName || 'Product';
  const packInfo = product.variations?.[0]?.value || product.pack || product.smallDescription || 'Standard';
  const brandName =
    product.brand && typeof product.brand === 'object' && product.brand.name
      ? product.brand.name
      : typeof product.brand === 'string' && product.brand.length < 50
      ? product.brand
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group"
    >
      <div onClick={handleCardClick} className="cursor-pointer flex-1 flex flex-col">
        {/* Product Image Area */}
        <div className="w-full aspect-square bg-[#FAFBFD] flex items-center justify-center overflow-hidden relative p-2.5">
          <UserImage
            src={imageUrl}
            alt={productName}
            categoryFallback={product.category?.name || 'grocery'}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
          />

          {/* Discount Pill Badge */}
          {discount > 0 && (
            <div className="absolute top-2 left-2 z-10 bg-[#FF2E7A] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-2xs">
              {discount}% OFF
            </div>
          )}

          {/* Custom Badge */}
          {showBadge && badgeText && discount <= 0 && (
            <div className="absolute top-2 left-2 z-10 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-2xs">
              {badgeText}
            </div>
          )}

          {/* Heart / Wishlist Toggle */}
          {showHeartIcon && (
            <button
              type="button"
              onClick={toggleWishlist}
              className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center hover:bg-white transition-all shadow-2xs border border-slate-100"
              aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              {isWishlisted ? (
                <HeartFilledIcon size={14} className="text-[#FF2E7A]" />
              ) : (
                <HeartOutlineIcon size={14} className="text-slate-400 hover:text-slate-600" />
              )}
            </button>
          )}

          {/* Delivery ETA Pill */}
          <div className="absolute bottom-1.5 left-2 z-10 flex items-center gap-1 bg-white/90 backdrop-blur-xs px-1.5 py-0.5 rounded-md border border-slate-100 text-[9px] font-bold text-slate-600 shadow-2xs">
            <ClockIcon size={10} className="text-[#FF2E7A]" />
            <span>15 MINS</span>
          </div>
        </div>

        {/* Product Details */}
        <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 mb-0.5 min-w-0">
              {brandName ? (
                <span className="text-[10px] font-bold text-[#FF2E7A] uppercase tracking-wider truncate max-w-[60%]">
                  {brandName}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-medium truncate">
                  {packInfo}
                </span>
              )}
              {brandName && (
                <span className="text-[10px] text-slate-400 font-medium truncate ml-auto">
                  {packInfo}
                </span>
              )}
            </div>

            <h4 className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-2 leading-snug min-h-[2rem]">
              {productName}
            </h4>
          </div>

          {/* Price & Add to Cart row */}
          <div className="pt-2 mt-auto flex items-center justify-between gap-1.5">
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                ₹{displayPrice.toLocaleString('en-IN')}
              </span>
              {mrp && mrp > displayPrice && (
                <span className="text-[10px] text-slate-400 line-through font-medium">
                  ₹{mrp.toLocaleString('en-IN')}
                </span>
              )}
            </div>

            {/* In-Card Add Button / Stepper */}
            <div>
              {inCartQty === 0 ? (
                <button
                  ref={addButtonRef}
                  type="button"
                  disabled={isActionDisabled}
                  onClick={handleAdd}
                  className={`rounded-lg font-bold text-[11px] h-7 px-3 flex items-center justify-center uppercase tracking-wider transition-all active:scale-95 touch-target-min ${
                    isActionDisabled
                      ? 'border border-slate-200 text-slate-400 bg-slate-100 cursor-not-allowed'
                      : 'border border-[#FF2E7A] text-[#FF2E7A] bg-[#FFF1F4] hover:bg-[#FFE4EA]'
                  }`}
                >
                  {isOutOfRange ? 'N/A' : isSoldOut ? 'Sold' : 'ADD'}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-[#FFF1F4] border border-[#FFE4EA] rounded-lg px-1.5 h-7 text-[#FF2E7A] font-bold">
                  <button
                    type="button"
                    onClick={handleDecrease}
                    className="w-5 h-5 flex items-center justify-center font-bold hover:text-[#E02269] active:scale-90"
                    aria-label="Decrease quantity"
                  >
                    <MinusIcon size={12} />
                  </button>
                  <span className="text-xs font-bold min-w-[0.8rem] text-center text-[#FF2E7A]">
                    {inCartQty}
                  </span>
                  <button
                    type="button"
                    disabled={isOutOfRange}
                    onClick={handleIncrease}
                    className="w-5 h-5 flex items-center justify-center font-bold hover:text-[#E02269] active:scale-90"
                    aria-label="Increase quantity"
                  >
                    <PlusIcon size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
