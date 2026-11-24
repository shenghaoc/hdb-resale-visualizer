import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NEON_REFRESH_SCHEMA } from "../helpers/neonRefreshHarness";

/**
 * The PostGIS SQL of `sql/neon/`, executed for real: PostgreSQL with the PostGIS extension, in process (PGlite).
 * Every file is run exactly as an operator runs it with `psql -f`, on a fixture database with the publisher's
 * schema. Nothing here is opt-in; it runs with the unit tests.
 *
 * A check that cannot fail proves nothing, so each verifier is also run against a calculation with one rule
 * broken on purpose (radius, grouping before the limit, a tie-break, the station alias) and must refuse it.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const sql = (name: string) => readFileSync(join(process.cwd(), "sql/neon", name), "utf8");
const MIGRATION = sql("001_postgis_nearby.sql");
const PUBLICATION = sql("publish_block_detail_nearby_mrt_exits.sql");
const VERIFIER = sql("verify_block_detail_nearby_mrt_exits.sql");
const CASES = sql("verify_block_detail_nearby_mrt_exits_cases.sql");
const CRS_CONTRACT = sql("verify_crs_contract.sql");

/** One rule of the published calculation, broken. Each replaces text that occurs exactly once in the core. */
const BROKEN_RULES = {
  radius: ["1500::double precision", "1400::double precision"],
  "grouping before the limit": [
    "  FROM nearby\n), displayed AS (",
    "  FROM (SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY address_key ORDER BY distance_meters ASC, exit_id) AS pre FROM nearby) AS cut WHERE pre <= 5) AS nearby\n), displayed AS (",
  ],
  "the tie-break": [
    'ORDER BY distance_meters ASC, exit_id COLLATE "C" ASC\n    ) AS station_rank',
    'ORDER BY distance_meters ASC, exit_id COLLATE "C" DESC\n    ) AS station_rank',
  ],
} as const;
const breakRule = (text: string, rule: keyof typeof BROKEN_RULES) => {
  const [from, to] = BROKEN_RULES[rule];
  expect(text.split(from)).toHaveLength(2);
  return text.replace(from, to);
};
/** The publication without its station alias (the alias list matches no source code). */
const withoutAlias = (text: string) => {
  const alias =
    "VALUES ('CC9', 'PAYA LEBAR MRT STATION'), ('DT18', 'TELOK AYER MRT STATION')\n), centers";
  expect(text.split(alias)).toHaveLength(2);
  return text.replace(alias, "VALUES ('NO-CODE-1', 'NONE'), ('NO-CODE-2', 'NONE')\n), centers");
};

/**
 * Fixture exits, placed with ST_Project at an exact spheroidal distance and bearing from a block centre. Block
 * centres lie on the 0.0001-degree grid plus 0.00004 degrees, so snapping moves every one of them.
 * `[block, OBJECTID, STATION_NA, EXIT_CODE, bearing in degrees, metres from the SNAPPED centre]`
 */
