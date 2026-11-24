import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Burgen-Erfassung',
        short_name: 'Burgen',
        description: 'Burgen erfassen – im Feld und am PC',
        lang: 'de',
        theme_color: '#7a2e1d',
        background_color: '#f6f1e9',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [
          {
            // Kartenkacheln für die Arbeit im Feld zwischenspeichern
            urlPattern: /^https:\/\/(tile\.openstreetmap\.org|[abc]\.tile\.opentopomap\.org|server\.arcgisonline\.com)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'kartenkacheln',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
