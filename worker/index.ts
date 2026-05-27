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
import { onRequestPost as shortlistCreateHandler } from "../functions/api/shortlist/index";
import { onRequestGet as shortlistGetHandler } from "../functions/api/shortlist/[syncCode]";
import { townToFilename } from "../shared/geo";

// ---- route patterns -------------------------------------------------------

// `method` defaults to GET. Read endpoints stay GET-only; the opt-in shortlist
// sync adds the only runtime write (POST).
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
  { pattern: new URLPattern({ pathname: "/api/shortlist{/}?" }),             handler: shortlistCreateHandler, method: "POST" },
  { pattern: new URLPattern({ pathname: "/api/shortlist/:syncCode{/}?" }),   handler: shortlistGetHandler },
];

const blockOgPattern = new URLPattern({ pathname: "/og/block/:addressKey.png" });
const compareOgPattern = new URLPattern({ pathname: "/og/compare/:townA/:townB.png" });

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

function publicOrigin(url: URL): string {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return url.origin;
  }
  return url.origin.replace(/^http:/, "https:");
}

/** Paginate past D1's 10k-row cap so the sitemap includes every block. */
async function fetchAllBlockRows(env: Env): Promise<Array<{ address_key: string; town: string }>> {
  const blockRows: Array<{ address_key: string; town: string }> = [];
  const pageSize = 10_000;
  let offset = 0;

  while (true) {
    const chunk = await env.DB.prepare("SELECT address_key, town FROM blocks LIMIT ?1 OFFSET ?2")
      .bind(pageSize, offset)
      .all<{ address_key: string; town: string }>();
    const results = chunk.results ?? [];
    blockRows.push(...results);
    if (results.length < pageSize) break;
    offset += pageSize;
  }

  return blockRows;
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

      // Try to match an API route (path + method).
      for (const { pattern, handler, method } of patterns) {
        const match = pattern.exec(url);
        if (match && (method ?? "GET") === request.method) {
          return handler(
            buildPagesContext(request, env, match.pathname.groups, ctx) as Parameters<typeof handler>[0],
          );
        }
      }

      if (url.pathname === "/robots.txt") {
        return textResponse(`User-agent: *\nAllow: /\nSitemap: ${publicOrigin(url)}/sitemap.xml\n`, "text/plain");
      }

      if (url.pathname === "/sitemap.xml") {
        const cacheUrl = new URL(url.toString());
        if (cacheUrl.hostname !== "localhost" && cacheUrl.hostname !== "127.0.0.1") {
          cacheUrl.protocol = "https:";
        }
        const cacheKey = new Request(cacheUrl.toString());
        const cache = typeof caches !== "undefined" ? caches.default : null;
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
          getManifest(env),
          fetchAllBlockRows(env),
        ]);
        const generatedAt = manifest?.generatedAt;
        const towns = manifest?.filterOptions?.towns ?? [];
        const origin = publicOrigin(url);
        const urls = [
          { loc: `${origin}/`, lastmod: generatedAt },
          ...towns.map((town) => ({ loc: canonicalUrlForRoute(origin, town, null, null), lastmod: generatedAt })),
          ...blockRows.map((row) => ({ loc: canonicalUrlForRoute(origin, row.town, row.address_key, null), lastmod: generatedAt })),
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
      if (assetResponse.status >= 300 && assetResponse.status < 400) return assetResponse;
      if (!(assetResponse.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
        return assetResponse;
      }

      const town = url.searchParams.get("town");
      const selected = url.searchParams.get("selected");
      const compareTown = url.searchParams.get("compareTown");
      if (!town && !selected && !compareTown) return assetResponse;

      try {
        const [block, manifest] = await Promise.all([
          selected ? getBlock(env, selected) : Promise.resolve(null),
          getManifest(env),
        ]);
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
        const validTowns = manifest?.filterOptions?.towns ?? [];
        const authoritativeTown =
          block?.town ??
          (town ? validTowns.find((entry) => entry.toUpperCase() === town.toUpperCase()) ?? town : null);
        const authoritativeCompareTown =
          compareTown
            ? validTowns.find((entry) => entry.toUpperCase() === compareTown.toUpperCase()) ?? compareTown
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
          .on("title", { element(el) { el.setInnerContent(seo.title); } })
          .on('meta[name="description"]', { element(el) { el.setAttribute("content", seo.description); } })
          .on('meta[property="og:title"]', { element(el) { el.remove(); } })
          .on('meta[property="og:description"]', { element(el) { el.remove(); } })
          .on('meta[property="og:url"]', { element(el) { el.remove(); } })
          .on('link[rel="canonical"]', {
            // Remove any pre-existing canonical so the one appended in head is the only one.
            element(el) { el.remove(); },
          })
          .on('meta[property="og:image"]', { element(el) { el.remove(); } })
          .on('meta[property="og:image:type"]', { element(el) { el.remove(); } })
          .on('meta[name="twitter:image"]', { element(el) { el.remove(); } })
          .on("head", {
            element(el) {
              el.append(`<meta property="og:title" content="${seo.title.replaceAll("&", "&amp;").replaceAll('"', '&quot;')}">`, { html: true });
              el.append(`<meta property="og:description" content="${seo.description.replaceAll("&", "&amp;").replaceAll('"', '&quot;')}">`, { html: true });
              el.append(`<meta property="og:url" content="${canonicalUrl.replaceAll("&", "&amp;").replaceAll('"', '&quot;')}">`, { html: true });
              // Always emit og:image — uses dynamic PNG for block/compare routes,
              // falls back to the static /og-card.png for plain town routes.
              el.append(`<meta property="og:image" content="${ogImageUrl.replaceAll("&", "&amp;").replaceAll('"', '&quot;')}">`, { html: true });
              el.append(`<meta property="og:image:type" content="image/png">`, { html: true });
              el.append(`<meta property="og:image:width" content="1200">`, { html: true });
              el.append(`<meta property="og:image:height" content="630">`, { html: true });
              el.append(`<meta name="twitter:image" content="${ogImageUrl.replaceAll("&", "&amp;").replaceAll('"', '&quot;')}">`, { html: true });
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
