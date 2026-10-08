import { jsonResponse, notFound, serverError } from "../_lib/d1";
import type { PublicRouteHandler } from "../_lib/public-data";

export const onRequestGet: PublicRouteHandler = async ({ publicData }) => {
  try {
    const json = await publicData.mrtGeoJson("exits");
    if (json === null) {
      return notFound("MRT exits not synced yet");
    }
    return jsonResponse(JSON.parse(json));
  } catch (error) {
    console.error("MRT exits lookup failed:", error);
    return serverError("Internal server error");
  }
};
