import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the production build (vite preview), not the dev server.
 * Safari/WebKit bugs such as missing Temporal only appear after bundling when
 * module evaluation order differs from Vite dev. Do not point these tests at
 * `npm run dev` or reuse a dev server on this port.
 *
 * CI sets E2E_DIST_PREBUILT=1 when a pre-built dist/ artifact has already been
 * downloaded; in that case the webServer skips setup:fixtures + build and just
 * starts vite preview directly.
 */
const E2E_HOST = "127.0.0.1";
const E2E_PORT = 4173;
const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;

const prebuilt = process.env.E2E_DIST_PREBUILT === "1" || process.env.E2E_DIST_PREBUILT === "true";

export default defineConfig({
  reporter: [["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : "75%",
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: E2E_BASE_URL,
    storageState: "test-results/e2e-storage-state.json",
    trace: "retain-on-failure",
  },
  webServer: {
    command: prebuilt
      ? `npm run preview -- --host ${E2E_HOST} --port ${E2E_PORT}`
      : `npm run setup:fixtures && npm run build && npm run preview -- --host ${E2E_HOST} --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    // No build step when dist is pre-built; plain preview starts in seconds.
    timeout: prebuilt ? 30_000 : 180_000,
  },
  projects: [
    {
      name: "webkit",
      use: { ...devices["Desktop WebKit"] },
      testIgnore: /production-bootstrap\.spec\.ts/,
    },
    {
      name: "webkit-mobile",
      use: {
        ...devices["iPhone 14"],
      },
      testMatch: /production-bootstrap\.spec\.ts|mobile-regression\.spec\.ts/,
    },
  ],
});
