import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const CREAM = '#fbf6ec' // --cream in src/ui/theme.css

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // A separate registerSW.js file: the CSP forbids inline scripts.
      injectRegister: 'script',
      // Only the app's own built files are precached. No runtime caching, so
      // nothing from Supabase is ever stored by the service worker.
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [],
        // With a separate registerSW.js, autoUpdate does not set these itself.
        // Without them a new service worker waits until every window closes, so a
        // suspended home-screen app could keep serving an old build.
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'Bills',
        short_name: 'Bills',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: CREAM,
        theme_color: CREAM,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
