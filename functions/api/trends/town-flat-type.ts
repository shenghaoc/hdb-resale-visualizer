import { jsonResponse, serverError } from "../../_lib/d1";

type TrendRow = {
  town: string;
  flat_type: string;
  month: string;
  median_price: number;
  median_price_per_sqm: number;
  transaction_count: number;
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare(
      "SELECT town, flat_type, month, median_price, median_price_per_sqm, transaction_count " +
        "FROM town_flat_type_trends ORDER BY town, flat_type, month",
    ).all<TrendRow>();
    const points = (result.results ?? []).map((row) => ({
      town: row.town,
      flatType: row.flat_type,
      month: row.month,
      medianPrice: row.median_price,
      medianPricePerSqm: row.median_price_per_sqm,
      transactionCount: row.transaction_count,
    }));
    return jsonResponse(points);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "trends lookup failed");
  }
};
