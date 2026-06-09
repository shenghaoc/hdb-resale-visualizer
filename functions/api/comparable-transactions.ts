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
  parseStoreyMidpoint,
} from "../../shared/comparable-engine";
import {
  buildTrendLookup,
  computeTimeAdjustments,
} from "../../shared/time-adjustment";
import type { AdjustmentMeta } from "../../shared/time-adjustment";
import type { TimeAdjustedComparable } from "../../shared/data-types";
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

/** Map a snake_case D1 row to a camelCase TransactionRow.
 *  `storey_midpoint` and `price_per_sqm` are no longer stored in D1 —
 *  they are derived here at read time to save ~374 MB of index storage. */
function mapD1Row(row: Record<string, unknown>): TransactionRow {
  const storeyRange = row.storey_range as string;
  const floorAreaSqm = row.floor_area_sqm as number;
  const resalePrice = row.resale_price as number;
  return {
    id: String(row.id),
    month: row.month as string,
    town: row.town as string,
    block: row.block as string,
    streetName: row.street_name as string,
    addressKey: row.address_key as string,
    flatType: row.flat_type as string,
    storeyRange,
    // Fallback to 0 is defensive only — pipeline.ts filters out rows whose
    // storey_range cannot be parsed, so every row reaching D1 has a valid range.
    storeyMidpoint: parseStoreyMidpoint(storeyRange) ?? 0,
    floorAreaSqm,
    leaseCommenceDate: (row.lease_commence_year as number) ?? null,
    resalePrice,
    pricePerSqm: floorAreaSqm > 0 ? Number((resalePrice / floorAreaSqm).toFixed(2)) : 0,
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
// Time adjustment
// ---------------------------------------------------------------------------

/** Valid values for the ?adjust query parameter. */
const VALID_ADJUST_VALUES = new Set(["time"]);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 0. Parse query parameter for optional time adjustment
  const url = new URL(request.url);
  const adjustParam = url.searchParams.get("adjust");
  if (adjustParam !== null && adjustParam.length > 20) {
    return privateJsonResponse(
      { error: "Invalid ?adjust value — exceeds maximum length." },
      { status: 400 },
    );
  }
  if (adjustParam !== null && !VALID_ADJUST_VALUES.has(adjustParam)) {
    return privateJsonResponse(
      { error: `Invalid ?adjust value. Expected "time", got "${adjustParam}".` },
      { status: 400 },
    );
  }
  const applyAdjustment = adjustParam === "time";

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

  // 5. Apply time adjustment if requested (after scoring, before response)
  let adjustmentMeta: AdjustmentMeta | null = null;
  let adjustedComparables: TimeAdjustedComparable[] | null = null;

  if (applyAdjustment && result.comparables.length > 0) {
    try {
      // Collect unique town × flat type pairs from the comparables so we
      // only query the subset of trend data we actually need.
      const uniquePairs = new Map<string, { town: string; flatType: string }>();
      for (const c of result.comparables) {
        const key = `${c.town}__${c.flatType}`;
        if (!uniquePairs.has(key)) {
          uniquePairs.set(key, { town: c.town, flatType: c.flatType });
        }
      }

      // Build a parameterized IN clause: WHERE (town, flat_type) IN ((?1,?2), (?3,?4), ...)
      const placeholders: string[] = [];
      const params: string[] = [];
      let idx = 0;
      for (const pair of uniquePairs.values()) {
        placeholders.push(`(?${idx + 1},?${idx + 2})`);
        params.push(pair.town, pair.flatType);
        idx += 2;
      }

      const trendRows = await env.DB.prepare(
        `SELECT town, flat_type, month, median_price_per_sqm, transaction_count
         FROM town_flat_type_trends
         WHERE (town, flat_type) IN (${placeholders.join(", ")})`,
      )
        .bind(...params)
        .all<{
          town: string;
          flat_type: string;
          month: string;
          median_price_per_sqm: number;
          transaction_count: number;
        }>();
      const trendLookup = buildTrendLookup(trendRows.results ?? []);
      const adjustmentResult = computeTimeAdjustments(
        result.comparables.map((c) => ({
          town: c.town,
          flatType: c.flatType,
          month: c.month,
          resalePrice: c.resalePrice,
          pricePerSqm: c.pricePerSqm,
        })),
        trendLookup,
      );
      adjustmentMeta = adjustmentResult.meta;
      adjustedComparables = adjustmentResult.adjustedComparables;
    } catch {
      // If the trends query fails, fall back to raw prices.
      adjustmentMeta = {
        adjustmentApplied: false,
        adjustmentCaveats: [
          "Time adjustment could not be applied — trend data query failed.",
        ],
      };
      adjustedComparables = null;
    }
  }

  // Build the final response. When adjustment is applied, each comparable
  // is annotated with raw + adjusted prices. When not applied, the response
  // shape matches the existing contract (no adjustment fields).
  //
  // Importantly: when ?adjust=time was requested but the adjustment could not
  // be applied (e.g. trend query failure, missing data), we still surface the
  // adjustmentApplied flag and caveats so the UI can tell the user what happened.
  const baseResponse: ListingComparableSet = {
    ...result,
    sameBlockCount,
    sameStreetCount,
    sameTownCount,
  };

  if (applyAdjustment) {
    const effectiveMeta = adjustmentMeta ?? {
      adjustmentApplied: false,
      adjustmentCaveats: [
        "Time adjustment could not be applied — trend data query failed.",
      ],
    };
    if (adjustedComparables) {
      const comparablesWithAdjustment = result.comparables.map((c, i) => ({
        ...c,
        ...adjustedComparables[i],
      }));
      return privateJsonResponse({
        ...baseResponse,
        comparables: comparablesWithAdjustment,
        adjustmentApplied: effectiveMeta.adjustmentApplied,
        adjustmentCaveats: effectiveMeta.adjustmentCaveats,
      });
    }
    // Adjustment was requested but no adjusted data could be computed
    // (e.g. trend query failed, or all comparables lacked trend data).
    // Still include the meta so the client can show the failure reason.
    return privateJsonResponse({
      ...baseResponse,
      adjustmentApplied: effectiveMeta.adjustmentApplied,
      adjustmentCaveats: effectiveMeta.adjustmentCaveats,
    });
  }

  return privateJsonResponse(baseResponse);
};
