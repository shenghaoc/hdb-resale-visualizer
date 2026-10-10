import { privateJsonResponse } from "./d1";
import {
  NEARBY_ORIGIN_RATE_LIMIT_KEY,
  NEARBY_RATE_LIMIT_PERIOD_SEC,
} from "../../shared/nearby-limits";

export type NearbyRateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

const FALLBACK_CLIENT_KEY = "unknown-ip";
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV4_MAPPED_IPV6 = /^::ffff:((?:\d{1,3}\.){3}\d{1,3})$/;

function validIPv4(address: string): boolean {
  return IPV4.test(address) && address.split(".").every((part) => Number(part) <= 255);
}

/** Expands an IPv6 literal to eight 4-digit hextets, or null when it is not valid IPv6. */
function expandIPv6(address: string): string[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parse = (text: string): string[] | null => {
    if (text === "") return [];
    const groups = text.split(":");
    if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
    return groups.map((group) => group.padStart(4, "0"));
  };
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing >= 1 ? [...head, ...Array<string>(missing).fill("0000"), ...tail] : null;
}

/**
 * Stable per-client key for the Workers Rate Limiting binding. IPv4 addresses are used as they are.
 * IPv6 addresses collapse to their /64 prefix, because one subscriber typically owns a whole /64 and
 * could otherwise rotate addresses inside it to dodge a per-address limit.
 */
export function nearbyClientRateLimitKey(request: Request): string {
  const raw = request.headers.get("CF-Connecting-IP")?.trim().toLowerCase().split("%")[0];
  if (!raw) return FALLBACK_CLIENT_KEY;
  if (validIPv4(raw)) return raw;
  const mapped = IPV4_MAPPED_IPV6.exec(raw)?.[1];
  if (mapped) return validIPv4(mapped) ? mapped : FALLBACK_CLIENT_KEY;
  const hextets = expandIPv6(raw);
  return hextets ? `v6:${hextets.slice(0, 4).join(":")}` : FALLBACK_CLIENT_KEY;
}

const notConfigured = () =>
  privateJsonResponse({ error: "Nearby search is not configured" }, { status: 503 });

/**
 * Per-client limit, checked before the cache or the database is touched. A missing binding while the
 * feature is enabled is a deployment mistake, so it answers 503 instead of silently running unlimited.
 * A limiter that throws is treated as unavailable: the request proceeds and the failure is logged. That is
 * safe only because this limit is about fairness between clients, not about protecting the database: every
 * request that would reach the database still has to pass the origin checks, which fail closed.
 */
export async function checkNearbyClientRateLimit(
  request: Request,
  limiter: NearbyRateLimiter | undefined,
): Promise<Response | null> {
  if (!limiter) return notConfigured();
  try {
    const { success } = await limiter.limit({ key: nearbyClientRateLimitKey(request) });
    if (success) return null;
  } catch (error) {
    console.error("Nearby client rate limiter failed, allowing request:", error);
    return null;
  }
  return privateJsonResponse(
    { error: "Too Many Requests" },
    { status: 429, headers: { "Retry-After": String(NEARBY_RATE_LIMIT_PERIOD_SEC) } },
  );
}

/**
 * Per-location cap on cache-miss queries, checked only when the answer has to come from the database.
 * Answers 503 (the service is protecting itself) rather than 429 (the client did nothing wrong).
 *
 * This is the guard in front of the metered database, so it FAILS CLOSED: a limiter that throws means the
 * request is refused (and logged), never forwarded unchecked. Cached answers are unaffected because hits
 * never reach this check.
 */
export async function checkNearbyOriginRateLimit(
  limiter: NearbyRateLimiter | undefined,
): Promise<Response | null> {
  if (!limiter) return notConfigured();
  try {
    const { success } = await limiter.limit({ key: NEARBY_ORIGIN_RATE_LIMIT_KEY });
    if (success) return null;
  } catch (error) {
    console.error("Nearby origin rate limiter failed, refusing request:", error);
    return privateJsonResponse(
      { error: "Nearby search is temporarily unavailable" },
      { status: 503, headers: { "Retry-After": String(NEARBY_RATE_LIMIT_PERIOD_SEC) } },
    );
  }
  return privateJsonResponse(
    { error: "Nearby search is busy, try again shortly" },
    { status: 503, headers: { "Retry-After": String(NEARBY_RATE_LIMIT_PERIOD_SEC) } },
  );
}
