import { fetchJson, fetchWithRetry } from "./fetchers";
import { waitForUpstreamSlot } from "./rate-limits";
import { oneMapRoutingResponseSchema, oneMapTokenResponseSchema } from "../schemas";
import type { D1Client } from "./d1";

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

const COORD_PRECISION = 5;
const EPOCH_TIMESTAMP = Temporal.Instant.fromEpochMilliseconds(0).toString({
  fractionalSecondDigits: 3,
});

function roundCoord(value: number): string {
  return value.toFixed(COORD_PRECISION);
}

export function buildRoutingCacheKey(start: RoutingCoordinate, end: RoutingCoordinate): RoutingCacheKey {
  return `${roundCoord(start.lat)},${roundCoord(start.lng)}|${roundCoord(end.lat)},${roundCoord(end.lng)}`;
}

type RoutingCacheRow = {
  cache_key: string;
  walking_time_seconds: number;
  walking_distance_meters: number | null;
};

export async function loadRoutingCache(db: D1Client): Promise<RoutingCacheFile> {
  const rows = await db.query<RoutingCacheRow>({
    sql: "SELECT cache_key, walking_time_seconds, walking_distance_meters FROM walking_time_cache",
  });
  const entries: RoutingCacheFile["entries"] = {};
  for (const row of rows) {
    entries[row.cache_key] = {
      walkingTimeSeconds: row.walking_time_seconds,
      walkingDistanceMeters: row.walking_distance_meters,
    };
  }
  return { version: 1, updatedAt: EPOCH_TIMESTAMP, entries };
}

export async function saveRoutingCacheEntries(
  db: D1Client,
  cache: RoutingCacheFile,
  keys: Iterable<string>,
  updatedAt: string,
): Promise<void> {
  const rows: Array<{ key: string; entry: RoutingCacheEntry }> = [];
  for (const key of keys) {
    const entry = cache.entries[key];
    if (entry) {
      rows.push({ key, entry });
    }
  }
  if (rows.length === 0) {
    return;
  }
  await db.batchInsert({
    table: "walking_time_cache",
    columns: [
      "cache_key",
      "walking_time_seconds",
      "walking_distance_meters",
      "updated_at",
    ],
    rows,
    upsert: true,
    mapRow: ({ key, entry }) => [
      key,
      entry.walkingTimeSeconds,
      entry.walkingDistanceMeters,
      updatedAt,
    ],
  });
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

  try {
    const payload = await fetchJson<unknown>(options.tokenEndpoint.toString(), {
      method: "POST",
      body: JSON.stringify({ email: options.email, password: options.password }),
    });
    const parsed = oneMapTokenResponseSchema.parse(payload);
    return parsed.access_token;
  } catch (error) {
    console.warn(
      `Failed to resolve OneMap token: ${error instanceof Error ? error.message : "unknown error"}. Falling back to walking-time estimates.`,
    );
    return null;
  }
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

  await waitForUpstreamSlot("onemap-routing");
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
  /** Called periodically with the keys newly added since the last flush. */
  flushCacheFn: (newKeys: string[]) => Promise<void>;
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
  } = {},
): Promise<RoutePairsResult> {
  const fetchWalkingRouteFn = deps.fetchWalkingRouteFn ?? fetchWalkingRoute;

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
  let pendingFlushKeys: string[] = [];
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
        pendingFlushKeys.push(pair.key);
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
        const keys = pendingFlushKeys;
        pendingFlushKeys = [];
        const flush = flushInFlight ? flushInFlight.catch(() => {}) : Promise.resolve();
        flushInFlight = flush.then(() => options.flushCacheFn(keys));
        await flushInFlight;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, missing.length) }, () => worker()),
  );

  return { routedCount, failedCount, failureSamples };
}

export { EPOCH_TIMESTAMP as ROUTING_CACHE_EPOCH };
