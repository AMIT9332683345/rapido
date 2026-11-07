import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import brand from '../brand.json';

const root = fileURLToPath(new URL('.', import.meta.url));

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

function branding(appName: string): Plugin {
  const description = `${appName} is a local bike taxi for Chhoto Mollakhali, Gosaba. Book a verified rider in seconds and track the ride live.`;
  const assets = [
    {
      name: 'favicon.svg',
      type: 'image/svg+xml',
      source: readFileSync(resolve(root, 'public/favicon.svg'), 'utf8').replace(
        '__APP_NAME__',
        () => escapeHtml(appName),
      ),
    },
    {
      name: 'push-sw.js',
      type: 'application/javascript',
      source: readFileSync(resolve(root, 'public/push-sw.js'), 'utf8').replace(
        "const NOTIFICATION_TITLE = 'Ride update';",
        () => `const NOTIFICATION_TITLE = ${JSON.stringify(appName)};`,
      ),
    },
  ];

  return {
    name: 'app-branding',
    transformIndexHtml(html) {
      return html
        .replaceAll('__APP_NAME__', () => escapeHtml(appName))
        .replaceAll('__APP_DESCRIPTION__', () => escapeHtml(description));
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = assets.find((item) => `/${item.name}` === request.url?.split('?')[0]);
        if (!asset) return next();
        response.setHeader('Content-Type', asset.type);
        response.end(asset.source);
      });
    },
    // Update copied public assets before Workbox generates its precache in closeBundle.
    writeBundle(output) {
      for (const asset of assets) {
        writeFileSync(resolve(output.dir || resolve(root, 'dist'), asset.name), asset.source);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  const appName = env.VITE_APP_NAME?.trim() || brand.name;

  return {
    plugins: [
      branding(appName),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'push-sw.js', 'icons/apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: `${appName} — Bike taxi for Gosaba`,
          short_name: appName,
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
  };
});
