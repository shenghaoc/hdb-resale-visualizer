import type { BlockSummary } from "@/types/data";

type GeoJsonFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    address_key: string;
    town: string;
    address: string;
    median_price: number;
    transaction_count: number;
    latest_month: string;
  };
};

export function toGeoJson(blocks: BlockSummary[]) {
  return {
    type: "FeatureCollection" as const,
    features: blocks.map<GeoJsonFeature>((block) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [block.coordinates.lng, block.coordinates.lat],
      },
      properties: {
        address_key: block.addressKey,
        town: block.town,
        address: `${block.block} ${block.streetName}`,
        median_price: block.medianPrice,
        transaction_count: block.transactionCount,
        latest_month: block.latestMonth,
      },
    })),
  };
}
