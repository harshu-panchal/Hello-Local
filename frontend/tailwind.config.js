/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Safelist grid column classes for dynamic sections
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'grid-cols-6',
    'grid-cols-8',
    'md:grid-cols-2',
    'md:grid-cols-3',
    'md:grid-cols-4',
    'md:grid-cols-6',
    'md:grid-cols-8',
    'lg:grid-cols-2',
    'lg:grid-cols-3',
    'lg:grid-cols-4',
    'lg:grid-cols-6',
    'lg:grid-cols-8',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FFC94A',
          dark: '#FFB020',
        },
        cream: '#FFF7E0',
        hl: {
          coral: '#FF5364',
          'coral-hover': '#E84354',
          'pink-bg': '#FFF0F3',
          'pink-light': '#FFE8EC',
          purple: '#4F39F6',
          'purple-dark': '#2D1B69',
          'purple-deep': '#1F104F',
          'purple-light': '#F5F3FF',
          green: '#10B981',
          'green-light': '#EAFBF3',
          gold: '#FFAE1A',
          'gold-light': '#FFF8EB',
          dark: '#1E1E2D',
          muted: '#6B7280',
        },
      },
      boxShadow: {
        'hl-card': '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
        'hl-elevated': '0 10px 25px -3px rgba(255, 83, 100, 0.25)',
        'hl-purple': '0 10px 25px -3px rgba(79, 57, 246, 0.25)',
      },
      fontFamily: {
        // 'Outfit' lacks the ₹ (U+20B9) glyph — fall back to fonts that have it
        // so the Rupee sign never renders as "?" on devices/webviews.
        sans: ['Outfit', 'Segoe UI', 'Roboto', 'Noto Sans', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
