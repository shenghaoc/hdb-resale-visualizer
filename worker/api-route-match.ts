/**
 * API path/method matching for the Worker entry point.
 *
 * Handler imports live in worker/index.ts so this module stays free of
 * PagesFunction types and can be unit-tested in isolation.
 */

import { privateJsonResponse } from "../functions/_lib/d1";

export type ApiRouteId =
  | "manifest"
  | "block-summaries"
  | "blocks-by-town"
  | "details"
  | "comparisons"
  | "mrt-stations"
  | "mrt-exits"
  | "trends-town-flat-type"
  | "search"
  | "suggest"
  | "comparable-transactions"
  | "shortlist-create"
  | "shortlist-get";

export type ApiRouteDefinition = {
  id: ApiRouteId;
  pattern: URLPattern;
  method?: string;
};

/** `method` defaults to GET. The shortlist sync path is the only POST handler. */
export const apiRouteDefinitions: ApiRouteDefinition[] = [
  { id: "manifest", pattern: new URLPattern({ pathname: "/api/manifest{/}?" }) },
  { id: "block-summaries", pattern: new URLPattern({ pathname: "/api/block-summaries{/}?" }) },
  { id: "blocks-by-town", pattern: new URLPattern({ pathname: "/api/blocks/:town{/}?" }) },
  { id: "details", pattern: new URLPattern({ pathname: "/api/details/:addressKey{/}?" }) },
  { id: "comparisons", pattern: new URLPattern({ pathname: "/api/comparisons/:addressKey{/}?" }) },
  { id: "mrt-stations", pattern: new URLPattern({ pathname: "/api/mrt-stations{/}?" }) },
  { id: "mrt-exits", pattern: new URLPattern({ pathname: "/api/mrt-exits{/}?" }) },
  {
    id: "trends-town-flat-type",
    pattern: new URLPattern({ pathname: "/api/trends/town-flat-type{/}?" }),
  },
  { id: "search", pattern: new URLPattern({ pathname: "/api/search{/}?" }) },
  { id: "suggest", pattern: new URLPattern({ pathname: "/api/suggest{/}?" }) },
  {
    id: "comparable-transactions",
    pattern: new URLPattern({ pathname: "/api/comparable-transactions{/}?" }),
    method: "POST",
  },
  {
    id: "shortlist-create",
    pattern: new URLPattern({ pathname: "/api/shortlist{/}?" }),
    method: "POST",
  },
  { id: "shortlist-get", pattern: new URLPattern({ pathname: "/api/shortlist/:syncCode{/}?" }) },
];

export type ApiRouteMatch =
  | { kind: "handler"; routeId: ApiRouteId; groups: Record<string, string | undefined> }
  | { kind: "method_not_allowed"; allow: string[] }
  | { kind: "no_match" };

export function matchApiRoute(url: URL, requestMethod: string): ApiRouteMatch {
  const allowedMethods: string[] = [];
  let pathMatched = false;

  for (const { id, pattern, method } of apiRouteDefinitions) {
    const match = pattern.exec(url);
    if (!match) continue;

    pathMatched = true;
    const expectedMethod = method ?? "GET";
    const effectiveMethod = requestMethod === "HEAD" ? "GET" : requestMethod;
    if (expectedMethod === effectiveMethod) {
      return { kind: "handler", routeId: id, groups: match.pathname.groups };
    }
    allowedMethods.push(expectedMethod);
  }
  if (pathMatched) {
    return { kind: "method_not_allowed", allow: allowedMethods };
  }
  return { kind: "no_match" };
}

export function methodNotAllowedResponse(allow: string[]): Response {
  return privateJsonResponse(
    { error: "Method Not Allowed" },
    { status: 405, headers: { Allow: allow.join(", ") } },
  );
}
