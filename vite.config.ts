import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Hal Defteri',
        short_name: 'Hal Defteri',
        description: 'Hal komisyoncuları için çevrimdışı çalışan satış, stok ve cari takip',
        lang: 'tr',
        theme_color: '#1f6f43',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
})
