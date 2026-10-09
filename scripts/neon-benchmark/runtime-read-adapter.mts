/** Isolated public-GET rehearsal only: injected SQL transport, no credentials or deployments. */
import { onRequestGet as manifest } from "../../functions/api/manifest";
import { onRequestGet as summaries } from "../../functions/api/block-summaries";
import { onRequestGet as town } from "../../functions/api/blocks/[town]";
import { onRequestGet as details } from "../../functions/api/details/[addressKey]";
import { onRequestGet as comparisons } from "../../functions/api/comparisons/[addressKey]";
import { onRequestGet as stations } from "../../functions/api/mrt-stations";
import { onRequestGet as exits } from "../../functions/api/mrt-exits";
import { onRequestGet as trends } from "../../functions/api/trends/town-flat-type";
import { onRequestGet as search } from "../../functions/api/search";
import { onRequestGet as suggest } from "../../functions/api/suggest";
import { privateJsonResponse } from "../../functions/_lib/d1";
import type { PublicRouteHandler } from "../../functions/_lib/public-data";
import { matchApiRoute, type ApiRouteId } from "../../worker/api-route-match";
import { withPublicDataCache } from "../../worker/public-data-cache";
import { createNeonPublicData, type PublicReadQuery } from "../../worker/public-data-neon";

// The replay covers the routes this rehearsal was written for. Later public routes (nearby places) and the
// private ones are answered as "outside public replay".
type PublicRoute = Exclude<
  ApiRouteId,
  | "comparable-transactions"
  | "shortlist-create"
  | "shortlist-get"
  | "nearby-places"
  | "nearby-capabilities"
>;
const handlers: Record<PublicRoute, PublicRouteHandler> = {
  manifest,
  "block-summaries": summaries,
  "blocks-by-town": town,
  details,
  comparisons,
  "mrt-stations": stations,
  "mrt-exits": exits,
  "trends-town-flat-type": trends,
  search,
  suggest,
};

export function createPublicReadAdapter(
  query: PublicReadQuery,
  cache: Parameters<typeof withPublicDataCache>[2],
) {
  // The Worker's own Neon read implementation: its statements are native PostgreSQL, sent through `query`.
  const publicData = createNeonPublicData(query);
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET")
      return privateJsonResponse(
        { error: "Public GET replay only" },
        { status: 405, headers: { Allow: "GET" } },
      );
    if (request.headers.has("cookie") || request.headers.has("authorization"))
      return privateJsonResponse(
        { error: "Authenticated/private requests excluded" },
        { status: 403 },
      );
    const route = matchApiRoute(new URL(request.url), request.method);
    if (route.kind !== "handler" || !Object.hasOwn(handlers, route.routeId))
      return privateJsonResponse({ error: "Endpoint outside public replay" }, { status: 404 });
    const handler = handlers[route.routeId as PublicRoute];
    const params = Object.fromEntries(
      Object.entries(route.groups).filter((entry) => entry[1] !== undefined),
    ) as Record<string, string>;
    return withPublicDataCache(request, publicData, cache, () =>
      handler({ request, params, publicData }),
    );
  };
}
