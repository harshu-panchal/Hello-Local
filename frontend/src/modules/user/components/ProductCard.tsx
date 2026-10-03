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
import { UserModal } from './common/UserModal';
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
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(0);

  const variations = Array.isArray(product.variations) ? product.variations : [];
  const hasMultipleVariations = variations.length > 1;

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

  // Find all cart items matching this product ID (across all variants)
  const matchingCartItems = cart.items.filter((item) => {
    if (!item?.product) return false;
    const itemProdId = String(item.product.id || item.product._id);
    const prodId = String((product as any).id || product._id);
    return itemProdId === prodId;
  });
  const inCartQty = matchingCartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

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

    // Product with multiple selectable variants: REQUIRE user selection!
    if (hasMultipleVariations) {
      const firstAvailableIdx = variations.findIndex(
        (v: any) => v.status !== 'Sold out' && (v.stock === undefined || v.stock === null || v.stock > 0)
      );
      setSelectedVariantIndex(firstAvailableIdx >= 0 ? firstAvailableIdx : 0);
      setIsVariantModalOpen(true);
      return;
    }

    isOperationPendingRef.current = true;
    try {
      if (variations.length === 1) {
        // Exactly one selectable variant: attach unambiguous variant
        const singleVar = variations[0];
        const vTitle = singleVar.title || singleVar.value || singleVar.name || product.pack || 'Standard';
        const vId = typeof singleVar._id === 'object' && singleVar._id !== null
          ? (singleVar._id as any).$oid || String(singleVar._id)
          : String(singleVar._id || '');
        const { displayPrice: varPrice, mrp: varMrp } = calculateProductPrice(product, 0);
        const productWithVariant = {
          ...product,
          price: varPrice,
          mrp: varMrp,
          pack: vTitle,
          selectedVariant: singleVar,
          variantId: vId,
          variantTitle: vTitle,
        };
        await addToCart(productWithVariant, addButtonRef.current);
      } else {
        // Non-variant product
        await addToCart(product, addButtonRef.current);
      }
    } finally {
      isOperationPendingRef.current = false;
    }
  };

  const handleAddSelectedVariant = async () => {
    if (selectedVariantIndex === null || !variations[selectedVariantIndex]) return;
    const selectedVar = variations[selectedVariantIndex];
    if (selectedVar.status === 'Sold out' || (selectedVar.stock !== undefined && selectedVar.stock !== null && selectedVar.stock <= 0)) {
      showToast('Selected option is out of stock', 'error');
      return;
    }

    const vTitle = selectedVar.title || selectedVar.value || selectedVar.name || product.pack || 'Standard';
    const vId = typeof selectedVar._id === 'object' && selectedVar._id !== null
      ? (selectedVar._id as any).$oid || String(selectedVar._id)
      : String(selectedVar._id || '');
    const { displayPrice: varPrice, mrp: varMrp } = calculateProductPrice(product, selectedVariantIndex);
    const productWithVariant = {
      ...product,
      price: varPrice,
      mrp: varMrp,
      pack: vTitle,
      selectedVariant: selectedVar,
      variantId: vId,
      variantTitle: vTitle,
    };

    setIsVariantModalOpen(false);
    isOperationPendingRef.current = true;
    try {
      await addToCart(productWithVariant, addButtonRef.current);
      showToast(`Added ${vTitle} to cart`, 'success');
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
      if (matchingCartItems.length === 1) {
        const targetItem = matchingCartItems[0];
        const vId =
          (targetItem?.product as any)?.variantId ||
          (targetItem?.product as any)?.selectedVariant?._id ||
          targetItem?.variant;
        const vTitle =
          (targetItem?.product as any)?.variantTitle ||
          (targetItem?.product as any)?.pack;
        await updateQuantity(
          ((product as any).id || product._id) as string,
          targetItem.quantity - 1,
          vId,
          vTitle
        );
      } else if (matchingCartItems.length > 1) {
        const lastItem = matchingCartItems[matchingCartItems.length - 1];
        const vId =
          (lastItem?.product as any)?.variantId ||
          (lastItem?.product as any)?.selectedVariant?._id ||
          lastItem?.variant;
        const vTitle =
          (lastItem?.product as any)?.variantTitle ||
          (lastItem?.product as any)?.pack;
        await updateQuantity(
          ((product as any).id || product._id) as string,
          lastItem.quantity - 1,
          vId,
          vTitle
        );
      }
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

    if (hasMultipleVariations) {
      const firstAvailableIdx = variations.findIndex(
        (v: any) => v.status !== 'Sold out' && (v.stock === undefined || v.stock === null || v.stock > 0)
      );
      setSelectedVariantIndex(firstAvailableIdx >= 0 ? firstAvailableIdx : 0);
      setIsVariantModalOpen(true);
      return;
    }

    isOperationPendingRef.current = true;
    try {
      if (inCartQty > 0) {
        const targetItem = matchingCartItems[0];
        const vId =
          (targetItem?.product as any)?.variantId ||
          (targetItem?.product as any)?.selectedVariant?._id ||
          targetItem?.variant;
        const vTitle =
          (targetItem?.product as any)?.variantTitle ||
          (targetItem?.product as any)?.pack;
        await updateQuantity(
          ((product as any).id || product._id) as string,
          inCartQty + 1,
          vId,
          vTitle
        );
      } else {
        await handleAdd(e);
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
      className={`bg-white border border-slate-100 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group w-full ${
        compact ? 'rounded-xl sm:rounded-2xl' : 'rounded-2xl'
      }`}
    >
      <div onClick={handleCardClick} className="cursor-pointer flex-1 flex flex-col">
        {/* Product Image Area */}
        <div
          className={`w-full bg-[#FAFBFD] flex items-center justify-center overflow-hidden relative ${
            compact
              ? 'aspect-square max-h-36 sm:max-h-44 p-2'
              : 'aspect-square max-h-48 sm:max-h-56 p-2.5'
          }`}
        >
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
              className="absolute top-2 right-2 z-20 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center hover:bg-white transition-all shadow-2xs border border-slate-100"
              aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              {isWishlisted ? (
                <HeartFilledIcon size={13} className="text-[#FF2E7A]" />
              ) : (
                <HeartOutlineIcon size={13} className="text-slate-400 hover:text-slate-600" />
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
        <div className={`${compact ? 'p-2 sm:p-2.5' : 'p-2.5 sm:p-3'} flex-1 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-1 mb-0.5 min-w-0">
              {brandName ? (
                <span className="text-[9px] sm:text-[10px] font-bold text-[#FF2E7A] uppercase tracking-wider truncate max-w-[60%]">
                  {brandName}
                </span>
              ) : (
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium truncate">
                  {packInfo}
                </span>
              )}
              {brandName && (
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium truncate ml-auto">
                  {packInfo}
                </span>
              )}
            </div>

            <h4 className={`${compact ? 'text-xs sm:text-[13px] min-h-[1.9rem] leading-tight' : 'text-xs sm:text-sm min-h-[2rem] leading-snug'} font-semibold text-slate-900 line-clamp-2`}>
              {productName}
            </h4>
          </div>

          {/* Price & Add to Cart row */}
          <div className="pt-1.5 mt-auto flex items-center justify-between gap-1.5">
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                ₹{displayPrice.toLocaleString('en-IN')}
              </span>
              {mrp && mrp > displayPrice && (
                <span className="text-[9px] sm:text-[10px] text-slate-400 line-through font-medium">
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
                  className={`rounded-lg font-bold text-[10px] sm:text-[11px] h-6 sm:h-7 px-2.5 sm:px-3 flex items-center justify-center uppercase tracking-wider transition-all active:scale-95 touch-target-min ${
                    isActionDisabled
                      ? 'border border-slate-200 text-slate-400 bg-slate-100 cursor-not-allowed'
                      : 'border border-[#FF2E7A] text-[#FF2E7A] bg-[#FFF1F4] hover:bg-[#FFE4EA]'
                  }`}
                >
                  {isOutOfRange ? 'N/A' : isSoldOut ? 'Sold' : (
                    hasMultipleVariations ? (
                      <span className="flex items-center gap-1">
                        <span>ADD</span>
                        <span className="text-[8px] opacity-75 font-normal lowercase tracking-tight">+options</span>
                      </span>
                    ) : (
                      'ADD'
                    )
                  )}
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

      {/* Explicit Variant Selection Modal */}
      <UserModal
        isOpen={isVariantModalOpen}
        onClose={() => setIsVariantModalOpen(false)}
        title={
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Select Option</h3>
            <p className="text-[11px] text-slate-500 truncate max-w-xs">{productName}</p>
          </div>
        }
        maxWidth="sm"
      >
        <div className="py-2 space-y-3">
          <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <UserImage
              src={imageUrl}
              alt={productName}
              className="w-12 h-12 object-contain rounded-lg bg-white p-1"
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-900 truncate">{productName}</h4>
              <p className="text-[11px] text-slate-500">{brandName || 'Choose preferred size/pack'}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
              Available Options:
            </label>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {variations.map((variant: any, idx: number) => {
                const vTitle = variant.title || variant.value || variant.name || `Option ${idx + 1}`;
                const isOutOfStock =
                  variant.status === 'Sold out' ||
                  (variant.stock !== undefined && variant.stock !== null && variant.stock <= 0);
                const isSelected = selectedVariantIndex === idx;
                const { displayPrice: optPrice, mrp: optMrp } = calculateProductPrice(product, idx);

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => setSelectedVariantIndex(idx)}
                    className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                      isSelected
                        ? 'border-[#FF2E7A] bg-[#FFF1F4]/70 ring-1 ring-[#FF2E7A]'
                        : isOutOfStock
                        ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-[#FF2E7A] bg-[#FF2E7A]' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-900 truncate">{vTitle}</div>
                        {isOutOfStock && <div className="text-[10px] text-red-500 font-semibold">Sold Out</div>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-xs font-bold text-slate-900">₹{optPrice.toLocaleString('en-IN')}</div>
                      {optMrp > optPrice && (
                        <div className="text-[10px] text-slate-400 line-through">₹{optMrp.toLocaleString('en-IN')}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsVariantModalOpen(false)}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                selectedVariantIndex === null ||
                variations[selectedVariantIndex]?.status === 'Sold out' ||
                (variations[selectedVariantIndex]?.stock !== undefined &&
                  variations[selectedVariantIndex]?.stock !== null &&
                  variations[selectedVariantIndex]?.stock <= 0)
              }
              onClick={handleAddSelectedVariant}
              className="flex-1 py-2 rounded-xl bg-[#FF2E7A] hover:bg-[#E02269] text-white text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </UserModal>
    </motion.div>
  );
}
