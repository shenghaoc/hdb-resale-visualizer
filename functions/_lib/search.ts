import { canonicalFlatType } from "../../shared/filter-options";

const MAX_LEASE_DURATION = 99;
const MAX_SEARCH_QUERY_LENGTH = 256;
const MAX_MRT_DISTANCE_METERS = 20_000;
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const SEARCH_RESULT_LIMIT = 2000;

export const SEARCH_PREDICATE_OWNERSHIP = {
  server: [
    "town",
    "flatType",
    "budgetMin",
    "budgetMax",
    "flatModel",
    "areaMin",
    "areaMax",
    "mrtMax",
    "remainingLeaseMin",
    "startMonth",
    "endMonth",
  ],
  client: ["textGeographicSearch", "affordability"],
} as const;

export type SearchRequest = {
  town: string;
  flatType: string;
  flatModel: string;
  budgetMin: number | null;
  budgetMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  mrtMax: number | null;
  remainingLeaseMin: number | null;
  startMonth: string | null;
  endMonth: string | null;
};

export type SearchQueryPlan = {
  whereSql: string;
  bindings: unknown[];
};

export type ParsedSearchRequest =
  | { ok: true; request: SearchRequest }
  | { ok: false; error: string };

function parseBoundedParam(value: string | null): string | null {
  if (value === null) return null;
  return value.length <= MAX_SEARCH_QUERY_LENGTH ? value : null;
}

function parseFiniteNumber(value: string | null): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSearchRequest(url: URL): ParsedSearchRequest {
  const params = url.searchParams;

  const town = parseBoundedParam(params.get("town"));
  const flatType = parseBoundedParam(params.get("flatType"));
  const flatModel = parseBoundedParam(params.get("flatModel"));
  const startMonth = parseBoundedParam(params.get("startMonth"));
  const endMonth = parseBoundedParam(params.get("endMonth"));

  if (
    (params.get("town") && town === null) ||
    (params.get("flatType") && flatType === null) ||
    (params.get("flatModel") && flatModel === null) ||
    (params.get("startMonth") && startMonth === null) ||
    (params.get("endMonth") && endMonth === null)
  ) {
    return { ok: false, error: "query parameter too long" };
  }

  const request: SearchRequest = {
    town: town ?? "",
    flatType: flatType ?? "",
    flatModel: flatModel ?? "",
    budgetMin: parseFiniteNumber(params.get("budgetMin")),
    budgetMax: parseFiniteNumber(params.get("budgetMax")),
    areaMin: parseFiniteNumber(params.get("areaMin")),
    areaMax: parseFiniteNumber(params.get("areaMax")),
    mrtMax: parseFiniteNumber(params.get("mrtMax")),
    remainingLeaseMin: parseFiniteNumber(params.get("remainingLeaseMin")),
    startMonth,
    endMonth,
  };

  if (request.budgetMin !== null && request.budgetMax !== null && request.budgetMin > request.budgetMax) {
    [request.budgetMin, request.budgetMax] = [request.budgetMax, request.budgetMin];
  }
  if (request.areaMin !== null && request.areaMax !== null && request.areaMin > request.areaMax) {
    [request.areaMin, request.areaMax] = [request.areaMax, request.areaMin];
  }
  if (request.startMonth && request.endMonth && request.startMonth > request.endMonth) {
    [request.startMonth, request.endMonth] = [request.endMonth, request.startMonth];
  }

  return { ok: true, request };
}

export function validateSearchRequest(request: SearchRequest): string | null {
  if (request.budgetMin !== null && request.budgetMin < 0) return "invalid budgetMin";
  if (request.budgetMax !== null && request.budgetMax < 0) return "invalid budgetMax";
  if (request.areaMin !== null && request.areaMin < 0) return "invalid areaMin";
  if (request.areaMax !== null && request.areaMax < 0) return "invalid areaMax";
  if (request.mrtMax !== null && (request.mrtMax < 0 || request.mrtMax > MAX_MRT_DISTANCE_METERS)) {
    return "invalid mrtMax";
  }
  if (
    request.remainingLeaseMin !== null &&
    (request.remainingLeaseMin < 0 || request.remainingLeaseMin > MAX_LEASE_DURATION)
  ) {
    return "invalid remainingLeaseMin";
  }
  if (request.startMonth && !YEAR_MONTH_PATTERN.test(request.startMonth)) return "invalid startMonth";
  if (request.endMonth && !YEAR_MONTH_PATTERN.test(request.endMonth)) return "invalid endMonth";
  return null;
}

export function buildSearchQuery(request: SearchRequest): SearchQueryPlan {
  const where: string[] = [];
  const bindings: unknown[] = [];

  if (request.town) {
    where.push("town = ?");
    bindings.push(request.town);
  }

  if (request.flatType) {
    const canonical = canonicalFlatType(request.flatType);
    where.push(
      "EXISTS (SELECT 1 FROM json_each(blocks.flat_types_json) WHERE UPPER(TRIM(json_each.value)) = ?)",
    );
    bindings.push(canonical);

    const jsonPath = `$.${JSON.stringify(canonical)}`;
    if (request.budgetMin !== null) {
      where.push(
        "COALESCE(CAST(json_extract(blocks.median_price_by_flat_type_json, ?) AS INTEGER), blocks.median_price) >= ?",
      );
      bindings.push(jsonPath, request.budgetMin);
    }
    if (request.budgetMax !== null) {
      where.push(
        "COALESCE(CAST(json_extract(blocks.median_price_by_flat_type_json, ?) AS INTEGER), blocks.median_price) <= ?",
      );
      bindings.push(jsonPath, request.budgetMax);
    }
  } else {
    if (request.budgetMin !== null) {
      where.push("median_price >= ?");
      bindings.push(request.budgetMin);
    }
    if (request.budgetMax !== null) {
      where.push("median_price <= ?");
      bindings.push(request.budgetMax);
    }
  }

  if (request.flatModel) {
    where.push("EXISTS (SELECT 1 FROM json_each(blocks.flat_models_json) WHERE json_each.value = ? COLLATE NOCASE)");
    bindings.push(request.flatModel);
  }
  if (request.areaMin !== null) {
    where.push("floor_area_max >= ?");
    bindings.push(request.areaMin);
  }
  if (request.areaMax !== null) {
    where.push("floor_area_min <= ?");
    bindings.push(request.areaMax);
  }
  if (request.mrtMax !== null) {
    where.push("nearest_mrt_json IS NOT NULL");
    where.push("CAST(json_extract(nearest_mrt_json, '$.distanceMeters') AS REAL) <= ?");
    bindings.push(request.mrtMax);
  }
  if (request.remainingLeaseMin !== null) {
    where.push("(? - lease_commence_year) <= ?");
    bindings.push(new Date().getUTCFullYear(), MAX_LEASE_DURATION - request.remainingLeaseMin);
  }
  if (request.startMonth) {
    where.push("available_max_month >= ?");
    bindings.push(request.startMonth);
  }
  if (request.endMonth) {
    where.push("available_min_month <= ?");
    bindings.push(request.endMonth);
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    bindings,
  };
}
