import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { NEARBY_SPATIAL_SQL, queryNearbyPlaces } from "../../worker/nearby-spatial-query";

/**
 * Static guard for the coordinate-system contract (.kiro/specs/geospatial-programme, R1). It reads SQL text, so it is
 * cheap enough for CI, which has no PostGIS. `sql/neon/verify_crs_contract.sql` is the executable counterpart.
 */

/** Argument lists (top-level, parenthesis-balanced) of every call to `fn` in `sql`. */
function callsOf(sql: string, fn: string): string[][] {
  const calls: string[][] = [];
  const opening = new RegExp(`\\b${fn}\\s*\\(`, "gi");
  for (let match = opening.exec(sql); match; match = opening.exec(sql)) {
    const args: string[] = [];
    let depth = 1;
    let start = match.index + match[0].length;
    for (let i = start; i < sql.length && depth > 0; i++) {
      const c = sql[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) args.push(sql.slice(start, i).trim());
      } else if (c === "," && depth === 1) {
        args.push(sql.slice(start, i).trim());
        start = i + 1;
      }
    }
    calls.push(args);
  }
  return calls;
}

const LONGITUDE = /(^|[^a-z])(lng|lon|longitude)([^a-z]|$)|^\$2\b/i;
const LATITUDE = /(^|[^a-z])(lat|latitude)([^a-z]|$)|^\$1\b/i;
/** The only spatial reference systems the contract allows a conversion to. */
const ALLOWED_TRANSFORM_TARGETS = new Set(["3414", "4326"]);

/** Every way the text of a SQL statement can break the contract. Empty means it does not. */
function crsViolations(sql: string): string[] {
  const found: string[] = [];
  for (const args of callsOf(sql, "ST_SetSRID")) {
    if (args.length !== 2 || !/^ST_MakePoint\s*\(/i.test(args[0]) || args[1] !== "4326")
      found.push(
        `ST_SetSRID is a label: only ST_SetSRID(ST_MakePoint(lng, lat), 4326) is allowed, found ST_SetSRID(${args.join(", ")})`,
      );
  }
  for (const args of callsOf(sql, "ST_MakePoint")) {
    if (args.length !== 2 || !LONGITUDE.test(args[0]) || !LATITUDE.test(args[1]))
      found.push(
        `ST_MakePoint takes (longitude, latitude), found ST_MakePoint(${args.join(", ")})`,
      );
  }
  for (const args of callsOf(sql, "ST_Transform")) {
    if (args.length !== 2 || !ALLOWED_TRANSFORM_TARGETS.has(args[1]))
      found.push(
        `ST_Transform may target only EPSG:3414 or 4326, found ST_Transform(${args.join(", ")})`,
      );
  }
  for (const fn of ["ST_DWithin", "ST_Distance"]) {
    for (const args of callsOf(sql, fn)) {
      if (!/location|geography/i.test(`${args[0]} ${args[1]}`))
        found.push(`${fn} must compare geography (metres), found ${fn}(${args.join(", ")})`);
    }
  }
  return found;
}

const repoRoot = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

describe("coordinate-system contract (static)", () => {
  const sqlFiles = walk(join(repoRoot, "sql/neon")).filter((f) => f.endsWith(".sql"));

  it("holds for the migration, the verifiers and the shipped nearby query", () => {
    const subjects: [string, string][] = [
      ...sqlFiles
        // The contract verifier demonstrates the forbidden forms on purpose.
        .filter((f) => !f.endsWith("verify_crs_contract.sql"))
        .map((f): [string, string] => [relative(repoRoot, f), readFileSync(f, "utf8")]),
      ["worker/nearby-spatial-query.ts (NEARBY_SPATIAL_SQL)", NEARBY_SPATIAL_SQL],
    ];
    expect(subjects.length).toBeGreaterThan(3);
    for (const [name, sql] of subjects) expect(crsViolations(sql), name).toEqual([]);
  });

  it("finds PostGIS only in the migration scripts and the Worker's spatial query", () => {
    // The local benchmark builds its own SQL; it never runs in the Worker or the build.
    const allowed = ["scripts/bench-postgis/"];
    const outside = ["functions", "shared", "src", "scripts"]
      .flatMap((dir) => walk(join(repoRoot, dir)))
      .filter(
        (f) =>
          /\.(ts|tsx|mts|mjs|js)$/.test(f) &&
          !/\.(test|spec)\./.test(f) &&
          !f.includes("__tests__"),
      )
      .filter((f) => /\bST_[A-Z][A-Za-z]+\s*\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(repoRoot, f))
      .filter((f) => !allowed.some((prefix) => f.startsWith(prefix)));
    expect(outside).toEqual([]);
  });

  it("binds latitude first and longitude second, which is what the SQL's $1 and $2 assume", async () => {
    let params: readonly unknown[] = [];
    await queryNearbyPlaces(
      async (_sql, bound) => {
        params = bound;
        return [];
      },
      { lat: 1.3521, lng: 103.8198, radiusMeters: 500, limit: 25, kinds: ["mrt_exit"] },
    );
    expect(params.slice(0, 2)).toEqual([1.3521, 103.8198]);
    expect(NEARBY_SPATIAL_SQL).toMatch(
      /ST_MakePoint\(\$2::double precision,\$1::double precision\)/,
    );
  });

  it("ships an executable verifier that writes nothing", () => {
    const text = readFileSync(join(repoRoot, "sql/neon/verify_crs_contract.sql"), "utf8");
    expect(text).toContain("ASSERT");
    expect(text.replace(/--.*$/gm, "")).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|COPY)\b/i,
    );
  });

  describe("the scanner catches the mistakes the contract forbids", () => {
    it.each([
      [
        "a longitude/latitude swap",
        "SELECT ST_SetSRID(ST_MakePoint(lat, lng), 4326)",
        "ST_MakePoint",
      ],
      [
        "a relabel instead of a conversion",
        "SELECT ST_SetSRID(ST_Transform(g, 3414), 4326)",
        "ST_SetSRID is a label",
      ],
      [
        "a relabel to a projected system",
        "SELECT ST_SetSRID(ST_MakePoint(lng, lat), 3414)",
        "ST_SetSRID is a label",
      ],
      ["a conversion to another system", "SELECT ST_Transform(g, 4269)", "ST_Transform may target"],
      [
        "degrees used as metres",
        "SELECT 1 WHERE ST_DWithin(a.geom, b.geom, 500)",
        "must compare geography",
      ],
      [
        "a distance on bare geometry",
        "SELECT ST_Distance(a.geom, b.geom)",
        "must compare geography",
      ],
    ])("%s", (_name, sql, message) => {
      expect(crsViolations(sql).join("\n")).toContain(message);
    });

    it("accepts the forms the contract allows", () => {
      expect(
        crsViolations(
          "SELECT ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography, ST_Transform(g, 3414), ST_Transform(h, 4326), ST_DWithin(p.location, c.point, 500), ST_Distance(a::geography, b::geography)",
        ),
      ).toEqual([]);
    });
  });
});
