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

export const oneMapResponseSchema = z.object({
  found: z.union([z.string(), z.number()]).optional(),
  results: z
    .array(
      z.object({
        LATITUDE: z.string(),
        LONGITUDE: z.string(),
        BUILDING: z.string().optional(),
        ADDRESS: z.string().optional(),
        POSTAL: z.string().optional(),
      }),
    )
    .default([]),
});

export const schoolRowSchema = z.object({
  school_name: z.string(),
  address: z.string().optional(),
  postal_code: z.string().optional(),
  mainlevel_code: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
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
