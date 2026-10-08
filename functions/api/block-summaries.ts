import { jsonResponse, rowToBlockSummary, serverError } from "../_lib/d1";
import type { PublicRouteHandler } from "../_lib/public-data";

export const onRequestGet: PublicRouteHandler = async ({ publicData }) => {
  try {
    const summaries = (await publicData.allBlocks()).map(rowToBlockSummary);
    return jsonResponse(summaries);
  } catch (error) {
    console.error("block-summaries lookup failed:", error);
    return serverError("Internal server error");
  }
};
