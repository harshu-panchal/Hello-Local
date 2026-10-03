import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getStorePreviewData,
  quickUpdateProductPrice,
  toggleProductPublish,
  toggleProductFeature,
  reorderProducts,
  uploadMediaFile,
  StorePreviewProduct,
  StorePreviewData,
} from '../../../services/api/sellerStorePreviewService';
import { updateSellerProfile } from '../../../services/api/auth/sellerAuthService';
import SellerPriceEditModal from '../components/SellerPriceEditModal';
import { useToast } from '../../../context/ToastContext';

export default function SellerStorePreview() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'customer' | 'edit'>('customer');
  const [storeData, setStoreData] = useState<StorePreviewData['store'] | null>(null);
  const [products, setProducts] = useState<StorePreviewProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Cover & Logo upload states
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Price Edit Modal
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StorePreviewProduct | null>(null);

  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const fetchStorePreview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getStorePreviewData();
      if (res.success && res.data) {
        setStoreData(res.data.store);
        setProducts(res.data.products || []);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to load store preview', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStorePreview();
  }, [fetchStorePreview]);

  // Handle Mode Toggle with Verify Feedback
  const handleToggleMode = (newMode: 'customer' | 'edit') => {
    if (newMode === 'customer' && mode === 'edit') {
      showToast('Store updated successfully. Viewing live customer experience.', 'success');
    }
    setMode(newMode);
  };

  // Cover Image Upload
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingCover(true);
      const imageUrl = await uploadMediaFile(file, 'hellolocal/stores');
      if (imageUrl) {
        await updateSellerProfile({ storeBanner: imageUrl });
        setStoreData((prev: any) => ({ ...prev, storeBanner: imageUrl }));
        showToast('Store cover picture updated successfully!', 'success');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to upload cover picture', 'error');
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  // Profile Logo Upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingLogo(true);
      const imageUrl = await uploadMediaFile(file, 'hellolocal/sellers/profile');
      if (imageUrl) {
        await updateSellerProfile({ profile: imageUrl, logo: imageUrl });
        setStoreData((prev: any) => ({ ...prev, logo: imageUrl }));
        showToast('Store logo updated successfully!', 'success');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to upload store logo', 'error');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  // Quick Price Edit Save Handler
  const handleSavePrice = async (productId: string, newSellingPrice: number, mrp: number) => {
    const res = await quickUpdateProductPrice(productId, mrp, newSellingPrice);
    if (res.success) {
      setProducts((prev) =>
        prev.map((p) =>
          p._id === productId
            ? {
                ...p,
                price: mrp,
                discPrice: newSellingPrice,
                discount:
                  mrp > newSellingPrice && mrp > 0
                    ? Math.round(((mrp - newSellingPrice) / mrp) * 100)
                    : 0,
              }
            : p
        )
      );
      showToast('Price updated successfully!', 'success');
    }
  };

  // Toggle Publish Status
  const handleTogglePublish = async (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await toggleProductPublish(productId);
      if (res.success) {
        setProducts((prev) =>
          prev.map((p) =>
            p._id === productId ? { ...p, publish: res.data.publish } : p
          )
        );
        showToast(res.message, 'success');
      }
    } catch (err: any) {
      showToast('Failed to update product visibility', 'error');
    }
  };

  // Toggle Feature Status
  const handleToggleFeature = async (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await toggleProductFeature(productId);
      if (res.success) {
        setProducts((prev) =>
          prev.map((p) =>
            p._id === productId ? { ...p, popular: res.data.popular } : p
          )
        );
        showToast(res.message, 'success');
      }
    } catch (err: any) {
      showToast('Failed to update featured status', 'error');
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (index: number) => {
    if (mode !== 'edit') return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (mode !== 'edit') return;
    e.preventDefault();
  };

  const handleDrop = async (targetIndex: number) => {
    if (mode !== 'edit' || draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const updated = [...products];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setProducts(updated);
    setDraggedIndex(null);

    try {
      const productIds = updated.map((p) => p._id);
      await reorderProducts(productIds);
      showToast('Product order updated successfully!', 'success');
    } catch (err: any) {
      showToast('Failed to save product order', 'error');
    }
  };

  // Extract Categories
  const categories = [
    'All',
    ...Array.from(
      new Set(
        products
          .map((p) => p.category?.name)
          .filter((name): name is string => Boolean(name))
      )
    ),
  ];

  const filteredProducts = products.filter((p) => {
    if (selectedCategory === 'All') return true;
    return p.category?.name === selectedCategory;
  });

  // Cover image fallback
  const coverImage =
    storeData?.storeBanner ||
    'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80';

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      {/* Hidden file inputs for instant media upload */}
      <input
        type="file"
        ref={coverInputRef}
        onChange={handleCoverUpload}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={logoInputRef}
        onChange={handleLogoUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Top Header with Segmented Mode Switcher */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          {/* Back button */}
          <button
            onClick={() => navigate('/seller')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-purple-600 transition-colors min-h-[44px] min-w-[44px] cursor-pointer"
            aria-label="Back to dashboard"
          >
            <span className="text-base leading-none">‹</span>
            <span className="hidden sm:inline">Dashboard</span>
          </button>

          {/* Segmented Mode Switcher Pill */}
          <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200/70 shadow-inner">
            <button
              onClick={() => handleToggleMode('customer')}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 min-h-[38px] cursor-pointer ${
                mode === 'customer'
                  ? 'bg-white text-purple-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>👁</span>
              <span>Customer View</span>
            </button>
            <button
              onClick={() => handleToggleMode('edit')}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 min-h-[38px] cursor-pointer ${
                mode === 'edit'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>✏️</span>
              <span>Edit Store</span>
            </button>
          </div>

          {/* Mode label */}
          <span className="text-[11px] font-black uppercase tracking-wider text-purple-700 hidden sm:block">
            {mode === 'edit' ? 'Editing Mode Active' : 'Live Preview'}
          </span>
        </div>
      </header>

      {/* Main Preview Container */}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 pt-3 space-y-4">
        {/* Cover Picture & Profile Logo Banner */}
        <div className="relative rounded-3xl overflow-hidden bg-slate-200 border border-slate-200/80 shadow-xs">
          {/* Cover Picture */}
          <div className="relative w-full aspect-[21/9] sm:aspect-[3.5/1] bg-slate-800 overflow-hidden">
            <img
              src={coverImage}
              alt="Store Cover"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

            {/* In Edit Mode: Edit Cover Button */}
            {mode === 'edit' && (
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/85 text-white text-xs font-bold backdrop-blur-md flex items-center gap-1.5 shadow-md transition-all active:scale-95 min-h-[36px] cursor-pointer border border-white/20"
              >
                <span>📷</span>
                <span>{uploadingCover ? 'Uploading...' : 'Edit Cover'}</span>
              </button>
            )}
          </div>

          {/* Centered Profile Logo Overlay */}
          <div className="relative flex justify-center -mt-10 sm:-mt-12 pb-3 z-10">
            <div className="relative">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white border-4 border-white shadow-lg overflow-hidden flex items-center justify-center">
                {storeData?.logo ? (
                  <img
                    src={storeData.logo}
                    alt={storeData.name || 'Store Logo'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex flex-col items-center justify-center text-white">
                    <span className="text-2xl sm:text-3xl">🏪</span>
                    <span className="text-[8px] font-black tracking-widest text-amber-300 uppercase mt-0.5">
                      24/7
                    </span>
                  </div>
                )}
              </div>

              {/* In Edit Mode: Edit Logo Camera Badge */}
              {mode === 'edit' && (
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs shadow-md border-2 border-white hover:bg-purple-700 transition-all active:scale-95 cursor-pointer"
                  title="Edit Profile Logo"
                >
                  {uploadingLogo ? '⏳' : '📷'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Drag to rearrange banner in Edit Mode */}
        {mode === 'edit' && (
          <div className="bg-purple-50 border border-purple-200/80 rounded-2xl p-2.5 text-center text-xs font-bold text-purple-800 flex items-center justify-center gap-2 shadow-2xs">
            <span>⠿</span>
            <span>Drag any product card to rearrange its display order on the storefront</span>
          </div>
        )}

        {/* Categories Strip */}
        {categories.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer min-h-[36px] ${
                  selectedCategory === cat
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-56 bg-slate-200 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-slate-200/80 text-center space-y-3">
            <span className="text-4xl">🛍️</span>
            <h4 className="text-sm font-bold text-slate-800">No products found in this category</h4>
            <p className="text-xs text-slate-500">
              Add products to your catalog to showcase them in your store preview.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((prod, index) => {
              const currentPrice = prod.discPrice || prod.price || 0;
              const originalPrice = prod.price || currentPrice;
              const hasDiscount = originalPrice > currentPrice && originalPrice > 0;
              const discountPercent = hasDiscount
                ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
                : 0;
              const imageSrc =
                prod.mainImage ||
                prod.mainImageUrl ||
                'https://placehold.co/300x300?text=Product';

              return (
                <div
                  key={prod._id}
                  draggable={mode === 'edit'}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  className={`bg-white rounded-3xl border transition-all flex flex-col justify-between overflow-hidden shadow-2xs ${
                    mode === 'edit'
                      ? 'border-purple-200 hover:shadow-md cursor-grab active:cursor-grabbing'
                      : 'border-slate-100 hover:shadow-sm'
                  } ${!prod.publish ? 'opacity-60 bg-slate-50' : ''}`}
                >
                  {/* Top: Image + Badges */}
                  <div>
                    <div className="relative aspect-square w-full bg-slate-100 overflow-hidden">
                      <img
                        src={imageSrc}
                        alt={prod.productName}
                        className="w-full h-full object-cover"
                      />

                      {/* Customer discount tag */}
                      {hasDiscount && (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black shadow-xs">
                          {discountPercent}% OFF
                        </span>
                      )}

                      {/* Featured star badge */}
                      {prod.popular && (
                        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center text-xs shadow-xs">
                          ★
                        </span>
                      )}

                      {/* Hidden status indicator */}
                      {!prod.publish && (
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[9px] font-bold">
                          Hidden
                        </span>
                      )}
                    </div>

                    {/* In Edit Store Mode: In-Line Quick Action Controls */}
                    {mode === 'edit' && (
                      <div className="p-2 border-b border-purple-100 bg-purple-50/50 flex items-center justify-between gap-1 text-[11px]">
                        {/* Price Edit Button */}
                        <button
                          onClick={() => {
                            setEditingProduct(prod);
                            setPriceModalOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-0.5 shadow-2xs active:scale-95 cursor-pointer"
                          title="Update Selling Price"
                        >
                          <span>₹</span>
                          <span>Price</span>
                        </button>

                        {/* Feature Toggle */}
                        <button
                          onClick={(e) => handleToggleFeature(prod._id, e)}
                          className={`p-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                            prod.popular
                              ? 'bg-amber-100 border-amber-300 text-amber-700'
                              : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                          }`}
                          title="Feature product"
                        >
                          ⭐
                        </button>

                        {/* Hide / Show Toggle */}
                        <button
                          onClick={(e) => handleTogglePublish(prod._id, e)}
                          className={`p-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                            prod.publish
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-rose-50 border-rose-200 text-rose-700'
                          }`}
                          title={prod.publish ? 'Hide product' : 'Show product'}
                        >
                          {prod.publish ? '👁' : '🚫'}
                        </button>

                        {/* Drag Handle */}
                        <span
                          className="text-slate-400 font-bold text-sm cursor-grab select-none px-1"
                          title="Drag to rearrange"
                        >
                          ⠿
                        </span>
                      </div>
                    )}

                    {/* Product Details */}
                    <div className="p-3 space-y-1">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2 leading-snug">
                        {prod.productName}
                      </h4>

                      <div className="flex items-baseline gap-1.5 flex-wrap pt-0.5">
                        <span className="text-xs sm:text-sm font-black text-slate-900">
                          ₹{currentPrice}
                        </span>
                        {hasDiscount && (
                          <span className="text-[10px] sm:text-xs text-slate-400 line-through">
                            MRP: ₹{originalPrice}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Customer View: Add to Cart button */}
                  {mode === 'customer' && (
                    <div className="p-3 pt-0">
                      <button
                        type="button"
                        className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors shadow-2xs active:scale-95 min-h-[38px] cursor-pointer"
                      >
                        Add to Cart
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Direct Price Edit Popup Modal */}
      <SellerPriceEditModal
        isOpen={priceModalOpen}
        product={editingProduct}
        onClose={() => {
          setPriceModalOpen(false);
          setEditingProduct(null);
        }}
        onSave={handleSavePrice}
      />
    </div>
  );
}
