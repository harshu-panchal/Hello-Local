import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  getPOSProducts,
  createOfflineSale,
  POSProduct,
  POSCartItem,
  BillData,
} from "../../../services/api/orderService";
import { PrintableBillModal } from "../components/PrintableBillModal";
import { SellerPageHeader } from "../components/common/SellerPageHeader";
import { SellerInput } from "../components/common/SellerInput";
import { SellerButton } from "../components/common/SellerButton";

export default function SellerPOSBilling() {
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [isWalkIn, setIsWalkIn] = useState<boolean>(true);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "UPI" | "Card">("Cash");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [orderNotes, setOrderNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [successBill, setSuccessBill] = useState<BillData | null>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState<boolean>(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load POS products on mount
  useEffect(() => {
    fetchProducts();
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const fetchProducts = async (query = "") => {
    setLoading(true);
    setError("");
    try {
      const res = await getPOSProducts({ query, limit: 100 });
      if (res.success && res.data) {
        setProducts(res.data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load products for POS");
    } finally {
      setLoading(false);
    }
  };

  // Barcode / SKU quick-scan key handler
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      const trimmed = searchQuery.trim().toLowerCase();
      // Look for exact match by barcode or SKU
      const matched = products.find(
        (p) =>
          p.barcode?.toLowerCase() === trimmed ||
          p.sku?.toLowerCase() === trimmed ||
          p.productName.toLowerCase() === trimmed
      );

      if (matched) {
        addToCart(matched);
        setSearchQuery("");
      } else {
        fetchProducts(searchQuery);
      }
    }
  };

  // Add product to POS Cart
  const addToCart = (product: POSProduct, variationSelector?: string) => {
    const selectedVar = product.hasVariations
      ? product.variations.find((v) => (variationSelector ? (v.id === variationSelector || v.value === variationSelector) : true)) || product.variations[0]
      : null;

    const unitPrice = selectedVar ? selectedVar.effectivePrice : product.effectivePrice;
    const availableStock = selectedVar ? selectedVar.stock : product.stock;
    const variationKey = selectedVar ? (selectedVar.id || selectedVar.value) : undefined;
    const variantTitle = selectedVar ? (selectedVar.value || selectedVar.name) : undefined;

    if (availableStock <= 0) {
      alert(`"${product.productName}" is out of stock!`);
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.productId === product.id &&
          (item.variation === variationKey || (!item.variation && !variationKey))
      );

      if (existingIndex > -1) {
        const existing = prev[existingIndex];
        if (existing.quantity >= availableStock) {
          alert(`Cannot add more. Only ${availableStock} units in stock.`);
          return prev;
        }
        const updated = [...prev];
        const newQty = existing.quantity + 1;
        const subtotal = Math.round(unitPrice * newQty * 100) / 100;
        const taxAmount = Math.round(((subtotal * product.taxRate) / 100) * 100) / 100;
        const total = Math.round((subtotal + taxAmount) * 100) / 100;

        updated[existingIndex] = {
          ...existing,
          quantity: newQty,
          subtotal,
          taxAmount,
          total,
        };
        return updated;
      }

      // Add new item
      const subtotal = Math.round(unitPrice * 1 * 100) / 100;
      const taxAmount = Math.round(((subtotal * product.taxRate) / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      const newItem: POSCartItem = {
        productId: product.id,
        productName: product.productName,
        variation: variationKey,
        variantTitle,
        unitPrice,
        taxRate: product.taxRate,
        quantity: 1,
        subtotal,
        taxAmount,
        total,
        mainImage: (product as any).mainImage || (product as any).image || '',
        availableStock: (product as any).stockQuantity || (product as any).stock || 0,
      };

      return [...prev, newItem];
    });
  };

  // Adjust item quantity in POS Cart
  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;

      // Find original product to check max stock
      const originalProd = products.find((p) => p.id === item.productId);
      const varStock = originalProd?.hasVariations
        ? originalProd.variations.find((v) => (v.id === item.variation || v.value === item.variation))?.stock || 0
        : originalProd?.stock || 999;

      const newQty = item.quantity + delta;

      if (newQty <= 0) {
        // Remove item from cart
        return updated.filter((_, i) => i !== index);
      }

      if (newQty > varStock) {
        alert(`Cannot add more. Max stock available is ${varStock}`);
        return prev;
      }

      const subtotal = Math.round(item.unitPrice * newQty * 100) / 100;
      const taxAmount = Math.round(((subtotal * item.taxRate) / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      updated[index] = {
        ...item,
        quantity: newQty,
        subtotal,
        taxAmount,
        total,
      };
      return updated;
    });
  };

  // Remove specific line item
  const removeCartItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear entire cart
  const clearCart = () => {
    if (cart.length > 0 && confirm("Are you sure you want to clear the active sale cart?")) {
      setCart([]);
      setDiscount(0);
      setCashReceived("");
      setPaymentReference("");
      setCustomerName("");
      setCustomerPhone("");
      setIsWalkIn(true);
    }
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.categoryName) set.add(p.categoryName);
    });
    return ["ALL", ...Array.from(set)];
  }, [products]);

  // Filter products by search text & selected category
  const displayedProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === "ALL" || p.categoryName === selectedCategory;
      const matchSearch =
        !searchQuery ||
        p.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // POS Totals Calculations
  const cartSubtotal = useMemo(() => {
    return Math.round(cart.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
  }, [cart]);

  const cartTotalTax = useMemo(() => {
    return Math.round(cart.reduce((sum, item) => sum + item.taxAmount, 0) * 100) / 100;
  }, [cart]);

  const rawGrandTotal = useMemo(() => {
    return Math.max(0, Math.round((cartSubtotal + cartTotalTax - discount) * 100) / 100);
  }, [cartSubtotal, cartTotalTax, discount]);

  const grandTotal = rawGrandTotal;

  // Change to return when Cash is selected
  const changeDue = useMemo(() => {
    const received = parseFloat(cashReceived) || 0;
    if (received <= 0 || received < grandTotal) return 0;
    return Math.round((received - grandTotal) * 100) / 100;
  }, [cashReceived, grandTotal]);

  // Complete & Submit Offline Sale
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      alert("Active cart is empty! Add products before checking out.");
      return;
    }

    if (!isWalkIn && customerPhone && customerPhone.length < 10) {
      alert("Please enter a valid 10-digit mobile number for WhatsApp receipt.");
      return;
    }

    const parsedCash = paymentMethod === "Cash" ? parseFloat(cashReceived) || grandTotal : undefined;
    if (paymentMethod === "Cash" && parsedCash !== undefined && parsedCash < grandTotal) {
      alert(`Cash received (₹${parsedCash}) cannot be less than Grand Total (₹${grandTotal}).`);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          variation: item.variation,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
        })),
        customerName: isWalkIn ? "Walk-in Customer" : customerName || "Walk-in Customer",
        customerPhone: isWalkIn ? undefined : customerPhone || undefined,
        paymentMethod,
        discount: discount > 0 ? discount : undefined,
        cashReceived: parsedCash,
        changeDue: changeDue > 0 ? changeDue : undefined,
        paymentReference: paymentReference || undefined,
        orderNotes: orderNotes || undefined,
      };

      const res = await createOfflineSale(payload);

      if (res.success && (res.data || (res as any).bill)) {
        setSuccessBill(res.data || (res as any).bill);
        setIsBillModalOpen(true);
        setIsMobileCartOpen(false);

        // Reset POS Billing form
        setCart([]);
        setDiscount(0);
        setCashReceived("");
        setPaymentReference("");
        setCustomerName("");
        setCustomerPhone("");
        setIsWalkIn(true);
        setOrderNotes("");

        // Refresh product stock list in background
        fetchProducts();
      } else {
        setError(res.message || "Failed to generate bill");
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to create offline sale");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <SellerPageHeader
        title="POS / Quick Billing"
        subtitle="Rapid barcode scanning, walk-in billing & instant invoice printing."
        breadcrumbs={[{ label: "POS Billing" }]}
      />

      {/* Main POS Interface Layout */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* LEFT SECTION: CATALOG, SEARCH & CATEGORY CHIPS */}
        <div className="flex-1 w-full flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Top Bar: Barcode / Text Search & Quick Refresh */}
          <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SellerInput
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Scan barcode, enter SKU or search products (Press Enter)..."
                  clearable
                  onClear={() => setSearchQuery("")}
                  prefixIcon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                      <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                      <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                      <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                      <rect x="7" y="7" width="10" height="10" rx="1"></rect>
                    </svg>
                  }
                />
              </div>
              <SellerButton
                variant="outline"
                size="md"
                onClick={() => fetchProducts(searchQuery)}
                className="flex-shrink-0 min-h-[44px]"
                aria-label="Refresh product catalog"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
              </SellerButton>
            </div>

            {/* Category Filter Chips */}
            <div
              data-lenis-prevent="true"
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
              style={{ touchAction: "pan-x" }}
            >
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap min-h-[36px] ${
                    selectedCategory === cat
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Catalog Grid */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 min-h-[380px] max-h-[620px] seller-scrollbar">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 animate-pulse">
                {Array.from({ length: 10 }).map((_, idx) => (
                  <div key={idx} className="h-44 rounded-xl bg-slate-100 p-3 space-y-2">
                    <div className="h-24 bg-slate-200 rounded-lg" />
                    <div className="h-3 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center p-6 text-slate-500">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300 mb-3">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <p className="text-base font-bold text-slate-800">No products found</p>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Try scanning a barcode or searching by product title/SKU.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {displayedProducts.map((prod) => {
                  const isOutOfStock = prod.stock <= 0;
                  return (
                    <div
                      key={prod.id}
                      className={`group relative flex flex-col justify-between rounded-xl border p-2.5 transition-all ${
                        isOutOfStock
                          ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                          : "bg-white border-slate-200/90 hover:border-purple-300 hover:shadow-md cursor-pointer"
                      }`}
                      onClick={() => !isOutOfStock && !prod.hasVariations && addToCart(prod)}
                    >
                      {/* Stock Badge */}
                      <span
                        className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-2xs ${
                          isOutOfStock
                            ? "bg-rose-100 text-rose-700"
                            : prod.stock < 5
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isOutOfStock ? "Sold out" : `${prod.stock} left`}
                      </span>

                      {/* Product Image */}
                      <div className="h-24 w-full flex items-center justify-center overflow-hidden rounded-lg bg-slate-50 mb-2">
                        {prod.mainImage ? (
                          <img
                            src={prod.mainImage}
                            alt={prod.productName}
                            className="h-full w-full object-contain p-1 group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">No Image</span>
                        )}
                      </div>

                      {/* Product Meta */}
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs line-clamp-2 leading-tight">
                          {prod.productName}
                        </h4>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs font-black text-purple-700">
                            ₹{prod.effectivePrice.toFixed(2)}
                          </span>
                          {prod.discPrice > 0 && (
                            <span className="text-[10px] text-slate-400 line-through">
                              ₹{prod.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Variation Buttons if Multi-variation */}
                      {prod.hasVariations ? (
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                          <span className="text-[10px] font-bold text-slate-500 block">
                            Select Variant:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {prod.variations.map((v) => (
                              <button
                                key={v.id || v.value}
                                disabled={v.stock <= 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToCart(prod, v.id || v.value);
                                }}
                                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold border transition-colors min-h-[30px] ${
                                  v.stock <= 0
                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-600 hover:text-white"
                                }`}
                              >
                                {v.value || v.name} (₹{v.effectivePrice})
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          disabled={isOutOfStock}
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(prod);
                          }}
                          className="mt-2 w-full rounded-lg bg-slate-100 group-hover:bg-purple-600 group-hover:text-white py-1.5 text-[11px] font-bold text-slate-700 transition-colors min-h-[34px]"
                        >
                          + Add to Bill
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SECTION: ACTIVE SALE CART & TENDER CONTROLS */}
        <div
          className={`w-full lg:w-96 flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${
            isMobileCartOpen ? "fixed inset-0 z-50 rounded-none lg:relative lg:inset-auto lg:rounded-2xl" : "hidden lg:flex"
          }`}
        >
          {/* Cart Header */}
          <div className="flex items-center justify-between p-4 border-b border-purple-900/40 bg-gradient-to-r from-[#2D1B69] to-purple-800 text-white">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              <h3 className="font-bold text-sm">Active Sale Cart</h3>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                {cart.reduce((s, it) => s + it.quantity, 0)} items
              </span>
            </div>

            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-white/80 hover:text-white underline underline-offset-2 transition-colors min-h-[36px] px-2"
                >
                  Clear
                </button>
              )}
              {isMobileCartOpen && (
                <button
                  onClick={() => setIsMobileCartOpen(false)}
                  className="lg:hidden p-1.5 text-white/80 hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Close cart"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Cart Line Items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-56 lg:max-h-72 seller-scrollbar">
            {cart.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center text-center text-slate-400 p-4">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 text-slate-300">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                <p className="text-xs font-bold text-slate-600">Cart is empty</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Scan barcode or tap products from catalog to add
                </p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={`${item.productId}-${item.variation || "default"}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate">{item.productName}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                      {item.variantTitle && (
                        <span className="rounded-md bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700 font-semibold">
                          {item.variantTitle}
                        </span>
                      )}
                      <span>₹{item.unitPrice.toFixed(2)}</span>
                      {item.taxRate > 0 && <span className="text-slate-400">+{item.taxRate}% tax</span>}
                    </div>
                  </div>

                  {/* Qty Steppers */}
                  <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className="px-2.5 py-1 hover:bg-slate-100 text-slate-700 font-bold transition-colors min-h-[36px]"
                    >
                      -
                    </button>
                    <span className="px-2 font-bold text-slate-900 text-xs">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className="px-2.5 py-1 hover:bg-slate-100 text-slate-700 font-bold transition-colors min-h-[36px]"
                    >
                      +
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="w-16 text-right">
                    <div className="font-bold text-slate-900">₹{item.total.toFixed(2)}</div>
                    <button
                      onClick={() => removeCartItem(idx)}
                      className="text-[10px] text-rose-500 hover:text-rose-700 font-bold"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Customer Details */}
          <div className="p-3.5 border-t border-slate-200/80 bg-slate-50/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Customer Details</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 font-medium">
                <input
                  type="checkbox"
                  checked={isWalkIn}
                  onChange={(e) => setIsWalkIn(e.target.checked)}
                  className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                Walk-in Customer
              </label>
            </div>

            {!isWalkIn && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name"
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-purple-600 outline-none min-h-[40px]"
                />
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Mobile (WhatsApp)"
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-purple-600 outline-none min-h-[40px]"
                />
              </div>
            )}
          </div>

          {/* Payment & Tender Controls */}
          <div className="p-4 border-t border-slate-200/80 space-y-3">
            {/* Payment Method Selector */}
            <div>
              <span className="text-xs font-bold text-slate-700 block mb-1.5">Payment Mode</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(["Cash", "UPI", "Card"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMethod(mode)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all min-h-[40px] ${
                      paymentMethod === mode
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Quick Tender & Change Helper */}
            {paymentMethod === "Cash" && (
              <div className="rounded-xl bg-purple-50/70 border border-purple-100 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-purple-900">Cash Received (₹):</span>
                  <input
                    type="number"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={grandTotal.toString()}
                    className="w-28 rounded-lg border border-purple-300 bg-white px-2 py-1 text-right text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-400 min-h-[36px]"
                  />
                </div>

                {/* Quick Cash Buttons */}
                <div className="flex items-center gap-1">
                  {[
                    { label: "Exact", val: grandTotal },
                    { label: "+₹50", val: Math.ceil(grandTotal / 50) * 50 },
                    { label: "+₹100", val: Math.ceil(grandTotal / 100) * 100 },
                    { label: "+₹500", val: Math.ceil(grandTotal / 500) * 500 },
                  ].map((b, i) => (
                    <button
                      key={i}
                      onClick={() => setCashReceived(b.val.toString())}
                      className="flex-1 rounded-lg bg-white border border-purple-200 py-1 text-[10px] font-bold text-purple-800 hover:bg-purple-100 transition-colors min-h-[32px]"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>

                {changeDue > 0 && (
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                    <span>Change to Return:</span>
                    <span>₹{changeDue.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* UPI / Card Reference */}
            {(paymentMethod === "UPI" || paymentMethod === "Card") && (
              <div>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder={paymentMethod === "UPI" ? "UPI Ref / UTR (Optional)" : "Card Last 4 Digits / Ref (Optional)"}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-purple-600 min-h-[40px]"
                />
              </div>
            )}

            {/* Discount & Totals Breakdown */}
            <div className="space-y-1.5 pt-1 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-900">₹{cartSubtotal.toFixed(2)}</span>
              </div>
              {cartTotalTax > 0 && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>Tax (GST):</span>
                  <span className="font-bold text-slate-900">₹{cartTotalTax.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-600">
                <span>Discount (₹):</span>
                <input
                  type="number"
                  min="0"
                  max={cartSubtotal}
                  value={discount || ""}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-xs font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[36px]"
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
                <span>Grand Total:</span>
                <span className="text-lg text-purple-700 font-black">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                {error}
              </div>
            )}

            {/* Complete Sale Button */}
            <SellerButton
              variant="primary"
              size="lg"
              fullWidth
              disabled={submitting || cart.length === 0}
              isLoading={submitting}
              onClick={handleCompleteSale}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              }
            >
              Complete Sale & Print Bill (₹{grandTotal.toFixed(2)})
            </SellerButton>
          </div>
        </div>
      </div>

      {/* Mobile Floating Cart Indicator Bar */}
      {cart.length > 0 && !isMobileCartOpen && (
        <div className="lg:hidden fixed bottom-16 left-3 right-3 z-40 bg-[#2D1B69] text-white p-3 rounded-2xl shadow-xl flex items-center justify-between border border-purple-400/30 animate-in slide-in-from-bottom">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-purple-500/40 flex items-center justify-center font-bold text-xs">
              {cart.reduce((s, it) => s + it.quantity, 0)}
            </span>
            <div>
              <p className="text-xs font-bold">Active Sale Cart</p>
              <p className="text-sm font-black text-amber-300">₹{grandTotal.toFixed(2)}</p>
            </div>
          </div>
          <button
            onClick={() => setIsMobileCartOpen(true)}
            className="px-4 py-2 bg-white text-purple-900 rounded-xl font-bold text-xs shadow-md min-h-[44px] flex items-center"
          >
            Checkout Cart →
          </button>
        </div>
      )}

      {/* Instant Print Modal */}
      <PrintableBillModal
        bill={successBill}
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        onNewSale={() => {
          if (searchInputRef.current) {
            searchInputRef.current.focus();
          }
        }}
      />
    </div>
  );
}
