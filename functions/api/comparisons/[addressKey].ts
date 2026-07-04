import { jsonResponse, notFound, serverError } from "../../_lib/d1";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const raw = params.addressKey;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) {
    return notFound("addressKey required");
  }
  const addressKey = slug.replace(/\.json$/, "");

  try {
    const row = await env.DB.prepare("SELECT json FROM comparisons WHERE address_key = ?")
      .bind(addressKey)
      .first<{ json: string }>();
    if (!row) {
      return notFound("Not found");
    }
    return jsonResponse(JSON.parse(row.json));
  } catch (error) {
    console.error("comparison lookup failed:", error);
    return serverError("Internal server error");
  }
};
