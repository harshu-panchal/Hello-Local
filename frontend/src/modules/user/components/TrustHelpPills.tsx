import { TruckFastIcon, HeadsetIcon } from './common/UserIcons';

export default function TrustHelpPills() {
  const handleWhatsAppHelp = () => {
    window.open('https://wa.me/919876543210?text=Hi%20HelloLocal%20Support,%20I%20need%20help', '_blank');
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 mb-2">
      <div className="bg-[#FFF5F7] border border-[#FFE2E8] rounded-2xl p-3 sm:p-4 grid grid-cols-2 divide-x divide-[#FFE2E8]">
        {/* Fast Delivery */}
        <div className="flex items-center gap-2.5 sm:gap-4 pr-2 sm:pr-4">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white shadow-2xs flex items-center justify-center text-[#FF2E7A] flex-shrink-0 border border-[#FFE4EA]">
            <TruckFastIcon size={20} className="text-[#FF2E7A]" />
          </div>
          <div className="min-w-0">
            <h5 className="text-xs sm:text-base font-bold text-[#FF2E7A] truncate leading-tight">
              Fast Delivery
            </h5>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate leading-tight mt-0.5">
              On time, every time!
            </p>
          </div>
        </div>

        {/* Need Help? Chat with us */}
        <button
          type="button"
          onClick={handleWhatsAppHelp}
          className="flex items-center gap-2.5 sm:gap-4 pl-2 sm:pl-4 text-left hover:opacity-90 active:scale-98 transition-all min-h-[44px]"
        >
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white shadow-2xs flex items-center justify-center text-[#FF2E7A] flex-shrink-0 border border-[#FFE4EA]">
            <HeadsetIcon size={20} className="text-[#FF2E7A]" />
          </div>
          <div className="min-w-0">
            <h5 className="text-xs sm:text-base font-bold text-[#FF2E7A] truncate leading-tight">
              Need Help?
            </h5>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate leading-tight mt-0.5">
              Chat on WhatsApp
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
