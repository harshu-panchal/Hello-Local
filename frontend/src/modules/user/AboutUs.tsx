import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ClockIcon,
  StoreNavIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  PhoneCallIcon,
  ZapIcon,
} from './components/common/UserIcons';

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              About Hello Local
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-5 space-y-4">
        {/* Brand Mission Hero */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-8 shadow-2xs text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] shadow-xs">
            <ZapIcon size={28} />
          </div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-2xl font-bold tracking-tight text-[#FF8A00]">Hello</span>
            <span className="text-2xl font-bold tracking-tight text-[#FF2E7A]">Local</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
            Empowering neighborhood shopkeepers and delivering daily essentials to community doorsteps in 15 minutes.
          </p>
        </div>

        {/* Mission Statement */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-2xs space-y-1.5">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900">
            Our Mission
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            At Hello Local, we bridge the gap between traditional neighborhood stores and modern fast-delivery convenience. We empower local retailers with technology while offering customers hyper-fast, reliable, and transparent grocery delivery.
          </p>
        </div>

        {/* Platform Pillars */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs text-center">
            <div className="w-8 h-8 mx-auto mb-1 rounded-lg bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A]">
              <ClockIcon size={16} />
            </div>
            <span className="text-base font-bold text-slate-900 block">15 Mins</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Fast Delivery</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs text-center">
            <div className="w-8 h-8 mx-auto mb-1 rounded-lg bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A]">
              <StoreNavIcon size={16} />
            </div>
            <span className="text-base font-bold text-slate-900 block">100%</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Local Stores</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs text-center">
            <div className="w-8 h-8 mx-auto mb-1 rounded-lg bg-[#FFF1F4] flex items-center justify-center text-[#16A34A]">
              <ShieldCheckIcon size={16} />
            </div>
            <span className="text-base font-bold text-slate-900 block">Fresh</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Handpicked</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs text-center">
            <div className="w-8 h-8 mx-auto mb-1 rounded-lg bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A]">
              <CreditCardIcon size={16} />
            </div>
            <span className="text-base font-bold text-slate-900 block">Secure</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Easy Checkout</span>
          </div>
        </div>

        {/* Why Choose Hello Local */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-2xs space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900">
            Why Shop on Hello Local?
          </h3>

          <div className="space-y-2.5 divide-y divide-slate-100 text-xs">
            <div className="pt-2.5 first:pt-0 flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] font-bold text-[10px] flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Support Local Economy</h4>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  Every order directly supports neighborhood grocery merchants and local delivery partners.
                </p>
              </div>
            </div>

            <div className="pt-2.5 flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] font-bold text-[10px] flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Fair Pricing & Great Discounts</h4>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  Enjoy daily discount deals, super saver combos, and verified MRP discounts.
                </p>
              </div>
            </div>

            <div className="pt-2.5 flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] font-bold text-[10px] flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Zero Contact & OTP Verified</h4>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  Every delivery is secured with OTP verification to ensure your items reach safely.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Support Card */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-2xs text-center space-y-1.5">
          <div className="w-9 h-9 mx-auto rounded-xl bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A]">
            <PhoneCallIcon size={18} />
          </div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900">Need Help or Have Inquiries?</h3>
          <p className="text-xs text-slate-500 font-medium">
            Contact us at <strong className="text-slate-900">support@hellolocal.com</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
