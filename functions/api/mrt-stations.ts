import { jsonResponse, notFound, serverError } from "../_lib/d1";
import type { PublicRouteHandler } from "../_lib/public-data";

export const onRequestGet: PublicRouteHandler = async ({ publicData }) => {
  try {
    const json = await publicData.mrtGeoJson("stations");
    if (json === null) {
      return notFound("MRT stations not synced yet");
    }
    return jsonResponse(JSON.parse(json));
  } catch (error) {
    console.error("MRT stations lookup failed:", error);
    return serverError("Internal server error");
  }
};
