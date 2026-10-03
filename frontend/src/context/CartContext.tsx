import { createContext, useContext, useState, ReactNode, useMemo, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useLocation } from '../hooks/useLocation';
import { Cart, CartItem } from '../types/cart';
import { Product } from '../types/domain';
import {
  getCart,
  addToCart as apiAddToCart,
  updateCartItem as apiUpdateCartItem,
  removeFromCart as apiRemoveFromCart,
  clearCart as apiClearCart,
  mergeCart as apiMergeCart,
  GuestCartItemPayload
} from '../services/api/customerCartService';
import { calculateProductPrice } from '../utils/priceUtils';

const CART_STORAGE_KEY = 'saved_cart';

interface AddToCartEvent {
  product: Product;
  sourcePosition?: { x: number; y: number };
}

interface CartContextType {
  cart: Cart;
  addToCart: (product: Product, sourceElement?: HTMLElement | null) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number, variantId?: string, variantTitle?: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: (latitude?: number, longitude?: number) => Promise<void>;
  lastAddEvent: AddToCartEvent | null;
  loading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Extended interface to include Cart Item ID
interface ExtendedCartItem extends CartItem {
  id?: string;
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Initialize state from localStorage for persistence on refresh
  const fetchCountRef = useRef(0);
  const [items, setItems] = useState<ExtendedCartItem[]>(() => {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Filter out items with null/undefined products (corrupted localStorage data)
        return Array.isArray(parsed) ? parsed.filter((item: any) => item?.product) : [];
      } catch (e) {
        console.error("Failed to parse saved cart", e);
      }
    }
    return [];
  });
  const [lastAddEvent, setLastAddEvent] = useState<AddToCartEvent | null>(null);
  const [estimatedFee, setEstimatedFee] = useState<number | undefined>(undefined);
  const [platformFee, setPlatformFee] = useState<number | undefined>(undefined);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState<number | undefined>(undefined);
  const [debugConfig, setDebugConfig] = useState<any>(null);
  const [backendTotal, setBackendTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const pendingOperationsRef = useRef<Set<string>>(new Set());

  const { isAuthenticated, user } = useAuth();
  const { location, openLocationModal } = useLocation();
  const { showToast } = useToast();

  // Helper to map API cart items to internal CartItem structure
  const mapApiItemsToState = (apiItems: any[]): ExtendedCartItem[] => {
    return apiItems
      .filter((item: any) => item.product) // Safety filter
      .map((item: any) => ({
        id: item._id, // Store CartItem ID
        product: {
          id: item.product._id, // Map _id to id
          name: item.product.productName || item.product.name,
          price: item.product.price,
          mrp: item.product.mrp,
          discPrice: item.product.discPrice,
          variations: item.product.variations,
          imageUrl: item.product.mainImage || item.product.imageUrl,
          pack: item.product.pack || '1 unit',
          categoryId: item.product.category || '',
          description: item.product.description,
          variantId: item.variation // Preserving variation ID/value
        },
        quantity: item.quantity,
        variant: item.variation // Also preserve it here for order placement
      }));
  };

  // Sync to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Helper to sync cart from API
  const fetchCart = async (lat?: number, lng?: number) => {
    if (!isAuthenticated || user?.userType !== 'Customer') {
      // If we cleared it above but had things in localStorage, we keep them for guests?
      // For now, if logged out, we clear if it was an authenticated session.
      // But if guest, we might want to keep it.
      // Let's only clear if we are transition from logged in to logged out.
      setLoading(false);
      return;
    }

    // Use provided coordinates or fallback to current location
    const queryLat = lat !== undefined ? lat : location?.latitude;
    const queryLng = lng !== undefined ? lng : location?.longitude;

    // CRITICAL: If authenticated but location is missing, don't call backend yet.
    // The backend returns an empty list if coordinates are missing, which would
    // wipe our local/optimistic state. We'll wait for the next trigger when location is ready.
    if (isAuthenticated && (queryLat === undefined || queryLng === undefined || queryLat === null || queryLng === null)) {
      setLoading(false);
      return;
    }

    const currentFetchCount = ++fetchCountRef.current;

    try {
      setLoading(true);

      const response = await getCart({
        latitude: queryLat,
        longitude: queryLng
      });

      // Race condition protection: only update state if this is still the most recent fetch
      if (currentFetchCount !== fetchCountRef.current) {
        return;
      }

      if (response && response.data && response.data.items) {
        setItems(mapApiItemsToState(response.data.items));
        setEstimatedFee(response.data.estimatedDeliveryFee);
        setPlatformFee(response.data.platformFee);
        setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
        setDebugConfig(response.data.debug_config);
        setBackendTotal(response.data.backendTotal);
      } else if (response && response.data) {
        setItems([]);
        setEstimatedFee(undefined);
        setPlatformFee(undefined);
        setFreeDeliveryThreshold(undefined);
        setDebugConfig(null);
        setBackendTotal(undefined);
      }
    } catch (error) {
      console.error("Failed to fetch cart:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to merge guest items to backend on login
  const mergeGuestItems = async (guestItemsToMerge: ExtendedCartItem[], lat?: number, lng?: number) => {
    if (!guestItemsToMerge || guestItemsToMerge.length === 0) return;
    if (!isAuthenticated || user?.userType !== 'Customer') return;

    const queryLat = lat !== undefined ? lat : location?.latitude;
    const queryLng = lng !== undefined ? lng : location?.longitude;

    if (queryLat === undefined || queryLng === undefined || queryLat === null || queryLng === null) {
      setLoading(false);
      return;
    }

    const currentFetchCount = ++fetchCountRef.current;

    try {
      setLoading(true);
      const payload: GuestCartItemPayload[] = guestItemsToMerge
        .filter(item => item?.product)
        .map(item => ({
          productId: String(item.product.id || item.product._id),
          quantity: item.quantity || 1,
          variation: item.variant || (item.product as any)?.variantId || (item.product as any)?.variantTitle || undefined
        }));

      const response = await apiMergeCart(payload, queryLat, queryLng);
      if (currentFetchCount !== fetchCountRef.current) {
        return;
      }

      if (response && response.data && response.data.items) {
        setItems(mapApiItemsToState(response.data.items));
        setEstimatedFee(response.data.estimatedDeliveryFee);
        setPlatformFee(response.data.platformFee);
        setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
        setDebugConfig(response.data.debug_config);
        setBackendTotal(response.data.backendTotal);
      }
    } catch (error) {
      console.error("Failed to merge cart:", error);
      await fetchCart(queryLat, queryLng);
    } finally {
      setLoading(false);
    }
  };

  const prevAuthRef = useRef(isAuthenticated);
  const guestItemsToMergeRef = useRef<ExtendedCartItem[]>([]);

  // Load / merge cart on auth change
  useEffect(() => {
    const justLoggedIn = !prevAuthRef.current && isAuthenticated;
    prevAuthRef.current = isAuthenticated;

    // Snapshot local items upon login transition
    if (justLoggedIn && items.length > 0) {
      guestItemsToMergeRef.current = [...items];
    }

    if (isAuthenticated && user?.userType === 'Customer') {
      const queryLat = location?.latitude;
      const queryLng = location?.longitude;
      const hasLocation = queryLat !== undefined && queryLng !== undefined && queryLat !== null && queryLng !== null;

      const itemsToMerge = guestItemsToMergeRef.current.length > 0
        ? guestItemsToMergeRef.current
        : items.filter(item => !item.id);

      if (itemsToMerge.length > 0) {
        if (hasLocation) {
          guestItemsToMergeRef.current = [];
          mergeGuestItems(itemsToMerge, queryLat, queryLng);
        } else {
          // Do NOT wipe guest items when location is unset; preserve them
          setLoading(false);
        }
      } else {
        if (hasLocation) {
          fetchCart(queryLat, queryLng);
        } else {
          setLoading(false);
        }
      }
    } else {
      // Guest cart is already in 'items' from localStorage if it existed
      setLoading(false);
    }
  }, [isAuthenticated, user?.userType, location?.latitude, location?.longitude]);



  const cart: Cart = useMemo(() => {
    // Filter out any items with null products before computing totals
    const validItems = items.filter(item => item?.product);
    const total = validItems.reduce((sum, item) => {
      const { displayPrice } = calculateProductPrice(item.product, item.variant);
      return sum + displayPrice * (item.quantity || 0);
    }, 0);
    const itemCount = validItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    return {
      items: validItems,
      total,
      itemCount,
      estimatedDeliveryFee: estimatedFee,
      platformFee,
      freeDeliveryThreshold,
      debug_config: debugConfig,
      backendTotal: backendTotal
    };
  }, [items, estimatedFee, platformFee, freeDeliveryThreshold, debugConfig, backendTotal]);

  const addToCart = async (product: Product, sourceElement?: HTMLElement | null) => {
    // Get consistent product ID - MongoDB returns _id, frontend expects id
    const productId = product._id || product.id;

    // Prevent concurrent operations on the same product
    if (pendingOperationsRef.current.has(productId)) {
      return;
    }
    pendingOperationsRef.current.add(productId);

    // Normalize product to always have 'id' property for consistency
    const normalizedProduct: Product = {
      ...product,
      id: productId,
      name: product.name || product.productName || 'Product',
      imageUrl: product.imageUrl || product.mainImage,
    };

    // Optimistic Update
    // Get source position if element is provided
    let sourcePosition: { x: number; y: number } | undefined;
    if (sourceElement) {
      const rect = sourceElement.getBoundingClientRect();
      sourcePosition = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    setLastAddEvent({ product: normalizedProduct, sourcePosition });
    setTimeout(() => setLastAddEvent(null), 800);

    // Optimistically update state
    const previousItems = [...items];
    setItems((prevItems) => {
      // Filter out null products and find existing item
      const validItems = prevItems.filter(item => item?.product);

      // Check for variant ID or variant title if product has variations
      let variantId = (product as any).variantId || (product as any).selectedVariant?._id;
      let variantTitle = (product as any).variantTitle || (product as any).pack;

      // If no explicit variant info but exactly one variation exists, default to that single variation
      if (!variantId && product.variations && product.variations.length === 1) {
        const firstVar = product.variations[0];
        variantId = (firstVar as any)._id || (firstVar as any).id;
        variantTitle = (firstVar as any).title || (firstVar as any).value || variantTitle;
      }

      // If multi-variant product and no variant specified, do not add ambiguous item
      if (!variantId && !variantTitle && product.variations && product.variations.length > 1) {
        console.warn('Cannot add multi-variant product without explicit variant selection');
        return validItems;
      }

      const resolvedVariant = variantTitle || (product as any).selectedVariant?.title || (product as any).selectedVariant?.value || (variantId ? String(variantId) : undefined);

      // Find existing item - match by product ID and variant
      const existingItem = validItems.find((item) => {
        const itemProductId = String(item.product.id || item.product._id);
        const thisProductId = String(productId);
        if (itemProductId !== thisProductId) return false;

        const itemVar = item.variant || (item.product as any)?.variantId || (item.product as any)?.variantTitle || (item.product as any)?.pack;
        if (resolvedVariant || itemVar) {
          return itemVar === resolvedVariant;
        }
        return true;
      });

      if (existingItem) {
        return validItems.map((item) => {
          const itemProductId = String(item.product.id || item.product._id);
          const thisProductId = String(productId);
          if (itemProductId !== thisProductId) return item;

          const itemVar = item.variant || (item.product as any)?.variantId || (item.product as any)?.variantTitle || (item.product as any)?.pack;
          const isMatch = (resolvedVariant || itemVar)
            ? itemVar === resolvedVariant
            : true;

          return isMatch
            ? { ...item, quantity: item.quantity + 1 }
            : item;
        });
      }

      return [
        ...validItems,
        {
          product: {
            ...normalizedProduct,
            variantId: variantId ? String(variantId) : undefined,
            variantTitle: variantTitle,
            selectedVariant: (product as any).selectedVariant,
            price: (product as any).price ?? normalizedProduct.price,
            mrp: (product as any).mrp ?? normalizedProduct.mrp,
            pack: variantTitle || normalizedProduct.pack,
          },
          quantity: 1,
          variant: resolvedVariant,
        },
      ];
    });

    // Only sync to API if user is authenticated
    if (isAuthenticated && user?.userType === 'Customer') {
      const hasLocation = location?.latitude !== undefined &&
                          location?.longitude !== undefined &&
                          location?.latitude !== null &&
                          location?.longitude !== null;

      if (!hasLocation) {
        // E2E-DEFECT-002: Intercept missing location on authenticated Add to Cart
        openLocationModal();
        showToast("Please set your delivery location to verify store availability and delivery charges", "info");
        pendingOperationsRef.current.delete(productId);
        return;
      }

      try {
        // Pass variation info to API if available
        // If product has variations but no variantId/selectedVariant is provided (e.g. from Home page),
        // use the ID of the first variation to ensure consistency with ProductDetail page
        let variation = (product as any).variantId || (product as any).selectedVariant?._id || (product as any).variantTitle;

        if (!variation && product.variations && product.variations.length === 1) {
          const firstVar = product.variations[0];
          variation = (firstVar as any)._id || (firstVar as any).id || (firstVar as any).title || (firstVar as any).value;
        }

        // Final fallback to pack only for non-variant products
        if (!variation && (!product.variations || product.variations.length === 0)) {
          variation = product.pack;
        }

        const response = await apiAddToCart(
          productId,
          1,
          variation,
          location?.latitude,
          location?.longitude
        );
        if (response && response.data && response.data.items) {
          // Atomic update from server response
          setItems(mapApiItemsToState(response.data.items));
          setEstimatedFee(response.data.estimatedDeliveryFee);
          setPlatformFee(response.data.platformFee);
          setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
        }
      } catch (error: any) {
        console.error("Add to cart failed", error);
        // Show error toast
        showToast(error.response?.data?.message || "Failed to add to cart", 'error');
        // Revert on error
        setItems(previousItems);
      } finally {
        // Remove from pending operations
        pendingOperationsRef.current.delete(productId);
      }
    } else {
      // For unregistered users, the optimistic update is already saved to localStorage
      // Remove from pending operations immediately
      pendingOperationsRef.current.delete(productId);
    }
  };

  const removeFromCart = async (productId: string, variantId?: string, variantTitle?: string) => {
    // Create a unique operation key
    const operationKey = variantId ? `${productId}-${variantId}` : (variantTitle ? `${productId}-${variantTitle}` : productId);

    // Prevent concurrent operations on the same product
    if (pendingOperationsRef.current.has(operationKey)) {
      return;
    }
    pendingOperationsRef.current.add(operationKey);

    // Find specific item matching variant if provided
    const itemToRemove = items.find(item => {
      if (!item?.product) return false;
      const itemProductId = item.product.id || item.product._id;
      if (itemProductId !== productId) return false;

      if (variantId || variantTitle) {
        const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
        const itemVariantTitle = (item.product as any).variantTitle || (item.product as any).pack;
        return itemVariantId === variantId || itemVariantTitle === variantTitle;
      }
      return true; // Match first matching product ID if no variant specified
    });

    const previousItems = [...items];
    setItems((prevItems) => {
      let removedOne = false;
      return prevItems.filter((item) => {
        if (!item?.product) return false;
        const itemProductId = item.product.id || item.product._id;
        if (itemProductId !== productId) return true;

        if (variantId || variantTitle) {
          const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
          const itemVariantTitle = (item.product as any).variantTitle || (item.product as any).pack;
          return !(itemVariantId === variantId || itemVariantTitle === variantTitle);
        } else if (!removedOne) {
          removedOne = true;
          return false;
        }
        return true;
      });
    });

    // Only sync to API if user is authenticated and item has CartItemID
    if (isAuthenticated && user?.userType === 'Customer' && itemToRemove?.id) {
      try {
        const response = await apiRemoveFromCart(
          itemToRemove.id,
          location?.latitude,
          location?.longitude
        );
        if (response && response.data && response.data.items) {
          setItems(mapApiItemsToState(response.data.items));
          setEstimatedFee(response.data.estimatedDeliveryFee);
          setPlatformFee(response.data.platformFee);
          setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
        }
      } catch (error) {
        console.error("Remove from cart failed", error);
        setItems(previousItems);
      } finally {
        // Remove from pending operations
        pendingOperationsRef.current.delete(operationKey);
      }
    } else {
      // For unregistered users, remove from pending operations immediately
      pendingOperationsRef.current.delete(operationKey);
    }
  };

  const updateQuantity = async (productId: string, quantity: number, variantId?: string, variantTitle?: string) => {
    if (quantity <= 0) {
      removeFromCart(productId, variantId, variantTitle);
      return;
    }

    // Create a unique operation key for this product/variant combination
    const operationKey = variantId ? `${productId}-${variantId}` : (variantTitle ? `${productId}-${variantTitle}` : productId);

    // Prevent concurrent operations on the same product
    if (pendingOperationsRef.current.has(operationKey)) {
      return;
    }
    pendingOperationsRef.current.add(operationKey);

    // Find item matching product ID and variant (if variant info provided)
    const itemToUpdate = items.find(item => {
      if (!item?.product) return false;
      const itemProductId = item.product.id || item.product._id;
      if (itemProductId !== productId) return false;

      // If variant info provided, match by variant strictly
      if (variantId || variantTitle) {
        const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
        const itemVariantTitle = (item.product as any).variantTitle || (item.product as any).pack;
        return itemVariantId === variantId || itemVariantTitle === variantTitle;
      }

      // If no variant info provided, just pick the first item that matches the product ID
      // This is to support HomeHero/ProductCard increment/decrement when they don't have explicit variant context
      return true;
    });

    const previousItems = [...items];
    setItems((prevItems) => {
      let updatedOne = false;
      return prevItems.filter(item => item?.product).map((item) => {
        const itemProductId = item.product.id || item.product._id;
        if (itemProductId !== productId) return item;

        // If variant info provided, match by variant strictly
        if (variantId || variantTitle) {
          const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
          const itemVariantTitle = (item.product as any).variantTitle || (item.product as any).pack;
          if (itemVariantId === variantId || itemVariantTitle === variantTitle) {
            return { ...item, quantity };
          }
        } else if (!updatedOne) {
          // If no variant info, update the first matching product found
          updatedOne = true;
          return { ...item, quantity };
        }
        return item;
      });
    });

    // Only sync to API if user is authenticated and item has CartItemID
    if (isAuthenticated && user?.userType === 'Customer' && itemToUpdate?.id) {
      try {
        const response = await apiUpdateCartItem(
          itemToUpdate.id,
          quantity,
          location?.latitude,
          location?.longitude
        );
        if (response && response.data && response.data.items) {
          setItems(mapApiItemsToState(response.data.items));
          setEstimatedFee(response.data.estimatedDeliveryFee);
          setPlatformFee(response.data.platformFee);
          setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
        }
      } catch (error) {
        console.error("Update quantity failed", error);
        setItems(previousItems);
      } finally {
        // Remove from pending operations
        pendingOperationsRef.current.delete(operationKey);
      }
    } else {
      // For unregistered users, remove from pending operations immediately
      pendingOperationsRef.current.delete(operationKey);
    }
  };


  const clearCart = async () => {
    guestItemsToMergeRef.current = [];
    setItems([]);
    try {
      if (isAuthenticated && user?.userType === 'Customer') {
        await apiClearCart();
      }
    } catch (error) {
      console.error("Clear cart failed", error);
      if (isAuthenticated && user?.userType === 'Customer') {
        await fetchCart();
      }
    }
  };

  const refreshCart = async (latitude?: number, longitude?: number) => {
    await fetchCart(latitude, longitude);
  };

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, refreshCart, lastAddEvent, loading }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}


