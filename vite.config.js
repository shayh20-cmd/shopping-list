import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH is set by the GitHub Pages workflow (e.g. /shopping-list/).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      // The marketing page is its own page, never the app shell.
      workbox: { navigateFallbackDenylist: [/welcome\.html$/] },
      manifest: {
        name: 'BASKET',
        short_name: 'BASKET',
        lang: 'he',
        dir: 'rtl',
        display: 'standalone',
        background_color: '#D97757',
        theme_color: '#F5F3EE',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
