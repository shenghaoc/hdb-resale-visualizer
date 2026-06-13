import path from "node:path";
import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
    exclude: [
      "**/node_modules/**",
      "**/*.e2e.*",
      "tests/e2e/**",
      "dist/**",
      "dev-dist/**",
      "playwright-report/**",
      "test-results/**",
      // Exclude browser tests from the default jsdom run. The test:browser
      // script sets VITEST_BROWSER=1 to skip this exclusion. Running vitest
      // directly without this env var (e.g. `vp test run tests/browser/…`)
      // will silently exclude these files — use `pnpm test:browser` instead.
      ...(process.env.VITEST_BROWSER ? [] : ["tests/browser/**"]),
    ],
    browser: {
      enabled: false,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
