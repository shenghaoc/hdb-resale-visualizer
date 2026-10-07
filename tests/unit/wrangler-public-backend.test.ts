// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

type WranglerConfig = {
  vars?: Record<string, string>;
  d1_databases?: { binding: string; database_id: string }[];
  hyperdrive?: { binding: string; id: string }[];
  compatibility_flags?: string[];
};

/** wrangler.jsonc is JSON with comments and trailing commas. */
function readWranglerConfig(): WranglerConfig {
  const text = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text) as WranglerConfig;
}

describe("deployed public-read backend configuration", () => {
  const config = readWranglerConfig();
  const backend = config.vars?.PUBLIC_DATA_BACKEND ?? "d1";

  it("selects exactly one known backend, and D1 unless Neon is fully wired", () => {
    expect(["d1", "neon"]).toContain(backend);
    if (backend === "neon") {
      const binding = config.hyperdrive?.find((entry) => entry.binding === "HDB_PUBLIC_NEON");
      expect(binding?.id).toMatch(/^[0-9a-f]{32}$/);
      expect(binding?.id).not.toBe("0".repeat(32));
    }
  });

  it("keeps the D1 binding that backs private shortlists and the rollback path", () => {
    const d1 = config.d1_databases?.find((entry) => entry.binding === "DB");
    expect(d1?.database_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses safe cache epochs so a switch or rollback can retire cached responses", () => {
    for (const name of ["D1_PUBLIC_CACHE_EPOCH", "NEON_PUBLIC_CACHE_EPOCH"] as const) {
      const epoch = config.vars?.[name];
      if (epoch !== undefined) expect(epoch).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    }
    if (backend === "neon") expect(config.vars?.NEON_PUBLIC_CACHE_EPOCH).toBeTruthy();
  });

  it("keeps the Node compatibility flag the pg transport needs", () => {
    expect(config.compatibility_flags).toContain("nodejs_compat");
  });
});
