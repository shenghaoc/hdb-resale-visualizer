import {
  badRequest,
  jsonResponse,
  parseSlugParam,
  rowToBlockSummary,
  serverError,
  townFilenameToCanonical,
} from "../../_lib/d1";
import type { PublicRouteHandler } from "../../_lib/public-data";

export const onRequestGet: PublicRouteHandler = async ({ publicData, params }) => {
  const slug = parseSlugParam(params, "town");
  if (!slug) {
    return badRequest("town filename required");
  }

  const town = townFilenameToCanonical(slug);

  try {
    return jsonResponse((await publicData.townBlocks(town)).map(rowToBlockSummary));
  } catch (error) {
    console.error("town lookup failed:", error);
    return serverError("Internal server error");
  }
};
