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

    let cohortMetadataAvailable = true;
    let result: Awaited<ReturnType<typeof execute>>;
    try {
      result = await execute(true);
    } catch (error) {
      if (!isMissingCohortColumnError(error)) {
        throw error;
      }
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
