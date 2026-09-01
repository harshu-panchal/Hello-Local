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
    <div className="w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5">
      {/* Section Header */}
      <UserSectionHeader
        title="Near You (Best Shops)"
        subtitle="Top-rated neighborhood stores"
        actionText="View All"
        onViewAllClick={() => navigate('/shop-by-stores')}
      />

      {/* Responsive Shop List: Horizontal Carousel on Mobile, 4-to-5 Col Grid on Desktop */}
      {hasShops ? (
        <div className="flex md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 overflow-x-auto md:overflow-visible scrollbar-hide pb-2 md:pb-0">
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
              <div key={shopId || idx} className="w-[200px] sm:w-[220px] md:w-auto flex-shrink-0">
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
        <div className="p-6 bg-white rounded-2xl border border-slate-100 text-center space-y-2">
          <StorefrontIcon size={28} className="text-slate-400 mx-auto" />
          <p className="text-xs font-bold text-slate-700">Connecting with local shops in your area</p>
          <button
            type="button"
            onClick={() => navigate('/shop-by-stores')}
            className="text-xs font-bold text-[#FF2E7A] hover:underline min-h-[44px]"
          >
            Explore all partner stores
          </button>
        </div>
      )}
    </div>
  );
}
