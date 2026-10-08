/**
 * POST /api/comparable-transactions
 *
 * Accepts a CandidateListing JSON body, reads the stored transactions with
 * three widening passes, scores results with the shared comparable engine,
 * and returns a ListingComparableSet.
 *
 * Deterministic, no AI, no external API calls, no runtime geocoding.
 */

import { privateJsonResponse, readBodyWithLimit } from "../_lib/d1";
import type { PublicRouteHandler, TransactionRecord, TransactionScope } from "../_lib/public-data";
import {
  type CandidateListing,
  type ListingComparableSet,
  type TransactionRow,
  MIN_COMPARABLES,
  buildComparableSet,
  parseStoreyMidpoint,
} from "../../shared/comparable-engine";
import { buildTrendLookup, computeTimeAdjustments } from "../../shared/time-adjustment";
import type { AdjustmentMeta } from "../../shared/time-adjustment";
import type { TimeAdjustedComparable } from "../../shared/data-types";
import { canonicalFlatType } from "../../shared/filter-options";
import { maxLeaseCommenceYear, MIN_LEASE_COMMENCE_YEAR } from "../../shared/product/lease";
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
  referenceMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  nearestMrtDistance: z.number().nonnegative().optional(),
});

// Body size limit: 8 KB is more than enough for a CandidateListing payload.
const MAX_BODY_BYTES = 8192;

function transactionRowKey(row: TransactionRow): string {
  return (
    row.id ||
    `${row.month}|${row.town}|${row.block}|${row.streetName}|${row.flatType}|${row.resalePrice}|${row.floorAreaSqm}`
  );
}

