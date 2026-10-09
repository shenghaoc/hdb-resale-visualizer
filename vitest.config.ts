import path from "node:path";
import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";

/**
 * Tests that import the Neon pilot's private scratch state (`.neon-benchmark/`, git-ignored: it holds role
 * credentials and private inputs, so the recovery snapshot (commit b80446400, docs/recovery/neon-publisher/README.md)
 * records it as deliberately not recovered). Without those files they cannot even be collected, so the default
 * run leaves them out; set `NEON_PRIVATE_PILOT=1` to include them where the scratch state exists.
 */
const NEEDS_PRIVATE_PILOT_STATE = ["tests/unit/neon-pilot-entrypoint.test.ts"];

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
      ...(process.env.NEON_PRIVATE_PILOT ? [] : NEEDS_PRIVATE_PILOT_STATE),
    ],
    // JUnit XML is emitted alongside the default reporter in CI so that
    // any GitHub Actions test reporter (e.g. dorny/test-reporter) can
    // surface failures inline on the PR.
    reporters: process.env.CI && process.env.CI !== "false" ? ["default", "junit"] : ["default"],
    outputFile:
      process.env.CI && process.env.CI !== "false"
        ? { junit: "test-results/junit-node.xml" }
        : undefined,
    browser: {
      enabled: false,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
