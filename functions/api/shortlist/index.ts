import { privateJsonResponse, readBodyWithLimit } from "../../_lib/d1";
import {
  checkShortlistWriteRateLimit,
  type ShortlistWriteRateLimiter,
} from "../../_lib/shortlist-rate-limit";
import { handleShortlistPush } from "../../_lib/shortlist";
import { MAX_SYNC_BODY_BYTES } from "../../../shared/shortlist-limits";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const limiter: ShortlistWriteRateLimiter | undefined = env.SHORTLIST_WRITE_LIMITER;
  const rateLimitResponse = await checkShortlistWriteRateLimit(request, limiter);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await readBodyWithLimit(request, MAX_SYNC_BODY_BYTES);
  if (body instanceof Response) {
    return body;
  }

  const result = await handleShortlistPush(env.DB, body);
  return privateJsonResponse(result.body, { status: result.status });
};
