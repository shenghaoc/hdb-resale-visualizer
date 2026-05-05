export const CRITICAL_DATA_ARTIFACT_PATHS = {
  manifest: "manifest.json",
  blockSummaries: "block-summaries.json",
  townFlatTypeTrend: "trends/town-flat-type.json",
  mrtExits: "mrt-exits.geojson",
  mrtStations: "mrt-stations.geojson",
} as const;

export const REQUIRED_DATA_FILES = [
  CRITICAL_DATA_ARTIFACT_PATHS.manifest,
  CRITICAL_DATA_ARTIFACT_PATHS.blockSummaries,
  CRITICAL_DATA_ARTIFACT_PATHS.townFlatTypeTrend,
  CRITICAL_DATA_ARTIFACT_PATHS.mrtExits,
  CRITICAL_DATA_ARTIFACT_PATHS.mrtStations,
] as const;

export const REQUIRED_DATA_DIRECTORIES = ["blocks", "details"] as const;
