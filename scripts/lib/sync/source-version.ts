import { datasetMetadataSchema } from "../schemas";
import { fetchJson } from "./fetchers";

/** Official metadata timestamps are observability hints, never reconciliation triggers. */
export async function fetchSourceVersionHints(
  datasetIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(datasetIds)].sort();
  if (!ids.length || ids.length > 64) throw new Error("Invalid source metadata inventory");
  const versions: Record<string, string> = {};
  for (const datasetId of ids) {
    const payload = datasetMetadataSchema.parse(
      await fetchJson<unknown>(
        `https://api-production.data.gov.sg/v2/public/api/datasets/${datasetId}/metadata`,
      ),
    );
    if (payload.errorMsg) throw new Error("Upstream source metadata reports an error");
    if (payload.data.datasetId !== datasetId) throw new Error("Source metadata dataset mismatch");
    versions[datasetId] = new Date(payload.data.lastUpdatedAt).toISOString();
  }
  return versions;
}

export function sourceVersionHintsChanged(
  previousHints: Record<string, string> | undefined,
  nextHints: Record<string, string>,
): boolean {
  if (!previousHints) return true;
  const entries = Object.entries(nextHints);
  return (
    Object.keys(previousHints).length !== entries.length ||
    entries.some(([id, version]) => previousHints[id] !== version)
  );
}
