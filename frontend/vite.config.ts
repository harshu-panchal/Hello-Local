import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { serveAssetsPlugin } from './vite-plugin-serve-assets'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Ensure React Fast Refresh works properly
      fastRefresh: true,
    }),
    serveAssetsPlugin()
  ],
  assetsInclude: ['**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.webp'],
  server: {
    fs: {
      strict: false,
    },
    middlewareMode: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@assets': path.resolve(__dirname, './assets'),
    },
    // Ensure single React instance
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Force include React and react-dom to ensure single instance
    include: ['react', 'react-dom', 'react-apexcharts', 'apexcharts'],
    // Exclude problematic packages if needed
    exclude: [],
  },
  build: {
    commonjsOptions: {
      // Ensure proper CommonJS handling
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    // Code splitting optimization
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }
            if (id.includes('framer-motion') || id.includes('gsap')) {
              return 'ui-vendor';
            }
            if (id.includes('apexcharts') || id.includes('react-apexcharts') || id.includes('recharts')) {
              return 'chart-vendor';
            }
            if (id.includes('leaflet') || id.includes('react-leaflet') || id.includes('@react-google-maps')) {
              return 'map-vendor';
            }
            return 'vendor';
          }
          if (id.includes('src/modules/admin')) {
            return 'admin-chunk';
          }
          if (id.includes('src/modules/seller')) {
            return 'seller-chunk';
          }
          if (id.includes('src/modules/delivery')) {
            return 'delivery-chunk';
          }
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional)
    sourcemap: false,
    // Minify with esbuild (built-in, faster than terser, no extra dependencies needed)
    minify: 'esbuild',
  },
})
