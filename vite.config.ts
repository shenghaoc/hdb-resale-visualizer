import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

function normalizeModuleId(id: string) {
  return id.replaceAll("\\", "/");
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: (id) => {
                const moduleId = normalizeModuleId(id);
                return moduleId.includes("node_modules/react/") || moduleId.includes("node_modules/react-dom/");
              },
            },
            {
              name: "vendor-maplibre",
              test: (id) => normalizeModuleId(id).includes("node_modules/maplibre-gl/"),
            },
            {
              name: "vendor-echarts",
              test: (id) => {
                const moduleId = normalizeModuleId(id);
                return (
                  moduleId.includes("node_modules/echarts/") ||
                  moduleId.includes("node_modules/echarts-for-react/") ||
                  moduleId.includes("node_modules/zrender/")
                );
              },
            },
          ],
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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
