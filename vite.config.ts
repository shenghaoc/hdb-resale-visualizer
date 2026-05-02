import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !/vendor-(?:maplibre|echarts)|(?:^|\/)(?:MapView|TrendChart)(?:-|\.)/.test(dep)),
    },
    rollupOptions: {
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
