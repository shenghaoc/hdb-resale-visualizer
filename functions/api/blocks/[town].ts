import {
  type BlockRow,
  jsonResponse,
  rowToBlockSummary,
  serverError,
  townFilenameToCanonical,
} from "../../_lib/d1";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const raw = params.town;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) {
    return new Response(JSON.stringify({ error: "town filename required" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // URL paths arrive as `…/blocks/bishan.json` — strip the extension.
  const town = townFilenameToCanonical(slug.replace(/\.json$/, ""));

  try {
    const result = await env.DB.prepare(
      "SELECT * FROM blocks WHERE town = ? ORDER BY median_price DESC, transaction_count DESC",
    )
      .bind(town)
      .all<BlockRow>();
    return jsonResponse((result.results ?? []).map(rowToBlockSummary));
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "town lookup failed");
  }
};
