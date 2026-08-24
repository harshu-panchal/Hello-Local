import React, { useEffect, useState } from 'react';
import { getHeaderCategoriesPublic } from '../../../services/api/headerCategoryService';
import { UserImage } from './common/UserImage';
import { CategoryNavIcon } from './common/UserIcons';

interface CategoryQuickStripProps {
  activeTab: string;
  onTabChange: (tabId: string, tabName?: string) => void;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  iconName?: string;
  image?: string;
}

export default function CategoryQuickStrip({ activeTab, onTabChange }: CategoryQuickStripProps) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const cats = await getHeaderCategoriesPublic();
        if (cats && cats.length > 0) {
          setCategories(
            cats.map((c: any) => ({
              id: c.slug || c._id,
              name: c.name,
              slug: c.slug,
              iconName: c.iconName,
              image: c.image,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load header categories', err);
      }
    };
    fetchCats();
  }, []);

  const pastelColors = [
    'bg-[#FFF5EB] border-[#FED7AA]', // soft orange/grocery
    'bg-[#F0FDF4] border-[#BBF7D0]', // soft green/fruits
    'bg-[#F0F9FF] border-[#BAE6FD]', // soft blue/dairy
    'bg-[#FAF5FF] border-[#E9D5FF]', // soft purple/bakery
    'bg-[#FFF1F2] border-[#FECDD3]', // soft rose/snacks
    'bg-[#FEFCE8] border-[#FEF08A]', // soft yellow
  ];

  return (
    <div className="w-full bg-white border-b border-slate-100">
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-3.5 sm:gap-5 min-w-max justify-start md:justify-center">
          {/* 1. 'All' Button */}
          <button
            type="button"
            onClick={() => onTabChange('all', 'All')}
            className={`flex flex-col items-center gap-1.5 transition-all group min-h-[44px] ${
              activeTab === 'all' ? 'scale-105' : 'opacity-85 hover:opacity-100'
            }`}
          >
            <div
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all ${
                activeTab === 'all'
                  ? 'bg-[#FFF1F4] border-2 border-[#FF2E7A] text-[#FF2E7A] shadow-2xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <CategoryNavIcon size={22} className={activeTab === 'all' ? 'text-[#FF2E7A]' : 'text-slate-700'} />
            </div>
            <span
              className={`text-[11px] font-bold ${
                activeTab === 'all' ? 'text-[#FF2E7A]' : 'text-slate-700'
              }`}
            >
              All
            </span>
          </button>

          {/* 2. Dynamic Categories with circular pastel image containers */}
          {categories.slice(0, 10).map((cat, idx) => {
            const isActive = activeTab === cat.slug || activeTab === cat.id;
            const bgCol = pastelColors[idx % pastelColors.length];
            return (
              <button
                type="button"
                key={cat.id || cat.slug || idx}
                onClick={() => onTabChange(cat.slug || cat.id, cat.name)}
                className={`flex flex-col items-center gap-1.5 transition-all group min-h-[44px] ${
                  isActive ? 'scale-105' : 'opacity-85 hover:opacity-100'
                }`}
              >
                <div
                  className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center overflow-hidden transition-all border p-1 ${bgCol} ${
                    isActive
                      ? 'ring-2 ring-[#FF2E7A] shadow-2xs'
                      : 'hover:scale-105'
                  }`}
                >
                  <UserImage
                    src={cat.image}
                    alt={cat.name}
                    className="w-full h-full object-contain rounded-full"
                    categoryFallback={cat.name}
                  />
                </div>
                <span
                  className={`text-[11px] font-medium max-w-[64px] truncate text-center ${
                    isActive ? 'text-[#FF2E7A] font-bold' : 'text-slate-700'
                  }`}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}

          {/* 3. More Action */}
          <button
            type="button"
            onClick={() => onTabChange('all', 'More')}
            className="flex flex-col items-center gap-1.5 opacity-85 hover:opacity-100 transition-all min-h-[44px]"
          >
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="18" cy="12" r="1.5" />
                <circle cx="6" cy="12" r="1.5" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-slate-700">More</span>
          </button>
        </div>
      </div>
    </div>
  );
}
