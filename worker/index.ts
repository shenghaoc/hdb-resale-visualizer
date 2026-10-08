/**
 * Cloudflare Worker entry point.
 *
 * Replaces the old Cloudflare Pages Functions routing.  API paths are forwarded
 * to their `onRequestGet`/`onRequestPost` handlers; everything else is served as
 * a static asset (SPA fallback via `not_found_handling`). Public data routes,
 * OG cards, the sitemap and the SEO rewrite read through the request's
 * public-read scope (`public-read-backend.ts`); only the private shortlist
 * routes and the cleanup cron use the D1 binding directly.
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
import { onRequestGet as suggestHandler } from "../functions/api/suggest";
import { onRequestPost as comparableTransactionsHandler } from "../functions/api/comparable-transactions";
import { onRequestPost as shortlistCreateHandler } from "../functions/api/shortlist/index";
import { onRequestGet as shortlistGetHandler } from "../functions/api/shortlist/[syncCode]";
import { handleBlockOg, handleCompareOg } from "./og";
import {
  buildSeoMeta,
  canonicalUrlForRoute,
  serializeJsonLdForScript,
  sitemapXml,
  type BlockSummaryLike,
  type ManifestLike,
} from "./seo";
import { matchApiRoute, methodNotAllowedResponse, type ApiRouteId } from "./api-route-match";
import { purgeStaleShortlists } from "../functions/_lib/shortlist";
import { withPublicDataCache } from "./public-data-cache";
import { townToFilename } from "../shared/geo";
import { createPublicReadScope, namespacePublicCache } from "./public-read-backend";
import { createNeonPublicTransport } from "./neon-transport";
import type { PublicData, PublicRouteHandler } from "../functions/_lib/public-data";

type ShortlistRouteId = "shortlist-create" | "shortlist-get";

const publicApiHandlers: Record<Exclude<ApiRouteId, ShortlistRouteId>, PublicRouteHandler> = {
  manifest: manifestHandler,
  "block-summaries": blockSummariesHandler,
  "blocks-by-town": blocksByTownHandler,
  details: detailHandler,
  comparisons: comparisonHandler,
  "mrt-stations": mrtStationsHandler,
  "mrt-exits": mrtExitsHandler,
  "trends-town-flat-type": trendsHandler,
  search: searchHandler,
  suggest: suggestHandler,
  "comparable-transactions": comparableTransactionsHandler,
};
const shortlistHandlers: Record<ShortlistRouteId, PagesFunction<Env>> = {
  "shortlist-create": shortlistCreateHandler,
  "shortlist-get": shortlistGetHandler,
};

const blockOgPattern = new URLPattern({ pathname: "/og/block/:addressKey.png" });
const compareOgPattern = new URLPattern({ pathname: "/og/compare/:townA/:townB.png" });

// ---- context helper -------------------------------------------------------

/** URLPattern group values may be undefined for optional segments; handlers only see defined params. */
function definedParams(groups: Record<string, string | undefined>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(groups)) {
    if (value !== undefined) params[key] = value;
  }
  return params;
}

/**
 * Build a context compatible with the PagesFunction signature consumed by
 * the shortlist handlers.  The Worker `Request` type differs from the
 * Pages `Request<unknown, IncomingRequestCfProperties>` — they are identical
 * at runtime, so we cast here.  The explicit helper avoids `as` on the
 * entire context, limiting the suppression to just the request type.
 */
function buildPagesContext(
  request: Request,
  env: Env,
  groups: Record<string, string | undefined>,
  ctx: ExecutionContext,
): Record<string, unknown> {
  return {
    env,
    params: definedParams(groups),
    request,
    functionPath: "",
    data: null,
    next: () => Promise.resolve(new Response(null, { status: 500 })),
    passThroughOnException: () => {},
    waitUntil(promise: Promise<unknown>) {
      ctx.waitUntil(
        promise.catch((err: unknown) => {
          console.warn("waitUntil promise rejected:", err);
        }),
      );
    },
  };
}

async function getManifest(data: PublicData): Promise<ManifestLike | null> {
  const json = await data.manifestJson();
  return json === null ? null : (JSON.parse(json) as ManifestLike);
}

async function getBlock(data: PublicData, addressKey: string): Promise<BlockSummaryLike | null> {
  const row = await data.block(addressKey);
  if (!row) return null;
  return {
    addressKey: row.address_key,
    town: row.town,
    displayName: row.display_name,
    medianPrice: row.median_price,
    transactionCount: row.transaction_count,
    availableDateRange: [row.available_min_month, row.available_max_month],
    floorAreaRange: [row.floor_area_min, row.floor_area_max],
  };
}

function textResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "content-type": `${contentType}; charset=utf-8`,
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}

