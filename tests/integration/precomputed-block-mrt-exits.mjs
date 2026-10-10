/**
 * Disposable PostGIS integration test for the exact publication SQL and the
 * shipped NEARBY_SPATIAL_SQL. Runs on an empty CI service database only.
 * No Neon credentials, private exports, uploaded artifacts or screenshot evidence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { NEARBY_SPATIAL_SQL } from "../../worker/nearby-spatial-query.ts";
import { snapNearbyCenter } from "../../shared/nearby-places.ts";

if (process.env.HDB_DISPOSABLE_POSTGIS_TEST !== "yes") {
  throw new Error("Requires explicit HDB_DISPOSABLE_POSTGIS_TEST=yes");
}
const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;
assert(["localhost", "127.0.0.1", "::1"].includes(PGHOST));
assert(PGDATABASE === "hdb_nearby_precompute_test");
const client = new pg.Client({
  host: PGHOST,
  port: Number(PGPORT),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
});
const publisher = readFileSync("sql/neon/publish_block_detail_nearby_mrt_exits.sql", "utf8");
const documentJson = async () => {
  const { rows } = await client.query(
    "SELECT address_key,json::text AS doc FROM public.block_details ORDER BY address_key",
  );
  return rows.map((row) => [row.address_key, JSON.parse(row.doc)]);
};
try {
  await client.connect();
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE TABLE public.blocks (
      address_key text PRIMARY KEY, block text NOT NULL,street_name text NOT NULL,
      display_name text,lat double precision NOT NULL,lng double precision NOT NULL
    );
    CREATE TABLE public.block_locations (
      address_key text PRIMARY KEY,
      lat double precision NOT NULL,lng double precision NOT NULL,
      location geography(Point,4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography
      ) STORED
    );
    CREATE INDEX ON public.block_locations USING gist(location);
    CREATE TABLE public.poi_locations(
      source text NOT NULL,poi_kind text NOT NULL,source_id text NOT NULL,
      name text NOT NULL,lat double precision NOT NULL,lng double precision NOT NULL,
      source_properties jsonb NOT NULL,
      location geography(Point,4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography
      ) STORED,
      PRIMARY KEY(source,poi_kind,source_id)
    );
    CREATE INDEX ON public.poi_locations USING gist(location);
    CREATE TABLE public.block_details(address_key text PRIMARY KEY,json jsonb NOT NULL);
    CREATE TABLE public.manifest(id integer PRIMARY KEY,json jsonb NOT NULL);
  `);
  await client.query(`
    INSERT INTO public.blocks(address_key,block,street_name,lat,lng)
    VALUES ('near','1','TEST ROAD',1.350049,103.750049),
           ('empty','2','EMPTY ROAD',1.450049,103.950049);
    INSERT INTO public.block_locations(address_key,lat,lng)
    SELECT address_key,lat,lng FROM public.blocks;
    INSERT INTO public.block_details(address_key,json)
    VALUES ('near','{"summary":{},"recentTransactions":[],"monthlyTrend":[]}'::jsonb),
           ('empty','{"summary":{},"recentTransactions":[],"monthlyTrend":[]}'::jsonb);
    INSERT INTO public.manifest(id,json)
    VALUES (1,'{"generatedAt":"2026-10-10T00:00:00Z","schemaVersion":"test"}'::jsonb);
    INSERT INTO public.poi_locations(source,poi_kind,source_id,name,lat,lng,source_properties)
    SELECT 'mrt_geojson','mrt_exit',lpad(g::text,3,'0'),
      'BUGIS MRT STATION (' || CASE WHEN g=1 THEN 'E' ELSE 'Exit '||g END || ')',
      1.35015+(g*0.000001),103.75012,
      jsonb_build_object('STATION_NA','BUGIS MRT STATION','EXIT_CODE',
        CASE WHEN g=1 THEN 'E' ELSE 'Exit '||g END)
    FROM generate_series(1,35) g;
    INSERT INTO public.poi_locations(source,poi_kind,source_id,name,lat,lng,source_properties)
    VALUES
      ('mrt_geojson','mrt_exit','901','OTHER STATION (Exit A)',1.3509,103.7506,
       '{"STATION_NA":"OTHER STATION","EXIT_CODE":"Exit A"}'::jsonb),
      ('mrt_geojson','mrt_exit','902','THIRD STATION (Exit B)',1.3519,103.751,
       '{"STATION_NA":"THIRD STATION","EXIT_CODE":"Exit B"}'::jsonb);
  `);
  const oldVersion = await client.query("SELECT json::text AS json FROM public.manifest WHERE id=1");
  await client.query(publisher);
  const docs = await documentJson();
  assert.equal(docs.length, 2);
  assert.deepEqual(docs[0][1].nearbyMrtExits, []);
  const populated = docs[1][1].nearbyMrtExits;
  assert.equal(populated.length, 3, "Grouping MUST happen before SQL LIMIT 25");
  assert.equal(populated[0].exitLabel, "E", "Source EXIT_CODE must not be parsed from name");
  const centre = snapNearbyCenter(1.350049, 103.750049);
  const oracle = await client.query(NEARBY_SPATIAL_SQL, [
    centre.lat,centre.lng,1500,["mrt_exit"],25,
  ]);
  const expected = oracle.rows.slice(0,5).map((row) => ({
    stationName:row.station_name,
    exitLabel:row.exit_code,
    distanceMeters:row.distance_meters,
    exitId:row.id,
  }));
  assert.deepEqual(populated, expected, "Published list differs from the shipped SQL oracle");

  const firstDocuments = JSON.stringify(docs);
  const firstMarker = (await client.query("SELECT json::text AS doc FROM public.manifest WHERE id=1")).rows[0].doc;
  assert.notEqual(firstMarker, oldVersion.rows[0].json, "Internal manifest identity must change");
  assert.deepEqual(JSON.parse(firstMarker).nearbyMrtExitsMaterialization, {
    version:1,radiusMeters:1500,maxStations:5,
  });
  await client.query(publisher);
  assert.equal(JSON.stringify(await documentJson()),firstDocuments,"Repeat publication must be idempotent");
  assert.equal((await client.query("SELECT json::text AS doc FROM public.manifest WHERE id=1")).rows[0].doc,firstMarker);

  console.log("PostGIS publish-time MRT exits: passed; exact SQL parity, top-five grouping, empty, marker and idempotence");
} finally {
  await client.end().catch(() => {});
}
