import { useNavigate } from 'react-router-dom';
import { StoreCard } from './common/StoreCard';
import { UserSectionHeader } from './common/UserSectionHeader';
import { StorefrontIcon } from './common/UserIcons';

interface NearYouShopsSectionProps {
  shops?: any[];
}

export default function NearYouShopsSection({ shops = [] }: NearYouShopsSectionProps) {
  const navigate = useNavigate();
  const hasShops = shops && shops.length > 0;

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-2">
      {/* Section Header */}
      <UserSectionHeader
        title="Near You (Best Shops)"
        subtitle="Top-rated neighborhood stores"
        actionText="View All"
        onViewAllClick={() => navigate('/shop-by-stores')}
      />

      {/* Responsive Shop List: Horizontal Carousel on Mobile, 3-to-5 Col Grid on Desktop */}
      {hasShops ? (
        <div className="flex md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 overflow-x-auto md:overflow-visible scrollbar-hide pb-2 md:pb-0 pt-1">
          {shops.map((shop: any, idx: number) => {
            const shopId = shop.storeId || shop._id || shop.id;
            const shopName = shop.storeName || shop.name || 'Local Store';
            const shopCategory =
              shop.category?.name || (typeof shop.category === 'string' ? shop.category : '') || shop.categories || 'Department Store';
            const rating = shop.rating || 4.8;
            const distance = shop.distance !== undefined ? `${shop.distance} km` : (shop.type === 'shop' ? 'Verified Partner' : 'Near You');
            const area = shop.area || shop.city || shop.address?.city || 'Neighborhood';
            const time = shop.deliveryTime || (shop.distance ? `${Math.round(15 + shop.distance * 4)}-${Math.round(25 + shop.distance * 4)} mins` : '20-30 mins');
            const offer = shop.offer || (shop.distance && shop.distance <= 3 ? 'Free Delivery' : 'Fast Delivery');
            const imageUrl = shop.bannerImage || shop.image || shop.logo || (shop.productImages && shop.productImages[0]) || null;

            return (
              <div key={shopId || idx} className="w-[190px] sm:w-[210px] md:w-auto flex-shrink-0">
                <StoreCard
                  id={shopId}
                  name={shopName}
                  category={shopCategory}
                  imageUrl={imageUrl}
                  rating={rating}
                  featured={shop.isShopOpen !== false}
                  distance={distance}
                  area={area}
                  eta={time}
                  offerText={offer}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-6 sm:p-8 bg-white rounded-2xl border border-slate-200/80 shadow-2xs text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A] mx-auto border border-[#FFE4EA]">
            <StorefrontIcon size={24} className="text-[#FF2E7A]" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">Connecting with local shops in your area</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">Discover trusted neighborhood grocery, bakery, and retail stores deliverable right to your door.</p>
          <button
            type="button"
            onClick={() => navigate('/shop-by-stores')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#FF2E7A] hover:bg-[#E02269] text-white text-xs font-black rounded-full shadow-2xs transition-all active:scale-95 min-h-[38px]"
          >
            <span>Explore all partner stores</span>
          </button>
        </div>
      )}
    </div>
  );
}
