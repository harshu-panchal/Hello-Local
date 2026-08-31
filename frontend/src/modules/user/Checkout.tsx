import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { useOrders } from "../../hooks/useOrders";
import { useLocation as useLocationContext } from "../../hooks/useLocation";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { OrderAddress, Order } from "../../types/order";
import PartyPopper from "./components/PartyPopper";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "../../components/ui/sheet";
import WishlistButton from "../../components/WishlistButton";
import {
  getCoupons,
  validateCoupon,
  Coupon as ApiCoupon,
} from "../../services/api/customerCouponService";
import { appConfig } from "../../services/configService";
import {
  getAddresses,
  updateAddress,
} from "../../services/api/customerAddressService";
import GoogleMapsLocationPicker from "../../components/GoogleMapsLocationPicker";
import { getProducts } from "../../services/api/customerProductService";
import { addToWishlist } from "../../services/api/customerWishlistService";
import { updateProfile } from "../../services/api/customerService";
import { calculateProductPrice } from "../../utils/priceUtils";
import RazorpayCheckout from "../../components/RazorpayCheckout";
import { UserImage, UserEmptyState } from "./components/common";
import { ArrowLeftIcon, LocationPinIcon, ClockIcon, TagIcon, CreditCardIcon, ChevronRightIcon, PlusIcon, MinusIcon } from "./components/common/UserIcons";

