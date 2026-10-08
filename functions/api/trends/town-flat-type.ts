import { jsonResponse, serverError } from "../../_lib/d1";
import type { PublicRouteHandler } from "../../_lib/public-data";

export const onRequestGet: PublicRouteHandler = async ({ publicData }) => {
  try {
    const points = (await publicData.townFlatTypeTrends()).map((row) => ({
      town: row.town,
      flatType: row.flat_type,
      month: row.month,
      medianPrice: row.median_price,
      medianPricePerSqm: row.median_price_per_sqm,
      transactionCount: row.transaction_count,
    }));
    return jsonResponse(points);
  } catch (error) {
    console.error("trends lookup failed:", error);
    return serverError("Internal server error");
  }
};
