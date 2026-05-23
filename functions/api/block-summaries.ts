import {
  type BlockRow,
  type Env,
  jsonResponse,
  rowToBlockSummary,
  serverError,
} from "../_lib/d1";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare(
      "SELECT * FROM blocks ORDER BY median_price DESC, transaction_count DESC",
    ).all<BlockRow>();
    const summaries = (result.results ?? []).map(rowToBlockSummary);
    return jsonResponse(summaries);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "block-summaries lookup failed");
  }
};
