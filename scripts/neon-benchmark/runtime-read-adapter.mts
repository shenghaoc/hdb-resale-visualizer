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
import { matchApiRoute, type ApiRouteId } from "../../worker/api-route-match";
import { withPublicDataCache } from "../../worker/public-data-cache";
import { createPublicReadDb, type PublicReadQuery } from "./runtime-read-sql";

type PublicRoute = Exclude<
  ApiRouteId,
  "comparable-transactions" | "shortlist-create" | "shortlist-get"
>;
const handlers: Record<PublicRoute, typeof manifest> = {
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
  const db = createPublicReadDb(query);
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
    );
    return withPublicDataCache(request, db, cache, async (publicDataVersion) => {
      const context = {
        request,
        env: { DB: db },
        params,
        functionPath: "",
        // Match worker/index.ts: it currently passes the version, not the optional shared dictionary cache.
        data: { publicDataVersion },
        next: async () => new Response(null, { status: 500 }),
        passThroughOnException() {},
        waitUntil() {},
      };
      return handler(context as unknown as Parameters<typeof handler>[0]);
    });
  };
}
