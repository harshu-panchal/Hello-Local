import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  TruckIcon,
  SparklesIcon,
  ShieldCheckIcon,
  PackageIcon,
  ZapIcon,
  DropletIcon,
  WrenchIcon,
  ScaleIcon,
  AcademicCapIcon,
} from './components/common/UserIcons';

const services = [
  { id: 1, name: 'Parcel Delivery', icon: <TruckIcon size={22} className="text-[#FF2E7A]" />, bgColor: 'bg-[#FFF1F4]' },
  { id: 2, name: 'Local Cab', icon: <PackageIcon size={22} className="text-[#FF8A00]" />, bgColor: 'bg-orange-50' },
  { id: 3, name: 'Electrician', icon: <ZapIcon size={22} className="text-amber-600" />, bgColor: 'bg-amber-50' },
  { id: 4, name: 'Plumber', icon: <DropletIcon size={22} className="text-blue-600" />, bgColor: 'bg-blue-50' },
  { id: 5, name: 'Deep Cleaning', icon: <SparklesIcon size={22} className="text-purple-600" />, bgColor: 'bg-purple-50' },
  { id: 6, name: 'Laundry', icon: <WrenchIcon size={22} className="text-indigo-600" />, bgColor: 'bg-indigo-50' },
  { id: 7, name: 'Legal Advice', icon: <ScaleIcon size={22} className="text-slate-700" />, bgColor: 'bg-slate-100' },
  { id: 8, name: 'Security', icon: <ShieldCheckIcon size={22} className="text-[#16A34A]" />, bgColor: 'bg-emerald-50' },
  { id: 9, name: 'Home Tutors', icon: <AcademicCapIcon size={22} className="text-rose-600" />, bgColor: 'bg-rose-50' },
];

export default function LocalSetu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 relative overflow-hidden">
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
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Local SETU Services
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                On-demand verified local service professionals
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Services Grid (Background preview) */}
      <div className="max-w-[1440px] mx-auto p-3.5 sm:p-6 lg:px-8 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3.5">
        {services.map((service, index) => (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="bg-white rounded-2xl border border-slate-100 p-3 shadow-2xs flex flex-col items-center gap-1.5 text-center"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border border-slate-100 ${service.bgColor}`}>
              {service.icon}
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight line-clamp-2">
              {service.name}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Coming Soon Overlay Card */}
      <div className="absolute inset-0 top-12 bg-slate-950/20 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.1 }}
          className="bg-white px-5 sm:px-7 py-6 rounded-2xl shadow-xl border border-slate-100 flex flex-col items-center text-center max-w-sm"
        >
          <div className="w-14 h-14 bg-[#FFF1F4] border border-[#FFE4EA] rounded-full flex items-center justify-center mb-3 text-[#FF2E7A] shadow-xs">
            <SparklesIcon size={26} />
          </div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-lg font-bold tracking-tight text-[#FF8A00]">Hello</span>
            <span className="text-lg font-bold tracking-tight text-[#FF2E7A]">Local</span>
            <span className="text-sm font-bold text-slate-400 ml-1">SETU</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1">Coming Soon</h2>
          <p className="text-slate-500 text-xs leading-relaxed mb-4 font-medium">
            We are onboarding verified neighborhood technicians, helpers, and local service providers. This service will unlock soon in your area.
          </p>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-5">
            <motion.div
              className="h-full bg-[#FF2E7A]"
              initial={{ width: "0%" }}
              animate={{ width: "70%" }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            />
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full min-h-[44px] bg-[#FF2E7A] hover:bg-[#E02269] text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-xs transition-opacity flex items-center justify-center"
          >
            Back to Shopping
          </button>
        </motion.div>
      </div>
    </div>
  );
}