export default function Checkout() {
  const {
    cart,
    updateQuantity,
    clearCart,
    addToCart,
    removeFromCart,
    refreshCart,
    loading: cartLoading,
  } = useCart();
  const { addOrder } = useOrders();
  const { location: userLocation } = useLocationContext();
  const { showToast: showGlobalToast } = useToast();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [customTipAmount, setCustomTipAmount] = useState<number>(0);
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);
  const [savedAddress, setSavedAddress] = useState<OrderAddress | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<OrderAddress | null>(null);
  const [showCouponSheet, setShowCouponSheet] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<ApiCoupon | null>(null);
  const [showPartyPopper, setShowPartyPopper] = useState(false);
  const [hasAppliedCouponBefore, setHasAppliedCouponBefore] = useState(false);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);

  useEffect(() => {
    if (selectedAddress?.latitude && selectedAddress?.longitude) {
      refreshCart(selectedAddress.latitude, selectedAddress.longitude);
    }
  }, [selectedAddress]);

  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<ApiCoupon[]>([]);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [validatedDiscount, setValidatedDiscount] = useState<number>(0);
  const [similarProducts, setSimilarProducts] = useState<any[]>([]);
  const [showGstinSheet, setShowGstinSheet] = useState(false);
  const [gstin, setGstin] = useState<string>("");
  const [showCancellationPolicy, setShowCancellationPolicy] = useState(false);
  const [giftPackaging, setGiftPackaging] = useState<boolean>(false);

  // Profile completion modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileFormData, setProfileFormData] = useState({
    name: "",
    email: "",
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapLocation, setMapLocation] = useState<{
    lat: number;
    lng: number;
    address?: any;
  } | null>(null);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [isMapSelected, setIsMapSelected] = useState(false);

  // Payment Method State
  const [paymentMethod, setPaymentMethod] = useState<"Online" | "COD">("Online");

  // Razorpay Payment State
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [showRazorpayCheckout, setShowRazorpayCheckout] = useState(false);

  useBodyScrollLock(
    showCouponSheet ||
      showGstinSheet ||
      showCancellationPolicy ||
      showProfileModal ||
      showMapPicker
  );

  const isPlaceholderUser =
    user?.name === "User" || user?.email?.endsWith("@hellolocal.temp");

  // Load addresses and coupons
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [addressResponse, couponResponse] = await Promise.all([
          getAddresses(),
          getCoupons(),
        ]);

        if (
          addressResponse.success &&
          Array.isArray(addressResponse.data) &&
          addressResponse.data.length > 0
        ) {
          const defaultAddr =
            addressResponse.data.find((a: any) => a.isDefault) ||
            addressResponse.data[0];
          const mappedAddress: OrderAddress = {
            name: defaultAddr.fullName,
            phone: defaultAddr.phone,
            flat: "",
            street: defaultAddr.address,
            city: defaultAddr.city,
            state: defaultAddr.state,
            pincode: defaultAddr.pincode,
            landmark: defaultAddr.landmark || "",
            latitude: defaultAddr.latitude,
            longitude: defaultAddr.longitude,
            id: defaultAddr._id,
            _id: defaultAddr._id,
          };
          setSavedAddress(mappedAddress);
          setSelectedAddress(mappedAddress);
        }

        if (couponResponse.success) {
          setAvailableCoupons(couponResponse.data);
        }
      } catch (error) {
        console.error("Error loading checkout data:", error);
      }
    };
    fetchInitialData();
  }, []);

  // Fetch similar products dynamically
  useEffect(() => {
    const fetchSimilar = async () => {
      const items = (cart?.items || []).filter((item) => item && item.product);
      if (items.length === 0) return;

      const cartItem = items[0];
      try {
        let response;
        if (cartItem && cartItem.product) {
          let catId = "";
          const product = cartItem.product;

          if (product.categoryId) {
            catId =
              typeof product.categoryId === "string"
                ? product.categoryId
                : (product.categoryId as any)._id ||
                  (product.categoryId as any).id;
          }

          if (catId) {
            response = await getProducts({ category: catId, limit: 10 });
          } else {
            response = await getProducts({ limit: 10, sort: "popular" });
          }
        } else {
          response = await getProducts({ limit: 10, sort: "popular" });
        }

        if (response && response.data) {
          const itemsInCartIds = new Set(
            (cart?.items || [])
              .map((i) => i.product?.id || i.product?._id)
              .filter(Boolean)
          );
          const filtered = response.data
            .filter((p: any) => !itemsInCartIds.has(p.id || p._id))
            .map((p: any) => {
              const { displayPrice, mrp } = calculateProductPrice(p);
              return {
                ...p,
                id: p._id || p.id,
                name: p.productName || p.name || "Product",
                imageUrl: p.mainImage || p.imageUrl || p.mainImageUrl || "",
                price: displayPrice,
                mrp: mrp,
                pack:
                  p.pack ||
                  p.variations?.[0]?.title ||
                  p.variations?.[0]?.name ||
                  "Standard",
              };
            })
            .slice(0, 6);
          setSimilarProducts(filtered);
        }
      } catch (err) {
        console.error("Failed to fetch similar products", err);
      }
    };
    fetchSimilar();
  }, [cart?.items?.length]);

  if (cartLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-[#FF5364] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-xs sm:text-sm font-bold text-slate-500">
            Loading checkout...
          </p>
        </div>
      </div>
    );
  }

  if (!showOrderSuccess && (cart?.items?.length || 0) === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
        <UserEmptyState
          icon="🛒"
          title="Your cart is empty"
          description="Looks like you haven't added anything to your cart yet or your items are unavailable at the selected location."
          actionText="Start Shopping"
          onAction={() => navigate("/")}
        />
      </div>
    );
  }

  const displayItems = (cart?.items || []).filter(
    (item) => item && item.product
  );
  const displayCart = {
    ...cart,
    items: displayItems,
    itemCount: displayItems.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0
    ),
    total: displayItems.reduce((sum, item) => {
      const { displayPrice } = calculateProductPrice(
        item.product,
        item.variant
      );
      return sum + displayPrice * (item.quantity || 0);
    }, 0),
  };

  const freeDeliveryThreshold =
    cart.freeDeliveryThreshold ?? appConfig.freeDeliveryThreshold;
  const amountNeededForFreeDelivery = Math.max(
    0,
    freeDeliveryThreshold - (displayCart.total || 0)
  );

  const itemsTotal = displayItems.reduce((sum, item) => {
    if (!item?.product) return sum;
    const { mrp } = calculateProductPrice(item.product, item.variant);
    return sum + mrp * (item.quantity || 0);
  }, 0);

  const discountedTotal = displayCart.total;
  const savedAmount = itemsTotal - discountedTotal;
  const handlingCharge = cart.platformFee ?? appConfig.platformFee;

  const deliveryCharge =
    displayCart.estimatedDeliveryFee !== undefined
      ? displayCart.estimatedDeliveryFee
      : displayCart.total >= freeDeliveryThreshold
      ? 0
      : appConfig.deliveryFee;

  const subtotalBeforeCoupon =
    discountedTotal + handlingCharge + deliveryCharge;

  let currentCouponDiscount = 0;
  if (selectedCoupon) {
    if (
      selectedCoupon.minOrderValue &&
      subtotalBeforeCoupon < selectedCoupon.minOrderValue
    ) {
      // Invalid
    } else {
      if (selectedCoupon.discountType === "percentage") {
        currentCouponDiscount = Math.round(
          (subtotalBeforeCoupon * selectedCoupon.discountValue) / 100
        );
        if (
          selectedCoupon.maxDiscountAmount &&
          currentCouponDiscount > selectedCoupon.maxDiscountAmount
        ) {
          currentCouponDiscount = selectedCoupon.maxDiscountAmount;
        }
      } else {
        currentCouponDiscount = selectedCoupon.discountValue;
      }
    }
  }

  const finalTipAmount = showCustomTipInput ? customTipAmount : tipAmount || 0;
  const giftPackagingFee = giftPackaging ? 30 : 0;
  const grandTotal = Math.max(
    0,
    discountedTotal +
      handlingCharge +
      deliveryCharge +
      finalTipAmount +
      giftPackagingFee -
      currentCouponDiscount
  );

  const handleApplyCoupon = async (coupon: ApiCoupon) => {
    setIsValidatingCoupon(true);
    setCouponError(null);
    try {
      const result = await validateCoupon(coupon.code, subtotalBeforeCoupon);
      if (result.success && result.data?.isValid) {
        const isFirstTime = !hasAppliedCouponBefore;
        setSelectedCoupon(coupon);
        setValidatedDiscount(result.data.discountAmount);
        setShowCouponSheet(false);
        if (isFirstTime) {
          setHasAppliedCouponBefore(true);
          setShowPartyPopper(true);
        }
      } else {
        setCouponError(result.message || "Invalid coupon");
      }
    } catch (err: any) {
      setCouponError(err.response?.data?.message || "Failed to apply coupon");
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setSelectedCoupon(null);
    setValidatedDiscount(0);
    setCouponError(null);
  };

  const handleMoveToWishlist = async (product: any) => {
    if (!product?.id && !product?._id) return;
    const productId = product.id || product._id;

    try {
      if (!userLocation?.latitude || !userLocation?.longitude) {
        showGlobalToast(
          "Location is required to move items to wishlist",
          "error"
        );
        return;
      }

      await addToWishlist(
        productId,
        userLocation.latitude,
        userLocation.longitude
      );
      await removeFromCart(productId);
      showGlobalToast("Item moved to wishlist");
    } catch (error: any) {
      console.error("Failed to move to wishlist:", error);
      const msg =
        error.response?.data?.message || "Failed to move item to wishlist";
      showGlobalToast(msg, "error");
    }
  };

  const handlePlaceOrder = async (arg?: any) => {
    const bypassProfileCheck = arg === true;

    if (!selectedAddress || cart.items.length === 0) {
      return;
    }

    if (!bypassProfileCheck && isPlaceholderUser) {
      setProfileFormData({
        name: user?.name === "User" ? "" : user?.name || "",
        email: user?.email?.endsWith("@hellolocal.temp")
          ? ""
          : user?.email || "",
      });
      setShowProfileModal(true);
      return;
    }

    if (!selectedAddress.city || !selectedAddress.pincode) {
      showGlobalToast("Please ensure your address has city and pincode.", "error");
      return;
    }

    const finalLatitude = selectedAddress.latitude ?? userLocation?.latitude;
    const finalLongitude = selectedAddress.longitude ?? userLocation?.longitude;

    if (finalLatitude == null || finalLongitude == null) {
      showGlobalToast(
        "Location is required for delivery. Please ensure your address has location data or enable location access.",
        "error"
      );
      return;
    }

    const addressWithLocation: OrderAddress = {
      ...selectedAddress,
      latitude: finalLatitude,
      longitude: finalLongitude,
    };

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const order: Order = {
      id: orderId,
      items: cart.items,
      totalItems: cart.itemCount || 0,
      subtotal: discountedTotal,
      fees: {
        platformFee: handlingCharge,
        deliveryFee: deliveryCharge,
      },
      totalAmount: grandTotal,
      address: addressWithLocation,
      paymentMethod: paymentMethod,
      status: paymentMethod === "COD" ? "Received" : "Pending",
      createdAt: new Date().toISOString(),
      tipAmount: finalTipAmount,
      gstin: gstin || undefined,
      couponCode: selectedCoupon?.code || undefined,
      giftPackaging: giftPackaging,
    };

    try {
      const placedId = await addOrder(order);
      if (placedId) {
        if (paymentMethod === "COD") {
          setPlacedOrderId(placedId);
          clearCart();
          setShowOrderSuccess(true);
          showGlobalToast("Order placed successfully!", "success");
        } else {
          setPendingOrderId(placedId);
          setShowRazorpayCheckout(true);
        }
      }
    } catch (error: any) {
      console.error("Order placement failed", error);
      const errorMessage =
        error.message ||
        error.response?.data?.message ||
        "Failed to place order. Please try again.";
      showGlobalToast(errorMessage, "error");
    }
  };

  const handleGoToOrders = () => {
    if (placedOrderId) {
      navigate(`/orders/${placedOrderId}`);
    } else {
      navigate("/orders");
    }
  };

  const handleUpdateLocation = async () => {
    if (!selectedAddress?.id || !mapLocation) return;
    setIsUpdatingLocation(true);
    try {
      const updatePayload: any = {
        latitude: mapLocation.lat,
        longitude: mapLocation.lng,
      };

      if (mapLocation.address) {
        if (mapLocation.address.street)
          updatePayload.address = mapLocation.address.street;
        if (mapLocation.address.city)
          updatePayload.city = mapLocation.address.city;
        if (mapLocation.address.state)
          updatePayload.state = mapLocation.address.state;
        if (mapLocation.address.pincode)
          updatePayload.pincode = mapLocation.address.pincode;
        if (mapLocation.address.landmark)
          updatePayload.landmark = mapLocation.address.landmark;
      }

      await updateAddress(selectedAddress.id, updatePayload);

      const updated = {
        ...selectedAddress,
        latitude: mapLocation.lat,
        longitude: mapLocation.lng,
        street: mapLocation.address?.street || selectedAddress.street,
        city: mapLocation.address?.city || selectedAddress.city,
        state: mapLocation.address?.state || selectedAddress.state,
        pincode: mapLocation.address?.pincode || selectedAddress.pincode,
        landmark: mapLocation.address?.landmark || selectedAddress.landmark,
      };
      setSelectedAddress(updated);
      setSavedAddress(updated);
      setShowMapPicker(false);
      setIsMapSelected(true);
      showGlobalToast("Location and address updated successfully!");
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleProfileSubmit = async () => {
    if (!profileFormData.name.trim() || !profileFormData.email.trim()) {
      setProfileError("Please enter both name and email");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(profileFormData.email)) {
      setProfileError("Please enter a valid email address");
      return;
    }

    setIsUpdatingProfile(true);
    setProfileError(null);

    try {
      const response = await updateProfile({
        name: profileFormData.name.trim(),
        email: profileFormData.email.trim(),
      });

      if (response.success) {
        updateUser({
          ...user,
          id: user?.id || "",
          name: response.data.name,
          email: response.data.email,
        });

        setShowProfileModal(false);
        showGlobalToast("Profile updated successfully!");
        handlePlaceOrder(true);
      }
    } catch (error: any) {
      setProfileError(
        error.response?.data?.message ||
          "Failed to update profile. Please try again."
      );
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen flex flex-col pb-32 md:pb-16">
      {/* Party Popper Animation */}
      <PartyPopper
        show={showPartyPopper}
        onComplete={() => setShowPartyPopper(false)}
      />

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors touch-target-min"
            aria-label="Go back"
          >
            <ArrowLeftIcon size={18} />
          </button>

          <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
            Checkout
          </h1>

          <div className="w-8 h-8" />
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto w-full px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
          {/* Left Column: Details & Items */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-3.5">
            {/* 1. Delivery Address Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <LocationPinIcon size={16} className="text-[#FF2E7A]" />
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                    Delivery Address
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigate("/checkout/address", {
                      state: { editAddress: savedAddress },
                    })
                  }
                  className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] bg-[#FFF1F4] px-2.5 py-0.5 rounded-full border border-[#FFE4EA] transition-colors touch-target-min"
                >
                  {savedAddress ? "Change" : "Add Address"}
                </button>
              </div>

              {savedAddress ? (
                <div
                  onClick={() => {
                    setSelectedAddress(savedAddress);
                    setIsMapSelected(false);
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedAddress && !isMapSelected
                      ? "border-[#FF2E7A] bg-[#FFF1F4]/40 shadow-2xs"
                      : "border-slate-200 bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-slate-900">
                          {savedAddress.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {savedAddress.phone}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {savedAddress.flat ? `${savedAddress.flat}, ` : ""}
                        {savedAddress.street}
                        {savedAddress.landmark && (
                          <span className="font-bold text-[#FF2E7A]">
                            {" "}• Near {savedAddress.landmark}
                          </span>
                        )}
                        , {savedAddress.city} - {savedAddress.pincode}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/checkout/address", {
                          state: { editAddress: savedAddress },
                        });
                      }}
                      className="text-xs font-bold text-[#FF2E7A] hover:underline flex-shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-3 text-xs text-slate-500">
                  No address selected. Please add an address to continue.
                </div>
              )}

              {/* Pin Precise Location on Map */}
              <button
                type="button"
                onClick={() => {
                  setMapLocation({
                    lat: userLocation?.latitude || selectedAddress?.latitude || 0,
                    lng: userLocation?.longitude || selectedAddress?.longitude || 0,
                  });
                  setShowMapPicker(true);
                }}
                className={`mt-2.5 w-full py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 border touch-target-min ${
                  isMapSelected
                    ? "bg-[#FFF1F4] border-[#FF2E7A] text-[#FF2E7A]"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <LocationPinIcon size={14} className={isMapSelected ? "text-[#FF2E7A]" : "text-slate-500"} />
                <span>
                  {isMapSelected
                    ? "Precise Map Location Confirmed ✓"
                    : selectedAddress?.latitude
                    ? "Update Location on Map"
                    : "Set Exact Location on Map"}
                </span>
              </button>
            </div>

            {/* 2. Order Items Shipment Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                  Order Items ({displayCart.itemCount || 0})
                </h2>
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#FF2E7A] bg-[#FFF1F4] px-2 py-0.5 rounded-md border border-[#FFE4EA]">
                  <ClockIcon size={10} className="text-[#FF2E7A]" />
                  <span>15 MINS DELIVERY</span>
                </div>
              </div>

              <div className="space-y-2.5 divide-y divide-slate-100">
                {displayItems.map((item) => {
                  const { displayPrice, mrp, hasDiscount } = calculateProductPrice(
                    item.product,
                    item.variant
                  );
                  const pId = ((item.product?.id || item.product?._id || '') as string);

                  return (
                    <div key={pId} className="pt-2.5 first:pt-0 flex gap-3 items-center">
                      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center p-1 border border-slate-100 flex-shrink-0">
                        <UserImage
                          src={item.product?.imageUrl || item.product?.mainImage}
                          alt={item.product?.name}
                          categoryFallback="grocery"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-bold text-slate-900 line-clamp-1">
                          {item.product?.name}
                        </h3>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {item.product?.pack || "Standard"}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleMoveToWishlist(item.product)}
                          className="text-[10px] font-bold text-[#FF2E7A] hover:underline"
                        >
                          Save for later
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {/* Stepper */}
                        <div className="flex items-center gap-1.5 bg-[#FFF1F4] border border-[#FFE4EA] rounded-full px-1.5 py-0.5 text-[#FF2E7A]">
                          <button
                            type="button"
                            onClick={() => updateQuantity(pId, item.quantity - 1, item.variant)}
                            className="w-4 h-4 flex items-center justify-center font-bold text-xs hover:text-[#E02269] active:scale-90"
                          >
                            <MinusIcon size={10} />
                          </button>
                          <span className="text-xs font-bold min-w-[1rem] text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(pId, item.quantity + 1, item.variant)}
                            className="w-4 h-4 flex items-center justify-center font-bold text-xs hover:text-[#E02269] active:scale-90"
                          >
                            <PlusIcon size={10} />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right min-w-[3rem]">
                          <span className="text-xs font-bold text-slate-900">
                            ₹{(displayPrice * item.quantity).toLocaleString("en-IN")}
                          </span>
                          {hasDiscount && (
                            <span className="text-[9px] text-slate-400 line-through block font-medium">
                              ₹{(mrp * item.quantity).toLocaleString("en-IN")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Tip Your Delivery Partner Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Tip Delivery Partner
                </h3>
                {finalTipAmount > 0 && (
                  <span className="text-[11px] font-bold text-[#FF2E7A] bg-[#FFF1F4] px-2 py-0.5 rounded-full border border-[#FFE4EA]">
                    +₹{finalTipAmount} added
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-medium mb-2.5">
                100% of your tip goes directly to your local delivery partner.
              </p>

              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                {[20, 30, 50].map((amt) => {
                  const isSelected = tipAmount === amt && !showCustomTipInput;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setTipAmount(null);
                        } else {
                          setTipAmount(amt);
                          setShowCustomTipInput(false);
                        }
                      }}
                      className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl border font-bold text-xs transition-all touch-target-min ${
                        isSelected
                          ? "border-[#FF2E7A] bg-[#FFF1F4] text-[#FF2E7A] shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setShowCustomTipInput(true);
                    setTipAmount(null);
                  }}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl border font-bold text-xs transition-all touch-target-min ${
                    showCustomTipInput
                      ? "border-[#FF2E7A] bg-[#FFF1F4] text-[#FF2E7A] shadow-2xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Custom
                </button>
              </div>

              {showCustomTipInput && (
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="number"
                    value={customTipAmount || ""}
                    onChange={(e) => setCustomTipAmount(Math.max(0, Number(e.target.value)))}
                    placeholder="Enter amount in ₹"
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25"
                    min="0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomTipInput(false);
                      setCustomTipAmount(0);
                      setTipAmount(null);
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* 4. GSTIN & Gift Packaging */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* GSTIN */}
              <button
                type="button"
                onClick={() => setShowGstinSheet(true)}
                className="bg-white rounded-2xl border border-slate-100 p-3 shadow-2xs flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {gstin ? `GSTIN: ${gstin}` : "Add GSTIN"}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {gstin ? "Saved for input credit" : "Claim tax credit for business"}
                  </p>
                </div>
                <span className="text-xs text-[#FF2E7A] font-bold">Edit ▸</span>
              </button>

              {/* Gift Packaging Toggle */}
              <button
                type="button"
                onClick={() => setGiftPackaging(!giftPackaging)}
                className={`rounded-2xl border p-3 shadow-2xs flex items-center justify-between text-left transition-all ${
                  giftPackaging
                    ? "bg-[#FFF1F4] border-[#FF2E7A] text-[#FF2E7A]"
                    : "bg-white border-slate-100 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Gift Packaging
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {giftPackaging ? "+₹30 added" : "Add packaging (+₹30)"}
                  </p>
                </div>
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    giftPackaging
                      ? "bg-[#FF2E7A] border-[#FF2E7A] text-white"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {giftPackaging && <span className="text-[10px]">✓</span>}
                </div>
              </button>
            </div>

            {/* Cancellation Policy trigger */}
            <div className="pt-0.5 text-center sm:text-left">
              <button
                type="button"
                onClick={() => setShowCancellationPolicy(true)}
                className="text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
              >
                Cancellation & Refund Policy ▸
              </button>
            </div>
          </div>

          {/* Right Column: Sticky Summary, Coupons & Payment */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-3.5 lg:sticky lg:top-20">
            {/* 1. Coupons & Offers Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs">
              <div className="flex items-center gap-1.5 mb-2">
                <TagIcon size={14} className="text-[#FF2E7A]" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Coupons & Offers
                </h3>
              </div>

              {selectedCoupon ? (
                <div className="p-2.5 bg-[#FFF1F4] border border-[#FFE4EA] rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#FF2E7A] block">
                      {selectedCoupon.code}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {selectedCoupon.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-xs font-bold text-[#FF2E7A] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCouponSheet(true)}
                  className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-between transition-colors touch-target-min"
                >
                  <span>Select a coupon</span>
                  <span className="text-[#FF2E7A] font-bold">View ({availableCoupons.length}) ▸</span>
                </button>
              )}
            </div>

            {/* 2. Payment Method Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs">
              <div className="flex items-center gap-1.5 mb-2.5">
                <CreditCardIcon size={14} className="text-[#FF2E7A]" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Payment Method
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("Online")}
                  className={`p-2.5 rounded-xl border text-center transition-all touch-target-min ${
                    paymentMethod === "Online"
                      ? "border-[#FF2E7A] bg-[#FFF1F4] text-[#FF2E7A] shadow-2xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-xs font-bold block">Online Payment</span>
                  <span className="text-[9px] text-slate-400 font-medium">UPI / Cards / NetBanking</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("COD")}
                  className={`p-2.5 rounded-xl border text-center transition-all touch-target-min ${
                    paymentMethod === "COD"
                      ? "border-[#FF2E7A] bg-[#FFF1F4] text-[#FF2E7A] shadow-2xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-xs font-bold block">Cash on Delivery</span>
                  <span className="text-[9px] text-slate-400 font-medium">Pay upon delivery</span>
                </button>
              </div>
            </div>

            {/* 3. Bill Summary Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs space-y-2.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>Bill Summary</span>
                {savedAmount > 0 && (
                  <span className="text-[10px] font-bold text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Saved ₹{savedAmount}
                  </span>
                )}
              </h3>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Item Subtotal</span>
                  <span className="font-bold text-slate-900">₹{discountedTotal.toLocaleString("en-IN")}</span>
                </div>

                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Handling Charge</span>
                  <span className="font-bold text-slate-900">₹{handlingCharge.toLocaleString("en-IN")}</span>
                </div>

                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Delivery Charge</span>
                  <span className={`font-bold ${deliveryCharge === 0 ? "text-[#16A34A]" : "text-slate-900"}`}>
                    {deliveryCharge === 0 ? "FREE" : `₹${deliveryCharge.toLocaleString("en-IN")}`}
                  </span>
                </div>

                {selectedCoupon && currentCouponDiscount > 0 && (
                  <div className="flex justify-between text-[#FF2E7A] font-bold">
                    <span>Coupon ({selectedCoupon.code})</span>
                    <span>-₹{currentCouponDiscount.toLocaleString("en-IN")}</span>
                  </div>
                )}

                {finalTipAmount > 0 && (
                  <div className="flex justify-between text-slate-600 font-medium">
                    <span>Partner Tip</span>
                    <span className="font-bold text-slate-900">₹{finalTipAmount}</span>
                  </div>
                )}

                {giftPackaging && (
                  <div className="flex justify-between text-slate-600 font-medium">
                    <span>Gift Packaging</span>
                    <span className="font-bold text-slate-900">₹{giftPackagingFee}</span>
                  </div>
                )}
              </div>

              {/* Grand Total & Primary CTA */}
              <div className="border-t border-slate-100 pt-2.5 space-y-2.5">
                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="text-xs font-bold text-slate-900">Grand Total</span>
                    <p className="text-[10px] text-slate-400 font-medium">Inclusive of all taxes</p>
                  </div>
                  <span className="text-base sm:text-lg font-bold text-slate-900">
                    ₹{grandTotal.toLocaleString("en-IN")}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handlePlaceOrder()}
                  disabled={cart.items.length === 0}
                  className={`w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-xs transition-all active:scale-95 touch-target-min flex items-center justify-center gap-1.5 ${
                    cart.items.length > 0
                      ? "bg-[#FF2E7A] text-white hover:bg-[#E02269]"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <span>{paymentMethod === "COD" ? "Place COD Order" : "Proceed to Pay"}</span>
                  <ChevronRightIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 shadow-lg lg:hidden user-safe-bottom">
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-slate-900">
                ₹{grandTotal.toLocaleString("en-IN")}
              </span>
              {currentCouponDiscount > 0 && (
                <span className="text-[9px] font-bold text-[#FF2E7A] bg-[#FFF1F4] px-1.5 py-0.2 rounded-md">
                  Saved ₹{currentCouponDiscount}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {paymentMethod === "COD" ? "Cash on Delivery" : "Online Payment"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handlePlaceOrder()}
            disabled={cart.items.length === 0}
            className="px-6 py-2 bg-[#FF2E7A] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-xs hover:bg-[#E02269] active:scale-95 transition-all touch-target-min flex items-center gap-1"
          >
            <span>{paymentMethod === "COD" ? "Place Order" : "Pay Now"}</span>
            <ChevronRightIcon size={14} />
          </button>
        </div>
      </div>

      {/* Profile Completion Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200"
            >
              <h2 className="text-base font-black text-slate-900 mb-1">
                Complete Your Profile
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Please provide your name and email to finalize your order.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profileFormData.name}
                    onChange={(e) =>
                      setProfileFormData((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Enter your full name"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none focus:ring-2 focus:ring-rose-400/40"
                    disabled={isUpdatingProfile}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profileFormData.email}
                    onChange={(e) =>
                      setProfileFormData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="Enter your email"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none focus:ring-2 focus:ring-rose-400/40"
                    disabled={isUpdatingProfile}
                  />
                </div>

                {profileError && (
                  <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-xl">
                    {profileError}
                  </p>
                )}

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
                    disabled={isUpdatingProfile}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleProfileSubmit}
                    disabled={
                      isUpdatingProfile ||
                      !profileFormData.name.trim() ||
                      !profileFormData.email.trim()
                    }
                    className="flex-1 py-2.5 text-xs font-black text-white bg-gradient-to-r from-[#FF5364] to-[#FF2E7A] rounded-full shadow-xs hover:opacity-95 transition-opacity"
                  >
                    {isUpdatingProfile ? "Saving..." : "Save & Continue"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Map Picker Modal */}
      <AnimatePresence>
        {showMapPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl overflow-hidden w-full max-w-lg shadow-2xl border border-slate-200"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-black text-sm text-slate-900">
                  Pin Delivery Location
                </h3>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"
                >
                  ✕
                </button>
              </div>

              <GoogleMapsLocationPicker
                initialLat={
                  mapLocation?.lat ||
                  userLocation?.latitude ||
                  selectedAddress?.latitude ||
                  0
                }
                initialLng={
                  mapLocation?.lng ||
                  userLocation?.longitude ||
                  selectedAddress?.longitude ||
                  0
                }
                onLocationSelect={(lat, lng, address) =>
                  setMapLocation({ lat, lng, address })
                }
                height="300px"
              />

              <div className="p-4 bg-white border-t border-slate-100">
                <p className="text-[11px] text-slate-500 mb-3 text-center">
                  Move the map pin to mark your exact delivery doorstep.
                </p>
                <button
                  type="button"
                  onClick={handleUpdateLocation}
                  disabled={isUpdatingLocation}
                  className="w-full py-3 bg-gradient-to-r from-[#FF5364] to-[#FF2E7A] text-white font-black text-xs uppercase tracking-wider rounded-full shadow-xs flex justify-center items-center gap-2"
                >
                  {isUpdatingLocation ? "Updating Location..." : "Confirm Location"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Order Success Celebration Screen */}
      {showOrderSuccess && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center h-screen w-screen overflow-hidden">
          <div className="relative z-10 flex flex-col items-center px-6 text-center max-w-sm">
            <div className="w-24 h-24 bg-gradient-to-tr from-[#FF5364] to-[#FF2E7A] rounded-full flex items-center justify-center shadow-xl mb-6">
              <span className="text-4xl text-white">✓</span>
            </div>

            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
              Order Placed!
            </h2>
            <p className="text-xs text-slate-500 font-medium mb-6 leading-relaxed">
              Your order has been sent to our local store partner and is being prepared with care.
            </p>

            {selectedAddress && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 w-full mb-6 text-left">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Delivering to</p>
                <p className="text-xs font-black text-slate-900">{selectedAddress.name}</p>
                <p className="text-[11px] text-slate-600 truncate">{selectedAddress.street}, {selectedAddress.city}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoToOrders}
              className="w-full py-3.5 bg-gradient-to-r from-[#FF5364] to-[#FF2E7A] text-white rounded-full text-xs font-black uppercase tracking-wider shadow-md hover:opacity-95 transition-all"
            >
              Track Your Order ▸
            </button>
          </div>
        </div>
      )}

      {/* GSTIN Bottom Sheet */}
      <Sheet open={showGstinSheet} onOpenChange={setShowGstinSheet}>
        <SheetContent side="bottom" className="max-h-[50vh] rounded-t-3xl p-6">
          <SheetHeader className="text-left pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-black text-slate-900">
                Add GSTIN for Business Purchase
              </SheetTitle>
              <SheetClose onClick={() => setShowGstinSheet(false)} className="text-slate-400">
                ✕
              </SheetClose>
            </div>
          </SheetHeader>

          <div className="pt-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                GSTIN Number (15 Digits)
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                  if (val.length <= 15) setGstin(val);
                }}
                placeholder="e.g. 27AAAAA0000A1Z5"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-rose-400/40 uppercase"
                maxLength={15}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
                if (!gstRegex.test(gstin)) {
                  showGlobalToast("Please enter a valid GSTIN format", "error");
                  return;
                }
                setShowGstinSheet(false);
                showGlobalToast("GST details saved", "success");
              }}
              className="w-full py-3 bg-gradient-to-r from-[#FF5364] to-[#FF2E7A] text-white font-black text-xs uppercase tracking-wider rounded-full shadow-xs"
            >
              Save GSTIN
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Cancellation Policy Bottom Sheet */}
      <Sheet open={showCancellationPolicy} onOpenChange={setShowCancellationPolicy}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-3xl p-6 overflow-y-auto">
          <SheetHeader className="text-left pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-black text-slate-900">
                Cancellation & Refund Policy
              </SheetTitle>
              <SheetClose onClick={() => setShowCancellationPolicy(false)} className="text-slate-400">
                ✕
              </SheetClose>
            </div>
          </SheetHeader>
          <div className="pt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
            <p><strong>Order Cancellation:</strong> You can cancel your order before it is accepted and packed by the local shop partner.</p>
            <p><strong>Refund Policy:</strong> Refunds on online payments are initiated immediately upon cancellation and credited back within 3-5 working days.</p>
            <p><strong>Support:</strong> For help, email support@hellolocal.com or contact customer care via WhatsApp.</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Coupon Sheet */}
      <Sheet open={showCouponSheet} onOpenChange={setShowCouponSheet}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-3xl p-6 overflow-y-auto">
          <SheetHeader className="text-left pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-black text-slate-900">
                Available Coupons
              </SheetTitle>
              <SheetClose onClick={() => setShowCouponSheet(false)} className="text-slate-400">
                ✕
              </SheetClose>
            </div>
          </SheetHeader>

          <div className="pt-4 space-y-3">
            {availableCoupons.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No coupons available right now.</p>
            ) : (
              availableCoupons.map((coupon) => {
                const subtotalBeforeCoupon = discountedTotal + handlingCharge + deliveryCharge;
                const meetsMinOrder = !coupon.minOrderValue || subtotalBeforeCoupon >= coupon.minOrderValue;
                const isSelected = selectedCoupon?._id === coupon._id;

                return (
                  <div
                    key={coupon._id}
                    className={`p-3.5 rounded-2xl border-2 transition-all ${
                      isSelected
                        ? "border-rose-400 bg-rose-50"
                        : meetsMinOrder
                        ? "border-slate-200 bg-white"
                        : "border-slate-100 bg-slate-50 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-black text-rose-600 block mb-0.5">
                          {coupon.code}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900">{coupon.title}</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">{coupon.description}</p>
                        {coupon.minOrderValue && (
                          <span className="text-[10px] text-slate-400 font-medium block mt-1">
                            Min. order value: ₹{coupon.minOrderValue}
                          </span>
                        )}
                      </div>

                      {isSelected ? (
                        <span className="text-xs font-black text-rose-600">Applied ✓</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => meetsMinOrder && handleApplyCoupon(coupon)}
                          disabled={!meetsMinOrder || isValidatingCoupon}
                          className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                            meetsMinOrder
                              ? "bg-rose-500 text-white hover:opacity-95"
                              : "bg-slate-200 text-slate-400 cursor-not-allowed"
                          }`}
                        >
                          {isValidatingCoupon ? "..." : "Apply"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Razorpay Payment Integration */}
      {showRazorpayCheckout && pendingOrderId && user && (
        <RazorpayCheckout
          orderId={pendingOrderId}
          amount={grandTotal}
          customerDetails={{
            name: user.name || "Customer",
            email: user.email || "",
            phone: user.phone || "",
          }}
          onSuccess={(paymentId) => {
            setShowRazorpayCheckout(false);
            setPlacedOrderId(pendingOrderId);
            setPendingOrderId(null);
            clearCart();
            setShowOrderSuccess(true);
            showGlobalToast("Payment successful!", "success");
          }}
          onFailure={(error) => {
            setShowRazorpayCheckout(false);
            setPendingOrderId(null);
            showGlobalToast(
              error || "Payment failed. Please try again.",
              "error"
            );
          }}
        />
      )}
    </div>
  );
}
