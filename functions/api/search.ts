import { blockSummarySchema } from "../../src/lib/dataSchemas";
import { type BlockRow, jsonResponse, rowToBlockSummary, serverError } from "../_lib/d1";
import {
  SEARCH_RESULT_LIMIT,
  buildSearchQuery,
  parseSearchRequest,
  validateSearchRequest,
} from "../_lib/search";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchRequest(url);
    const validationError = validateSearchRequest(parsed);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const { whereSql, bindings } = buildSearchQuery(parsed);
    const sql = `SELECT * FROM blocks ${whereSql} ORDER BY median_price DESC, transaction_count DESC LIMIT ?`;
    const result = await env.DB.prepare(sql).bind(...bindings, SEARCH_RESULT_LIMIT + 1).all<BlockRow>();
    const rows = result.results ?? [];
    const truncated = rows.length > SEARCH_RESULT_LIMIT;
    const shaped = rows.slice(0, SEARCH_RESULT_LIMIT).map(rowToBlockSummary);
    const parsedShape = blockSummarySchema.array().parse(shaped);
    return jsonResponse({ blocks: parsedShape, truncated, limit: SEARCH_RESULT_LIMIT });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "search failed");
  }
};
