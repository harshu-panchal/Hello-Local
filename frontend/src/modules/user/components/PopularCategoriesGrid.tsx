import { useNavigate } from 'react-router-dom';
import { UserImage } from './common/UserImage';
import { UserSectionHeader } from './common/UserSectionHeader';

interface PopularCategoriesGridProps {
  categories?: any[];
}

export default function PopularCategoriesGrid({ categories = [] }: PopularCategoriesGridProps) {
  const navigate = useNavigate();

  const defaultCategories = [
    {
      name: 'Rice & Atta',
      slug: 'rice-atta',
      bgClass: 'bg-[#FFF9EE] border-[#FCE9C8]',
    },
    {
      name: 'Masala & Spices',
      slug: 'masala-spices',
      bgClass: 'bg-[#FFF3E8] border-[#FEDBBA]',
    },
    {
      name: 'Cold Drinks',
      slug: 'cold-drinks',
      bgClass: 'bg-[#F0F9FF] border-[#BAE6FD]',
    },
    {
      name: 'Personal Care',
      slug: 'personal-care',
      bgClass: 'bg-[#FDF2F8] border-[#FBCFE8]',
    },
    {
      name: 'Pooja Items',
      slug: 'pooja-items',
      bgClass: 'bg-[#FFFBEB] border-[#FEF08A]',
    },
    {
      name: 'Baby Care',
      slug: 'baby-care',
      bgClass: 'bg-[#EFF6FF] border-[#BFDBFE]',
    },
    {
      name: 'Dairy & Eggs',
      slug: 'dairy-eggs',
      bgClass: 'bg-[#FFF1F4] border-[#FFE4EA]',
    },
    {
      name: 'Fresh Veggies',
      slug: 'fresh-veggies',
      bgClass: 'bg-[#EBFBF0] border-[#D1F7DB]',
    },
  ];

  const displayCategories =
    categories && categories.length >= 6 ? categories.slice(0, 8) : defaultCategories;

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5">
      {/* Header */}
      <UserSectionHeader
        title="Popular Categories"
        subtitle="Explore by category"
        actionText="View All"
        onViewAllClick={() => navigate('/categories')}
      />

      {/* 4-to-8 Items Circular Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
        {displayCategories.map((cat: any, idx: number) => {
          const name = cat.name || 'Category';
          const slug = cat.slug || 'all';
          const image = cat.image || cat.icon;
          const bgClass = defaultCategories[idx % defaultCategories.length].bgClass;

          return (
            <button
              type="button"
              key={cat.id || cat._id || slug || idx}
              onClick={() => navigate(`/categories?category=${slug}`)}
              className="flex flex-col items-center text-center group active:scale-95 transition-all min-h-[44px]"
            >
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 lg:w-18 lg:h-18 rounded-full border p-1.5 shadow-2xs flex items-center justify-center overflow-hidden mb-1.5 ${bgClass} group-hover:scale-105 transition-transform`}
              >
                <UserImage
                  src={image}
                  alt={name}
                  className="w-full h-full object-contain rounded-full"
                  categoryFallback={name}
                />
              </div>
              <span className="text-[11px] font-medium text-slate-800 leading-tight line-clamp-1 max-w-[80px]">
                {name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
