import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  NEARBY_BLOCK_SPATIAL_SQL,
  NEARBY_SPATIAL_SQL,
  queryNearbyPlaces,
} from "../../worker/nearby-spatial-query";

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

const IDENTIFIER = "[a-z_][a-z0-9_]*";

/** Column names declared with a geography type, as in `location geography(Point,4326)`. */
function geographyColumns(ddl: string): Set<string> {
  const declaration = new RegExp(`\\b(${IDENTIFIER})\\s+geography\\s*\\(`, "gi");
  return new Set([...ddl.matchAll(declaration)].map((match) => match[1].toLowerCase()));
}

/** Names a statement gives to an expression it casts to geography, as in `...::geography AS point`. */
function geographyAliases(sql: string): Set<string> {
  const alias = new RegExp(`::\\s*geography\\s+AS\\s+(${IDENTIFIER})\\b`, "gi");
  return new Set([...sql.matchAll(alias)].map((match) => match[1].toLowerCase()));
}

/**
 * True only when the operand is provably geography: its last cast is `::geography`, or it is a bare (optionally
 * qualified) name that a declaration types as geography. A name that merely contains "location", or a geography
 * column cast to geometry, is not.
 */
function isGeographyOperand(operand: string, geographyNames: ReadonlySet<string>): boolean {
  if (/::\s*geography$/i.test(operand)) return true;
  const bare = new RegExp(`^(?:${IDENTIFIER}\\.)?(${IDENTIFIER})$`, "i").exec(operand);
  return bare !== null && geographyNames.has(bare[1].toLowerCase());
}

/**
 * Every way the text of a SQL statement can break the contract. Empty means it does not. `declaredGeography` holds
 * the column names the schema declares as geography; names the statement itself casts to geography are added.
 */
function crsViolations(sql: string, declaredGeography: ReadonlySet<string> = new Set()): string[] {
  const found: string[] = [];
  const geographyNames = new Set([...declaredGeography, ...geographyAliases(sql)]);
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
      const operands = args.slice(0, 2);
      if (
        operands.length !== 2 ||
        !operands.every((operand) => isGeographyOperand(operand, geographyNames))
      )
        found.push(`${fn} must compare geography (metres), found ${fn}(${args.join(", ")})`);
    }
  }
  return found;
}

/**
 * PostGIS in any spelling PostgreSQL accepts: a function call in either case, a cast to a spatial type, or the
 * nearest-neighbour operator.
 */
