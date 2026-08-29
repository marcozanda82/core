import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** JSON alimentari multi-MB: esclusi dal precache (runtime cache Sprint 2). */
const PWA_GLOB_IGNORES = [
  '**/kentu_*.json',
  '**/crea_*.json',
  '**/*_master_db.json',
  '**/*_master_usda.json',
  '**/*_master_usda_FINAL.json',
  '**/*.mp4',
  '**/*.png',
  '**/*.webp',
  '**/*.jpg',
  '**/*.jpeg',
];

/** Cache on-demand per DB alimentari (StaleWhileRevalidate). */
const FOOD_DB_RUNTIME_CACHING = {
  urlPattern: ({ url }) => /\/(kentu_|crea_).*\.json$/i.test(url.pathname),
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'kentu-food-databases-v2-final',
    expiration: {
      maxEntries: 12,
      maxAgeSeconds: 60 * 60 * 24 * 30,
    },
    cacheableResponse: {
      statuses: [0, 200],
    },
  },
};

/** Video mascotte / McDrive — CacheFirst dopo primo fetch. */
const VIDEO_RUNTIME_CACHING = {
  urlPattern: ({ request, url }) => (
    request.destination === 'video' || /\.mp4$/i.test(url.pathname)
  ),
  handler: 'CacheFirst',
  options: {
    cacheName: 'kentu-media-videos',
    expiration: {
      maxEntries: 40,
      maxAgeSeconds: 60 * 60 * 24 * 90,
    },
    cacheableResponse: {
      statuses: [0, 200],
    },
    rangeRequests: true,
  },
};

/** PNG/WebP mascotte — on-demand, no precache. */
const MASCOT_IMAGE_RUNTIME_CACHING = {
  urlPattern: ({ url }) => (
    /\.(png|webp|jpe?g)$/i.test(url.pathname)
    && !/(icon|favicon|emblema)/i.test(url.pathname)
  ),
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'kentu-media-images',
    expiration: {
      maxEntries: 80,
      maxAgeSeconds: 60 * 60 * 24 * 30,
    },
    cacheableResponse: {
      statuses: [0, 200],
    },
  },
};

/**
 * Vendor split — riduce il main chunk e posticipa PDF/charts fino al lazy route.
 * @param {string} id
 */
function resolveManualChunk(id) {
  if (!id.includes('node_modules')) return undefined;

  if (id.includes('firebase')) return 'firebase-chunk';
  if (
    id.includes('recharts')
    || id.includes('chart.js')
    || id.includes('/d3-')
  ) {
    return 'charts-chunk';
  }
  if (
    id.includes('html2pdf')
    || id.includes('jspdf')
    || id.includes('html2canvas')
  ) {
    return 'pdf-chunk';
  }
  if (id.includes('framer-motion')) return 'ui-chunk';

  return undefined;
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      injectRegister: 'auto',
      includeAssets: [
        'EmblemaKbianca.png',
        'nuova icon_fixed_192.png',
        'nuova icon_fixed_512.png',
        'icon_512.svg',
      ],
      manifest: false,
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,svg,woff,woff2,ttf,eot}',
        ],
        globIgnores: PWA_GLOB_IGNORES,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          FOOD_DB_RUNTIME_CACHING,
          VIDEO_RUNTIME_CACHING,
          MASCOT_IMAGE_RUNTIME_CACHING,
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'expo-image-picker': path.resolve(__dirname, 'src/platform/stubs/expoImagePicker.stub.js'),
      'expo-file-system': path.resolve(__dirname, 'src/platform/stubs/expoFileSystem.stub.js'),
    },
  },
});
