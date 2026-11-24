import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { projectManifestContract } from "../../shared/manifest-contract";
import { manifestVersion } from "../../shared/publication-state";
import { NEARBY_GRID_DEGREES } from "../../shared/nearby-places";
import { NEARBY_SPATIAL_SQL } from "../../worker/nearby-spatial-query";

/**
 * The publication-time MRT exits of the block drawer (`sql/neon/publish_block_detail_nearby_mrt_exits.sql`).
 *
 * `tests/unit/postgis-sql.test.ts` executes these files on PostGIS. The tests here pin what makes a pass of the two
 * read-only scripts meaningful (they execute the statement that is published and the query the Worker sends), and
 * run the plain-SQL `apply` stage with lists of their own: coverage, atomic refusal, the manifest written last,
 * idempotence and the publication identity.
 */
const read = (name: string) => readFileSync(join(process.cwd(), "sql/neon", name), "utf8");
const publication = read("publish_block_detail_nearby_mrt_exits.sql");
const verifier = read("verify_block_detail_nearby_mrt_exits.sql");
const cases = read("verify_block_detail_nearby_mrt_exits_cases.sql");

const between = (text: string, start: string, end: string) => {
  const parts = text.split(start);
  expect(parts).toHaveLength(2);
  const rest = parts[1].split(end);
  expect(rest).toHaveLength(2);
  return rest[0];
};
const CORE = between(publication, "-- core:begin\n", "-- core:end");
const APPLY = between(publication, "-- apply:begin\n", "-- apply:end");
const ALIASES = "VALUES ('CC9', 'PAYA LEBAR MRT STATION'), ('DT18', 'TELOK AYER MRT STATION')";