/** Keep `primary` rows first, then append extras that the recency LIMIT omitted. */
function mergeTransactionRows(
  primary: TransactionRow[],
  extras: TransactionRow[],
): TransactionRow[] {
  if (extras.length === 0) return primary;
  const seen = new Set<string>();
  const merged: TransactionRow[] = [];
  for (const row of [...primary, ...extras]) {
    const key = transactionRowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

function isValidLeaseCommenceYear(
  leaseCommenceYear: number | null,
  referenceMonth: string,
): boolean {
  if (leaseCommenceYear == null) return true;
  const referenceYear = Number(referenceMonth.slice(0, 4));
  return (
    Number.isFinite(referenceYear) &&
    leaseCommenceYear >= MIN_LEASE_COMMENCE_YEAR &&
    leaseCommenceYear <= maxLeaseCommenceYear(referenceYear)
  );
}

// ---------------------------------------------------------------------------
// Stored row ↔ TS mapping
// ---------------------------------------------------------------------------

function normalizeComparableId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Map a snake_case `transactions` row to a camelCase TransactionRow.
 *  `storey_midpoint` and `price_per_sqm` are no longer stored —
 *  they are derived here at read time to save ~374 MB of index storage. */
function toTransactionRow(row: TransactionRecord): TransactionRow {
  const storeyRange = (row.storey_range as string) ?? "";
  const floorAreaSqm = (row.floor_area_sqm as number) ?? 0;
  const resalePrice = (row.resale_price as number) ?? 0;
  return {
    id: normalizeComparableId(row.id),
    month: row.month as string,
    town: row.town as string,
    block: row.block as string,
    streetName: row.street_name as string,
    addressKey: row.address_key as string,
    flatType: canonicalFlatType(row.flat_type as string),
    storeyRange,
    // Fallback to 0 is defensive only — pipeline.ts filters out rows whose
    // storey_range cannot be parsed, so every stored row has a valid range.
    storeyMidpoint: parseStoreyMidpoint(storeyRange) ?? 0,
    floorAreaSqm,
    leaseCommenceDate: (row.lease_commence_year as number) ?? null,
    resalePrice,
    pricePerSqm: floorAreaSqm > 0 ? Math.round((resalePrice / floorAreaSqm) * 100) / 100 : 0,
    flatModel: (row.flat_model as string) ?? "",
  };
}

// ---------------------------------------------------------------------------
// Time adjustment
// ---------------------------------------------------------------------------

/** Valid values for the ?adjust query parameter. */
const VALID_ADJUST_VALUES = new Set(["time"]);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const onRequestPost: PublicRouteHandler = async ({ request, publicData }) => {
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
      { error: 'Invalid ?adjust value. Expected "time".' },
      { status: 400 },
    );
  }
  const applyAdjustment = adjustParam === "time";

  // 1. Read and validate body
  const bodyText = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (bodyText instanceof Response) return bodyText;

  let parsed: CandidateListing;
  try {
    const json: unknown = JSON.parse(bodyText);
    parsed = candidateListingSchema.parse(json) as CandidateListing;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return privateJsonResponse({ error: "Invalid request body" }, { status: 400 });
    }
    return privateJsonResponse({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidLeaseCommenceYear(parsed.leaseCommenceYear, parsed.referenceMonth)) {
    return privateJsonResponse({ error: "Invalid request body" }, { status: 400 });
  }
  parsed = { ...parsed, flatType: canonicalFlatType(parsed.flatType) };

  // 2. Count each scope in parallel
  const blockScope: TransactionScope = {
    kind: "block",
    town: parsed.town,
    block: parsed.block,
    flatType: parsed.flatType,
  };
  const streetScope: TransactionScope = {
    kind: "street",
    streetName: parsed.streetName,
    flatType: parsed.flatType,
  };
  const townScope: TransactionScope = {
    kind: "town",
    town: parsed.town,
    flatType: parsed.flatType,
  };
  const [sameBlockCount, sameStreetCount, sameTownCount] = await Promise.all([
    publicData.countTransactions(blockScope),
    publicData.countTransactions(streetScope),
    publicData.countTransactions(townScope),
  ]);

  // 3. Fetch the narrowest pass that meets MIN_COMPARABLES, then merge in any
  // narrower-scope rows the recency limit (RECENT_TRANSACTIONS_LIMIT per scope)
  // would otherwise drop. Quiet blocks often have a handful of older same-block
  // sales while the town has 150+ newer transactions; scoring only the recent
  // town window would hide the listing's own evidence and skew the asking-price
  // verdict.
  const fetchRows = async (scope: TransactionScope) =>
    (await publicData.recentTransactions(scope)).map(toTransactionRow);
  const fetchBlockRows = () => fetchRows(blockScope);
  const fetchStreetRows = () => fetchRows(streetScope);
  const fetchTownRows = () => fetchRows(townScope);

  let sameBlockRows: TransactionRow[] = [];
  let sameStreetRows: TransactionRow[] = [];
  let sameTownRows: TransactionRow[] = [];

  if (sameBlockCount >= MIN_COMPARABLES) {
    sameBlockRows = await fetchBlockRows();
    sameStreetRows = sameBlockRows.filter((row) => row.streetName === parsed.streetName);
    sameTownRows = sameBlockRows;
  } else if (sameStreetCount >= MIN_COMPARABLES) {
    const [blockRows, streetRows] = await Promise.all([
      sameBlockCount > 0 ? fetchBlockRows() : Promise.resolve([]),
      fetchStreetRows(),
    ]);
    sameBlockRows = blockRows;
    sameStreetRows = mergeTransactionRows(streetRows, blockRows);
    sameTownRows = sameStreetRows;
  } else if (sameTownCount > 0) {
    const [blockRows, streetRows, townRows] = await Promise.all([
      sameBlockCount > 0 ? fetchBlockRows() : Promise.resolve([]),
      sameStreetCount > 0 ? fetchStreetRows() : Promise.resolve([]),
      fetchTownRows(),
    ]);
    sameBlockRows = blockRows;
    sameStreetRows = mergeTransactionRows(streetRows, blockRows);
    sameTownRows = mergeTransactionRows(townRows, sameStreetRows);
  }
  // If all counts are 0, the three arrays stay empty → buildComparableSet handles it.

  // 4. Score and build the result
  const result = buildComparableSet({
    candidate: parsed,
    sameBlockRows,
    sameStreetRows,
    sameTownRows,
  });

  // 5. Apply time adjustment if requested (after scoring, before response)
  let adjustmentMeta: AdjustmentMeta | null = null;
  let adjustedComparables: TimeAdjustedComparable[] | null = null;

  if (applyAdjustment && result.comparables.length > 0) {
    try {
      // Collect unique town × flat type pairs from the comparables so we
      // only read the subset of trend data we actually need.
      const uniquePairs = new Map<string, { town: string; flatType: string }>();
      for (const c of result.comparables) {
        const key = `${c.town}__${c.flatType}`;
        if (!uniquePairs.has(key)) {
          uniquePairs.set(key, { town: c.town, flatType: c.flatType });
        }
      }

      const trendLookup = buildTrendLookup(
        await publicData.trendHistory([...uniquePairs.values()]),
      );
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
        adjustmentCaveats: ["Time adjustment could not be applied — trend data query failed."],
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
    const effectiveMeta =
      adjustmentMeta ??
      (result.comparables.length === 0
        ? {
            adjustmentApplied: false,
            adjustmentCaveats: [],
          }
        : {
            adjustmentApplied: false,
            adjustmentCaveats: ["Time adjustment could not be applied — trend data query failed."],
          });
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
