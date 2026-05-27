import { privateJsonResponse } from "./d1";
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

  try {
    const { success } = await limiter.limit({ key: shortlistWriteRateLimitKey(request) });
    if (success) {
      return null;
    }
  } catch (error) {
    console.error("Rate limiter failed, allowing request:", error);
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

