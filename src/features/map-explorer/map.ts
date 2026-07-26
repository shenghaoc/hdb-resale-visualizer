import type { BlockSummary } from "../../types/data";
import {
  resolveEffectiveBlockCohort,
  resolveEffectiveMedianPrice,
  resolveEffectivePricePerSqmMedian,
} from "../../shared/lib/filtering";

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
    price_basis: string;
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
      // No flat-type filter means one stable block-wide feature can be reused.
      if (!flatType) {
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
              price_basis: "__BLOCK_WIDE__",
              transaction_count: block.transactionCount,
              latest_month: block.latestMonth,
              ...(block.displayName ? { display_name: block.displayName } : {}),
            },
          };
          geoJsonCache.set(block, feature);
        }
        return feature;
      }

      const priceResolution = resolveEffectiveMedianPrice(block, flatType);
      const ppsmResolution = resolveEffectivePricePerSqmMedian(block, flatType);
      const cohortResolution = resolveEffectiveBlockCohort(block, flatType);
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
          median_price: priceResolution.value,
          price_per_sqm_median: ppsmResolution.value,
          price_basis: priceResolution.isTypeSpecific ? priceResolution.flatType : "__BLOCK_WIDE__",
          transaction_count: cohortResolution.isTypeSpecific
            ? cohortResolution.transactionCount
            : block.transactionCount,
          latest_month: cohortResolution.isTypeSpecific
            ? cohortResolution.latestMonth
            : block.latestMonth,
          ...(block.displayName ? { display_name: block.displayName } : {}),
        },
      };
    }),
  };
}
