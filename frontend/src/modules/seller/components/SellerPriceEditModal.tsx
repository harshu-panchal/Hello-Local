import React, { useState, useEffect } from 'react';
import { StorePreviewProduct } from '../../../services/api/sellerStorePreviewService';

interface SellerPriceEditModalProps {
  isOpen: boolean;
  product: StorePreviewProduct | null;
  onClose: () => void;
  onSave: (productId: string, newSellingPrice: number, mrp: number) => Promise<void>;
}

export default function SellerPriceEditModal({
  isOpen,
  product,
  onClose,
  onSave,
}: SellerPriceEditModalProps) {
  const [newPrice, setNewPrice] = useState<string>('');
  const [mrp, setMrp] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (product) {
      const currentSellingPrice = product.discPrice || product.price || 0;
      const currentMrp = product.price || currentSellingPrice;
      setNewPrice(currentSellingPrice.toString());
      setMrp(currentMrp.toString());
      setError('');
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const currentPriceNum = product.discPrice || product.price || 0;
  const newPriceNum = parseFloat(newPrice) || 0;
  const mrpNum = parseFloat(mrp) || product.price || currentPriceNum;

  const discountPercent =
    mrpNum > newPriceNum && mrpNum > 0
      ? Math.round(((mrpNum - newPriceNum) / mrpNum) * 100)
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(newPriceNum) || newPriceNum <= 0) {
      setError('Please enter a valid selling price greater than 0');
      return;
    }
    if (newPriceNum > mrpNum) {
      setError('Selling price cannot exceed MRP');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await onSave(product._id, newPriceNum, mrpNum);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update price');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-base font-black text-slate-900 tracking-tight">
            Update Price
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Product Details */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-500">Product Name:</p>
          <p className="text-sm font-black text-slate-900 truncate">
            {product.productName}
          </p>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 pt-1">
            <span>
              Current Price: <strong className="text-slate-900">₹{currentPriceNum}</strong>
            </span>
            <span>
              MRP: <strong className="text-slate-900">₹{mrpNum}</strong>
            </span>
          </div>
        </div>

        {/* Price Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              New Selling Price
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                ₹
              </span>
              <input
                type="number"
                step="any"
                min="1"
                required
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Enter selling price"
                className="w-full pl-8 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-sm font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                autoFocus
              />
            </div>
          </div>

          {/* Dynamic Comparison Indicator */}
          {newPriceNum > 0 && (
            <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">Preview Update:</span>
              <div className="flex items-center gap-1.5 font-black">
                <span className="text-slate-400 line-through">₹{currentPriceNum}</span>
                <span className="text-purple-700">→ ₹{newPriceNum}</span>
                {discountPercent > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black">
                    {discountPercent}% OFF
                  </span>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-600 font-bold">{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors shadow-xs active:scale-95 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
