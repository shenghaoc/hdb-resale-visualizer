import { jsonResponse, notFound, parseSlugParam, serverError } from "../../_lib/d1";
import type { PublicRouteHandler } from "../../_lib/public-data";

export const onRequestGet: PublicRouteHandler = async ({ publicData, params }) => {
  const addressKey = parseSlugParam(params, "addressKey");
  if (!addressKey) {
    return notFound("addressKey required");
  }

  try {
    const json = await publicData.blockComparisonJson(addressKey);
    if (json === null) {
      return notFound("Not found");
    }
    return jsonResponse(JSON.parse(json));
  } catch (error) {
    console.error("comparison lookup failed:", error);
    return serverError("Internal server error");
  }
};
