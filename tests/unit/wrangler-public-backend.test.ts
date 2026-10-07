// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vite-plus/test";
import { createPublicReadScope, type PublicReadTransport } from "../../worker/public-read-backend";

type WranglerConfig = {
  vars?: Record<string, string>;
  d1_databases?: { binding: string; database_id: string }[];
  hyperdrive?: { binding: string; id: string; localConnectionString?: string }[];
  compatibility_flags?: string[];
};

const WRANGLER_CONFIG = new URL("../../wrangler.jsonc", import.meta.url);

/** A D1 binding that records every statement the public reads prepare on it. */
function recordingD1() {
  const d1Reads: string[] = [];
  const d1 = {
    prepare: (sql: string) => {
      d1Reads.push(sql);
      return { first: async () => null };
    },
  } as unknown as D1Database;
  return { d1, d1Reads };
}

/** wrangler.jsonc is JSON with comments and trailing commas. */
function readWranglerConfig(): WranglerConfig {
  const text = readFileSync(WRANGLER_CONFIG, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text) as WranglerConfig;
}

const devFunctionsScript = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts["dev:functions"];

describe("deployed public-read backend configuration", () => {
  const config = readWranglerConfig();
  const backend = config.vars?.PUBLIC_DATA_BACKEND ?? "d1";
  const binding = config.hyperdrive?.find((entry) => entry.binding === "HDB_PUBLIC_NEON");

  it("selects exactly one known backend", () => {
    expect(["d1", "neon"]).toContain(backend);
  });

  // Whichever backend is selected: a switch to Neon, or a rollback by configuration and back, only changes
  // variables, so the binding has to be in the committed file at all times.
  it("always declares the Hyperdrive binding, so switching is a variable change", () => {
    expect(binding?.id).toMatch(/^[0-9a-f]{32}$/);
    expect(binding?.id).not.toBe("0".repeat(32));
  });

  it("keeps the D1 binding that backs private shortlists and the rollback path", () => {
    const d1 = config.d1_databases?.find((entry) => entry.binding === "DB");
    expect(d1?.database_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses safe cache epochs so a switch or rollback can retire cached responses", () => {
    // Both must be present: a switch bumps the Neon epoch and a rollback by configuration bumps the D1 one.
    for (const name of ["D1_PUBLIC_CACHE_EPOCH", "NEON_PUBLIC_CACHE_EPOCH"] as const)
      expect(config.vars?.[name]).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
  });

  it("keeps the Node compatibility flag the pg transport needs", () => {
    expect(config.compatibility_flags).toContain("nodejs_compat");
  });

  // The documented switch and the rollback by configuration only change the selector (plus an epoch);
  // every other var and the Hyperdrive binding must already be in the committed file and work as shipped.
  it.each(["neon", "d1"] as const)(
    "completes the switch path from the committed vars and binding: %s",
    async (selected) => {
      const { d1, d1Reads } = recordingD1();
      const hyperdrive = { connectionString: "postgresql://never-used" } as unknown as Hyperdrive;
      const neonQuery = vi.fn(async () => []);
      const factory = vi.fn((): PublicReadTransport => ({
        query: neonQuery,
        snapshot: (respond) => respond(),
        close: async () => {},
      }));
      const scope = createPublicReadScope(
        {
          ...config.vars,
          PUBLIC_DATA_BACKEND: selected,
          DB: d1,
          HDB_PUBLIC_NEON: hyperdrive,
        } as unknown as Env,
        factory,
      );
      expect(scope.backend).toBe(selected);
      await scope.data.manifestJson();
      if (selected === "neon") {
        // The Worker receives the binding the config declares and namespaces its cache by the configured epoch.
        expect(factory).toHaveBeenCalledWith(hyperdrive);
        expect(scope.namespace).toBe(`neon-${config.vars?.NEON_PUBLIC_CACHE_EPOCH}`);
        expect(neonQuery).toHaveBeenCalledOnce();
        expect(d1Reads).toEqual([]);
      } else {
        expect(factory).not.toHaveBeenCalled();
        expect(scope.namespace).toBe(`d1-${config.vars?.D1_PUBLIC_CACHE_EPOCH}`);
        expect(d1Reads).toHaveLength(1);
      }
    },
  );

  it("is wired for the backend it selects, so the committed file works as deployed", () => {
    const factory = vi.fn((): PublicReadTransport => ({
      query: async () => [],
      snapshot: (respond) => respond(),
      close: async () => {},
    }));
    // The committed binding itself, not a stand-in: if the file lost it, Neon would fail every public read.
    const scope = createPublicReadScope(
      {
        ...config.vars,
        DB: {} as D1Database,
        HDB_PUBLIC_NEON: binding as unknown as Hyperdrive,
      } as unknown as Env,
      factory,
    );
    expect(scope.backend).toBe(backend);
  });
});

describe("local development with the committed configuration", () => {
  const config = readWranglerConfig();
  const binding = config.hyperdrive?.find((entry) => entry.binding === "HDB_PUBLIC_NEON");

  // `wrangler dev` aborts at startup ("When developing locally, you should use a local Postgres connection
  // string to emulate Hyperdrive functionality") when a Hyperdrive binding has none. This is Wrangler's own
  // option builder, so it fails the same way `vp run dev:functions` would.
  it("is accepted by Wrangler for local development", async () => {
    const { unstable_getMiniflareWorkerOptions } = await import("wrangler");
    const { workerOptions } = unstable_getMiniflareWorkerOptions(fileURLToPath(WRANGLER_CONFIG));
    expect(Object.keys((workerOptions as { hyperdrives?: object }).hyperdrives ?? {})).toContain(
      "HDB_PUBLIC_NEON",
    );
  }, 30_000);

  it("uses a placeholder connection string that is local, fixed and not a real credential", () => {
    expect(binding?.localConnectionString).toBeTruthy();
    const url = new URL(binding?.localConnectionString ?? "");
    expect(["postgres:", "postgresql:"]).toContain(url.protocol);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    // Wrangler insists on a user and a password; neither may be a real secret.
    expect([url.username, url.password]).toEqual(["local", "local"]);
  });

  it("runs `dev:functions` against the seeded local D1 emulator, whichever backend production selects", async () => {
    expect(devFunctionsScript).toMatch(/\bwrangler dev\b/);
    const override = /--var\s+PUBLIC_DATA_BACKEND:(\S+)/.exec(devFunctionsScript)?.[1];
    expect(override).toBe("d1");

    // With that override the Worker serves the local D1 and never opens a Neon transport.
    const { d1, d1Reads } = recordingD1();
    const factory = vi.fn((): PublicReadTransport => {
      throw new Error("local development must not need a Neon connection");
    });
    const scope = createPublicReadScope(
      {
        ...config.vars,
        PUBLIC_DATA_BACKEND: override,
        DB: d1,
        HDB_PUBLIC_NEON: { connectionString: binding?.localConnectionString } as Hyperdrive,
      } as unknown as Env,
      factory,
    );
    expect(scope.backend).toBe("d1");
    await scope.data.manifestJson();
    expect(d1Reads).toHaveLength(1);
    expect(factory).not.toHaveBeenCalled();
  });
});
