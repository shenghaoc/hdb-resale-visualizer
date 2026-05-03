import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Vite 8: use tsconfig paths instead of manual alias duplication
    tsconfigPaths: true,
  },
  build: {
    chunkSizeWarningLimit: 1500,
    modulePreload: {
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
    // Forward browser console output to the terminal (useful for agent-driven debugging)
    forwardConsole: true,
  },
  preview: {
    port: 4173,
  },
});
