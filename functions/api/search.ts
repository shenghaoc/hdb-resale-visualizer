import { badRequest, jsonResponse, rowToBlockSummary, serverError } from "../_lib/d1";
import type { PublicRouteHandler } from "../_lib/public-data";
import { SEARCH_RESULT_LIMIT, parseSearchRequest, validateSearchRequest } from "../_lib/search";
import { requiresFlatTypeCohortMetadata } from "../../shared/product/flat-type-cohort";

export const onRequestGet: PublicRouteHandler = async ({ publicData, request }) => {
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

    // A successful ALTER TABLE is not the same as a completed data backfill.
    // Probe only when the requested refinement needs the cohort JSON, and
    // conservatively refuse the refinement if any block is still unbackfilled.
    const useFlatTypeCohorts = requiresFlatTypeCohortMetadata(parsed.request)
      ? await publicData.flatTypeCohortsComplete()
      : true;
    // The result reports whether the cohorts were used: if readiness changed between the probe and the query,
    // the backend answers without them, and the response says so rather than failing.
    const { rows, usedFlatTypeCohorts } = await publicData.searchBlocks(
      parsed.request,
      useFlatTypeCohorts,
    );
    const truncated = rows.length > SEARCH_RESULT_LIMIT;
    const shaped = rows.slice(0, SEARCH_RESULT_LIMIT).map(rowToBlockSummary);
    return jsonResponse({
      blocks: shaped,
      truncated,
      limit: SEARCH_RESULT_LIMIT,
      cohortMetadataAvailable: usedFlatTypeCohorts,
    });
  } catch (error) {
    console.error("Search API failed:", error);
    return serverError("Internal server error");
  }
};
