import React from 'react';
import { motion } from 'framer-motion';

const services = [
    { id: 1, name: 'Parcel Delivery', icon: '📦', bgColor: 'bg-rose-100', iconColor: 'text-rose-600' },
    { id: 2, name: 'Local Cab', icon: '🚕', bgColor: 'bg-orange-100', iconColor: 'text-orange-600' },
    { id: 3, name: 'Electrician', icon: '⚡', bgColor: 'bg-yellow-100', iconColor: 'text-yellow-600' },
    { id: 4, name: 'Plumber', icon: '💧', bgColor: 'bg-blue-100', iconColor: 'text-blue-600' },
    { id: 5, name: 'Deep Cleaning', icon: '✨', bgColor: 'bg-purple-100', iconColor: 'text-purple-600' },
    { id: 6, name: 'Laundry', icon: '👕', bgColor: 'bg-indigo-100', iconColor: 'text-indigo-600' },
    { id: 7, name: 'Lawyers', icon: '⚖️', bgColor: 'bg-slate-200', iconColor: 'text-slate-700' },
    { id: 8, name: 'Security', icon: '🛡️', bgColor: 'bg-red-100', iconColor: 'text-red-600' },
    { id: 9, name: 'Tutors', icon: '🎓', bgColor: 'bg-amber-100', iconColor: 'text-amber-700' },
];

export default function LocalSetu() {
    return (
        <div className="min-h-screen bg-gray-50 pb-24 relative overflow-hidden">
            {/* Header */}
            <div className="px-4 py-4 bg-white shadow-sm flex items-center justify-between sticky top-0 z-10">
                <h1 className="text-xl font-bold text-gray-800">Local SETU Services</h1>
            </div>

            {/* Main Grid */}
            <div className="p-4 grid grid-cols-3 gap-y-6 gap-x-4">
                {services.map((service, index) => (
                    <motion.div
                        key={service.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex flex-col items-center gap-2"
                    >
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-sm border border-black/5 ${service.bgColor} ${service.iconColor}`}>
                            <span className="drop-shadow-sm">{service.icon}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight max-w-[70px]">
                            {service.name}
                        </span>
                    </motion.div>
                ))}
            </div>

            {/* Coming Soon Overlay */}
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center p-6">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.3 }}
                    className="bg-white px-8 py-6 rounded-3xl shadow-2xl border border-rose-100 flex flex-col items-center text-center max-w-sm"
                >
                    <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4 text-rose-500 shadow-inner">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Coming Soon</h2>
                    <p className="text-gray-500 text-sm leading-relaxed mb-6 font-medium">
                        We are working hard to bring these amazing Hyper-Local services right to your doorstep. Stay tuned!
                    </p>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-[#FF8A3D] via-[#FF2E7A] to-[#FFC233]"
                            initial={{ width: "0%" }}
                            animate={{ width: "65%" }}
                            transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                        />
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
