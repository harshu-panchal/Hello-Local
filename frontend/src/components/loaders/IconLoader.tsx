import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLoading } from '../../context/LoadingContext';
import { useThemeContext } from '../../context/ThemeContext';
import './iconLoader.css';

interface IconLoaderProps {
  forceShow?: boolean;
  isLoading?: boolean;
}

// category items SVGs
const items = [
  {
    id: 'fruit',
    icon: (
      <svg className="w-6 h-6 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    )
  },
  {
    id: 'veg',
    icon: (
      <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20a7 7 0 0 1-7-7c0-2.5 2-4.5 4.5-4.5 1.5 0 2.5.5 3.5 1.5.5-1.5 2-2.5 3.5-2.5 2.5 0 4.5 2 4.5 4.5 0 2.5-2 4.5-4.5 4.5-.5 0-1 0-1.5-.5-1 1-2 1.5-3.5 1.5z" />
        <path d="M12 13V5" />
        <path d="M12 5l-2 2" />
        <path d="M12 5l2 2" />
      </svg>
    )
  },
  {
    id: 'electronics',
    icon: (
      <svg className="w-6 h-6 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    )
  },
  {
    id: 'veg-food',
    icon: (
      <svg className="w-6 h-6 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 11l-5 5" />
        <path d="M4.3 14a8.5 8.5 0 0 0 11.7 0" />
        <path d="M4.3 14l5.7-9.3 5.7 9.3" />
        <circle cx="11" cy="11" r="1" />
      </svg>
    )
  },
  {
    id: 'non-veg-food',
    icon: (
      <svg className="w-6 h-6 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6a6 6 0 0 0-12 0c0 4.42 3 8 3 8l3 4 3-4s3-3.58 3-8Z" />
        <path d="M17 10h.01" />
        <path d="M15 13h.01" />
        <path d="M13 10h.01" />
      </svg>
    )
  }
];

const IconLoader: React.FC<IconLoaderProps> = ({ forceShow = false, isLoading = false }) => {
  const { isRouteLoading, isLoading: contextIsLoading } = useLoading();
  const show = isRouteLoading || contextIsLoading || forceShow || isLoading;

  let currentTheme;
  try {
    const themeContext = useThemeContext();
    currentTheme = themeContext?.currentTheme;
  } catch (error) {
    // Fallback
  }

  const accentColor = currentTheme?.primary?.[0] || '#16a34a';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="modern-loader-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          role="status"
          aria-label="Loading"
        >
          <div className="modern-loader-container">
            {/* Background Glow */}
            <div className="loader-glow" style={{ backgroundColor: accentColor }} />
            
            <div className="bucket-wrapper">
              {/* Floating Items */}
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  className="floating-item"
                  initial={{ opacity: 0, y: 20, scale: 0.5, rotate: 0 }}
                  animate={{ 
                    opacity: [0, 1, 1, 0],
                    y: [20, -100, -120, -140],
                    scale: [0.5, 1, 1, 0.8],
                    rotate: [0, 15, -15, 0],
                    x: [0, (index % 2 === 0 ? 30 : -30), (index % 2 === 0 ? 40 : -40), 0]
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: index * 0.6,
                    ease: "easeInOut"
                  }}
                >
                  {item.icon}
                </motion.div>
              ))}

              {/* Bucket Icon */}
              <motion.div 
                className="bucket-icon"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  opacity: 1,
                  y: [0, -8, 0] 
                }}
                transition={{
                  scale: { duration: 0.5, ease: "backOut" },
                  y: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                }}
              >
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6V20C3 20.5304 3.21071 21.0391 3.58579 21.4142C3.96086 21.7893 4.46957 22 5 22H19C19.5304 22 20.0391 21.7893 20.4142 21.4142C20.7893 21.0391 21 20.5304 21 20V6L18 2H6Z" />
                  <path d="M3 6H21" />
                  <path d="M16 10C16 11.0609 15.5786 12.0783 14.8284 12.8284C14.0783 13.5786 13.0609 14 12 14C10.9391 14 9.92172 13.5786 9.17157 12.8284C8.42143 12.0783 8 11.0609 8 10" />
                </svg>
              </motion.div>
            </div>

            <motion.div 
              className="loading-text-container"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <p className="loading-sub-text">india's smart hyperlocal marketplace</p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IconLoader;
