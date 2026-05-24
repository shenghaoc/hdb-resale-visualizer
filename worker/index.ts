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

// ---- route patterns -------------------------------------------------------

const patterns = [
  { pattern: new URLPattern({ pathname: "/api/manifest" }),             handler: manifestHandler },
  { pattern: new URLPattern({ pathname: "/api/block-summaries" }),      handler: blockSummariesHandler },
  { pattern: new URLPattern({ pathname: "/api/blocks/:town" }),         handler: blocksByTownHandler },
  { pattern: new URLPattern({ pathname: "/api/details/:addressKey" }),   handler: detailHandler },
  { pattern: new URLPattern({ pathname: "/api/comparisons/:addressKey" }), handler: comparisonHandler },
  { pattern: new URLPattern({ pathname: "/api/mrt-stations" }),          handler: mrtStationsHandler },
  { pattern: new URLPattern({ pathname: "/api/mrt-exits" }),             handler: mrtExitsHandler },
  { pattern: new URLPattern({ pathname: "/api/trends/town-flat-type" }), handler: trendsHandler },
];

// ---- fetch handler --------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Try to match an API route.
    for (const { pattern, handler } of patterns) {
      const match = pattern.exec(url);
      if (match) {
        // Build a context compatible with PagesFunction.
        const ctx = {
          env,
          params: match.pathname.groups as Record<string, string | string[]>,
          request,
          functionPath: "",
          next: () => Promise.resolve(new Response(null, { status: 500 })),
          data: undefined as unknown,
          waitUntil: (p: Promise<unknown>) => { void p; },
          passThroughOnException: () => {},
        };
        return handler(ctx as Parameters<typeof handler>[0]);
      }
    }

    // Not an API route — serve from static assets with SPA fallback.
    return env.ASSETS.fetch(request);
  },
};
