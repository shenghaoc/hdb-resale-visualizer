/**
 * Cloudflare Worker entry point.
 *
 * Replaces the old Cloudflare Pages Functions routing.  API paths are forwarded
 * to their existing `onRequestGet` handlers; everything else is served as a
 * static asset (SPA fallback via `not_found_handling`).
 */

import { onRequestGet as manifestHandler } from "../functions/api/manifest";
import { onRequestGet as blockSummariesHandler } from "../functions/api/block-summaries";
import { onRequestGet as blocksByTownHandler } from "../functions/api/blocks/[town]";
import { onRequestGet as detailHandler } from "../functions/api/details/[addressKey]";
import { onRequestGet as comparisonHandler } from "../functions/api/comparisons/[addressKey]";
import { onRequestGet as mrtStationsHandler } from "../functions/api/mrt-stations";
import { onRequestGet as mrtExitsHandler } from "../functions/api/mrt-exits";
import { onRequestGet as trendsHandler } from "../functions/api/trends/town-flat-type";
import { onRequestGet as searchHandler } from "../functions/api/search";

// ---- route patterns -------------------------------------------------------

const patterns = [
  { pattern: new URLPattern({ pathname: "/api/manifest{/}?" }),             handler: manifestHandler },
  { pattern: new URLPattern({ pathname: "/api/block-summaries{/}?" }),      handler: blockSummariesHandler },
  { pattern: new URLPattern({ pathname: "/api/blocks/:town{/}?" }),         handler: blocksByTownHandler },
  { pattern: new URLPattern({ pathname: "/api/details/:addressKey{/}?" }),   handler: detailHandler },
  { pattern: new URLPattern({ pathname: "/api/comparisons/:addressKey{/}?" }), handler: comparisonHandler },
  { pattern: new URLPattern({ pathname: "/api/mrt-stations{/}?" }),          handler: mrtStationsHandler },
  { pattern: new URLPattern({ pathname: "/api/mrt-exits{/}?" }),             handler: mrtExitsHandler },
  { pattern: new URLPattern({ pathname: "/api/trends/town-flat-type{/}?" }), handler: trendsHandler },
  { pattern: new URLPattern({ pathname: "/api/search{/}?" }),               handler: searchHandler },
];

// ---- context helper -------------------------------------------------------

/**
 * Build a context compatible with the PagesFunction signature consumed by
 * each `onRequestGet` handler.  The Worker `Request` type differs from the
 * Pages `Request<unknown, IncomingRequestCfProperties>` — they are identical
 * at runtime, so we cast here.  The explicit helper avoids `as` on the
 * entire context, limiting the suppression to just the request type.
 */
function buildPagesContext(
  request: Request,
  env: Env,
  groups: Record<string, string | undefined>,
): Record<string, unknown> {
  // URLPattern group values may be undefined for optional segments.
  // Filter them out so handlers only see defined params.
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(groups)) {
    if (value !== undefined) params[key] = value;
  }

  return {
    env,
    params,
    request,
    functionPath: "",
    data: null,
    next: () => Promise.resolve(new Response(null, { status: 500 })),
    passThroughOnException: () => {},
    waitUntil(promise: Promise<unknown>) {
      void promise.catch((err: unknown) => {
        console.warn("waitUntil promise rejected:", err);
      });
    },
  };
}

// ---- fetch handler --------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Try to match an API route.
      for (const { pattern, handler } of patterns) {
        const match = pattern.exec(url);
        if (match) {
          return handler(buildPagesContext(request, env, match.pathname.groups) as Parameters<typeof handler>[0]);
        }
      }

      // Not an API route — serve from static assets with SPA fallback.
      return env.ASSETS.fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker error";
      console.error("Worker fetch handler error:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  },
};
