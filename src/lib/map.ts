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
    display_name?: string | null;
    median_price: number;
    transaction_count: number;
    latest_month: string;
  };
};

// ⚡ Bolt: Cache GeoJsonFeature per block summary reference to avoid allocating
// massive amounts of objects (~10,000+) on every map filter change, which caused GC spikes.
const geoJsonCache = new WeakMap<BlockSummary, GeoJsonFeature>();

export function toGeoJson(blocks: BlockSummary[]) {
  return {
    type: "FeatureCollection" as const,
    features: blocks.map<GeoJsonFeature>((block) => {
      let feature = geoJsonCache.get(block);
      if (!feature) {
        feature = {
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
            ...(block.displayName ? { display_name: block.displayName } : {}),
          },
        };
        geoJsonCache.set(block, feature);
      }
      return feature;
    }),
  };
}
