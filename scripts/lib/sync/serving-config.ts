import { readFileSync } from "node:fs";

/** The Hyperdrive binding the deployed Worker reads public data through (see `wrangler.jsonc`). */
export const PUBLIC_NEON_HYPERDRIVE_BINDING = "HDB_PUBLIC_NEON";

type WranglerHyperdrive = { binding?: unknown; id?: unknown };

/**
 * The Hyperdrive configuration id committed in `wrangler.jsonc` for the public Neon binding. This is the
 * repository's authoritative statement of which Hyperdrive serves the site; the origin that Hyperdrive points at
 * lives in Cloudflare and is checked against this id. `wrangler.jsonc` is JSON with whole-line comments and
 * trailing commas (the same reading as `tests/unit/wrangler-public-backend.test.ts`).
 */
export function readServingHyperdriveId(path = "wrangler.jsonc"): string {
  const text = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  const config = JSON.parse(text) as { hyperdrive?: WranglerHyperdrive[] };
  const bindings = (config.hyperdrive ?? []).filter(
    (entry) => entry.binding === PUBLIC_NEON_HYPERDRIVE_BINDING,
  );
  const id = bindings.length === 1 ? bindings[0].id : undefined;
  if (typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id) || id === "0".repeat(32))
    throw new Error(
      `wrangler.jsonc must bind exactly one ${PUBLIC_NEON_HYPERDRIVE_BINDING} Hyperdrive`,
    );
  return id;
}

/**
 * The Neon compute endpoint id behind a Hyperdrive origin host, for a direct (non-pooler) endpoint host in the
 * refresh project's region. Anything else is refused rather than guessed.
 */
export function neonEndpointIdFromHost(host: string): string {
  const match = /^(ep-[a-z0-9]+(?:-[a-z0-9]+)*?)\.c-4\.ap-southeast-1\.aws\.neon\.tech$/.exec(host);
  if (!match || match[1].endsWith("-pooler"))
    throw new Error(
      "Serving origin is not a direct Neon endpoint host in the refresh project region",
    );
  return match[1];
}
