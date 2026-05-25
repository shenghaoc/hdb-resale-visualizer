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
import { handleBlockOg, handleCompareOg } from "./og";
import { buildSeoMeta, canonicalUrlForRoute, serializeJsonLdForScript, sitemapXml, type BlockSummaryLike, type ManifestLike } from "./seo";

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

const blockOgPattern = new URLPattern({ pathname: "/og/block/:addressKey.svg" });
const compareOgPattern = new URLPattern({ pathname: "/og/compare/:townA/:townB.svg" });

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
  ctx: ExecutionContext,
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
      ctx.waitUntil(
        promise.catch((err: unknown) => {
          console.warn("waitUntil promise rejected:", err);
        }),
      );
    },
  };
}

async function getManifest(env: Env): Promise<ManifestLike | null> {
  const row = await env.DB.prepare("SELECT json FROM manifest WHERE id = 1").first<{ json: string }>();
  return row ? (JSON.parse(row.json) as ManifestLike) : null;
}

async function getBlock(env: Env, addressKey: string): Promise<BlockSummaryLike | null> {
  const row = await env.DB.prepare("SELECT address_key,town,display_name,median_price,transaction_count,available_min_month,available_max_month,floor_area_min,floor_area_max FROM blocks WHERE address_key = ?1").bind(addressKey).first<{ address_key: string; town: string; display_name: string | null; median_price: number; transaction_count: number; available_min_month: string; available_max_month: string; floor_area_min: number; floor_area_max: number }>();
  if (!row) return null;
  return { addressKey: row.address_key, town: row.town, displayName: row.display_name, medianPrice: row.median_price, transactionCount: row.transaction_count, availableDateRange: [row.available_min_month, row.available_max_month], floorAreaRange: [row.floor_area_min, row.floor_area_max] };
}

function textResponse(body: string, contentType: string): Response {
  return new Response(body, { headers: { "content-type": `${contentType}; charset=utf-8`, "cache-control": "public, max-age=300, s-maxage=3600" } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);

      const blockOg = blockOgPattern.exec(url);
      if (blockOg) {
        const key = blockOg.pathname.groups.addressKey;
        return key ? handleBlockOg(request, env, key, ctx) : Response.redirect(`${url.origin}/og-card.png`, 302);
      }
      const compareOg = compareOgPattern.exec(url);
      if (compareOg) {
        const { townA, townB } = compareOg.pathname.groups;
        return townA && townB
          ? handleCompareOg(request, env, townA, townB, ctx)
          : Response.redirect(`${url.origin}/og-card.png`, 302);
      }

      // Try to match an API route.
      for (const { pattern, handler } of patterns) {
        const match = pattern.exec(url);
        if (match) {
          return handler(
            buildPagesContext(request, env, match.pathname.groups, ctx) as Parameters<typeof handler>[0],
          );
        }
      }

      if (url.pathname === "/robots.txt") {
        return textResponse(`User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`, "text/plain");
      }

      if (url.pathname === "/sitemap.xml") {
        const cacheKey = new Request(url.toString());
        const cache = typeof caches !== "undefined" ? caches.default : null;
        const cached = cache ? await cache.match(cacheKey) : null;
        if (cached) return cached;

        const manifest = await getManifest(env);
        const generatedAt = manifest?.generatedAt;
        const towns = manifest?.filterOptions?.towns ?? [];
        // D1 caps results at 10k rows and 1MB response size; LIMIT is set to 10000 to avoid silent truncation.
        const blockRows = await env.DB.prepare("SELECT address_key, town FROM blocks LIMIT 10000").all<{ address_key: string; town: string }>();
        const origin = url.hostname === "localhost" ? url.origin : url.origin.replace(/^http:/, "https:");
        const urls = [
          { loc: `${origin}/`, lastmod: generatedAt },
          ...towns.map((town) => ({ loc: canonicalUrlForRoute(origin, town, null, null), lastmod: generatedAt })),
          ...(blockRows.results ?? []).map((row) => ({ loc: canonicalUrlForRoute(origin, row.town, row.address_key, null), lastmod: generatedAt })),
        ];
        const response = textResponse(sitemapXml(urls), "application/xml");
        // Sitemap changes infrequently; use longer cache lifetimes to reduce D1 reads.
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
      if (!(assetResponse.headers.get("content-type") ?? "").includes("text/html")) return assetResponse;

      const town = url.searchParams.get("town");
      const selected = url.searchParams.get("selected");
      const compareTown = url.searchParams.get("compareTown");
      if (!town && !selected && !compareTown) return assetResponse;

      try {
        const block = selected ? await getBlock(env, selected) : null;
        const manifest = await getManifest(env);
        if (manifest) {
          const validTowns = manifest.filterOptions?.towns ?? [];
          if (town && !validTowns.some((t) => t.toUpperCase() === town.toUpperCase())) {
            return assetResponse;
          }
          if (compareTown && !validTowns.some((t) => t.toUpperCase() === compareTown.toUpperCase())) {
            return assetResponse;
          }
        }
        const seo = buildSeoMeta({ town, block, manifest });
        if (!seo) return assetResponse;
        // Use the canonical town from D1 when a block was resolved, so the
        // canonical URL reflects the authoritative town name — prevents
        // query-parameter injection from polluting SEO metadata.
        const canonicalUrl = canonicalUrlForRoute(url.origin, block ? block.town : town, selected, compareTown);

        const safeJsonLd = serializeJsonLdForScript(seo.jsonLd);
        return new HTMLRewriter()
          .on("title", { element(el) { el.setInnerContent(seo.title); } })
          .on('meta[name="description"]', { element(el) { el.setAttribute("content", seo.description); } })
          .on('meta[property="og:title"]', { element(el) { el.setAttribute("content", seo.title); } })
          .on('meta[property="og:description"]', { element(el) { el.setAttribute("content", seo.description); } })
          .on('meta[property="og:url"]', { element(el) { el.setAttribute("content", canonicalUrl); } })
          .on('link[rel="canonical"]', {
            // Remove any pre-existing canonical so the one appended in head is the only one.
            element(el) { el.remove(); },
          })
          .on("head", {
            element(el) {
              el.append(`<script type="application/ld+json">${safeJsonLd}</script>`, { html: true });
              el.append(`<link rel="canonical" href="${canonicalUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`, {
                html: true,
              });
            },
          })
          .transform(assetResponse);
      } catch (seoError) {
        console.error("SEO rewrite failed:", seoError);
        return assetResponse;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker error";
      return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } });
    }
  },
};
