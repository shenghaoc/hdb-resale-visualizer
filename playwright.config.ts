import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  reporter: [['html', { open: 'never' }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    storageState: "test-results/e2e-storage-state.json",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "webkit",
      use: { ...devices["Desktop WebKit"] },
    },
  ],
});
