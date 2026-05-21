import { z } from "zod";

export const collectionMetadataSchema = z.object({
  code: z.number(),
  data: z.object({
    collectionMetadata: z.object({
      collectionId: z.string(),
      lastUpdatedAt: z.string(),
      childDatasets: z.array(z.string()),
    }),
  }),
});

export const resaleCsvRowSchema = z.object({
  month: z.string(),
  town: z.string(),
  flat_type: z.string(),
  block: z.string(),
  street_name: z.string(),
  storey_range: z.string(),
  floor_area_sqm: z.string(),
  flat_model: z.string(),
  lease_commence_date: z.string(),
  resale_price: z.string(),
  remaining_lease: z.string().optional(),
});

export const propertyRowSchema = z.object({
  blk_no: z.string(),
  street: z.string(),
  max_floor_lvl: z.string(),
  year_completed: z.string(),
  total_dwelling_units: z.string(),
});

export const mrtFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.object({
    STATION_NA: z.string(),
    EXIT_CODE: z.string().optional(),
  }),
});

export const sgPostalCodeSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val) return null;
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "NIL" || trimmed.toLowerCase() === "na") return null;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length > 0 && digits.length <= 6) {
      return digits.padStart(6, "0");
    }
    return null;
  });

export const oneMapResponseSchema = z.object({
  found: z.union([z.string(), z.number()]).optional(),
  results: z
    .array(
      z.object({
        LATITUDE: z.string(),
        LONGITUDE: z.string(),
        BUILDING: z.string().optional(),
        ADDRESS: z.string().optional(),
        POSTAL: sgPostalCodeSchema,
      }),
    )
    .default([]),
});

export const schoolRowSchema = z.object({
  school_name: z.string(),
  address: z.string().optional(),
  postal_code: sgPostalCodeSchema,
  mainlevel_code: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
});

export const supermarketRowSchema = z.object({
  licensee_name: z.string(),
  building_name: z.string().optional(),
  block_house_num: z.string().optional(),
  street_name: z.string().optional(),
  postal_code: sgPostalCodeSchema,
});

export const geoJsonFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.record(z.string(), z.unknown()),
});

export const geoJsonCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(geoJsonFeatureSchema),
});

// OneMap routing returns route_summary.total_time (seconds) when routeType is walk/drive/cycle.
// Public transport returns an array of plan_label entries instead — not used here.
export const oneMapRoutingResponseSchema = z.object({
  status: z.union([z.string(), z.number()]).optional(),
  status_message: z.string().optional(),
  route_summary: z
    .object({
      total_time: z.number().nonnegative(),
      total_distance: z.number().nonnegative().optional(),
    })
    .optional(),
});

export const oneMapTokenResponseSchema = z.object({
  access_token: z.string(),
  expiry_timestamp: z.union([z.string(), z.number()]).optional(),
});

export const routingCacheEntrySchema = z.object({
  walkingTimeSeconds: z.number().nonnegative().int(),
  walkingDistanceMeters: z.number().nonnegative().nullable(),
});

export const routingCacheFileSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  entries: z.record(z.string(), routingCacheEntrySchema),
});
