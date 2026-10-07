import { badRequest, jsonResponse, serverError } from "../_lib/d1";
import type { PublicRouteHandler } from "../_lib/public-data";
import { buildSuggestions, parseSuggestRequest } from "../_lib/suggest";

export const onRequestGet: PublicRouteHandler = async ({ publicData, request }) => {
  try {
    const url = new URL(request.url);
    const parsed = parseSuggestRequest(url);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const suggestions = await buildSuggestions(publicData, parsed.normalizedQuery);
    return jsonResponse({ suggestions });
  } catch (error) {
    console.error("Suggest API failed:", error);
    return serverError("Internal server error");
  }
};
