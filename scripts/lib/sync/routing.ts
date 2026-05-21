import fs from "node:fs/promises";
import path from "node:path";
import { fetchJson, fetchWithRetry } from "./fetchers";
import { oneMapRoutingResponseSchema, oneMapTokenResponseSchema } from "../schemas";

export type RoutingCacheKey = string;

export type RoutingCacheEntry = {
  walkingTimeSeconds: number;
  walkingDistanceMeters: number | null;
};

export type RoutingCacheFile = {
  version: 1;
  updatedAt: string;
  entries: Record<RoutingCacheKey, RoutingCacheEntry>;
};

export type RoutingCoordinate = { lat: number; lng: number };

// Cache keys are quantised to ~1 m precision so that microscopic float drift between
// runs (e.g. recomputed geocodes) does not cause spurious cache misses, while
// genuine MRT exit relocations or geocode corrections still recompute.
const COORD_PRECISION = 5;

function roundCoord(value: number): string {
  return value.toFixed(COORD_PRECISION);
}

export function buildRoutingCacheKey(start: RoutingCoordinate, end: RoutingCoordinate): RoutingCacheKey {
  return `${roundCoord(start.lat)},${roundCoord(start.lng)}|${roundCoord(end.lat)},${roundCoord(end.lng)}`;
}

export async function loadRoutingCache(cachePath: string): Promise<RoutingCacheFile> {
  try {
    const content = await fs.readFile(cachePath, "utf8");
    return JSON.parse(content) as RoutingCacheFile;
  } catch {
    return {
      version: 1,
      updatedAt: Temporal.Instant.fromEpochMilliseconds(0).toString({ fractionalSecondDigits: 3 }),
      entries: {},
    };
  }
}

export async function saveRoutingCache(cachePath: string, cache: RoutingCacheFile) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
}

export type OneMapTokenOptions = {
  email?: string;
  password?: string;
  token?: string;
  tokenEndpoint: URL;
};

export async function resolveOneMapToken(options: OneMapTokenOptions): Promise<string | null> {
  if (options.token && options.token.trim().length > 0) {
    return options.token.trim();
  }
  if (!options.email || !options.password) {
    return null;
  }

  const payload = await fetchJson<unknown>(options.tokenEndpoint.toString(), {
    method: "POST",
    body: JSON.stringify({ email: options.email, password: options.password }),
  });
  const parsed = oneMapTokenResponseSchema.parse(payload);
  return parsed.access_token;
}

export async function fetchWalkingRoute(
  start: RoutingCoordinate,
  end: RoutingCoordinate,
  routingEndpoint: URL,
  token: string,
): Promise<RoutingCacheEntry> {
  const url = new URL(routingEndpoint);
  url.searchParams.set("start", `${start.lat},${start.lng}`);
  url.searchParams.set("end", `${end.lat},${end.lng}`);
  url.searchParams.set("routeType", "walk");

  const response = await fetchWithRetry(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await response.json();
  const parsed = oneMapRoutingResponseSchema.parse(payload);

  if (!parsed.route_summary) {
    throw new Error(
      `OneMap routing returned no route_summary: ${parsed.status_message ?? "unknown"}`,
    );
  }

  return {
    walkingTimeSeconds: Math.round(parsed.route_summary.total_time),
    walkingDistanceMeters:
      parsed.route_summary.total_distance !== undefined
        ? Math.round(parsed.route_summary.total_distance)
        : null,
  };
}

export type RoutePairsOptions = {
  pairs: Array<{ key: RoutingCacheKey; start: RoutingCoordinate; end: RoutingCoordinate }>;
  cache: RoutingCacheFile;
  routingEndpoint: URL;
  token: string;
  cachePath: string;
  concurrency: number;
  now: () => string;
};

export type RoutePairsResult = {
  routedCount: number;
  failedCount: number;
  failureSamples: string[];
};

export async function routeMissingPairs(
  options: RoutePairsOptions,
  deps: {
    fetchWalkingRouteFn?: typeof fetchWalkingRoute;
    saveRoutingCacheFn?: typeof saveRoutingCache;
  } = {},
): Promise<RoutePairsResult> {
  const fetchWalkingRouteFn = deps.fetchWalkingRouteFn ?? fetchWalkingRoute;
  const saveRoutingCacheFn = deps.saveRoutingCacheFn ?? saveRoutingCache;

  const missing = options.pairs.filter((pair) => options.cache.entries[pair.key] === undefined);
  if (missing.length === 0) {
    return { routedCount: 0, failedCount: 0, failureSamples: [] };
  }

  console.log(
    `Routing ${missing.length} walking-distance pairs with concurrency ${options.concurrency}...`,
  );

  let nextIndex = 0;
  let completed = 0;
  let routedCount = 0;
  let failedCount = 0;
  const failureSamples: string[] = [];
  let flushedAt = 0;
  let flushInFlight: Promise<void> | null = null;

  async function worker() {
    while (nextIndex < missing.length) {
      const currentIndex = nextIndex++;
      const pair = missing[currentIndex];
      try {
        const entry = await fetchWalkingRouteFn(
          pair.start,
          pair.end,
          options.routingEndpoint,
          options.token,
        );
        options.cache.entries[pair.key] = entry;
        routedCount += 1;
      } catch (error) {
        failedCount += 1;
        if (failureSamples.length < 5) {
          failureSamples.push(
            `${pair.key}: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }
      completed += 1;
      if (completed % 200 === 0 || completed === missing.length) {
        console.log(`Routed ${completed}/${missing.length}`);
      }
      if (completed - flushedAt >= 250 || completed === missing.length) {
        flushedAt = completed;
        options.cache.updatedAt = options.now();
        const flush = flushInFlight ? flushInFlight.catch(() => {}) : Promise.resolve();
        flushInFlight = flush.then(() => saveRoutingCacheFn(options.cachePath, options.cache));
        await flushInFlight;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, missing.length) }, () => worker()),
  );

  return { routedCount, failedCount, failureSamples };
}

// Conservative pedestrian pace: distance / 1.25 m/s ≈ 75 m/min. Slightly
// slower than the 80 m/min proxy used elsewhere in the app to account for
// crossings, stairs, and detours not visible in straight-line distance.
const FALLBACK_PACE_METERS_PER_SECOND = 1.25;

export function fallbackWalkingTimeSeconds(distanceMeters: number): number {
  return Math.round(distanceMeters / FALLBACK_PACE_METERS_PER_SECOND);
}