const POSTGIS_SYNTAX = /\bST_[a-z0-9_]+\s*\(|::\s*geo(?:graphy|metry)\b|<->/i;
/** The one runtime or build module that may hold PostGIS. */
const POSTGIS_MODULE = "worker/nearby-spatial-query.ts";
const SOURCE_ROOTS = ["functions", "scripts", "shared", "src", "worker"];

const repoRoot = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

describe("coordinate-system contract (static)", () => {
  const sqlFiles = walk(join(repoRoot, "sql/neon")).filter((f) => f.endsWith(".sql"));
  const declaredGeography = geographyColumns(
    readFileSync(join(repoRoot, "sql/neon/001_postgis_nearby.sql"), "utf8"),
  );

  it("holds for the migration, the verifiers and the shipped nearby query", () => {
    const subjects: [string, string][] = [
      ...sqlFiles
        // The contract verifier demonstrates the forbidden forms on purpose.
        .filter((f) => !f.endsWith("verify_crs_contract.sql"))
        .map((f): [string, string] => [relative(repoRoot, f), readFileSync(f, "utf8")]),
      ["worker/nearby-spatial-query.ts (NEARBY_SPATIAL_SQL)", NEARBY_SPATIAL_SQL],
      ["worker/nearby-spatial-query.ts (NEARBY_BLOCK_SPATIAL_SQL)", NEARBY_BLOCK_SPATIAL_SQL],
    ];
    expect(subjects.length).toBeGreaterThan(3);
    expect([...declaredGeography]).toEqual(["location"]);
    for (const [name, sql] of subjects)
      expect(crsViolations(sql, declaredGeography), name).toEqual([]);
  });

  it("finds PostGIS only in the migration scripts and the Worker's spatial query", () => {
    const withPostgis = SOURCE_ROOTS.flatMap((dir) => walk(join(repoRoot, dir)))
      .filter(
        (f) =>
          /\.(ts|tsx|mts|mjs|js)$/.test(f) &&
          !/\.(test|spec)\./.test(f) &&
          !f.includes("__tests__"),
      )
      .filter((f) => POSTGIS_SYNTAX.test(readFileSync(f, "utf8")))
      .map((f) => relative(repoRoot, f));
    // Exactly one: the rest of the Worker is scanned too, and the scan is shown to find the module it allows.
    expect(withPostgis).toEqual([POSTGIS_MODULE]);
  });

  it.each([
    ["an upper-case call", "SELECT ST_Distance(a, b)"],
    ["a lower-case call", "select st_distance(a, b)"],
    ["a call with a digit in its name", "SELECT st_3ddistance (a, b)"],
    ["a geography cast", "SELECT value::geography"],
    ["a geometry cast", "SELECT value :: geometry"],
    ["the nearest-neighbour operator", "ORDER BY a.location <-> b.location"],
  ])("recognises %s as PostGIS", (_name, text) => {
    expect(POSTGIS_SYNTAX.test(text)).toBe(true);
  });

  it("does not take ordinary code for PostGIS", () => {
    expect(
      POSTGIS_SYNTAX.test("const first_name = test_helper(a) < -b > c; // geometry of the map"),
    ).toBe(false);
  });

  it("sends no coordinate: the centre is the block's stored geography, and the verified text keeps (lng, lat)", async () => {
    let sent = "";
    let params: readonly unknown[] = [];
    await queryNearbyPlaces(
      async (sql, bound) => {
        sent = sql;
        params = bound;
        return [];
      },
      {
        block: "central-area-535-upp-cross-st",
        radiusMeters: 1500,
        limit: 25,
        kinds: ["mrt_exit"],
      },
    );
    expect(params).toEqual(["central-area-535-upp-cross-st", 1500, ["mrt_exit"], 25]);
    // The block statement constructs no point, so there is no axis order to get wrong in the Worker.
    expect(sent).not.toMatch(/ST_MakePoint|ST_Point|ST_SetSRID/);
    expect(sent).toContain(
      "SELECT origin.location::geography AS point FROM public.block_locations AS origin",
    );
    // The coordinate-centred text is what the Neon verifier runs: longitude first, as PostGIS requires.
    expect(NEARBY_SPATIAL_SQL).toMatch(
      /ST_MakePoint\(\$2::double precision,\$1::double precision\)/,
    );
  });

  it("ships an executable verifier that writes nothing", () => {
    const text = readFileSync(join(repoRoot, "sql/neon/verify_crs_contract.sql"), "utf8");
    expect(text).toContain("ASSERT");
    // It turns assertions on and proves one fires before it relies on any (plpgsql.check_asserts = off skips them).
    expect(text).toContain("set_config('plpgsql.check_asserts', 'on', true)");
    expect(text).toContain("WHEN assert_failure THEN");
    expect(text.indexOf("WHEN assert_failure THEN")).toBeLessThan(text.indexOf("-- 1. Axis order"));
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
      [
        "geography columns cast back to geometry",
        "WITH center AS (SELECT x::geography AS point) SELECT 1 WHERE ST_DWithin(p.location::geometry, center.point::geometry, 500)",
        "must compare geography",
      ],
      [
        "a geometry column whose name contains location",
        "SELECT ST_Distance(a.location_geom, b.location_geom)",
        "must compare geography",
      ],
      [
        "one geography operand and one geometry operand",
        "SELECT ST_Distance(p.location, q.geom)",
        "must compare geography",
      ],
      [
        "a name that no declaration types as geography",
        "SELECT 1 WHERE ST_DWithin(p.location, c.point, 500)",
        "must compare geography",
      ],
    ])("%s", (_name, sql, message) => {
      expect(crsViolations(sql, new Set(["location"])).join("\n")).toContain(message);
    });

    it("accepts the forms the contract allows", () => {
      expect(
        crsViolations(
          "WITH c AS (SELECT ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography AS point) SELECT ST_Transform(g, 3414), ST_Transform(h, 4326), ST_DWithin(p.location, c.point, 500), ST_Distance(a::geography, b::geography)",
          new Set(["location"]),
        ),
      ).toEqual([]);
    });
  });
});
