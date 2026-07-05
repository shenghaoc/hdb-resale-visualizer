import {
  badRequest,
  BLOCK_SUMMARY_SELECT_SQL,
  type BlockRow,
  jsonResponse,
  parseSlugParam,
  rowToBlockSummary,
  serverError,
  townFilenameToCanonical,
} from "../../_lib/d1";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const slug = parseSlugParam(params, "town");
  if (!slug) {
    return badRequest("town filename required");
  }

  const town = townFilenameToCanonical(slug);

  try {
    const result = await env.DB.prepare(
      `SELECT ${BLOCK_SUMMARY_SELECT_SQL} FROM blocks WHERE town = ? ORDER BY median_price DESC, transaction_count DESC`,
    )
      .bind(town)
      .all<BlockRow>();
    return jsonResponse((result.results ?? []).map(rowToBlockSummary));
  } catch (error) {
    console.error("town lookup failed:", error);
    return serverError("Internal server error");
  }
};
