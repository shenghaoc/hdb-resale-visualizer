import { jsonResponse, serverError } from "../_lib/d1";
import { buildSuggestions, parseSuggestRequest } from "../_lib/suggest";

type SuggestContext = {
  env: { DB: Parameters<typeof buildSuggestions>[0] };
  request: Request;
};

export const onRequestGet = async ({ env, request }: SuggestContext) => {
  try {
    const url = new URL(request.url);
    const parsed = parseSuggestRequest(url);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const suggestions = await buildSuggestions(env.DB, parsed.normalizedQuery);
    return jsonResponse({ suggestions });
  } catch (error) {
    console.error("Suggest API failed:", error);
    return serverError("suggest failed");
  }
};
