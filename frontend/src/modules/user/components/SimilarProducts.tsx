import { Product } from '../../../types/domain';
import { useNavigate } from 'react-router-dom';
import { calculateProductPrice } from '../../../utils/priceUtils';
import { UserImage } from './common/UserImage';

interface SimilarProductsProps {
  products: Product[];
  currentProductId: string;
}

export default function SimilarProducts({ products, currentProductId }: SimilarProductsProps) {
  const navigate = useNavigate();

  // Filter out current product and limit to 6
  const similarProducts = products
    .filter((p) => (p.id || (p as any)._id) !== currentProductId)
    .slice(0, 6);

  if (similarProducts.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 mb-4">
      <div className="flex items-center gap-2 mb-3 px-4">
        <span className="text-xl">✨</span>
        <h3 className="text-base font-black text-slate-900 tracking-tight">Similar Products</h3>
      </div>
      <div className="px-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2 scroll-smooth">
          {similarProducts.map((product) => {
            const { displayPrice, mrp, hasDiscount, discount } = calculateProductPrice(product);
            const pId = product.id || (product as any)._id;

            return (
              <div
                key={pId}
                onClick={() => navigate(`/product/${pId}`)}
                className="flex-shrink-0 w-36 bg-white rounded-3xl shadow-2xs border border-slate-200/90 overflow-hidden cursor-pointer hover:shadow-md transition-all active:scale-98 group flex flex-col justify-between"
              >
                {/* Image */}
                <div className="w-full h-28 bg-slate-50 flex items-center justify-center overflow-hidden relative">
                  <UserImage
                    src={product.imageUrl || (product as any).mainImage}
                    alt={product.name}
                    categoryFallback="grocery"
                    className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                  />
                  {hasDiscount && discount > 0 && (
                    <div className="absolute top-2 left-2 bg-gradient-to-r from-[#FF5364] to-[#FF2E7A] text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-xs">
                      {discount}% OFF
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium mb-0.5 truncate">
                      {product.variations?.[0]?.value || product.pack || 'Standard'}
                    </p>
                    <h4 className="text-xs font-black text-slate-900 line-clamp-2 mb-1.5 leading-tight">
                      {product.name}
                    </h4>
                  </div>
                  <div className="flex items-baseline gap-1 mt-auto">
                    <span className="text-xs font-black text-slate-900">
                      ₹{displayPrice.toLocaleString('en-IN')}
                    </span>
                    {hasDiscount && (
                      <span className="text-[10px] text-slate-400 line-through font-medium">
                        ₹{mrp.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
