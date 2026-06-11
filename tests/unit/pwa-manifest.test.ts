import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const manifestPath = join(process.cwd(), "public/manifest.webmanifest");

describe("PWA manifest", () => {
  it("is valid JSON with install-required fields", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      icons?: { src: string; sizes: string; purpose?: string }[];
    };

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons?.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons?.some((icon) => icon.sizes === "512x512")).toBe(true);
    // Lighthouse's installability audit requires a maskable icon.
    expect(manifest.icons?.some((icon) => icon.purpose?.includes("maskable"))).toBe(true);
  });
});
