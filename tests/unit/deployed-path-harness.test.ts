import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { buildDirectBlock, parseFingerprints } from "../deployed-path/direct-sql.mjs";
import { SAMPLES, canonical, queryString } from "../deployed-path/samples.mjs";
import { NEARBY_CLIENT_RATE_LIMIT, NEARBY_RATE_LIMIT_PERIOD_SEC } from "../../shared/nearby-limits";
import { parseNearbyPlacesRequest } from "../../shared/nearby-places";
import { NEARBY_SPATIAL_SQL } from "../../worker/nearby-spatial-query";

const harness = (name: string) =>
  readFileSync(join(process.cwd(), "tests/deployed-path", name), "utf8");

/** Minimal JSONC reader: strips comments outside strings, then trailing commas. */
function parseJsonc(text: string): Record<string, unknown> {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")) as Record<string, unknown>;
}

describe("deployed-path verification harness", () => {
  it("canonicalises every sample exactly as the Worker's request parser does", () => {
    for (const sample of SAMPLES) {
      const parsed = parseNearbyPlacesRequest(
        new URL(`https://example.com/api/nearby-places?${queryString(sample)}`),
      );
      expect(parsed.ok, sample.id).toBe(true);
      if (!parsed.ok) continue;
      const cell = canonical(sample);
      expect(
        {
          lat: parsed.request.lat,
          lng: parsed.request.lng,
          radius: parsed.request.radiusMeters,
          kinds: parsed.request.kinds,
        },
        sample.id,
      ).toEqual(cell);
    }
  });

  it("has an expected fingerprint for every default sample, and no stray ones", () => {
    const expected = JSON.parse(harness("fork-expected.json")).samples as Record<
      string,
      { n: number; md5: string }
    >;
    expect(Object.keys(expected).sort()).toEqual(SAMPLES.map((s) => s.id).sort());
    for (const { n, md5 } of Object.values(expected)) {
      expect(n).toBeLessThanOrEqual(25);
      expect(md5).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("runs the shipped SQL verbatim and writes nothing", () => {
    const block = buildDirectBlock(SAMPLES, NEARBY_SPATIAL_SQL);
    expect(block).toContain(NEARBY_SPATIAL_SQL);
    expect(block.replace(NEARBY_SPATIAL_SQL, "")).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|COPY)\b/i,
    );
    expect(NEARBY_SPATIAL_SQL).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|COPY)\b/i,
    );
  });

  it("refuses a shipped SQL text that could close the harness's dollar quotes", () => {
    expect(() => buildDirectBlock(SAMPLES, "SELECT $q$")).toThrow("dollar-quote collision");
  });

  it("reads fingerprint lines out of a runner's error text and ignores the rest", () => {
    const text = `ERROR:  REALPATH-RESULT\nsample-a|3|0123456789abcdef0123456789abcdef\nnoise\nsample-b|0|d41d8cd98f00b204e9800998ecf8427e\nCONTEXT: PL/pgSQL function inline_code_block`;
    expect(parseFingerprints(text)).toEqual({
      "sample-a": { n: 3, md5: "0123456789abcdef0123456789abcdef" },
      "sample-b": { n: 0, md5: "d41d8cd98f00b204e9800998ecf8427e" },
    });
  });

  describe("temporary Worker template", () => {
    const filled = parseJsonc(
      harness("wrangler.deployed.template.jsonc")
        .replaceAll("__WORKER_NAME__", "hdb-realpath-verify-test")
        .replaceAll("__REPO_ROOT__", "/repo")
        .replaceAll("__HYPERDRIVE_ID__", "0".repeat(32))
        .replaceAll("__CACHE_EPOCH__", "realpath-test"),
    ) as {
      name: string;
      ratelimits: {
        name: string;
        namespace_id: string;
        simple: { limit: number; period: number };
      }[];
      vars: Record<string, string>;
      d1_databases?: unknown;
    };
    const production = parseJsonc(readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8")) as {
      name: string;
      ratelimits: { namespace_id: string }[];
      vars: Record<string, string>;
    };

    it("never shares a rate-limit namespace id or the Worker name with production", () => {
      const productionIds = new Set(production.ratelimits.map((r) => r.namespace_id));
      for (const limiter of filled.ratelimits)
        expect(productionIds.has(limiter.namespace_id)).toBe(false);
      expect(new Set(filled.ratelimits.map((r) => r.namespace_id)).size).toBe(
        filled.ratelimits.length,
      );
      expect(filled.name).not.toBe(production.name);
    });

    it("keeps the production client limit and window, and binds no database but Hyperdrive", () => {
      const client = filled.ratelimits.find((r) => r.name === "NEARBY_IP_LIMITER");
      expect(client?.simple).toEqual({
        limit: NEARBY_CLIENT_RATE_LIMIT,
        period: NEARBY_RATE_LIMIT_PERIOD_SEC,
      });
      expect(filled.d1_databases).toBeUndefined();
    });

    it("opens the spatial gate only in the temporary Worker, never in production", () => {
      expect(filled.vars.NEON_SPATIAL_ENABLED).toBe("true");
      expect(production.vars.NEON_SPATIAL_ENABLED).toBe("false");
    });
  });
});
