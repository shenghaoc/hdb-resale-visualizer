import { jsonResponse, notFound, parseSlugParam, serverError } from "../../_lib/d1";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const addressKey = parseSlugParam(params, "addressKey");
  if (!addressKey) {
    return notFound("addressKey required");
  }

  try {
    const row = await env.DB.prepare("SELECT json FROM block_details WHERE address_key = ?")
      .bind(addressKey)
      .first<{ json: string }>();
    if (!row) {
      return notFound("Not found");
    }
    return jsonResponse(JSON.parse(row.json));
  } catch (error) {
    console.error("detail lookup failed:", error);
    return serverError("Internal server error");
  }
};
