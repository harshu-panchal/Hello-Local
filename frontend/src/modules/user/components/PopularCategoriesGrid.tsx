import { useNavigate } from 'react-router-dom';
import { UserImage } from './common/UserImage';
import { UserSectionHeader } from './common/UserSectionHeader';
import { getIconByName } from '../../../utils/iconLibrary';

interface PopularCategoriesGridProps {
  categories?: any[];
}

export default function PopularCategoriesGrid({ categories = [] }: PopularCategoriesGridProps) {
  const navigate = useNavigate();

  const pastelThemes = [
    { bgClass: 'bg-[#FFF9EE] border-[#FCE9C8]', textColor: 'text-[#EA580C]' },
    { bgClass: 'bg-[#FFF3E8] border-[#FEDBBA]', textColor: 'text-[#D97706]' },
    { bgClass: 'bg-[#F0F9FF] border-[#BAE6FD]', textColor: 'text-[#0284C7]' },
    { bgClass: 'bg-[#FDF2F8] border-[#FBCFE8]', textColor: 'text-[#DB2777]' },
    { bgClass: 'bg-[#FFFBEB] border-[#FEF08A]', textColor: 'text-[#CA8A04]' },
    { bgClass: 'bg-[#EFF6FF] border-[#BFDBFE]', textColor: 'text-[#2563EB]' },
    { bgClass: 'bg-[#FFF1F4] border-[#FFE4EA]', textColor: 'text-[#E11D48]' },
    { bgClass: 'bg-[#EBFBF0] border-[#D1F7DB]', textColor: 'text-[#16A34A]' },
  ];

  const defaultCategories = [
    {
      name: 'Rice & Atta',
      slug: 'rice-atta',
      bgClass: 'bg-[#FFF9EE] border-[#FCE9C8]',
      textColor: 'text-[#EA580C]',
    },
    {
      name: 'Masala & Spices',
      slug: 'masala-spices',
      bgClass: 'bg-[#FFF3E8] border-[#FEDBBA]',
      textColor: 'text-[#D97706]',
    },
    {
      name: 'Cold Drinks',
      slug: 'cold-drinks',
      bgClass: 'bg-[#F0F9FF] border-[#BAE6FD]',
      textColor: 'text-[#0284C7]',
    },
    {
      name: 'Personal Care',
      slug: 'personal-care',
      bgClass: 'bg-[#FDF2F8] border-[#FBCFE8]',
      textColor: 'text-[#DB2777]',
    },
    {
      name: 'Pooja Items',
      slug: 'pooja-items',
      bgClass: 'bg-[#FFFBEB] border-[#FEF08A]',
      textColor: 'text-[#CA8A04]',
    },
    {
      name: 'Baby Care',
      slug: 'baby-care',
      bgClass: 'bg-[#EFF6FF] border-[#BFDBFE]',
      textColor: 'text-[#2563EB]',
    },
    {
      name: 'Dairy & Eggs',
      slug: 'dairy-eggs',
      bgClass: 'bg-[#FFF1F4] border-[#FFE4EA]',
      textColor: 'text-[#E11D48]',
    },
    {
      name: 'Fresh Veggies',
      slug: 'fresh-veggies',
      bgClass: 'bg-[#EBFBF0] border-[#D1F7DB]',
      textColor: 'text-[#16A34A]',
    },
  ];

  const displayCategories =
    categories && categories.length > 0 ? categories.slice(0, 8) : defaultCategories;

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
          const slug = cat.slug || cat.id || cat._id || 'all';
          const image = cat.image || (cat.icon && typeof cat.icon === 'string' && cat.icon.startsWith('http') ? cat.icon : null);
          const hasImage = Boolean(image && typeof image === 'string' && image.trim().length > 0);
          const theme = pastelThemes[idx % pastelThemes.length];

          return (
            <button
              type="button"
              key={cat.id || cat._id || slug || idx}
              onClick={() => navigate(`/category/${slug}`)}
              className="flex flex-col items-center text-center group active:scale-95 transition-all min-h-[44px]"
            >
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 lg:w-18 lg:h-18 rounded-full border p-1.5 shadow-2xs flex items-center justify-center overflow-hidden mb-1.5 ${theme.bgClass} group-hover:scale-105 transition-transform`}
              >
                {hasImage ? (
                  <UserImage
                    src={image}
                    alt={name}
                    className="w-full h-full object-cover rounded-full"
                    categoryFallback={name}
                  />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center ${theme.textColor}`}>
                    {getIconByName(cat.icon || cat.iconName || cat.slug || name)}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-medium text-slate-800 leading-tight line-clamp-2 max-w-[88px]">
                {name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
