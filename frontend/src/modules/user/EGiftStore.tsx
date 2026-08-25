import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Product } from '../../types/domain';
import { getProducts } from '../../services/api/customerProductService';
import { useLocation } from '../../hooks/useLocation';
import ProductCard from './components/ProductCard';
import { UserEmptyState } from './components/common';
import { ArrowLeftIcon, SparklesIcon } from './components/common/UserIcons';

export default function EGiftStore() {
  const navigate = useNavigate();
  const { location } = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await getProducts({
          category: 'egifts',
          latitude: location?.latitude,
          longitude: location?.longitude,
        });
        setProducts((response.data as unknown as Product[]) || []);
      } catch (error) {
        console.error('Failed to fetch egift products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [location?.latitude, location?.longitude]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                E-Gift Cards & Vouchers
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                Instant digital gifting & discount vouchers
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2.5">
            <div className="w-10 h-10 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">Loading gift cards...</p>
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
            {products.map((product) => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="py-10">
            <UserEmptyState
              icon={<SparklesIcon size={32} className="text-[#FF2E7A]" />}
              title="No gift cards found in your area"
              description="E-Gift vouchers are currently refreshing. Please check back shortly."
              actionText="Explore Marketplace"
              onAction={() => navigate('/')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
