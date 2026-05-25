import { API_BASE_PATH } from "./constants";
import { townToFilename } from "./utils";
import {
  addressDetailSchema,
  blockSummarySchema,
  comparisonArtifactSchema,
  manifestSchema,
  townFlatTypeTrendPointSchema,
  searchResponseSchema,
} from "./dataSchemas";
import type {
  AddressDetail,
  BlockSummary,
  ComparisonArtifact,
  Manifest,
  TownFlatTypeTrendPoint,
} from "../types/data";
import type { z } from "zod";

let townFlatTrendsPromise: Promise<TownFlatTypeTrendPoint[]> | null = null;
const blocksByTownPromises = new Map<string, Promise<BlockSummary[]>>();
let blocksBySearchPromise: Promise<{ blocks: BlockSummary[]; truncated: boolean; limit: number }> | null =
  null;
let blocksBySearchKey = "";
let blocksBySearchSequence = 0;

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
  return fetchJson(`${API_BASE_PATH}/manifest`, manifestSchema);
}

export function fetchBlockSummaries(): Promise<BlockSummary[]> {
  return fetchJson(`${API_BASE_PATH}/block-summaries`, blockSummarySchema.array());
}

export function fetchBlocksByTown(town: string): Promise<BlockSummary[]> {
  const existing = blocksByTownPromises.get(town);
  if (existing) return existing;
  const request = fetchJson(
    `${API_BASE_PATH}/blocks/${townToFilename(town)}`,
    blockSummarySchema.array(),
  ).catch((error) => {
    blocksByTownPromises.delete(town);
    throw error;
  });
  blocksByTownPromises.set(town, request);
  return request;
}

export function resetTownFlatTypeTrendsCacheForTests(): void {
  townFlatTrendsPromise = null;
}

export function fetchTownFlatTypeTrends(): Promise<TownFlatTypeTrendPoint[]> {
  if (!townFlatTrendsPromise) {
    townFlatTrendsPromise = fetchJson(
      `${API_BASE_PATH}/trends/town-flat-type`,
      townFlatTypeTrendPointSchema.array(),
    ).catch((error) => {
      townFlatTrendsPromise = null;
      throw error;
    });
  }

  return townFlatTrendsPromise;
}

export function fetchAddressDetail(addressKey: string): Promise<AddressDetail> {
  return fetchJson(`${API_BASE_PATH}/details/${addressKey}`, addressDetailSchema);
}

export async function fetchComparisonArtifact(addressKey: string): Promise<ComparisonArtifact | null> {
  try {
    return await fetchJson(`${API_BASE_PATH}/comparisons/${addressKey}`, comparisonArtifactSchema);
  } catch (error) {
    if (error instanceof ArtifactFetchHttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
}


export type CoarseSearchParams = {
  town: string;
  flatType: string;
  flatModel: string;
  budgetMin: number | null;
  budgetMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  remainingLeaseMin: number | null;
  startMonth: string | null;
  endMonth: string | null;
  mrtMax: number | null;
};

export function resetBlocksBySearchCacheForTests(): void {
  blocksBySearchPromise = null;
  blocksBySearchKey = "";
  blocksBySearchSequence = 0;
}

export function fetchBlocksBySearch(
  params: CoarseSearchParams,
): Promise<{ blocks: BlockSummary[]; truncated: boolean; limit: number }> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") search.set(k, String(v));
  }
  const query = search.toString();
  const cacheKey = query;
  if (blocksBySearchPromise && blocksBySearchKey === cacheKey) {
    return blocksBySearchPromise;
  }

  const sequence = ++blocksBySearchSequence;
  blocksBySearchKey = cacheKey;
  blocksBySearchPromise = fetchJson(
    `${API_BASE_PATH}/search${query ? `?${query}` : ""}`,
    searchResponseSchema,
  ).catch((error) => {
    if (blocksBySearchSequence === sequence && blocksBySearchKey === cacheKey) {
      blocksBySearchPromise = null;
      blocksBySearchKey = "";
    }
    throw error;
  });
  return blocksBySearchPromise;
}
