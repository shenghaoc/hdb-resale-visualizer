import { DATA_BASE_PATH } from "@/lib/constants";
import type {
  AddressDetail,
  BlockSummary,
  ComparisonArtifact,
  Manifest,
  TownFlatTypeTrendPoint,
} from "@/types/data";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchManifest() {
  return fetchJson<Manifest>(`${DATA_BASE_PATH}/manifest.json`);
}

export function fetchBlockSummaries() {
  return fetchJson<BlockSummary[]>(`${DATA_BASE_PATH}/block-summaries.json`);
}

export function fetchTownFlatTypeTrends() {
  return fetchJson<TownFlatTypeTrendPoint[]>(`${DATA_BASE_PATH}/trends/town-flat-type.json`);
}

export function fetchAddressDetail(addressKey: string) {
  return fetchJson<AddressDetail>(`${DATA_BASE_PATH}/details/${addressKey}.json`);
}

export async function fetchComparisonArtifact(addressKey: string): Promise<ComparisonArtifact | null> {
  try {
    return await fetchJson<ComparisonArtifact>(`${DATA_BASE_PATH}/comparisons/${addressKey}.json`);
  } catch (error) {
    // Return null if comparison data doesn't exist yet
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    // Re-throw other errors (network issues, etc.)
    throw error;
  }
}
