import { privateJsonResponse } from "../../_lib/d1";
import {
  checkShortlistWriteRateLimit,
  type ShortlistWriteRateLimiter,
} from "../../_lib/shortlist-rate-limit";
import { handleShortlistPush } from "../../_lib/shortlist";
import { MAX_SYNC_BODY_BYTES } from "../../../shared/shortlist-limits";

/**
 * POST /api/shortlist — opt-in cloud sync write path.
 *
 * - No `syncCode`: mint a fresh anonymous code, create the row, return
 *   `{ syncCode, items }`.
 * - With `syncCode`: overwrite the stored row with the client's items (no
 *   server-side merge — deletions must not be resurrected). An unknown code is
 *   rejected (404) so codes are only ever server-minted, never client-chosen.
 *
 * Only the SHA-256 hash of the code is ever read or written; the raw code is
 * never persisted or logged. See functions/_lib/shortlist.ts for the logic.
 *
 * Rate limiting (defense in depth):
 * - (a) Workers binding `SHORTLIST_WRITE_LIMITER` — 10 POST writes / 60 s / IP
 *     per colo, enforced in code before any D1 mutation.
 * - (b) Cloudflare WAF custom rule (dashboard, not in-repo): expression
 *       `(http.request.uri.path eq "/api/shortlist" and http.request.method eq "POST")`,
 *       characteristic `ip.src`, rate 10 requests / 60 seconds, action Block
 *       (429). Apply at the zone edge ahead of the Worker.
 * - (c) Scheduled TTL purge of rows untouched for SHORTLIST_RETENTION_DAYS —
 *     see worker/index.ts scheduled handler.
 */
async function readBodyWithLimit(request: Request): Promise<string | Response> {
  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader) {
    return privateJsonResponse({ error: "Length Required" }, { status: 411 });
  }
  const declaredLength = Number(contentLengthHeader);
  if (
    !Number.isInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_SYNC_BODY_BYTES
  ) {
    return privateJsonResponse({ error: "Payload too large" }, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return privateJsonResponse({ error: "Bad Request" }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > MAX_SYNC_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* stream already closed */
        }
        return privateJsonResponse({ error: "Payload too large" }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return privateJsonResponse({ error: "Failed to read request body" }, { status: 400 });
  }

  const bodyBuffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bodyBuffer);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const limiter: ShortlistWriteRateLimiter | undefined = env.SHORTLIST_WRITE_LIMITER;
  const rateLimitResponse = await checkShortlistWriteRateLimit(request, limiter);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await readBodyWithLimit(request);
  if (body instanceof Response) {
    return body;
  }

  const result = await handleShortlistPush(env.DB, body);
  return privateJsonResponse(result.body, { status: result.status });
};
