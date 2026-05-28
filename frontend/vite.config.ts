import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Katta chunk xabardorlik chegarasini 700KB ga ko'taramiz
    // AdminPanel lazy load bilan asosiy bundle kichrayadi
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      output: {
        // Vendor chunklarini alohida faylga ajratamiz (browser caching uchun yaxshi)
        manualChunks(id: string) {
          // React ekotizimi
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react';
          }
          // Tanstack Query
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-query';
          }
          // Zustand
          if (id.includes('node_modules/zustand')) {
            return 'vendor-zustand';
          }
          // Axios
          if (id.includes('node_modules/axios')) {
            return 'vendor-axios';
          }
        },
      },
    },
  },
})