const BLOCKS = {
  dense: [1.3, 103.6],
  alias: [1.35, 103.6],
  second_alias: [1.4, 103.6],
  boundary: [1.45, 103.6],
  empty: [1.3, 103.7],
  ties: [1.35, 103.7],
  untouched: [1.4, 103.7],
} as const;
const EXITS: [keyof typeof BLOCKS, number, string, string, number, number][] = [
  // dense: 30 exits of one station nearer than anything else, then six more stations (seven in range).
  ...Array.from(
    { length: 30 },
    (_, i): [keyof typeof BLOCKS, number, string, string, number, number] => [
      "dense",
      1000 + i,
      "BUSY MRT STATION",
      `Exit ${i + 1}`,
      i * 12,
      100 + i,
    ],
  ),
  ["dense", 1101, "SECOND MRT STATION", "Exit A", 20, 300],
  ["dense", 1102, "THIRD MRT STATION", "Exit A", 80, 500],
  ["dense", 1103, "FOURTH MRT STATION", "Exit A", 140, 700],
  ["dense", 1104, "FIFTH MRT STATION", "Exit A", 200, 900],
  ["dense", 1105, "SIXTH MRT STATION", "Exit A", 260, 1100],
  ["dense", 1106, "SEVENTH MRT STATION", "Exit A", 320, 1300],
  // alias: two CC9 exits beside PAYA LEBAR exits (within 200 m of each other), and a code with no named station.
  ["alias", 2001, "CC9", "E", 0, 100],
  ["alias", 2002, "CC9", "F", 5, 120],
  ["alias", 2003, "PAYA LEBAR MRT STATION", "Exit A", 0, 160],
  ["alias", 2004, "PAYA LEBAR MRT STATION", "Exit B", 10, 220],
  ["alias", 2005, "DT4", "Exit A", 180, 600],
  ["second_alias", 2101, "DT18", "D", 90, 250],
  ["second_alias", 2102, "TELOK AYER MRT STATION", "Exit A", 90, 180],
  // boundary: just inside and just outside 1,500 m.
  ["boundary", 3001, "EDGE MRT STATION", "Exit A", 45, 1499.7],
  ["boundary", 3002, "OUTSIDE MRT STATION", "Exit A", 225, 1500.3],
  // ties: two exits of one station at one point, and two stations at one distance.
  ["ties", 4010, "TWIN MRT STATION", "Exit B", 30, 150],
  ["ties", 4002, "TWIN MRT STATION", "Exit A", 30, 150],
  ["ties", 4020, "LATER MRT STATION", "Exit A", 200, 250],
  ["ties", 4015, "EARLIER MRT STATION", "Exit A", 200, 250],
  // untouched: a block with no new transaction still gets its list.
  ["untouched", 5001, "QUIET MRT STATION", "C", 270, 800],
];

let db: PGlite;

/** Runs a whole SQL file as `psql -f` would; a failure rolls back whatever transaction the file opened. */
async function run(text: string) {
  try {
    await db.exec(text);
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
const rows = async <T>(text: string) => (await db.query<T>(text)).rows;
const lists = async () =>
  Object.fromEntries(
    (
      await rows<{ address_key: string; exits: { stationName: string; exitLabel: string }[] }>(
        "SELECT address_key, json->'nearbyMrtExits' AS exits FROM public.block_details ORDER BY 1",
      )
    ).map((row) => [row.address_key, row.exits]),
  );
const publicationState = async () =>
  (
    await rows<{ details: string; manifest: string; updated_at: string }>(`
      SELECT (SELECT string_agg(address_key || json::text, '|' ORDER BY address_key) FROM public.block_details) AS details,
        m.json::text AS manifest, m.updated_at::text AS updated_at
      FROM public.manifest AS m WHERE m.id = 1`)
  )[0];
/** The candidate as the fork leaves it: no derived field, no marker. */
async function unpublish() {
  await db.exec(`
    UPDATE public.block_details SET json = json - 'nearbyMrtExits';
    UPDATE public.manifest SET json = json - 'nearbyMrtExitsMaterialization', updated_at = '2026-12-01T15:30:00Z';
  `);
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { postgis } });
  await db.exec(`CREATE ROLE hdb_benchmark_runtime; ${NEON_REFRESH_SCHEMA}`);
  await db.exec("CREATE EXTENSION postgis");
  for (const [key, [lat, lng]] of Object.entries(BLOCKS)) {
    await db.query(
      `INSERT INTO public.blocks (address_key, town, block, street_name, lat, lng, median_price,
         price_per_sqm_median, transaction_count, floor_area_min, floor_area_max, lease_commence_year,
         latest_month, available_min_month, available_max_month, flat_types_json, flat_models_json)
       VALUES ($1, 'FIXTURE', '1', $1, $2, $3, 500000, 5000, 1, 90, 90, 1990, '2026-11', '2026-01', '2026-11',
         '[]'::jsonb, '[]'::jsonb)`,
      [key, lat + 0.00004, lng + 0.00004],
    );
    await db.query("INSERT INTO public.block_details VALUES ($1, $2::jsonb)", [
      key,
      JSON.stringify({ summary: { addressKey: key }, recentTransactions: [], monthlyTrend: [] }),
    ]);
  }
  await db.exec(`
    INSERT INTO public.manifest VALUES
      (1, '{"schemaVersion":"2.0.0","generatedAt":"2026-12-01T15:30:00.000Z"}'::jsonb, '2026-12-01T15:30:00Z');
    CREATE TABLE fixture_exits (block text, object_id int, station text, code text, bearing float8, meters float8);
  `);
  for (const exit of EXITS)
    await db.query("INSERT INTO fixture_exits VALUES ($1, $2, $3, $4, $5, $6)", exit);
  // The official exit GeoJSON, as the publisher stores it: every position computed from its block's snapped centre.
  await db.exec(`
    CREATE VIEW fixture_exit_geojson AS
    SELECT jsonb_build_object('type', 'FeatureCollection', 'features', jsonb_agg(
      jsonb_build_object('type', 'Feature',
        'properties', jsonb_build_object('OBJECTID', e.object_id, 'STATION_NA', e.station, 'EXIT_CODE', e.code),
        'geometry', jsonb_build_object('type', 'Point', 'coordinates',
          jsonb_build_array(ST_X(p.point::geometry), ST_Y(p.point::geometry))))
      ORDER BY e.object_id)) AS document
    FROM fixture_exits AS e
    JOIN public.blocks AS b ON b.address_key = e.block
    CROSS JOIN LATERAL (SELECT ST_Project(
      ST_SetSRID(ST_MakePoint(round(b.lng::numeric, 4)::float8, round(b.lat::numeric, 4)::float8), 4326)::geography,
      e.meters, radians(e.bearing)) AS point) AS p;
    INSERT INTO public.mrt_geojson
    SELECT 'exits', document, '2026-12-01T15:30:00Z' FROM fixture_exit_geojson;
    INSERT INTO public.mrt_geojson VALUES ('stations', '{"type":"FeatureCollection","features":[
      {"type":"Feature","properties":{"stationName":"BUSY MRT STATION"},"geometry":{"type":"Point","coordinates":[103.6,1.3]}}
    ]}'::jsonb, '2026-12-01T15:30:00Z');
  `);
  await run(MIGRATION);
});

