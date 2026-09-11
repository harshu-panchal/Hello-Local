import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({
  message,
  type = 'success',
  isVisible,
  onClose,
  duration,
}: ToastProps) {
  // Default durations: 4500ms for errors to ensure readability, 3000ms for success
  const effectiveDuration = duration ?? (type === 'error' ? 4500 : 3000);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, effectiveDuration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, effectiveDuration, onClose]);

  const typeConfig = {
    success: {
      bg: 'bg-emerald-600 border-emerald-500/40 text-white',
      badge: 'bg-emerald-700/80 text-emerald-100',
      title: 'Success',
      icon: (
        <svg className="w-5 h-5 text-white shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    error: {
      bg: 'bg-rose-600 border-rose-500/40 text-white',
      badge: 'bg-rose-700/80 text-rose-100',
      title: 'Error',
      icon: (
        <svg className="w-5 h-5 text-white shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 7.5h.008v.008H12v-.008z" />
        </svg>
      ),
    },
    info: {
      bg: 'bg-blue-600 border-blue-500/40 text-white',
      badge: 'bg-blue-700/80 text-blue-100',
      title: 'Note',
      icon: (
        <svg className="w-5 h-5 text-white shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  }[type];

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed top-6 right-0 left-0 sm:left-auto sm:right-6 z-[9999] flex justify-center sm:justify-end px-4 sm:px-0 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: -25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -25, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`pointer-events-auto max-w-md w-full rounded-2xl border shadow-2xl p-4 flex items-start gap-3 backdrop-blur-md ${typeConfig.bg}`}
          >
            {typeConfig.icon}
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${typeConfig.badge}`}>
                  {typeConfig.title}
                </span>
              </div>
              <p className="text-sm font-medium leading-snug break-words max-h-36 overflow-y-auto">
                {message}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded-lg hover:bg-white/10 shrink-0"
              aria-label="Close notification"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}



