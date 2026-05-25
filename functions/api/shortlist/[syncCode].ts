import { privateJsonResponse } from "../../_lib/d1";
import { handleShortlistGet } from "../../_lib/shortlist";

/**
 * GET /api/shortlist/:syncCode — read the shortlist stored for a sync code.
 * Returns `{ items }`, or 404 for an unknown or malformed code. The lookup is
 * by SHA-256 hash of the code; the raw code is never logged.
 */
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const raw = params.syncCode;
  const code = Array.isArray(raw) ? raw[0] : raw;
  const result = await handleShortlistGet(env.DB, code);
  return privateJsonResponse(result.body, { status: result.status });
};
