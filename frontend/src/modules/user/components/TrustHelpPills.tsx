import { TruckFastIcon, HeadsetIcon } from './common/UserIcons';

export default function TrustHelpPills() {
  const handleWhatsAppHelp = () => {
    window.open('https://wa.me/919876543210?text=Hi%20HelloLocal%20Support,%20I%20need%20help', '_blank');
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-2 mb-1">
      <div className="bg-gradient-to-r from-[#FFF1F4]/70 via-white to-[#FFF7ED]/70 border border-[#FFE4EA] rounded-2xl p-2.5 sm:p-3.5 grid grid-cols-2 divide-x divide-[#FFE4EA] shadow-2xs">
        {/* Fast Delivery */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 pr-2 sm:pr-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-2xs flex items-center justify-center text-[#FF2E7A] flex-shrink-0 border border-[#FFE4EA]">
            <TruckFastIcon size={19} className="text-[#FF2E7A]" />
          </div>
          <div className="min-w-0">
            <h5 className="text-xs sm:text-sm font-black text-slate-900 truncate leading-tight">
              Fast Delivery
            </h5>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate leading-tight mt-0.5">
              Fresh & on time, every time
            </p>
          </div>
        </div>

        {/* Need Help? Chat with us */}
        <button
          type="button"
          onClick={handleWhatsAppHelp}
          className="flex items-center gap-2.5 sm:gap-3.5 pl-2.5 sm:pl-4 text-left hover:opacity-95 active:scale-[0.98] transition-all min-h-[44px] group"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-2xs flex items-center justify-center text-[#16A34A] flex-shrink-0 border border-emerald-100 group-hover:scale-105 transition-transform">
            <HeadsetIcon size={19} className="text-[#16A34A]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h5 className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-[#16A34A] transition-colors truncate leading-tight">
                Need Help?
              </h5>
              <span className="hidden sm:inline-block text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200">
                Online
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate leading-tight mt-0.5">
              Chat on WhatsApp
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
