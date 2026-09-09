import { useNavigate } from 'react-router-dom';
import { TagOfferIcon, SparklesIcon, LoyaltyStarIcon, UsersGroupIcon } from './common/UserIcons';

export default function FeatureHighlightStrip() {
  const navigate = useNavigate();

  const features = [
    {
      title: 'Offers',
      subtitle: 'Best Deals',
      icon: <TagOfferIcon size={16} className="text-[#FF2E7A]" />,
      iconBg: 'bg-[#FFF1F4] border-[#FFE4EA]',
      route: '/order-again',
    },
    {
      title: 'Spin & Win',
      subtitle: 'Win Coins',
      icon: <SparklesIcon size={16} className="text-[#E11D48]" />,
      iconBg: 'bg-[#FFE4E6] border-[#FECDD3]',
      route: '/homemade',
    },
    {
      title: 'Loyalty',
      subtitle: 'Earn Coins',
      icon: <LoyaltyStarIcon size={16} className="text-[#D97706]" />,
      iconBg: 'bg-[#FEF3C7] border-[#FDE68A]',
      route: '/account',
    },
    {
      title: 'Cart with Friends',
      subtitle: 'Shop Together',
      icon: <UsersGroupIcon size={16} className="text-[#DB2777]" />,
      iconBg: 'bg-[#FCE7F3] border-[#FBCFE8]',
      route: '/cart',
    },
  ];

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-1 sm:py-2">
      <div className="bg-white p-2 sm:p-3 rounded-2xl border border-slate-200/70 shadow-2xs grid grid-cols-4 divide-x divide-slate-100">
        {features.map((f, idx) => (
          <button
            type="button"
            key={idx}
            onClick={() => navigate(f.route)}
            className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2.5 px-1 sm:px-3 py-1.5 hover:bg-slate-50 rounded-xl transition-all duration-200 text-center sm:text-left active:scale-95 group min-h-[44px]"
          >
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${f.iconBg} group-hover:scale-105 transition-transform duration-200 shadow-2xs`}
            >
              {f.icon}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] sm:text-xs font-black text-slate-900 leading-tight truncate group-hover:text-[#FF2E7A] transition-colors">
                {f.title}
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium leading-tight truncate">
                {f.subtitle}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
