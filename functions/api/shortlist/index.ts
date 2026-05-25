import { privateJsonResponse } from "../../_lib/d1";
import { handleShortlistPush } from "../../_lib/shortlist";
import { MAX_SYNC_BODY_BYTES } from "../../../shared/shortlist-limits";

/**
 * POST /api/shortlist — opt-in cloud sync write path.
 *
 * - No `syncCode`: mint a fresh anonymous code, create the row, return
 *   `{ syncCode, items }`.
 * - With `syncCode`: merge the incoming items into the stored row and return
 *   the merged set. An unknown code is rejected (404) so codes are only ever
 *   server-minted, never client-chosen.
 *
 * Only the SHA-256 hash of the code is ever read or written; the raw code is
 * never persisted or logged. See functions/_lib/shortlist.ts for the logic.
 *
 * Rate limiting: this endpoint has no built-in rate limiting on sync code
 * creation. A script issuing empty-payload POSTs in a tight loop could
 * accumulate unbounded rows and exhaust D1 storage. The recommended mitigation
 * is a Cloudflare WAF rate-limiting rule on POST /api/shortlist (zero code
 * change). For expected traffic volume this risk is accepted as-is.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Client-side/edge DoS guard: reject oversized bodies before reading them.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SYNC_BODY_BYTES) {
    return privateJsonResponse({ error: "Payload too large" }, { status: 413 });
  }

  const text = await request.text();
  const result = await handleShortlistPush(env.DB, text);
  return privateJsonResponse(result.body, { status: result.status });
};
