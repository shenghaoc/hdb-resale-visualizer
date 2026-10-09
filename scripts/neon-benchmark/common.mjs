import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
export const PROJECT = "wispy-mouse-67963002";
export const BRANCH = "br-wispy-boat-b34glczl";
export const ENDPOINT = "ep-steep-moon-b35xjj4d";
export const SCRATCH = ".neon-benchmark";
export function benchmarkUrl() {
  const value = readFileSync(`${SCRATCH}/connection.txt`, "utf8").trim();
  const url = new URL(value);
  if (url.hostname !== `${ENDPOINT}.c-4.ap-southeast-1.aws.neon.tech`)
    throw new Error("Only verified benchmark direct endpoint permitted");
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
export async function connect() {
  const client = new pg.Client({
    connectionString: benchmarkUrl(),
    application_name: "hdb-neon-benchmark",
    statement_timeout: 120000,
    connectionTimeoutMillis: 30000,
  });
  const started = performance.now();
  await client.connect();
  await client.query("SET lock_timeout='5s'");
  return { client, connectionMs: performance.now() - started };
}
export function save(name, value) {
  writeFileSync(`${SCRATCH}/${name}.json`, JSON.stringify(value, null, 2));
}
export const TABLES = [
  "transactions",
  "blocks",
  "block_details",
  "comparisons",
  "town_flat_type_trends",
  "manifest",
  "mrt_geojson",
  "geocode_cache",
  "walking_time_cache",
];
export function csvCell(value) {
  return value === null || value === undefined ? "" : `"${String(value).replaceAll('"', '""')}"`;
}
