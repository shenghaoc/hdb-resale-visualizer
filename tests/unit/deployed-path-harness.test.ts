import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { buildDirectBlock, parseFingerprints } from "../deployed-path/direct-sql.mjs";
import { SAMPLES, canonical, queryString } from "../deployed-path/samples.mjs";
import { NEARBY_CLIENT_RATE_LIMIT, NEARBY_RATE_LIMIT_PERIOD_SEC } from "../../shared/nearby-limits";
import { parseNearbyPlacesRequest } from "../../shared/nearby-places";
import { NEARBY_LABELLED_SQL, NEARBY_SPATIAL_SQL } from "../../worker/nearby-spatial-query";

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

  it("runs the statement the Worker sends verbatim, next to the verified places query, and writes nothing", () => {
    const block = buildDirectBlock(SAMPLES, {
      labelled: NEARBY_LABELLED_SQL,
      base: NEARBY_SPATIAL_SQL,
    });
    expect(block).toContain(NEARBY_LABELLED_SQL);
    expect(block).toContain(NEARBY_SPATIAL_SQL);
    // The harness fails the run unless both return the same places and the labelled one has exactly one header.
    expect(block).toContain("LABELLED-DIFFERS");
    expect(block).toContain("LABELLED-HEADER");
    const write = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|COPY)\b/i;
    expect(block.replace(NEARBY_LABELLED_SQL, "").replace(NEARBY_SPATIAL_SQL, "")).not.toMatch(
      write,
    );
    expect(NEARBY_LABELLED_SQL).not.toMatch(write);
  });

  it("refuses a shipped SQL text that could close the harness's dollar quotes", () => {
    const fine = "SELECT 1";
    for (const tag of ["$q$", "$b$", "$f$", "$do$"]) {
      expect(() => buildDirectBlock(SAMPLES, { labelled: `SELECT ${tag}`, base: fine })).toThrow(
        "dollar-quote collision",
      );
      expect(() => buildDirectBlock(SAMPLES, { labelled: fine, base: `SELECT ${tag}` })).toThrow(
        "dollar-quote collision",
      );
    }
  });

  it("reads fingerprint lines out of a runner's error text and ignores the rest", () => {
    const text = `ERROR:  REALPATH-RESULT\nsample-a|3|0123456789abcdef0123456789abcdef\nnoise\nsample-b|0|d41d8cd98f00b204e9800998ecf8427e\nCONTEXT: PL/pgSQL function inline_code_block`;
    expect(parseFingerprints(text)).toEqual({
      "sample-a": { n: 3, md5: "0123456789abcdef0123456789abcdef" },
      "sample-b": { n: 0, md5: "d41d8cd98f00b204e9800998ecf8427e" },
    });
  });

  describe("temporary Worker template", () => {
    const template = harness("wrangler.deployed.template.jsonc");
    const placeholders: Record<string, string> = {
      __WORKER_NAME__: "hdb-realpath-verify-test",
      __REPO_ROOT__: "/repo",
      __HYPERDRIVE_ID__: "0".repeat(32),
      __CACHE_EPOCH__: "realpath-test",
      __BUDGET_DB_NAME__: "hdb-realpath-budget-test",
      __BUDGET_DB_ID__: "11111111-1111-4111-8111-111111111111",
      __CEILING__: "6",
    };
    const fillTemplate = () =>
      Object.entries(placeholders).reduce(
        (text, [name, value]) => text.replaceAll(name, value),
        template,
      );
    const filled = parseJsonc(fillTemplate()) as {
      name: string;
      ratelimits: {
        name: string;
        namespace_id: string;
        simple: { limit: number; period: number };
      }[];
      vars: Record<string, string>;
      d1_databases?: { binding: string; database_name: string; database_id: string }[];
    };
    const production = parseJsonc(readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8")) as {
      name: string;
      ratelimits: { namespace_id: string }[];
      vars: Record<string, string>;
      d1_databases: { database_name: string; database_id: string }[];
    };

    it("has no placeholder the test does not fill, and leaves none behind", () => {
      const used = new Set(template.match(/__[A-Z0-9_]+__/g));
      expect([...used].sort()).toEqual(Object.keys(placeholders).sort());
      expect(fillTemplate()).not.toMatch(/__[A-Z0-9_]+__/);
    });

    it("never shares a rate-limit namespace id or the Worker name with production", () => {
      const productionIds = new Set(production.ratelimits.map((r) => r.namespace_id));
      for (const limiter of filled.ratelimits)
        expect(productionIds.has(limiter.namespace_id)).toBe(false);
      expect(new Set(filled.ratelimits.map((r) => r.namespace_id)).size).toBe(
        filled.ratelimits.length,
      );
      expect(filled.name).not.toBe(production.name);
    });

    it("keeps the production client limit and window", () => {
      const client = filled.ratelimits.find((r) => r.name === "NEARBY_IP_LIMITER");
      expect(client?.simple).toEqual({
        limit: NEARBY_CLIENT_RATE_LIMIT,
        period: NEARBY_RATE_LIMIT_PERIOD_SEC,
      });
    });

    it("binds only a throwaway budget database of its own, never the production one", () => {
      expect(filled.d1_databases).toEqual([
        {
          binding: "DB",
          database_name: placeholders.__BUDGET_DB_NAME__,
          database_id: placeholders.__BUDGET_DB_ID__,
        },
      ]);
      const [productionDatabase] = production.d1_databases;
      expect(template).not.toContain(productionDatabase.database_id);
      expect(template).not.toContain(productionDatabase.database_name);
      expect(filled.d1_databases?.[0].database_id).not.toBe(productionDatabase.database_id);
      expect(filled.d1_databases?.[0].database_name).not.toBe(productionDatabase.database_name);
    });

    it("takes the daily ceiling from a placeholder, which the runbook sets small for the ceiling phase", () => {
      expect(filled.vars.NEARBY_DAILY_STATEMENT_CEILING).toBe("6");
      expect(Number(placeholders.__CEILING__)).toBeLessThan(NEARBY_CLIENT_RATE_LIMIT - 3);
    });

    it("opens the spatial gate only in the temporary Worker, never in production", () => {
      expect(filled.vars.NEON_SPATIAL_ENABLED).toBe("true");
      expect(production.vars.NEON_SPATIAL_ENABLED).toBe("false");
    });
  });
});
