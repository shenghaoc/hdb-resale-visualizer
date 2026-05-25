import { jsonResponse, rowToBlockSummary, serverError } from "../_lib/d1";
import {
  SEARCH_RESULT_LIMIT,
  buildSearchQuery,
  parseSearchRequest,
  validateSearchRequest,
} from "../_lib/search";

type SearchContext = {
  env: { DB: { prepare: (sql: string) => { bind: (...args: unknown[]) => { all: () => Promise<{ results?: unknown[] }> } } } };
  request: Request;
};

export const onRequestGet = async ({ env, request }: SearchContext) => {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchRequest(url);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const validationError = validateSearchRequest(parsed.request);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const { whereSql, bindings } = buildSearchQuery(parsed.request);
    const sql = `SELECT * FROM blocks ${whereSql} ORDER BY median_price DESC, transaction_count DESC LIMIT ?`;
    const result = await env.DB.prepare(sql).bind(...bindings, SEARCH_RESULT_LIMIT + 1).all();
    const rows = (result.results ?? []) as Parameters<typeof rowToBlockSummary>[0][];
    const truncated = rows.length > SEARCH_RESULT_LIMIT;
    const shaped = rows.slice(0, SEARCH_RESULT_LIMIT).map(rowToBlockSummary);
    return jsonResponse({ blocks: shaped, truncated, limit: SEARCH_RESULT_LIMIT });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "search failed");
  }
};