afterAll(async () => {
  await db?.close();
});

describe("sql/neon/001_postgis_nearby.sql", () => {
  it("derives a location for every block and a point for every MRT feature", async () => {
    expect(
      await rows(`SELECT (SELECT count(*)::int FROM public.block_locations) AS blocks,
        (SELECT count(*)::int FROM public.poi_locations WHERE poi_kind = 'mrt_exit') AS exits,
        (SELECT count(*)::int FROM public.poi_locations WHERE poi_kind = 'mrt_station') AS stations`),
    ).toEqual([{ blocks: Object.keys(BLOCKS).length, exits: EXITS.length, stations: 1 }]);
    // The source fields are kept as recorded; the display name is only built from them.
    expect(
      await rows(
        "SELECT name, source_properties->>'STATION_NA' AS station, source_properties->>'EXIT_CODE' AS code FROM public.poi_locations WHERE source_id = '2001'",
      ),
    ).toEqual([{ name: "CC9 (E)", station: "CC9", code: "E" }]);
  });

  it("is idempotent, and keeps the derived tables in step with their sources", async () => {
    const snapshot = () =>
      rows(`SELECT (SELECT string_agg(address_key || lat || lng, '|' ORDER BY 1) FROM public.block_locations) AS b,
        (SELECT string_agg(source_id || lat || lng, '|' ORDER BY 1) FROM public.poi_locations) AS p`);
    const before = await snapshot();
    await run(MIGRATION);
    expect(await snapshot()).toEqual(before);
    // A block that moves takes its derived point with it; the publisher only ever writes `blocks`.
    await db.exec("BEGIN; UPDATE public.blocks SET lat = lat + 0.01 WHERE address_key = 'empty'");
    expect(
      await rows(
        "SELECT round((l.lat - b.lat)::numeric, 9)::float8 AS drift FROM public.block_locations l JOIN public.blocks b USING (address_key) WHERE address_key = 'empty'",
      ),
    ).toEqual([{ drift: 0 }]);
    await db.exec("ROLLBACK");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a malformed exit source as a whole instead of publishing part of it", async () => {
    await expect(
      run(`BEGIN; UPDATE public.mrt_geojson SET json = jsonb_set(json, '{features,0,geometry,type}', '"LineString"')
           WHERE kind = 'exits'; COMMIT;`),
    ).rejects.toThrow(/MRT POI coverage mismatch: expected \d+, inserted \d+/);
    expect(
      await rows("SELECT count(*)::int AS n FROM public.poi_locations WHERE poi_kind = 'mrt_exit'"),
    ).toEqual([{ n: EXITS.length }]);
  });

  it("gives the runtime role read access to the derived tables and no way to write them", async () => {
    expect(
      await rows(`SELECT t AS table_name, has_table_privilege('hdb_benchmark_runtime', 'public.' || t, 'SELECT') AS can_read,
          has_table_privilege('hdb_benchmark_runtime', 'public.' || t, 'INSERT, UPDATE, DELETE, TRUNCATE') AS can_write
        FROM unnest(ARRAY['block_locations', 'poi_locations']) AS t`),
    ).toEqual([
      { table_name: "block_locations", can_read: true, can_write: false },
      { table_name: "poi_locations", can_read: true, can_write: false },
    ]);
  });
});

