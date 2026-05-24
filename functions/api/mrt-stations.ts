import { jsonResponse, notFound, serverError } from "../_lib/d1";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const row = await env.DB.prepare(
      "SELECT json FROM mrt_geojson WHERE kind = 'stations'",
    ).first<{ json: string }>();
    if (!row) {
      return notFound("MRT stations not synced yet");
    }
    return jsonResponse(JSON.parse(row.json));
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "MRT stations lookup failed");
  }
};
