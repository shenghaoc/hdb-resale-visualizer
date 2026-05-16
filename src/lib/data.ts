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

let townFlatTrendsPromise: Promise<TownFlatTypeTrendPoint[]> | null = null;

class ArtifactFetchHttpError extends Error {
  status: number;

  constructor(path: string, status: number) {
    super(`Failed to load ${path}: ${status}`);
    this.name = "ArtifactFetchHttpError";
    this.status = status;
  }
}

function createArtifactContractError(path: string, reason: string) {
  return new Error(`Artifact contract violation for ${path}: ${reason}`);
}

async function fetchJson<TSchema extends z.ZodTypeAny>(path: string, schema: TSchema): Promise<z.infer<TSchema>> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new ArtifactFetchHttpError(path, response.status);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw createArtifactContractError(path, parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join(", ") || "invalid JSON shape");
  }

  return parsed.data;
}

export { townToFilename };

export function fetchManifest(): Promise<Manifest> {
  return fetchJson(`${DATA_BASE_PATH}/manifest.json`, manifestSchema);
}

export function fetchBlockSummaries(): Promise<BlockSummary[]> {
  return fetchJson(`${DATA_BASE_PATH}/block-summaries.json`, blockSummarySchema.array());
}

export function fetchBlocksByTown(town: string): Promise<BlockSummary[]> {
  return fetchJson(`${DATA_BASE_PATH}/blocks/${townToFilename(town)}.json`, blockSummarySchema.array());
}

export function resetTownFlatTypeTrendsCacheForTests(): void {
  townFlatTrendsPromise = null;
}

export function fetchTownFlatTypeTrends(): Promise<TownFlatTypeTrendPoint[]> {
  if (!townFlatTrendsPromise) {
    townFlatTrendsPromise = fetchJson(
      `${DATA_BASE_PATH}/trends/town-flat-type.json`,
      townFlatTypeTrendPointSchema.array(),
    ).catch((error) => {
      townFlatTrendsPromise = null;
      throw error;
    });
  }

  return townFlatTrendsPromise;
}

export function fetchAddressDetail(addressKey: string): Promise<AddressDetail> {
  return fetchJson(`${DATA_BASE_PATH}/details/${addressKey}.json`, addressDetailSchema);
}

export async function fetchComparisonArtifact(addressKey: string): Promise<ComparisonArtifact | null> {
  try {
    return await fetchJson(`${DATA_BASE_PATH}/comparisons/${addressKey}.json`, comparisonArtifactSchema);
  } catch (error) {
    // Return null if comparison data doesn't exist yet
    if (error instanceof ArtifactFetchHttpError && error.status === 404) {
      return null;
    }
    // Re-throw other errors (network issues, etc.)
    throw error;
  }
}
