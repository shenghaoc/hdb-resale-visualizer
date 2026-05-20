import type { BlockSummary } from "../types/data";
import { getEffectiveMedianPrice } from "./filtering";

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
    price_per_sqm_median: number;
    transaction_count: number;
    latest_month: string;
  };
};

// ⚡ Bolt: Cache GeoJsonFeature per block summary reference to avoid allocating
// massive amounts of objects (~10,000+) on every map filter change, which caused GC spikes.
// When flatType is active, we cannot use the cache because median_price varies by flat type.
const geoJsonCache = new WeakMap<BlockSummary, GeoJsonFeature>();

export function toGeoJson(blocks: BlockSummary[], flatType?: string) {
  return {
    type: "FeatureCollection" as const,
    features: blocks.map<GeoJsonFeature>((block) => {
      // When flatType is active and block has per-type data, bypass cache since median_price varies
      if (!flatType || !block.medianPriceByFlatType) {
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
              price_per_sqm_median: block.pricePerSqmMedian,
              transaction_count: block.transactionCount,
              latest_month: block.latestMonth,
              ...(block.displayName ? { display_name: block.displayName } : {}),
            },
          };
          geoJsonCache.set(block, feature);
        }
        return feature;
      }

      const effectivePrice = getEffectiveMedianPrice(block, flatType);
      const midArea = (block.floorAreaRange[0] + block.floorAreaRange[1]) / 2;
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [block.coordinates.lng, block.coordinates.lat],
        },
        properties: {
          address_key: block.addressKey,
          town: block.town,
          address: `${block.block} ${block.streetName}`,
          median_price: effectivePrice,
          price_per_sqm_median: midArea > 0 ? Number((effectivePrice / midArea).toFixed(2)) : 0,
          transaction_count: block.transactionCount,
          latest_month: block.latestMonth,
          ...(block.displayName ? { display_name: block.displayName } : {}),
        },
      };
    }),
  };
}
