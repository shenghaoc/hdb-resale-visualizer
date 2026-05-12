import { DATA_BASE_PATH } from "@/lib/constants";
import { townToFilename } from "@/lib/utils";
import {
  addressDetailSchema,
  blockSummarySchema,
  comparisonArtifactSchema,
  manifestSchema,
  townFlatTypeTrendPointSchema,
} from "@/lib/dataSchemas";
import type {
  AddressDetail,
  BlockSummary,
  ComparisonArtifact,
  Manifest,
  TownFlatTypeTrendPoint,
} from "@/types/data";
import type { z } from "zod";

function createArtifactContractError(path: string, reason: string) {
  return new Error(`Artifact contract violation for ${path}: ${reason}`);
}

async function fetchJson<TSchema extends z.ZodTypeAny>(path: string, schema: TSchema): Promise<z.infer<TSchema>> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw createArtifactContractError(path, parsed.error.issues[0]?.message ?? "invalid JSON shape");
  }

  return parsed.data;
}

export { townToFilename };

export function fetchManifest() {
  return fetchJson(`${DATA_BASE_PATH}/manifest.json`, manifestSchema) as Promise<Manifest>;
}

export function fetchBlockSummaries() {
  return fetchJson(`${DATA_BASE_PATH}/block-summaries.json`, blockSummarySchema.array()) as Promise<BlockSummary[]>;
}

export function fetchBlocksByTown(town: string) {
  return fetchJson(`${DATA_BASE_PATH}/blocks/${townToFilename(town)}.json`, blockSummarySchema.array()) as Promise<BlockSummary[]>;
}

export function fetchTownFlatTypeTrends() {
  return fetchJson(`${DATA_BASE_PATH}/trends/town-flat-type.json`, townFlatTypeTrendPointSchema.array()) as Promise<TownFlatTypeTrendPoint[]>;
}

export function fetchAddressDetail(addressKey: string) {
  return fetchJson(`${DATA_BASE_PATH}/details/${addressKey}.json`, addressDetailSchema) as Promise<AddressDetail>;
}

export async function fetchComparisonArtifact(addressKey: string): Promise<ComparisonArtifact | null> {
  try {
    return await fetchJson(`${DATA_BASE_PATH}/comparisons/${addressKey}.json`, comparisonArtifactSchema) as Promise<ComparisonArtifact>;
  } catch (error) {
    // Return null if comparison data doesn't exist yet
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    // Re-throw other errors (network issues, etc.)
    throw error;
  }
}
