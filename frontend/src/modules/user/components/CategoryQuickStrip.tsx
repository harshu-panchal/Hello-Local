import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHeaderCategoriesPublic } from '../../../services/api/headerCategoryService';
import { UserImage } from './common/UserImage';
import { CategoryNavIcon } from './common/UserIcons';
import { getIconByName } from '../../../utils/iconLibrary';

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
  const navigate = useNavigate();
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
    { bg: 'bg-[#FFF5EB] border-[#FED7AA]', text: 'text-[#EA580C]' }, // soft orange/grocery
    { bg: 'bg-[#F0FDF4] border-[#BBF7D0]', text: 'text-[#16A34A]' }, // soft green/fruits
    { bg: 'bg-[#F0F9FF] border-[#BAE6FD]', text: 'text-[#0284C7]' }, // soft blue/dairy
    { bg: 'bg-[#FAF5FF] border-[#E9D5FF]', text: 'text-[#9333EA]' }, // soft purple/bakery
    { bg: 'bg-[#FFF1F2] border-[#FECDD3]', text: 'text-[#E11D48]' }, // soft rose/snacks
    { bg: 'bg-[#FEFCE8] border-[#FEF08A]', text: 'text-[#CA8A04]' }, // soft yellow/books
  ];

  return (
    <div className="w-full bg-white border-b border-slate-100">
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-3.5 sm:gap-5 min-w-max justify-start md:justify-center">
          {/* 1. 'All' Button */}
          {(() => {
            const isAllActive = activeTab === 'all' || !activeTab;
            return (
              <button
                type="button"
                onClick={() => onTabChange('all', 'All')}
                className={`flex flex-col items-center gap-1.5 transition-all group min-h-[44px] ${
                  isAllActive ? 'scale-105' : 'opacity-85 hover:opacity-100'
                }`}
              >
                <div
                  className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all ${
                    isAllActive
                      ? 'bg-[#FFF1F4] border-2 border-[#FF2E7A] text-[#FF2E7A] shadow-2xs'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <CategoryNavIcon size={22} className={isAllActive ? 'text-[#FF2E7A]' : 'text-slate-700'} />
                </div>
                <span
                  className={`text-[11px] font-bold ${
                    isAllActive ? 'text-[#FF2E7A]' : 'text-slate-700'
                  }`}
                >
                  All
                </span>
              </button>
            );
          })()}

          {/* 2. Dynamic Categories with circular pastel image/icon containers */}
          {categories.map((cat, idx) => {
            const isAllActive = activeTab === 'all' || !activeTab;
            const isActive = !isAllActive && (activeTab === cat.slug || activeTab === cat.id);
            const themeStyle = pastelColors[idx % pastelColors.length];
            const hasImage = Boolean(cat.image && cat.image.trim());

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
                  className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center overflow-hidden transition-all border p-1 ${themeStyle.bg} ${
                    isActive
                      ? 'ring-2 ring-[#FF2E7A] shadow-2xs'
                      : 'hover:scale-105'
                  }`}
                >
                  {hasImage ? (
                    <UserImage
                      src={cat.image}
                      alt={cat.name}
                      className="w-full h-full object-contain rounded-full"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${themeStyle.text}`}>
                      {getIconByName(cat.iconName || cat.slug || cat.name)}
                    </div>
                  )}
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

          {/* 3. More Action -> Direct Navigation to /categories */}
          <button
            type="button"
            onClick={() => navigate('/categories')}
            className="flex flex-col items-center gap-1.5 opacity-85 hover:opacity-100 transition-all min-h-[44px]"
            title="Browse all categories"
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
