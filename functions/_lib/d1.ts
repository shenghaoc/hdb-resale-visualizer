/**
 * Response helpers and `blocks` row shaping shared by the API routes under
 * `functions/api/*`, whichever backend produced the rows (see `public-data.ts`;
 * the file name predates the Neon backend). Keep this module dependency-free
 * (no Node imports) so it runs in the Workers runtime.
 */

type JsonValue = unknown;

const CACHE_HEADERS = {
  // Cache at the edge for an hour; clients refresh per-load.
  // Sync runs at most daily, so an hour of staleness is acceptable and
  // dramatically reduces D1 read volume.
  "cache-control": "public, max-age=60, s-maxage=3600",
  "content-type": "application/json; charset=utf-8",
};

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries()) as Record<string, string>;
  }
  if (Array.isArray(headers)) {
    const entries: Record<string, string> = {};
    for (const [key, value] of headers) {
      entries[key] = value;
    }
    return entries;
  }
  return headers as Record<string, string>;
}

export function jsonResponse(body: JsonValue, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...CACHE_HEADERS, ...headersToRecord(init.headers) },
  });
}

/**
 * JSON response for per-user runtime data (the opt-in shortlist sync).
 * Unlike {@link jsonResponse}, this is never cached at the edge or shared —
 * the payload is private to a single sync code.
 */
export function privateJsonResponse(body: JsonValue, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function notFound(message = "Not Found"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function serverError(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Read a request body with a byte-size limit. Returns the decoded string on
 * success, or a `Response` (400/411/413) on failure.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string | Response> {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    return privateJsonResponse({ error: "Length Required" }, { status: 411 });
  }
  const declared = Number(contentLength);
  if (!Number.isInteger(declared) || declared < 0 || declared > maxBytes) {
    return privateJsonResponse({ error: "Payload too large" }, { status: 413 });
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.body?.getReader();
  } catch {
    return privateJsonResponse({ error: "Bad Request" }, { status: 400 });
  }
  if (!reader) {
    return privateJsonResponse({ error: "Bad Request" }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return privateJsonResponse({ error: "Payload too large" }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return privateJsonResponse({ error: "Failed to read request body" }, { status: 400 });
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(buffer);
}

/**
 * Reconstructs the `BlockSummary` shape from a row of the `blocks` table.
 * Keys, ordering, and null/undefined choices match the original artifact
 * JSON contract enforced by `blockSummarySchema` in `src/lib/dataSchemas.ts`.
 */
export { rowToBlockSummary, type BlockRow } from "../../shared/d1-block-row";

export { townFilenameToCanonical } from "../../shared/geo";

/**
 * Extract a URL path parameter as a clean string.
 * Cloudflare Pages Functions may deliver params as `string | string[]`.
 * Strips a trailing `.json` extension when present.
 */
export function parseSlugParam(
  params: Record<string, string | string[]>,
  key: string,
): string | null {
  const raw = params[key];
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) return null;
  return slug.replace(/\.json$/, "");
}

/** Prefix indexes for `/api/suggest` — see migration `0005_suggest_indexes.sql`. */
