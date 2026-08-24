import {
  useParams,
  useNavigate,
  useLocation as useRouterLocation,
} from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { useLocation } from "../../hooks/useLocation";
import { useLoading } from "../../context/LoadingContext";
import { getProductById } from "../../services/api/customerProductService";
import WishlistButton from "../../components/WishlistButton";
import StarRating from "../../components/ui/StarRating";
import { calculateProductPrice } from "../../utils/priceUtils";
import { UserImage, UserEmptyState } from "./components/common";
import { ArrowLeftIcon, ClockIcon, ShieldCheckIcon, SparklesIcon, PlusIcon, MinusIcon } from "./components/common/UserIcons";
import ProductCard from "./components/ProductCard";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routerLocation = useRouterLocation();
  const { cart, addToCart, updateQuantity } = useCart();
  const { location } = useLocation();
  const { startLoading, stopLoading } = useLoading();
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const [isProductDetailsExpanded, setIsProductDetailsExpanded] = useState(false);
  const [isHighlightsExpanded, setIsHighlightsExpanded] = useState(false);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);

  const [product, setProduct] = useState<any>(null);
  const [similarProducts, setSimilarProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAvailableAtLocation, setIsAvailableAtLocation] = useState<boolean>(true);

  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      startLoading();
      try {
        const response = await getProductById(
          id,
          location?.latitude,
          location?.longitude
        );
        if (response.success && response.data) {
          const productData = response.data as any;

          setIsAvailableAtLocation(productData.isAvailableAtLocation !== false);

          const allImages = [
            productData.mainImage || productData.imageUrl || "",
            ...(productData.galleryImages || productData.galleryImageUrls || []),
          ].filter(Boolean);

          setProduct({
            ...productData,
            id: productData._id || productData.id,
            name: productData.productName || productData.name || "Product",
            imageUrl: productData.mainImage || productData.imageUrl || "",
            allImages: allImages,
            price: productData.price || 0,
            mrp: productData.mrp || productData.price || 0,
            pack:
              productData.variations?.[0]?.title ||
              productData.variations?.[0]?.value ||
              productData.smallDescription ||
              "Standard",
          });

          setSelectedVariantIndex(0);
          setSelectedImageIndex(0);
          setSimilarProducts(response.data.similarProducts || []);
        } else {
          setProduct(null);
          setError(response.message || "Product not found");
        }
      } catch (error: any) {
        console.error("Failed to fetch product", error);
        setProduct(null);
        setError(error.message || "Something went wrong while fetching product details");
      } finally {
        setLoading(false);
        stopLoading();
      }
    };

    fetchProduct();
  }, [id, location?.latitude, location?.longitude]);

  // Selected variant & calculations
  const selectedVariant = product?.variations?.[selectedVariantIndex] || null;
  const { displayPrice: variantPrice, mrp: variantMrp, discount, hasDiscount } = calculateProductPrice(
    product,
    selectedVariantIndex
  );

  const variantStock =
    selectedVariant?.stock !== undefined
      ? selectedVariant.stock
      : product?.stock || 0;
  const variantTitle =
    selectedVariant?.title || selectedVariant?.value || product?.pack || "Standard";
  const isVariantAvailable =
    selectedVariant?.status !== "Sold out" && variantStock > 0;

  const allImages = product?.allImages || [product?.imageUrl || ""].filter(Boolean);
  const currentImage = allImages[selectedImageIndex] || product?.imageUrl || "";

  // Mobile swipe handlers
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && selectedImageIndex < allImages.length - 1) {
      setIsTransitioning(true);
      setSelectedImageIndex(selectedImageIndex + 1);
      setTimeout(() => setIsTransitioning(false), 300);
    }

    if (isRightSwipe && selectedImageIndex > 0) {
      setIsTransitioning(true);
      setSelectedImageIndex(selectedImageIndex - 1);
      setTimeout(() => setIsTransitioning(false), 300);
    }
  };

  // Find cart item to track current in-cart quantity
  const cartItem = cart.items.find((item) => {
    if (!item?.product) return false;
    const itemProdId = String(item.product.id || item.product._id);
    const prodId = String(product?.id || product?._id);
    const itemVariantId = (item.product as any)?.variantId || (item.product as any)?.selectedVariant?._id || item?.variant;
    const currentVariantId = selectedVariant?._id;
    return itemProdId === prodId && (!currentVariantId || itemVariantId === currentVariantId);
  });
  const inCartQty = cartItem?.quantity || 0;

  if (loading && !product) {
    return null;
  }

  if (error && !product) {
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

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
        <UserEmptyState
          icon="📦"
          title="Product Not Found"
          description="The product you are looking for does not exist or has been removed."
          actionText="Go Back"
          onAction={() => navigate(-1)}
        />
      </div>
    );
  }

  const category =
    product.category && product.category.name
      ? { name: product.category.name, id: product.category._id }
      : null;

  const handleAddToCart = () => {
    if (!isAvailableAtLocation) {
      alert("This product is not available for delivery at your location.");
      return;
    }
    if (!isVariantAvailable && variantStock !== 0) {
      alert("This variant is currently out of stock.");
      return;
    }

    const productWithVariant = {
      ...product,
      price: variantPrice,
      mrp: variantMrp,
      pack: variantTitle,
      selectedVariant: selectedVariant,
      variantId: selectedVariant?._id,
      variantTitle: variantTitle,
    };
    addToCart(productWithVariant, addButtonRef.current);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 md:pb-16">
      {/* Top Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-full transition-colors touch-target-min"
            aria-label="Go back"
          >
            <ArrowLeftIcon size={18} />
          </button>

          <span className="text-xs sm:text-sm font-bold text-slate-800 truncate max-w-[200px] sm:max-w-md">
            {product.name}
          </span>

          <div className="flex items-center gap-2">
            {product?.id && (
              <WishlistButton
                productId={product.id}
                size="sm"
                className="bg-slate-50 hover:bg-slate-100 !shadow-none border border-slate-200"
              />
            )}
          </div>
        </div>
      </div>

      {/* Main Product Layout */}
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        {/* Location Availability Alert */}
        {!isAvailableAtLocation && (
          <div className="bg-[#FFF9EE] border border-[#FCE9C8] rounded-2xl p-3 mb-4 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <span className="text-lg">⚠️</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-900">
                  Not available at your location
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  This product cannot be delivered to your current location. You can browse but cannot add to cart.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-8 items-start">
          {/* Left Column: Image Gallery */}
          <div className="md:col-span-6 lg:col-span-5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden md:sticky md:top-20">
              {/* Main Image Preview */}
              <div
                className="w-full aspect-square relative bg-[#FAFBFD] flex items-center justify-center overflow-hidden cursor-grab"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {/* Mobile Swipe Container */}
                <div
                  className="w-full h-full flex transition-transform duration-300 ease-out md:hidden"
                  style={{
                    transform: `translateX(-${selectedImageIndex * 100}%)`,
                  }}
                >
                  {allImages.map((image: string, index: number) => (
                    <div
                      key={index}
                      className="w-full h-full flex-shrink-0 flex items-center justify-center p-4"
                      style={{ minWidth: "100%" }}
                    >
                      <UserImage
                        src={image}
                        alt={`${product.name} - ${index + 1}`}
                        categoryFallback={product.category?.name || "grocery"}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ))}
                </div>

                {/* Desktop Single Image */}
                <div className="hidden md:flex w-full h-full items-center justify-center p-6">
                  <UserImage
                    src={currentImage}
                    alt={product.name}
                    categoryFallback={product.category?.name || "grocery"}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Discount Tag */}
                {hasDiscount && discount > 0 && (
                  <div className="absolute top-3 left-3 bg-[#FF2E7A] text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs">
                    {discount}% OFF
                  </div>
                )}

                {/* Gallery Pagination Dots */}
                {allImages.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10 bg-black/25 backdrop-blur-xs px-2 py-0.5 rounded-full">
                    {allImages.map((_: string, index: number) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setSelectedImageIndex(index)}
                        className={`h-1.5 rounded-full transition-all ${
                          index === selectedImageIndex
                            ? "bg-white w-4"
                            : "bg-white/50 w-1.5"
                        }`}
                        aria-label={`Go to image ${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Thumbnails Row */}
              {allImages.length > 1 && (
                <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex gap-2 overflow-x-auto scrollbar-hide">
                  {allImages.map((image: string, index: number) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setSelectedImageIndex(index)}
                      className={`flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden border-2 transition-all p-0.5 bg-white ${
                        index === selectedImageIndex
                          ? "border-[#FF2E7A]"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <UserImage
                        src={image}
                        alt={`${product.name} thumbnail ${index + 1}`}
                        categoryFallback="grocery"
                        className="w-full h-full object-contain"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Product Info & Purchase Controls */}
          <div className="md:col-span-6 lg:col-span-7 space-y-4">
            {/* Header Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-2xs">
              {/* Delivery Speed & Rating */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1 bg-[#FFF1F4] border border-[#FFE4EA] text-[#FF2E7A] px-2 py-0.5 rounded-md text-[10px] font-bold">
                  <ClockIcon size={11} className="text-[#FF2E7A]" />
                  <span>15 MINS DELIVERY</span>
                </div>

                <StarRating
                  rating={(product.rating || (product as any).rating) || 4.5}
                  reviewCount={(product.reviews || (product as any).reviewsCount) || 0}
                  size="sm"
                  showCount={true}
                />
              </div>

              {/* Title */}
              <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight leading-snug mb-1">
                {product.name}
              </h1>

              {/* Pack Subtitle */}
              <p className="text-xs font-medium text-slate-500 mb-3">
                {variantTitle}
              </p>

              {/* Price Row */}
              <div className="flex items-baseline gap-2 pb-3 border-b border-slate-100">
                <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  ₹{variantPrice.toLocaleString("en-IN")}
                </span>
                {hasDiscount && (
                  <>
                    <span className="text-xs text-slate-400 line-through font-medium">
                      ₹{variantMrp.toLocaleString("en-IN")}
                    </span>
                    {discount > 0 && (
                      <span className="bg-[#FFF1F4] text-[#FF2E7A] text-[10px] font-bold border border-[#FFE4EA] px-2 py-0.5 rounded-md">
                        {discount}% OFF
                      </span>
                    )}
                  </>
                )}
                <span className="text-[10px] text-slate-400 font-medium ml-auto">
                  Inclusive of all taxes
                </span>
              </div>

              {/* Variant Selector */}
              {product.variations && product.variations.length > 1 && (
                <div className="pt-3">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Select {product.variationType || "Option"}:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {product.variations.map((variant: any, index: number) => {
                      const vTitle =
                        variant.title || variant.value || `Option ${index + 1}`;
                      const isOutOfStock =
                        variant.status === "Sold out" ||
                        (variant.stock === 0 &&
                          variant.stock !== undefined &&
                          variant.stock !== null);
                      const isSelected = index === selectedVariantIndex;

                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setSelectedVariantIndex(index)}
                          disabled={isOutOfStock}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border touch-target-min ${
                            isSelected
                              ? "border-[#FF2E7A] bg-[#FFF1F4] text-[#FF2E7A] shadow-2xs"
                              : isOutOfStock
                              ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          {vTitle}
                          {isOutOfStock && (
                            <span className="ml-1 text-[9px] opacity-75">(Sold Out)</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stock status */}
              {variantStock !== 0 && variantStock !== undefined && variantStock !== null && (
                <p className="text-[11px] text-slate-500 font-medium mt-2.5">
                  {variantStock > 0 ? `🟢 In Stock (${variantStock} units)` : "🔴 Out of stock"}
                </p>
              )}
            </div>

            {/* Guarantees Strip */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3 shadow-2xs">
              <div className="grid grid-cols-3 gap-2 text-center divide-x divide-slate-100">
                <div className="px-1 flex flex-col items-center">
                  <ShieldCheckIcon size={16} className="text-[#16A34A] mb-1" />
                  <span className="text-xs font-bold text-slate-800">48h Return</span>
                  <span className="text-[9px] text-slate-400">Doorstep pickup</span>
                </div>
                <div className="px-1 flex flex-col items-center">
                  <SparklesIcon size={16} className="text-[#FF8A00] mb-1" />
                  <span className="text-xs font-bold text-slate-800">100% Quality</span>
                  <span className="text-[9px] text-slate-400">Direct from store</span>
                </div>
                <div className="px-1 flex flex-col items-center">
                  <ClockIcon size={16} className="text-[#FF2E7A] mb-1" />
                  <span className="text-xs font-bold text-slate-800">Instant</span>
                  <span className="text-[9px] text-slate-400">15-30 mins</span>
                </div>
              </div>
            </div>

            {/* Product Highlights & Info */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs space-y-3">
              {/* Product Highlights */}
              <div className="border-b border-slate-100 pb-2.5">
                <button
                  type="button"
                  onClick={() => setIsHighlightsExpanded(!isHighlightsExpanded)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-800 uppercase tracking-wider"
                >
                  <span>Highlights & Key Features</span>
                  <span className={`transition-transform text-slate-400 text-xs ${isHighlightsExpanded ? "rotate-180" : ""}`}>
                    ▼
                  </span>
                </button>
                {isHighlightsExpanded && (
                  <div className="pt-2.5 space-y-1.5 text-xs text-slate-600">
                    {product.tags && product.tags.length > 0 && (
                      <div className="flex gap-2">
                        <span className="font-bold text-slate-800 w-24 flex-shrink-0">Features:</span>
                        <span>{product.tags.join(", ")}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="font-bold text-slate-800 w-24 flex-shrink-0">Origin:</span>
                      <span>{product.madeIn || "India"}</span>
                    </div>
                    {category && (
                      <div className="flex gap-2">
                        <span className="font-bold text-slate-800 w-24 flex-shrink-0">Category:</span>
                        <span>{category.name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Product Description & Specifications */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-800 uppercase tracking-wider"
                >
                  <span>Product Specifications & Info</span>
                  <span className={`transition-transform text-slate-400 text-xs ${isInfoExpanded ? "rotate-180" : ""}`}>
                    ▼
                  </span>
                </button>
                {isInfoExpanded && (
                  <div className="pt-2.5 space-y-2 text-xs text-slate-600">
                    {product.description && (
                      <div>
                        <span className="font-bold text-slate-800 block mb-0.5">Description:</span>
                        <p className="leading-relaxed text-slate-600">{product.description}</p>
                      </div>
                    )}
                    {product.fssaiLicNo && (
                      <div className="flex gap-2">
                        <span className="font-bold text-slate-800 w-24 flex-shrink-0">FSSAI Lic:</span>
                        <span>{product.fssaiLicNo}</span>
                      </div>
                    )}
                    {product.manufacturer && (
                      <div className="flex gap-2">
                        <span className="font-bold text-slate-800 w-24 flex-shrink-0">Manufacturer:</span>
                        <span>{product.manufacturer}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="font-bold text-slate-800 w-24 flex-shrink-0">Return Policy:</span>
                      <span>
                        {product.isReturnable
                          ? `Returnable within ${product.maxReturnDays || 2} days`
                          : "Non-returnable"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <div className="mt-8 mb-6">
            <div className="flex items-center gap-1.5 mb-3">
              <SparklesIcon size={16} className="text-[#FF8A00]" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Similar items you might like
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
              {similarProducts.slice(0, 5).map((simProduct) => (
                <ProductCard
                  key={simProduct.id || simProduct._id}
                  product={simProduct}
                  categoryStyle={false}
                  showBadge={true}
                  showStockInfo={false}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 shadow-lg user-safe-bottom">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-bold text-slate-900">
                ₹{variantPrice.toLocaleString("en-IN")}
              </span>
              {hasDiscount && (
                <span className="text-xs text-slate-400 line-through font-medium">
                  ₹{variantMrp.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-medium truncate">
              {variantTitle} • Inclusive of all taxes
            </p>
          </div>

          <div>
            <AnimatePresence mode="wait">
              {inCartQty === 0 ? (
                <button
                  ref={addButtonRef}
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!isAvailableAtLocation || !isVariantAvailable}
                  className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all active:scale-95 touch-target-min ${
                    !isAvailableAtLocation || !isVariantAvailable
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-[#FF2E7A] text-white hover:bg-[#E02269] shadow-xs"
                  }`}
                >
                  {!isAvailableAtLocation
                    ? "Unavailable"
                    : !isVariantAvailable
                    ? "Out of Stock"
                    : "Add to Cart"}
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-[#FFF1F4] border border-[#FFE4EA] rounded-full px-2.5 py-1 text-[#FF2E7A] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      const productId = product.id || product._id;
                      const variantId = selectedVariant?._id;
                      updateQuantity(productId, inCartQty - 1, variantId, variantTitle);
                    }}
                    className="w-6 h-6 flex items-center justify-center font-bold hover:text-[#E02269] active:scale-90 touch-target-min"
                    aria-label="Decrease quantity"
                  >
                    <MinusIcon size={13} />
                  </button>
                  <span className="text-xs font-bold text-[#FF2E7A] min-w-[1.2rem] text-center">
                    {inCartQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const productId = product.id || product._id;
                      const variantId = selectedVariant?._id;
                      updateQuantity(productId, inCartQty + 1, variantId, variantTitle);
                    }}
                    className="w-6 h-6 flex items-center justify-center font-bold hover:text-[#E02269] active:scale-90 touch-target-min"
                    aria-label="Increase quantity"
                  >
                    <PlusIcon size={13} />
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
