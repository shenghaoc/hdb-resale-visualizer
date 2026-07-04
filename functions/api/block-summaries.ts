import { type BlockRow, jsonResponse, rowToBlockSummary, serverError } from "../_lib/d1";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare(
      "SELECT * FROM blocks ORDER BY median_price DESC, transaction_count DESC",
    ).all<BlockRow>();
    const summaries = (result.results ?? []).map(rowToBlockSummary);
    return jsonResponse(summaries);
  } catch (error) {
    console.error("block-summaries lookup failed:", error);
    return serverError("Internal server error");
  }
};
