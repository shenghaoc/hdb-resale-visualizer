import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      manifest: false,
      includeAssets: [
        "favicon.ico",
        "og-card.png",
        "temporal-polyfill.js",
        "manifest.webmanifest",
        "icons/pwa-192.svg",
        "icons/pwa-512.svg",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/og\//],
        runtimeCaching: [
          {
            // Workbox RegExpRoute execs against url.href, so a `^/api/`-anchored
            // pattern never matches `https://host/api/...`. Match on pathname.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "hdb-api-get-v1",
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    // Vite 8: use tsconfig paths instead of manual alias duplication
    tsconfigPaths: true,
  },
  build: {
    chunkSizeWarningLimit: 1500,
    modulePreload: {
      // Keep heavy async chunks out of the entry preload graph; bundle check enforces gzip budgets on what remains.
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !/vendor-(?:maplibre|echarts)|(?:^|\/)(?:MapView|TrendChart)(?:-|\.)/.test(dep)),
    },
    // Vite 8: rolldownOptions replaces the deprecated rollupOptions
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/maplibre-gl/")) return "vendor-maplibre";
          if (id.includes("/node_modules/echarts/")) return "vendor-echarts";
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
