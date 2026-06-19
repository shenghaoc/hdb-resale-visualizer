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
      // will silently exclude these files — use `vp run test:browser` instead.
      ...(process.env.VITEST_BROWSER ? [] : ["tests/browser/**"]),
    ],
    // JUnit XML is emitted alongside the default reporter in CI so that
    // any GitHub Actions test reporter (e.g. dorny/test-reporter) can
    // surface failures inline on the PR.
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: process.env.CI ? { junit: "test-results/junit-node.xml" } : undefined,
    browser: {
      enabled: false,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