describe("sql/neon/verify_crs_contract.sql", () => {
  it("passes on this PostGIS build", async () => {
    await expect(run(CRS_CONTRACT)).resolves.toBeUndefined();
  });

  it("fails when the Singapore bounding-box guard is widened (a broken rule is detected)", async () => {
    // The contract asserts that a point with its axes swapped falls outside the Singapore box. With the box
    // widened to the whole globe that assertion no longer holds, and the script must stop.
    const guard = "ST_X(q) BETWEEN 103.55 AND 104.15 AND ST_Y(q) BETWEEN 1.15 AND 1.55";
    expect(CRS_CONTRACT.split(guard).length).toBeGreaterThan(1);
    await expect(
      run(
        CRS_CONTRACT.replaceAll(
          guard,
          "ST_X(q) BETWEEN -180 AND 180 AND ST_Y(q) BETWEEN -180 AND 180",
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("sql/neon/verify_block_detail_nearby_mrt_exits_cases.sql", () => {
  it("passes: all eight synthetic cases, on real PostGIS", async () => {
    await expect(run(CASES)).resolves.toBeUndefined();
  });

  it.each(Object.keys(BROKEN_RULES) as (keyof typeof BROKEN_RULES)[])(
    "fails when %s is broken in the calculation it executes",
    async (rule) => {
      await expect(run(breakRule(CASES, rule))).rejects.toThrow("FAIL: cases differ");
    },
  );

  it("fails when the station alias is removed", async () => {
    const alias = "VALUES ('CC9', 'PAYA LEBAR MRT STATION'), ('DT18', 'TELOK AYER MRT STATION')";
    expect(CASES.split(alias)).toHaveLength(2);
    await expect(run(CASES.replace(alias, "VALUES ('NO-CODE-1', 'NONE')"))).rejects.toThrow(
      "FAIL: cases differ",
    );
  });
});

describe("publication and corpus verifier, as run on a serving candidate", () => {
  beforeEach(unpublish);

  it("refuses a candidate that has not been materialized", async () => {
    await expect(run(VERIFIER)).rejects.toThrow("FAIL coverage");
  });

  it("materializes a list for every block detail, and the verifier passes", async () => {
    await run(PUBLICATION);
    const published = await lists();
    expect(Object.keys(published)).toEqual(Object.keys(BLOCKS).sort());
    const stations = (key: string) => published[key].map((exit) => exit.stationName);
    // Seven stations in range, thirty exits of the nearest one: grouped first, then the nearest five.
    expect(stations("dense")).toEqual([
      "BUSY MRT STATION",
      "SECOND MRT STATION",
      "THIRD MRT STATION",
      "FOURTH MRT STATION",
      "FIFTH MRT STATION",
    ]);
    expect(published.dense[0].exitLabel).toBe("Exit 1");
    // CC9's exits and PAYA LEBAR's are one station; the nearest exit is a CC9 one, with its source code.
    expect(published.alias).toMatchObject([
      { stationName: "PAYA LEBAR MRT STATION", exitLabel: "E", distanceMeters: 100 },
      { stationName: "DT4", exitLabel: "Exit A", distanceMeters: 600 },
    ]);
    expect(stations("second_alias")).toEqual(["TELOK AYER MRT STATION"]);
    expect(published.boundary).toMatchObject([
      { stationName: "EDGE MRT STATION", distanceMeters: 1499.7 },
    ]);
    expect(published.empty).toEqual([]);
    expect(published.ties).toMatchObject([
      { stationName: "TWIN MRT STATION", exitLabel: "Exit A", exitId: "mrt_geojson:mrt_exit:4002" },
      { stationName: "EARLIER MRT STATION", exitId: "mrt_geojson:mrt_exit:4015" },
      { stationName: "LATER MRT STATION", exitId: "mrt_geojson:mrt_exit:4020" },
    ]);
    expect(published.untouched).toMatchObject([
      { stationName: "QUIET MRT STATION", exitLabel: "C" },
    ]);
    await expect(run(VERIFIER)).resolves.toBeUndefined();
  });

  it("an unchanged rerun preserves every document, the marker and `updated_at`", async () => {
    await run(PUBLICATION);
    const first = await publicationState();
    expect(first.manifest).toContain("nearbyMrtExitsMaterialization");
    await run(PUBLICATION);
    expect(await publicationState()).toEqual(first);
    await expect(run(VERIFIER)).resolves.toBeUndefined();
  });

  it("covers the candidate's own key set: a block detail without a location stops the publication", async () => {
    await db.exec(
      `INSERT INTO public.block_details VALUES ('no-location', '{"summary":{},"recentTransactions":[],"monthlyTrend":[]}')`,
    );
    try {
      const before = await publicationState();
      await expect(run(PUBLICATION)).rejects.toThrow(
        `do not cover the candidate block details exactly (block details ${Object.keys(BLOCKS).length + 1}, derived ${Object.keys(BLOCKS).length}, without a list 1, without a block detail 0)`,
      );
      expect(await publicationState()).toEqual(before);
    } finally {
      await db.exec("DELETE FROM public.block_details WHERE address_key = 'no-location'");
    }
  });

  it.each(Object.keys(BROKEN_RULES) as (keyof typeof BROKEN_RULES)[])(
    "the verifier refuses a publication made with %s broken",
    async (rule) => {
      await run(breakRule(PUBLICATION, rule));
      await expect(run(VERIFIER)).rejects.toThrow("FAIL oracle");
    },
  );

  it("the verifier refuses a publication made without the station alias", async () => {
    await run(withoutAlias(PUBLICATION));
    await expect(run(VERIFIER)).rejects.toThrow("FAIL oracle");
  });

  it("the alias check: an aliased code with no named exit within 200 m stops the publication and the verifier", async () => {
    await run(PUBLICATION);
    // The PAYA LEBAR exits move 400 m and more away from the CC9 exits.
    await db.exec(`
      UPDATE fixture_exits SET meters = meters + 500 WHERE station = 'PAYA LEBAR MRT STATION';
      UPDATE public.mrt_geojson SET json = (SELECT document FROM fixture_exit_geojson) WHERE kind = 'exits';
    `);
    try {
      await expect(run(VERIFIER)).rejects.toThrow("FAIL alias: no named exit within 200 m of CC9");
      await unpublish();
      await expect(run(PUBLICATION)).rejects.toThrow(
        "station alias no longer grounded in the source (no named exit within 200 m): CC9:2001, CC9:2002",
      );
      expect((await publicationState()).manifest).not.toContain("nearbyMrtExitsMaterialization");
    } finally {
      await db.exec(`
        UPDATE fixture_exits SET meters = meters - 500 WHERE station = 'PAYA LEBAR MRT STATION';
        UPDATE public.mrt_geojson SET json = (SELECT document FROM fixture_exit_geojson) WHERE kind = 'exits';
      `);
    }
  });

  it("the verifier refuses a document or a marker changed after publication", async () => {
    await run(PUBLICATION);
    await db.exec(
      `UPDATE public.block_details SET json = jsonb_set(json, '{nearbyMrtExits}', '[]') WHERE address_key = 'untouched'`,
    );
    await expect(run(VERIFIER)).rejects.toThrow("FAIL oracle: 1 of");
    await unpublish();
    await run(PUBLICATION);
    await db.exec(
      `UPDATE public.manifest SET json = jsonb_set(json, '{nearbyMrtExitsMaterialization,listsSHA256}', '"${"0".repeat(64)}"')`,
    );
    await expect(run(VERIFIER)).rejects.toThrow("FAIL marker");
  });
});
