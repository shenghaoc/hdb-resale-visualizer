/**
 * The public shape of `GET /api/manifest`.
 *
 * The stored manifest row is written by the data pipeline and may carry internal bookkeeping (sync build
 * state, publication identity, reconciliation evidence, the D1 `publicationInProgress` marker). None of that
 * is part of the public contract, and a backend change must never widen it, so the handler projects every
 * stored manifest through this list.
 * Keys are emitted in declaration order, which is also the order the D1 publication stores, so the output
 * is byte-for-byte what D1 serves today regardless of how the backend orders JSON object keys.
 *
 * Keep these lists equal to `manifestSchema` in `src/shared/lib/dataSchemas.ts` and to `Manifest` in
 * `shared/data-types.ts`; tests/unit/manifest-contract.test.ts fails when they drift.
 */
export const MANIFEST_CONTRACT = {
  top: ["schemaVersion", "generatedAt", "dataWindow", "sources", "filterOptions", "counts"],
  dataWindow: ["minMonth", "maxMonth"],
  sources: [
    "resaleCollectionId",
    "resaleDatasetIds",
    "propertyDatasetId",
    "mrtDatasetId",
    "moeSchoolDatasetId",
    "neaHawkerDatasetId",
    "sfaSupermarketDatasetId",
    "nparksParksDatasetId",
    "lastUpdatedAt",
  ],
  filterOptions: ["towns", "flatTypes", "flatModels"],
  counts: ["blocks", "transactions", "towns", "mrtStations", "comparisons"],
} as const;

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function pick(source: Plain, keys: readonly string[]): Plain {
  const out: Plain = {};
  for (const key of keys) if (Object.hasOwn(source, key)) out[key] = source[key];
  return out;
}

/** Returns the manifest restricted to its public contract. Non-object values pass through untouched. */
export function projectManifestContract(raw: unknown): unknown {
  if (!isPlain(raw)) return raw;
  const out = pick(raw, MANIFEST_CONTRACT.top);
  for (const section of ["dataWindow", "sources", "filterOptions", "counts"] as const) {
    const value = out[section];
    if (isPlain(value)) out[section] = pick(value, MANIFEST_CONTRACT[section]);
  }
  return out;
}
