import {
  badRequest,
  BLOCK_SUMMARY_SELECT_SQL,
  jsonResponse,
  rowToBlockSummary,
  serverError,
} from "../_lib/d1";
import {
  SEARCH_RESULT_LIMIT,
  buildSearchQuery,
  parseSearchRequest,
  validateSearchRequest,
} from "../_lib/search";
import { requiresFlatTypeCohortMetadata } from "../../shared/product/flat-type-cohort";

type SearchContext = {
  env: {
    DB: {
      prepare: (sql: string) => {
        bind: (...args: unknown[]) => { all: () => Promise<{ results?: unknown[] }> };
      };
    };
  };
  request: Request;
};

function isMissingCohortColumnError(error: unknown): boolean {
  return error instanceof Error && /no such column:.*flat_type_cohorts_json/i.test(error.message);
}

async function hasCompleteCohortMetadata(db: SearchContext["env"]["DB"]): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        "SELECT COUNT(*) AS total_count, COUNT(NULLIF(TRIM(flat_type_cohorts_json), '')) AS populated_count FROM blocks",
      )
      .bind()
      .all();
    const counts = (result.results?.[0] ?? {}) as {
      total_count?: number;
      populated_count?: number;
    };
    return (
      typeof counts.total_count === "number" &&
      counts.total_count > 0 &&
      counts.populated_count === counts.total_count
    );
  } catch (error) {
    if (isMissingCohortColumnError(error)) return false;
    throw error;
  }
}

export const onRequestGet = async ({ env, request }: SearchContext) => {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchRequest(url);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const validationError = validateSearchRequest(parsed.request);
    if (validationError) {
      return badRequest(validationError);
    }

    const execute = (supportsFlatTypeCohorts: boolean) => {
      const { whereSql, bindings } = buildSearchQuery(
        parsed.request,
        undefined,
        supportsFlatTypeCohorts,
      );
      const sql = `SELECT ${BLOCK_SUMMARY_SELECT_SQL} FROM blocks ${whereSql} ORDER BY address_key LIMIT ?`;
      return env.DB.prepare(sql)
        .bind(...bindings, SEARCH_RESULT_LIMIT + 1)
        .all();
    };

    // A successful ALTER TABLE is not the same as a completed data backfill.
    // Probe only when the requested refinement needs the cohort JSON, and
    // conservatively refuse the refinement if any block is still unbackfilled.
    let cohortMetadataAvailable = requiresFlatTypeCohortMetadata(parsed.request)
      ? await hasCompleteCohortMetadata(env.DB)
      : true;
    let result: Awaited<ReturnType<typeof execute>>;
    try {
      result = await execute(cohortMetadataAvailable);
    } catch (error) {
      // Defensive race handling: if readiness changed between the probe and
      // query, retain the truthful unsupported response rather than returning 500.
      if (!cohortMetadataAvailable || !isMissingCohortColumnError(error)) throw error;
      cohortMetadataAvailable = false;
      result = await execute(false);
    }
    const rows = (result.results ?? []) as Parameters<typeof rowToBlockSummary>[0][];
    const truncated = rows.length > SEARCH_RESULT_LIMIT;
    const shaped = rows.slice(0, SEARCH_RESULT_LIMIT).map(rowToBlockSummary);
    return jsonResponse({
      blocks: shaped,
      truncated,
      limit: SEARCH_RESULT_LIMIT,
      cohortMetadataAvailable,
    });
  } catch (error) {
    console.error("Search API failed:", error);
    return serverError("Internal server error");
  }
};
