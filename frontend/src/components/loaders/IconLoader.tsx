import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLoading } from '../../context/LoadingContext';
import { useThemeContext } from '../../context/ThemeContext';
import './iconLoader.css';

interface IconLoaderProps {
  forceShow?: boolean;
}

const IconLoader: React.FC<IconLoaderProps> = ({ forceShow = false }) => {
  const { isRouteLoading } = useLoading();
  const show = isRouteLoading || forceShow;

  let currentTheme;
  try {
    const themeContext = useThemeContext();
    currentTheme = themeContext?.currentTheme;
  } catch (error) {
    // Fallback if the hook is somehow used outside the ThemeProvider
    // Defaulting to "all" theme colors implicitly by leaving variables unset.
  }

  const accentColor = currentTheme?.primary?.[0] || '#16a34a';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="global-loader-overlay"
          style={{
            '--loader-accent': accentColor,
          } as React.CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-label="Loading"
        >
          <div className="loader-container">
            <div className="simple-loader-card">
              <div className="simple-spinner" />
              <span className="loader-text">Loading</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IconLoader;
