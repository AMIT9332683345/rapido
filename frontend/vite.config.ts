import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'push-sw.js', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Amit — Bike taxi for Gosaba',
        short_name: 'Amit',
        description:
          'Book a verified bike taxi in Chhoto Mollakhali, Gosaba and track your rider live.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f3e8',
        theme_color: '#08211f',
        categories: ['travel', 'navigation'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Book a ride', short_name: 'Book', url: '/app' },
          { name: 'Rider hub', short_name: 'Rider', url: '/rider' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        cleanupOutdatedCaches: true,
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.endsWith('openfreemap.org') ||
              url.hostname.endsWith('openstreetmap.org'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'amit-map-tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
});
