import { readFileSync } from "node:fs";

/**
 * Request samples for the deployed-path check of GET /api/nearby-places. The defaults use coordinates read from a
 * disposable fork of the serving branch (`blocks` and `poi_locations` rows) plus deliberate edge cases. A JSON file
 * named by SAMPLES_FILE replaces them, which is how the local rehearsal uses its own synthetic data.
 */
const FORK_SAMPLES = [
  { id: "grounded-535-exits-1500", lat: 1.2846, lng: 103.8462, radius: 1500, types: "mrt_exit" },
  {
    id: "grounded-535-all-1000",
    lat: 1.2846,
    lng: 103.8462,
    radius: 1000,
    types: "hdb_block,mrt_station,mrt_exit",
  },
  { id: "bukit-merah-48-default-500", lat: 1.2873, lng: 103.811, radius: 500 },
  { id: "amk-215-blocks-250", lat: 1.3666, lng: 103.8416, radius: 250, types: "hdb_block" },
  {
    id: "bedok-110-blocks-exits-1000",
    lat: 1.3325,
    lng: 103.9349,
    radius: 1000,
    types: "hdb_block,mrt_exit",
  },
  {
    id: "tg-pagar-plaza-all-100",
    lat: 1.2771,
    lng: 103.8431,
    radius: 100,
    types: "hdb_block,mrt_station,mrt_exit",
  },
  {
    id: "bukit-panjang-509-stations-exits-2500",
    lat: 1.3866,
    lng: 103.769,
    radius: 2500,
    types: "mrt_station,mrt_exit",
  },
  { id: "sembawang-591a-default-1500", lat: 1.4508, lng: 103.8262, radius: 1500 },
  { id: "cc9-code-labelled-exit-100", lat: 1.3183, lng: 103.8932, radius: 100, types: "mrt_exit" },
  { id: "dt18-code-labelled-exit-250", lat: 1.2827, lng: 103.8475, radius: 250, types: "mrt_exit" },
  {
    id: "offshore-south-2500",
    lat: 1.19,
    lng: 103.8,
    radius: 2500,
    types: "hdb_block,mrt_station,mrt_exit",
  },
  {
    id: "box-corner-outside-sg-2500",
    lat: 1.55,
    lng: 104.15,
    radius: 2500,
    types: "hdb_block,mrt_station,mrt_exit",
  },
  {
    id: "radius-101-rounds-up-to-250",
    lat: 1.3666,
    lng: 103.8416,
    radius: 101,
    types: "hdb_block",
  },
];

export const SAMPLES = process.env.SAMPLES_FILE
  ? JSON.parse(readFileSync(process.env.SAMPLES_FILE, "utf8"))
  : FORK_SAMPLES;

export const KINDS = ["hdb_block", "mrt_station", "mrt_exit"];

const GRID_SCALE = 10_000;
const RADIUS_BUCKETS = [100, 250, 500, 1000, 1500, 2500];

/** The Worker's own canonicalisation: snap to 0.0001 degrees, round the radius up to a bucket, order the kinds. */
export function canonical(sample) {
  const snap = (value) => Math.round(value * GRID_SCALE) / GRID_SCALE;
  const wanted = sample.types ? sample.types.split(",") : ["mrt_station", "mrt_exit"];
  return {
    lat: snap(sample.lat),
    lng: snap(sample.lng),
    radius: RADIUS_BUCKETS.find((bucket) => sample.radius <= bucket) ?? 2500,
    kinds: KINDS.filter((kind) => wanted.includes(kind)),
  };
}

export function queryString(sample) {
  const params = new URLSearchParams({
    lat: String(sample.lat),
    lng: String(sample.lng),
    radius: String(sample.radius),
  });
  if (sample.types) params.set("types", sample.types);
  return params.toString();
}
