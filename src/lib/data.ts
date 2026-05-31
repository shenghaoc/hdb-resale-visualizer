import { API_BASE_PATH } from "./constants";
import { townToFilename } from "./utils";
import {
  addressDetailSchema,
  blockSummarySchema,
  comparisonArtifactSchema,
  manifestSchema,
  townFlatTypeTrendPointSchema,
  searchResponseSchema,
  suggestResponseSchema,
} from "./dataSchemas";
import type {
  AddressDetail,
  BlockSummary,
  ComparisonArtifact,
  Manifest,
  Suggestion,
  TownFlatTypeTrendPoint,
} from "../types/data";
import type { z } from "zod";

let townFlatTrendsPromise: Promise<TownFlatTypeTrendPoint[]> | null = null;
const blocksByTownPromises = new Map<string, Promise<BlockSummary[]>>();
let blocksBySearchPromise: Promise<{ blocks: BlockSummary[]; truncated: boolean; limit: number }> | null =
  null;
let blocksBySearchKey = "";
let blocksBySearchSequence = 0;

const SUGGEST_CACHE_LIMIT = 32;
const suggestCache = new Map<string, Promise<Suggestion[]>>();
const SUGGEST_TIMEOUT_MS = 10_000;

const MAX_FETCH_ATTEMPTS = 3;
const DEFAULT_FETCH_RETRY_BASE_DELAY_MS = 400;

export const DATA_FETCH_USER_ERROR_MESSAGE =
  "Unable to load data after several attempts. Check your connection and refresh the page.";

class ArtifactFetchHttpError extends Error {
  status: number;

  constructor(path: string, status: number) {
    super(`Failed to load ${path}: ${status}`);
    this.name = "ArtifactFetchHttpError";
    this.status = status;
  }
}

export class DataFetchError extends Error {
  readonly userMessage: string;
  readonly path: string;

  constructor(path: string, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "DataFetchError";
    this.path = path;
    this.userMessage = userMessage;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function createArtifactContractError(path: string, reason: string) {
  return new Error(`Artifact contract violation for ${path}: ${reason}`);
}

let fetchRetryBaseDelayMs = DEFAULT_FETCH_RETRY_BASE_DELAY_MS;

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      reject(abortReason(signal!));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isTransientFetchFailure(error: unknown): boolean {
  if (error instanceof ArtifactFetchHttpError) {
    return isTransientHttpStatus(error.status);
  }
  if ((error instanceof Error || error instanceof DOMException) && error.name === "AbortError") {
    return false;
  }
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}

export function setFetchRetryDelayForTests(ms: number): void {
  fetchRetryBaseDelayMs = ms;
}

export function resetFetchRetrySettingsForTests(): void {
  fetchRetryBaseDelayMs = DEFAULT_FETCH_RETRY_BASE_DELAY_MS;
}

async function fetchJsonOnce<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  signal?: AbortSignal,
): Promise<z.infer<TSchema>> {
  const response = signal ? await fetch(path, { signal }) : await fetch(path);

  if (!response.ok) {
    throw new ArtifactFetchHttpError(path, response.status);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw createArtifactContractError(path, parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join(", ") || "invalid JSON shape");
  }

  return parsed.data;
}

async function fetchJson<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  signal?: AbortSignal,
): Promise<z.infer<TSchema>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJsonOnce(path, schema, signal);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      lastError = error;
      if (!isTransientFetchFailure(error)) {
        throw error;
      }

      if (attempt < MAX_FETCH_ATTEMPTS - 1) {
        // Pass the signal so an abort during backoff rejects immediately
        // instead of waiting out the full delay before the next attempt aborts.
        await sleep(fetchRetryBaseDelayMs * 2 ** attempt, signal);
      }
    }
  }

  throw new DataFetchError(path, DATA_FETCH_USER_ERROR_MESSAGE, lastError);
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

function evictSuggestCacheIfNeeded(): void {
  if (suggestCache.size < SUGGEST_CACHE_LIMIT) {
    return;
  }
  const oldestKey = suggestCache.keys().next().value;
  if (oldestKey !== undefined) {
    suggestCache.delete(oldestKey);
  }
}

export function resetSuggestCacheForTests(): void {
  suggestCache.clear();
}

export function fetchSuggestions(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const trimmed = query.trim();
  const cacheKey = trimmed.toLowerCase();
  if (!cacheKey || cacheKey.length < 2) {
    return Promise.resolve([]);
  }

  let shared = suggestCache.get(cacheKey);
  if (!shared) {
    evictSuggestCacheIfNeeded();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUGGEST_TIMEOUT_MS);
    shared = fetchJson(
      `${API_BASE_PATH}/suggest?q=${encodeURIComponent(trimmed)}`,
      suggestResponseSchema,
      controller.signal,
    )
      .then((response) => {
        clearTimeout(timeout);
        return response.suggestions;
      })
      .catch((error) => {
        clearTimeout(timeout);
        if (suggestCache.get(cacheKey) === shared) {
          suggestCache.delete(cacheKey);
        }
        throw error;
      });
    suggestCache.set(cacheKey, shared);
  } else {
    // Re-insert to move to end for LRU order (Map preserves insertion sequence)
    suggestCache.delete(cacheKey);
    suggestCache.set(cacheKey, shared);
  }

  if (!signal) {
    return shared;
  }

  if (signal.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
  }

  // Wrap so that aborting this caller's signal doesn't cancel the shared fetch.
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort);
    shared.then(
      (res) => {
        signal.removeEventListener("abort", onAbort);
        resolve(res);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
