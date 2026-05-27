import { privateJsonResponse } from "./d1";
import { handleShortlistPush, type SyncDB, type SyncResult } from "./shortlist";
import { SHORTLIST_WRITE_RATE_LIMIT_PERIOD_SEC } from "../../shared/shortlist-limits";

export type ShortlistWriteRateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

const FALLBACK_RATE_LIMIT_KEY = "unknown-ip";

/** Stable per-request key for the Workers Rate Limiting binding. */
export function shortlistWriteRateLimitKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? FALLBACK_RATE_LIMIT_KEY;
}

/**
 * Enforce the shortlist write rate limit before any D1 mutation.
 * Returns a 429 response when limited, otherwise null.
 */
export async function checkShortlistWriteRateLimit(
  request: Request,
  limiter: ShortlistWriteRateLimiter | undefined,
): Promise<Response | null> {
  if (!limiter) {
    return null;
  }

  const { success } = await limiter.limit({ key: shortlistWriteRateLimitKey(request) });
  if (success) {
    return null;
  }

  return privateJsonResponse(
    { error: "Too Many Requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(SHORTLIST_WRITE_RATE_LIMIT_PERIOD_SEC),
      },
    },
  );
}

/**
 * Rate-limit gate in front of {@link handleShortlistPush}. Extracted so the
 * write path can be unit-tested without importing the Pages handler module.
 */
export async function runShortlistWriteIfAllowed(
  request: Request,
  db: SyncDB,
  bodyText: string,
  limiter: ShortlistWriteRateLimiter | undefined,
): Promise<Response | SyncResult> {
  const rateLimitResponse = await checkShortlistWriteRateLimit(request, limiter);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  return handleShortlistPush(db, bodyText);
}