describe("the published calculation and its checks stay one calculation", () => {
  it("the synthetic cases execute the published core verbatim", () => {
    const parts = cases.split("$core$");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe(`\n${CORE}`);
  });

  it("the corpus verifier executes the shipped NEARBY_SPATIAL_SQL verbatim", () => {
    const parts = verifier.split("$worker_sql$");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe(NEARBY_SPATIAL_SQL);
  });

  it("uses the endpoint's snapping, radius, distance, grouping, tie-breaking and rounding", () => {
    // 0.0001-degree centres: four decimals, as `snapNearbyCenter` rounds.
    expect(NEARBY_GRID_DEGREES).toBe(0.0001);
    expect(publication).toContain("round(b.lng::numeric, 4)::double precision");
    expect(publication).toContain("round(b.lat::numeric, 4)::double precision");
    expect(CORE).toContain("ST_DWithin(e.location, c.point, 1500::double precision)");
    expect(CORE).toContain("ST_Distance(e.location, c.point) AS distance_meters");
    // Nearest exit per station first, as the endpoint partitions and orders ...
    expect(NEARBY_SPATIAL_SQL).toContain('ORDER BY distance_meters ASC, id COLLATE "C" ASC');
    expect(CORE).toContain("PARTITION BY address_key, source, kind, station_name");
    expect(CORE).toContain('ORDER BY distance_meters ASC, exit_id COLLATE "C" ASC');
    // ... then the endpoint's final order, which sorts by the ROUNDED output column, then the first five.
    expect(NEARBY_SPATIAL_SQL).toContain(
      "ROUND(distance_meters::numeric,1)::double precision AS distance_meters",
    );
    expect(CORE).toContain(
      'ORDER BY ROUND(distance_meters::numeric, 1) ASC, kind COLLATE "C" ASC, exit_id COLLATE "C" ASC',
    );
    expect(CORE).toContain("d.display_rank <= 5");
    // The limit is applied after grouping: nothing in the core cuts rows before `station_rank = 1`.
    expect(CORE.indexOf("WHERE station_rank = 1")).toBeLessThan(
      CORE.indexOf("d.display_rank <= 5"),
    );
    expect(CORE).not.toMatch(/\bLIMIT\b/);
  });

  it("reads station and exit code from the source fields, never from the display name", () => {
    expect(publication).toContain("p.source_properties->>'STATION_NA'");
    expect(publication).toContain("p.source_properties->>'EXIT_CODE' AS exit_label");
    expect(publication).not.toMatch(/\bp\.name\b/);
  });

  it("states the one station alias the same way wherever it is used", () => {
    // The derivation, its grounding check and the fixture of the cases.
    expect(publication.split(ALIASES)).toHaveLength(3);
    expect(cases).toContain(ALIASES);
    expect(publication).toContain("'CC9', 'PAYA LEBAR MRT STATION',");
    // The verifier writes the same mapping out independently.
    expect(verifier).toContain("WHEN 'CC9' THEN 'PAYA LEBAR MRT STATION'");
    expect(verifier).toContain("WHEN 'DT18' THEN 'TELOK AYER MRT STATION'");
    expect(verifier).toContain(
      "jsonb_build_object('CC9', 'PAYA LEBAR MRT STATION', 'DT18', 'TELOK AYER MRT STATION')",
    );
    // The endpoint itself is not normalised.
    expect(NEARBY_SPATIAL_SQL).not.toContain("PAYA LEBAR");
  });

  it("both checks refuse to run outside a READ ONLY transaction, and the publication is one transaction", () => {
    for (const script of [verifier, cases]) {
      expect(script).toMatch(/^BEGIN READ ONLY;$/m);
      expect(script).toContain("current_setting('transaction_read_only') <> 'on'");
      expect(script).toMatch(/^ROLLBACK;$/m);
    }
    expect(publication.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(publication.match(/^COMMIT;$/gm)).toHaveLength(1);
    // Derived details first, the manifest last.
    expect(APPLY.indexOf("UPDATE public.block_details")).toBeLessThan(
      APPLY.indexOf("UPDATE public.manifest"),
    );
    expect(APPLY.trimEnd().endsWith("IS DISTINCT FROM marker.value;")).toBe(true);
  });

  it("derives the expected key set and count from the candidate, never from a fixed number", () => {
    for (const script of [publication, verifier]) expect(script).not.toMatch(/9,?730/);
    expect(APPLY).toContain("SELECT count(*) INTO expected FROM public.block_details;");
    expect(verifier).toContain("(v_marker->>'blockDetails')::bigint IS DISTINCT FROM v_details");
  });
});

describe("apply stage: coverage, atomic write and publication identity (PGlite)", () => {
  let db: PGlite;
  const exit = (station: string, meters: number, id: string) => ({
    stationName: station,
    exitLabel: "Exit A",
    distanceMeters: meters,
    exitId: `mrt_geojson:mrt_exit:${id}`,
  });
  const ANSWERS: Record<string, unknown[]> = {
    // A block with new transactions, one without any (its detail is as old as the publication) and an empty one.
    "bedok-101": [
      exit("BEDOK MRT STATION", 310.4, "1"),
      exit("TANAH MERAH MRT STATION", 1180, "2"),
    ],
    "bedok-102-untouched": [exit("BEDOK MRT STATION", 355.1, "1")],
    "yishun-301-no-exit": [],
  };

  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      CREATE TABLE public.block_details (address_key text PRIMARY KEY, json jsonb NOT NULL);
      CREATE TABLE public.manifest (id smallint PRIMARY KEY, json jsonb NOT NULL, updated_at timestamptz NOT NULL);
    `);
  });
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await db.exec("TRUNCATE public.block_details; TRUNCATE public.manifest;");
    for (const key of Object.keys(ANSWERS))
      await db.query("INSERT INTO public.block_details VALUES ($1, $2::jsonb)", [
        key,
        JSON.stringify({ summary: { addressKey: key }, recentTransactions: [], monthlyTrend: [] }),
      ]);
    await db.query("INSERT INTO public.manifest VALUES (1, $1::jsonb, $2)", [
      JSON.stringify({ schemaVersion: "2.0.0", generatedAt: "2026-12-01T15:30:00.000Z" }),
      "2026-12-01T15:30:00Z",
    ]);
  });

  /** The publication's own transaction, with the PostGIS derivation replaced by the given answers. */
  async function publish(answers: Record<string, unknown> = ANSWERS) {
    const rows = Object.entries(answers)
      .map(([key, exits]) => `('${key}', '${JSON.stringify(exits)}'::jsonb)`)
      .join(", ");
    try {
      await db.exec(`
        BEGIN;
        CREATE TEMPORARY TABLE nearby_mrt_exit_answers ON COMMIT DROP AS
        SELECT * FROM (VALUES ${rows}) AS answers(address_key, exits);
        ${APPLY}
        COMMIT;
      `);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
  const state = async () => ({
    details: (
      await db.query<{ address_key: string; json: Record<string, unknown> }>(
        "SELECT address_key, json FROM public.block_details ORDER BY address_key",
      )
    ).rows,
    manifest: (
      await db.query<{ text: string; updated_at: string }>(
        "SELECT json::text AS text, updated_at::text AS updated_at FROM public.manifest WHERE id = 1",
      )
    ).rows[0],
  });

  it("writes one list to every block detail and the marker last, bound to the candidate's own count", async () => {
    const before = await state();
    await publish();
    const after = await state();
    expect(after.details.map((row) => [row.address_key, row.json.nearbyMrtExits])).toEqual(
      Object.entries(ANSWERS),
    );
    // Nothing else in a document changed.
    for (const [i, row] of after.details.entries()) {
      const { nearbyMrtExits: _exits, ...rest } = row.json;
      expect(rest).toEqual(before.details[i].json);
    }
    const marker = (JSON.parse(after.manifest.text) as Record<string, Record<string, unknown>>)
      .nearbyMrtExitsMaterialization;
    expect(marker).toMatchObject({
      version: 1,
      radiusMeters: 1500,
      maxStations: 5,
      stationAliases: { CC9: "PAYA LEBAR MRT STATION", DT18: "TELOK AYER MRT STATION" },
      blockDetails: 3,
    });
    expect(marker.listsSHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(after.manifest.updated_at).not.toBe(before.manifest.updated_at);
  });

  it("gives the publication a new identity that never leaves the Worker", async () => {
    const before = await state();
    await publish();
    const after = await state();
    // The Worker's cache generation is the hash of the stored manifest text: it changes with the marker ...
    expect(await manifestVersion(after.manifest.text)).not.toBe(
      await manifestVersion(before.manifest.text),
    );
    // ... and the public manifest is the same document as before: the marker is not part of the contract.
    const published = projectManifestContract(JSON.parse(after.manifest.text));
    expect(published).toEqual(projectManifestContract(JSON.parse(before.manifest.text)));
    expect(JSON.stringify(published)).not.toContain("nearbyMrtExitsMaterialization");
  });

  it("an unchanged rerun preserves every document, the marker and `updated_at`", async () => {
    await publish();
    const first = await state();
    await publish();
    expect(await state()).toEqual(first);
  });

  it("a changed derivation rewrites only the documents that differ and moves the identity", async () => {
    await publish();
    const first = await state();
    await publish({ ...ANSWERS, "yishun-301-no-exit": [exit("YISHUN MRT STATION", 1499.7, "9")] });
    const second = await state();
    expect(second.details[0]).toEqual(first.details[0]);
    expect(second.details[1]).toEqual(first.details[1]);
    expect(second.details[2].json.nearbyMrtExits).toHaveLength(1);
    expect(second.manifest.text).not.toBe(first.manifest.text);
    expect(await manifestVersion(second.manifest.text)).not.toBe(
      await manifestVersion(first.manifest.text),
    );
  });

  it.each([
    [
      "a block detail without a derived list",
      () => {
        const { "bedok-102-untouched": _dropped, ...rest } = ANSWERS;
        return rest;
      },
      "do not cover the candidate block details exactly (block details 3, derived 2, without a list 1, without a block detail 0)",
    ],
    [
      "a derived list for a block that has no detail",
      () => ({ ...ANSWERS, "nowhere-999": [] }),
      "do not cover the candidate block details exactly (block details 3, derived 4, without a list 0, without a block detail 1)",
    ],
    [
      "a list of six",
      () => ({
        ...ANSWERS,
        "bedok-101": Array.from({ length: 6 }, (_, i) =>
          exit(`S${i} MRT STATION`, 100 + i, `${i}`),
        ),
      }),
      "1 derived lists are not valid",
    ],
    [
      "an entry without an exit code",
      () => ({
        ...ANSWERS,
        "bedok-101": [{ ...exit("BEDOK MRT STATION", 310.4, "1"), exitLabel: "" }],
      }),
      "1 derived lists are not valid",
    ],
    [
      "an entry beyond the radius",
      () => ({ ...ANSWERS, "bedok-101": [exit("BEDOK MRT STATION", 1500.2, "1")] }),
      "1 derived lists are not valid",
    ],
  ])("refuses %s and leaves the candidate exactly as it was", async (_name, answers, message) => {
    const before = await state();
    await expect(publish(answers())).rejects.toThrow(message);
    // No document, no marker: the candidate is not admitted (the verifier requires the marker).
    expect(await state()).toEqual(before);
    expect(before.manifest.text).not.toContain("nearbyMrtExitsMaterialization");
  });

  it("a refused rerun keeps the earlier, complete publication", async () => {
    await publish();
    const first = await state();
    const { "bedok-101": _dropped, ...partial } = ANSWERS;
    await expect(publish(partial)).rejects.toThrow("do not cover the candidate block details");
    expect(await state()).toEqual(first);
  });
});
