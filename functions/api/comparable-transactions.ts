/**
 * POST /api/comparable-transactions
 *
 * Accepts a CandidateListing JSON body, queries the transactions D1 table
 * with three widening passes, scores results with the shared comparable
 * engine, and returns a ListingComparableSet.
 *
 * Deterministic, no AI, no external API calls, no runtime geocoding.
 */

import { privateJsonResponse } from "../_lib/d1";
import {
  type CandidateListing,
  type ListingComparableSet,
  type TransactionRow,
  buildComparableSet,
} from "../../shared/comparable-engine";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const candidateListingSchema = z.object({
  town: z.string().min(1),
  block: z.string().min(1),
  streetName: z.string().min(1),
  flatType: z.string().min(1),
  storeyRange: z.string().min(1),
  floorAreaSqm: z.number().positive(),
  leaseCommenceYear: z.number().int().positive().nullable(),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
  nearestMrtDistance: z.number().nonnegative().optional(),
});

// Body size limit: 8 KB is more than enough for a CandidateListing payload.
const MAX_BODY_BYTES = 8192;

// ---------------------------------------------------------------------------
// D1 ↔ TS mapping
// ---------------------------------------------------------------------------

/** Map a snake_case D1 row to a camelCase TransactionRow. */
function mapD1Row(row: Record<string, unknown>): TransactionRow {
  return {
    id: row.id as string,
    month: row.month as string,
    town: row.town as string,
    block: row.block as string,
    streetName: row.street_name as string,
    addressKey: row.address_key as string,
    flatType: row.flat_type as string,
    storeyRange: row.storey_range as string,
    storeyMidpoint: row.storey_midpoint as number,
    floorAreaSqm: row.floor_area_sqm as number,
    leaseCommenceDate: (row.lease_commence_year as number) ?? null,
    resalePrice: row.resale_price as number,
    pricePerSqm: row.price_per_sqm as number,
    flatModel: (row.flat_model as string) ?? "",
  };
}

// ---------------------------------------------------------------------------
// Body reading
// ---------------------------------------------------------------------------

async function readBodyWithLimit(request: Request): Promise<string | Response> {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    return privateJsonResponse({ error: "Length Required" }, { status: 411 });
  }
  const declared = Number(contentLength);
  if (!Number.isInteger(declared) || declared < 0 || declared > MAX_BODY_BYTES) {
    return privateJsonResponse({ error: "Payload too large" }, { status: 413 });
  }

  const reader = request.body?.getReader();
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
      if (totalBytes > MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch { /* ignore */ }
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

// ---------------------------------------------------------------------------
// D1 queries
// ---------------------------------------------------------------------------

async function queryCount(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<number> {
  let stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt = stmt.bind(...params);
  }
  const result = await stmt.first<{ cnt: number }>();
  return result?.cnt ?? 0;
}

async function queryRows(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<TransactionRow[]> {
  let stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt = stmt.bind(...params);
  }
  const result = await stmt.all<Record<string, unknown>>();
  return (result.results ?? []).map(mapD1Row);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 1. Read and validate body
  const bodyText = await readBodyWithLimit(request);
  if (bodyText instanceof Response) return bodyText;

  let parsed: CandidateListing;
  try {
    const json: unknown = JSON.parse(bodyText);
    parsed = candidateListingSchema.parse(json) as CandidateListing;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return privateJsonResponse(
        { error: "Invalid request body", details: e.issues },
        { status: 400 },
      );
    }
    return privateJsonResponse({ error: "Invalid JSON" }, { status: 400 });
  }

  // 2. Run three parallel COUNT(*) queries for scope counts
  const [sameBlockCount, sameStreetCount, sameTownCount] = await Promise.all([
    queryCount(
      env.DB,
      "SELECT COUNT(*) AS cnt FROM transactions WHERE town = ?1 AND block = ?2 AND flat_type = ?3",
      parsed.town, parsed.block, parsed.flatType,
    ),
    queryCount(
      env.DB,
      "SELECT COUNT(*) AS cnt FROM transactions WHERE street_name = ?1 AND flat_type = ?2",
      parsed.streetName, parsed.flatType,
    ),
    queryCount(
      env.DB,
      "SELECT COUNT(*) AS cnt FROM transactions WHERE town = ?1 AND flat_type = ?2",
      parsed.town, parsed.flatType,
    ),
  ]);

  // 3. Determine which pass wins and fetch the data
  let dataRows: TransactionRow[] = [];

  if (sameBlockCount >= 8) {
    dataRows = await queryRows(
      env.DB,
      "SELECT * FROM transactions WHERE town = ?1 AND block = ?2 AND flat_type = ?3 ORDER BY month DESC LIMIT 150",
      parsed.town, parsed.block, parsed.flatType,
    );
  } else if (sameStreetCount >= 8) {
    dataRows = await queryRows(
      env.DB,
      "SELECT * FROM transactions WHERE street_name = ?1 AND flat_type = ?2 ORDER BY month DESC LIMIT 150",
      parsed.streetName, parsed.flatType,
    );
  } else if (sameTownCount > 0) {
    dataRows = await queryRows(
      env.DB,
      "SELECT * FROM transactions WHERE town = ?1 AND flat_type = ?2 ORDER BY month DESC LIMIT 150",
      parsed.town, parsed.flatType,
    );
  }
  // If all counts are 0, dataRows stays empty → buildComparableSet handles it.

  // 4. Score and build the result
  // buildComparableSet needs all three row arrays for counts, but we only
  // have the winning pass's data. Pass empty arrays for non-winning scopes
  // since we already have the counts from the parallel queries above.
  //
  // Actually, buildComparableSet computes counts from the passed arrays.
  // To avoid re-querying, we pass the data rows and use the pre-computed
  // counts to construct the result directly.
  const result = buildComparableSet({
    candidate: parsed,
    sameBlockRows: dataRows.filter(
      (r) => r.block === parsed.block && r.town === parsed.town,
    ),
    sameStreetRows: dataRows.filter(
      (r) => r.streetName === parsed.streetName,
    ),
    sameTownRows: dataRows,
  });

  // Override counts with the pre-computed values from COUNT(*) queries,
  // which are accurate for the full dataset (not just the winning pass).
  const response: ListingComparableSet = {
    ...result,
    sameBlockCount,
    sameStreetCount,
    sameTownCount,
  };

  return privateJsonResponse(response);
};
