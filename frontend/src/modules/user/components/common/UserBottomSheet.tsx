import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBodyScrollLock } from '../../../../hooks/useBodyScrollLock';
import { CloseIcon } from './UserIcons';

export interface UserBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string;
}

export const UserBottomSheet: React.FC<UserBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxHeight = '85dvh',
}) => {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />

          {/* Slide-Up Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
            style={{ maxHeight }}
            className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-2xl border-t border-slate-100 overflow-hidden z-10 flex flex-col"
          >
            {/* Grab Handle */}
            <div className="w-full flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <div className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  {title}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Close sheet"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
            )}

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 user-safe-bottom">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
