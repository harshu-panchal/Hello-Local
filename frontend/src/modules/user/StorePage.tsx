import { useNavigate, useParams } from 'react-router-dom';
import { Product } from '../../types/domain';
import { useEffect, useState } from 'react';
import { getStoreProducts } from '../../services/api/customerHomeService';
import { useLocation } from '../../hooks/useLocation';
import ProductCard from './components/ProductCard';
import { UserEmptyState } from './components/common';
import { ArrowLeftIcon, SearchIcon, StoreNavIcon, ClockIcon, ShieldCheckIcon } from './components/common/UserIcons';

export default function StorePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { location } = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [shopData, setShopData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      try {
        setLoading(true);
        const response = await getStoreProducts(
          slug,
          location?.latitude,
          location?.longitude
        );

        if (response.success) {
          setProducts(response.data || []);
          setShopData(response.shop || null);
        } else {
          setProducts([]);
          setShopData(null);
        }
      } catch (error: any) {
        console.error('Failed to fetch store data:', error);
        setProducts([]);
        setShopData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug, location]);

  const storeName =
    shopData?.name ||
    (slug ? slug.charAt(0).toUpperCase() + slug.slice(1).replace('-', ' ') : 'Store');
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (shopData?.image) {
      setBannerImage(shopData.image);
      setImageError(false);
    } else if (slug) {
      const possiblePaths = [
        `/assets/shopbystore/${slug}/${slug}header.png`,
        `/assets/shopbystore/${slug}/header.png`,
        `/assets/shopbystore/${slug}.png`,
        `/assets/shopbystore/${slug}.jpg`,
      ];
      setBannerImage(possiblePaths[0]);
      setImageError(false);
    } else {
      setBannerImage(null);
      setImageError(true);
    }
  }, [shopData, slug]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    const currentSrc = target.src;

    if (slug && currentSrc.includes('/assets/shopbystore/')) {
      const fallbackPaths = [
        `/assets/shopbystore/${slug}/header.png`,
        `/assets/shopbystore/${slug}.png`,
        `/assets/shopbystore/${slug}.jpg`,
      ];
      const currentIndex = fallbackPaths.findIndex((path) => currentSrc.includes(path));

      if (currentIndex < fallbackPaths.length - 1) {
        target.src = fallbackPaths[currentIndex + 1];
        return;
      }
    }

    setImageError(true);
    target.style.display = 'none';
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16">
      {/* Store Banner Hero */}
      <div className="relative w-full aspect-[21/9] sm:aspect-[3.5/1] bg-slate-100 overflow-hidden">
        {bannerImage && !imageError ? (
          <img
            src={bannerImage}
            alt={storeName}
            className="w-full h-full object-cover"
            onError={handleImageError}
            loading="eager"
          />
        ) : (
          <div className="w-full h-full bg-[#FF2E7A] flex items-center justify-center">
            <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight">
              {storeName}
            </h1>
          </div>
        )}

        {/* Floating Top Nav with 44px min touch target */}
        <header className="absolute top-0 left-0 right-0 z-20">
          <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center bg-white/90 shadow-2xs text-slate-800 hover:bg-white transition-colors"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>

            <button
              type="button"
              onClick={() => navigate('/search')}
              className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center bg-white/90 shadow-2xs text-slate-800 hover:bg-white transition-colors"
              aria-label="Search"
            >
              <SearchIcon size={18} />
            </button>
          </div>
        </header>

        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#F8FAFC] to-transparent pointer-events-none" />
      </div>

      {/* Store Header & Metadata */}
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 -mt-4 relative z-10">
        <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                {storeName}
              </h1>
              <ShieldCheckIcon size={15} className="text-[#16A34A]" />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
              <span>Verified Local Partner</span>
              <span>•</span>
              <div className="flex items-center gap-0.5 text-slate-600">
                <ClockIcon size={11} className="text-[#FF2E7A]" />
                <span>15 Mins Delivery</span>
              </div>
            </div>
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-[#16A34A] border border-emerald-200 px-2.5 py-0.5 rounded-full flex-shrink-0">
            Open Now
          </span>
        </div>
      </div>

      {/* Products Section */}
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900">
            Products from {storeName} ({products.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2.5">
            <div className="w-10 h-10 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">Loading store catalogue...</p>
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
            {products.map((product) => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="py-10">
            <UserEmptyState
              icon={<StoreNavIcon size={32} className="text-[#FF2E7A]" />}
              title="No products available"
              description="This store has no active products listed in your selected delivery zone."
              actionText="Explore Other Stores"
              onAction={() => navigate('/')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
