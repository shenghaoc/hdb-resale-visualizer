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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-maplibre": ["maplibre-gl"],
          "vendor-echarts": ["echarts", "echarts-for-react"],
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
