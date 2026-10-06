import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // `pnpm dev:mobile` serves HTTPS on the LAN: Safari only exposes WebGPU in a
    // secure context, and plain http://<lan-ip> is not one.
    ...(mode === 'mobile' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Thiên Cơ Kỷ',
        short_name: 'Thiên Cơ Kỷ',
        description: 'RPG 2.5D semi-mini: Robot · Tu tiên · Võ hiệp',
        lang: 'vi',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#1b2430',
        theme_color: '#1b2430',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache only the app shell (tech plan §19). Game content is cached at runtime.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        globIgnores: ['assets/**', '**/*.navmesh.*'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Hashed asset files never change: cache first, keep a bounded number.
            urlPattern: ({ url }) => /\/assets\/.+\.[0-9a-f]{10}\.(glb|js)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-assets',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 60,
                purgeOnQuotaError: true,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.navmesh.bin'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-nav',
              expiration: { maxEntries: 50, purgeOnQuotaError: true },
            },
          },
          {
            // The manifest points at the current hashes; prefer fresh, fall back offline.
            urlPattern: ({ url }) => url.pathname.endsWith('assets.manifest.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'game-manifest', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  server: {
    port: 5173,
    // game-data/ lives at the repo root and is imported via import.meta.glob.
    fs: { allow: [repoRoot] },
  },
  build: {
    target: 'es2022',
    // App code goes to static/; assets/ is reserved for hashed game content.
    assetsDir: 'static',
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      output: {
        // Engine and UI libraries change rarely: separate chunks stay cached across game updates.
        codeSplitting: {
          groups: [
            { name: 'babylon', test: /node_modules[/]\.pnpm[/]@babylonjs/ },
            {
              name: 'recast',
              test: /node_modules[/]\.pnpm[/]@?recast-navigation/,
            },
            {
              name: 'react',
              test: /node_modules[/]\.pnpm[/](react|react-dom|scheduler|zustand)@/,
            },
          ],
        },
      },
    },
  },
}));