function publicOrigin(url: URL): string {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return url.origin;
  }
  return url.origin.replace(/^http:/, "https:");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const capturedEnv = { ...env };
    let readScope: ReturnType<typeof createPublicReadScope> | undefined;
    const publicReads = () =>
      (readScope ??= createPublicReadScope(capturedEnv, createNeonPublicTransport));
    const respond = async () => {
      try {
        const url = new URL(request.url);

        const blockOg = blockOgPattern.exec(url);
        if (blockOg) {
          const key = blockOg.pathname.groups.addressKey;
          return await (key
            ? handleBlockOg(
                request,
                publicReads(),
                key,
                ctx,
                namespacePublicCache(
                  typeof caches !== "undefined" ? caches.default : null,
                  publicReads().namespace,
                ),
              )
            : Response.redirect(`${url.origin}/og-card.png`, 302));
        }
        const compareOg = compareOgPattern.exec(url);
        if (compareOg) {
          const { townA, townB } = compareOg.pathname.groups;
          return await (townA && townB
            ? handleCompareOg(
                request,
                publicReads(),
                townA,
                townB,
                ctx,
                namespacePublicCache(
                  typeof caches !== "undefined" ? caches.default : null,
                  publicReads().namespace,
                ),
              )
            : Response.redirect(`${url.origin}/og-card.png`, 302));
        }

        const apiMatch = matchApiRoute(url, request.method);
        if (apiMatch.kind === "handler") {
          const { routeId } = apiMatch;
          if (routeId === "shortlist-create" || routeId === "shortlist-get") {
            const handler = shortlistHandlers[routeId];
            return await handler(
              buildPagesContext(request, capturedEnv, apiMatch.groups, ctx) as Parameters<
                typeof handler
              >[0],
            );
          }
          const reads = publicReads();
          const publicCache = namespacePublicCache(
            typeof caches !== "undefined" ? caches.default : null,
            reads.namespace,
          );
          const handler = publicApiHandlers[routeId];
          const handle = () =>
            withPublicDataCache(request, reads.data, publicCache, () =>
              handler({ request, params: definedParams(apiMatch.groups), publicData: reads.data }),
            );
          return await (routeId === "comparable-transactions"
            ? reads.comparableSnapshot(handle)
            : handle());
        }
        if (apiMatch.kind === "method_not_allowed") {
          return methodNotAllowedResponse(apiMatch.allow);
        }

        if (url.pathname === "/robots.txt") {
          return textResponse(
            `User-agent: *\nAllow: /\nSitemap: ${publicOrigin(url)}/sitemap.xml\n`,
            "text/plain",
          );
        }

        if (url.pathname === "/sitemap.xml") {
          const cacheUrl = new URL(url.toString());
          if (cacheUrl.hostname !== "localhost" && cacheUrl.hostname !== "127.0.0.1") {
            cacheUrl.protocol = "https:";
          }
          const cacheKey = new Request(cacheUrl.toString());
          const reads = publicReads();
          const cache = namespacePublicCache(
            typeof caches !== "undefined" ? caches.default : null,
            reads.namespace,
          );
          let cached: Response | null = null;
          if (cache) {
            try {
              // Cloudflare's Cache.match can be typed as `Response | undefined`.
              // Normalize to `Response | null` so downstream checks are consistent.
              cached = (await cache.match(cacheKey)) ?? null;
            } catch (err) {
              console.warn("Sitemap cache match failed:", err);
            }
          }
          if (cached) return cached;

          const [manifest, blockRows] = await Promise.all([
            getManifest(reads.data),
            reads.data.blockIndex(),
          ]);
          const generatedAt = manifest?.generatedAt;
          const towns = manifest?.filterOptions?.towns ?? [];
          const origin = publicOrigin(url);
          const urls = [
            { loc: `${origin}/`, lastmod: generatedAt },
            ...towns.map((town) => ({
              loc: canonicalUrlForRoute(origin, town, null, null),
              lastmod: generatedAt,
            })),
            ...blockRows.map((row) => ({
              loc: canonicalUrlForRoute(origin, row.town, row.address_key, null),
              lastmod: generatedAt,
            })),
          ];
          const response = textResponse(sitemapXml(urls), "application/xml");
          // Sitemap changes infrequently; use longer cache lifetimes to reduce database reads.
          response.headers.set("cache-control", "public, max-age=86400, s-maxage=604800");
          if (cache) {
            ctx.waitUntil(
              cache.put(cacheKey, response.clone()).catch((err) => {
                console.error("Sitemap cache put failed:", err);
              }),
            );
          }
          return response;
        }

        const assetResponse = await env.ASSETS.fetch(request);
        if ([204, 304].includes(assetResponse.status)) return assetResponse;
        if (assetResponse.status >= 300 && assetResponse.status < 400) return assetResponse;
        if (
          !(assetResponse.headers.get("content-type") ?? "").toLowerCase().includes("text/html")
        ) {
          return assetResponse;
        }

        const town = url.searchParams.get("town");
        const selected = url.searchParams.get("selected");
        const compareTown = url.searchParams.get("compareTown");
        if (!town && !selected && !compareTown) return assetResponse;

        try {
          const [block, manifest] = await Promise.all([
            selected ? getBlock(publicReads().data, selected) : Promise.resolve(null),
            getManifest(publicReads().data),
          ]);
          if (manifest) {
            const validTowns = manifest.filterOptions?.towns ?? [];
            if (town && !validTowns.some((t) => t.toUpperCase() === town.toUpperCase())) {
              return assetResponse;
            }
            if (
              compareTown &&
              !validTowns.some((t) => t.toUpperCase() === compareTown.toUpperCase())
            ) {
              return assetResponse;
            }
          }
          const seo = buildSeoMeta({ town, block, manifest });
          if (!seo) return assetResponse;
          const validTowns = manifest?.filterOptions?.towns ?? [];
          const authoritativeTown =
            block?.town ??
            (town
              ? (validTowns.find((entry) => entry.toUpperCase() === town.toUpperCase()) ?? town)
              : null);
          const authoritativeCompareTown = compareTown
            ? (validTowns.find((entry) => entry.toUpperCase() === compareTown.toUpperCase()) ??
              compareTown)
            : null;
          const canonicalUrl = canonicalUrlForRoute(
            publicOrigin(url),
            authoritativeTown,
            block ? selected : null,
            authoritativeCompareTown,
          );

          const safeJsonLd = serializeJsonLdForScript(seo.jsonLd);

          // Build per-route og:image URL (absolute, required by scrapers).
          // Falls back to the static /og-card.png for plain town routes.
          let ogImageUrl: string;
          if (block && selected) {
            ogImageUrl = `${publicOrigin(url)}/og/block/${encodeURIComponent(selected)}.png`;
          } else if (authoritativeTown && authoritativeCompareTown) {
            ogImageUrl = `${publicOrigin(url)}/og/compare/${encodeURIComponent(townToFilename(authoritativeTown))}/${encodeURIComponent(townToFilename(authoritativeCompareTown))}.png`;
          } else {
            ogImageUrl = `${publicOrigin(url)}/og-card.png`;
          }

          return new HTMLRewriter()
            .on("title", {
              element(el) {
                el.setInnerContent(seo.title);
              },
            })
            .on('meta[name="description"]', {
              element(el) {
                el.setAttribute("content", seo.description);
              },
            })
            .on('meta[property="og:title"]', {
              element(el) {
                el.remove();
              },
            })
            .on('meta[property="og:description"]', {
              element(el) {
                el.remove();
              },
            })
            .on('meta[property="og:url"]', {
              element(el) {
                el.remove();
              },
            })
            .on('link[rel="canonical"]', {
              // Remove any pre-existing canonical so the one appended in head is the only one.
              element(el) {
                el.remove();
              },
            })
            .on('meta[property="og:image"]', {
              element(el) {
                el.remove();
              },
            })
            .on('meta[property="og:image:type"]', {
              element(el) {
                el.remove();
              },
            })
            .on('meta[property="og:image:width"]', {
              element(el) {
                el.remove();
              },
            })
            .on('meta[property="og:image:height"]', {
              element(el) {
                el.remove();
              },
            })
            .on('meta[name="twitter:image"]', {
              element(el) {
                el.remove();
              },
            })
            .on("head", {
              element(el) {
                el.append(
                  `<meta property="og:title" content="${seo.title.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`,
                  { html: true },
                );
                el.append(
                  `<meta property="og:description" content="${seo.description.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`,
                  { html: true },
                );
                el.append(
                  `<meta property="og:url" content="${canonicalUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`,
                  { html: true },
                );
                // Always emit og:image — uses dynamic PNG for block/compare routes,
                // falls back to the static /og-card.png for plain town routes.
                el.append(
                  `<meta property="og:image" content="${ogImageUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`,
                  { html: true },
                );
                el.append(`<meta property="og:image:type" content="image/png">`, { html: true });
                el.append(`<meta property="og:image:width" content="1200">`, { html: true });
                el.append(`<meta property="og:image:height" content="630">`, { html: true });
                el.append(
                  `<meta name="twitter:image" content="${ogImageUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`,
                  { html: true },
                );
                el.append(`<script type="application/ld+json">${safeJsonLd}</script>`, {
                  html: true,
                });
                el.append(
                  `<link rel="canonical" href="${canonicalUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`,
                  {
                    html: true,
                  },
                );
              },
            })
            .transform(assetResponse);
        } catch (seoError) {
          console.error("SEO rewrite failed:", seoError);
          return assetResponse;
        }
      } catch (error) {
        console.error("Worker error:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
    };
    try {
      return await respond();
    } finally {
      await readScope?.close().catch(() => {
        console.warn("Public read connection cleanup failed");
      });
    }
  },

  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (!env.DB) {
      console.error("Shortlist TTL cleanup skipped: DB binding is missing");
      return;
    }
    ctx.waitUntil(
      purgeStaleShortlists(env.DB).catch((err: unknown) => {
        console.error("Shortlist TTL cleanup failed:", err);
      }),
    );
  },
};
