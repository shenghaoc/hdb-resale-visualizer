import { makeSupermarketCacheKey } from "../amenity";
import { geoJsonFeatureSchema, mrtFeatureSchema, propertyRowSchema, resaleCsvRowSchema, schoolRowSchema, supermarketRowSchema } from "../schemas";
import { makeAddressKey, normalizeText, parseRemainingLease, type GeocodeCacheFile, type MrtExit, type PropertyInfo, type ResaleTransaction, type SchoolLocation } from "../pipeline";
import { geocodeAddress } from "./geocode";
import { sleep } from "./fetchers";

/** Conversion factor from square meters to square feet. */
const SQM_TO_SQFT = 10.7639;

type RawGeoJson = { type: "FeatureCollection"; features: unknown[] };

export function normalizeResaleRows(rows: Record<string, string>[]) {
  const transactions: ResaleTransaction[] = [];
  for (const [index, row] of rows.entries()) {
    const parsed = resaleCsvRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const month = parsed.data.month.trim();
    const town = normalizeText(parsed.data.town);
    const block = normalizeText(parsed.data.block);
    const streetName = normalizeText(parsed.data.street_name);
    const floorAreaSqm = Number(parsed.data.floor_area_sqm);
    const resalePrice = Number(parsed.data.resale_price);
    const leaseCommenceDate = Number(parsed.data.lease_commence_date);
    if (!Number.isFinite(floorAreaSqm) || !Number.isFinite(resalePrice) || !Number.isFinite(leaseCommenceDate)) continue;
    const addressKey = makeAddressKey(town, block, streetName);
    const pricePerSqm = resalePrice / floorAreaSqm;
    transactions.push({
      id: `${addressKey}-${month}-${index}`,
      month,
      town,
      flatType: normalizeText(parsed.data.flat_type),
      block,
      streetName,
      storeyRange: normalizeText(parsed.data.storey_range),
      floorAreaSqm,
      flatModel: normalizeText(parsed.data.flat_model),
      leaseCommenceDate,
      remainingLease: parseRemainingLease(parsed.data.remaining_lease, leaseCommenceDate),
      resalePrice,
      pricePerSqm: Number(pricePerSqm.toFixed(2)),
      pricePerSqft: Number.isFinite(pricePerSqm) ? Number((pricePerSqm / SQM_TO_SQFT).toFixed(2)) : null,
      addressKey,
    });
  }
  return transactions;
}

export function normalizePropertyRows(rows: Record<string, string>[]) {
  const output: PropertyInfo[] = [];

  const parseNumberOrNull = (val: string | undefined | null) => {
    if (!val || val.trim() === "") return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  for (const row of rows) {
    const parsed = propertyRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const block = normalizeText(parsed.data.blk_no);
    const streetName = normalizeText(parsed.data.street);
    output.push({
      addressKey: makeAddressKey("UNKNOWN", block, streetName),
      block,
      streetName,
      maxFloorLevel: parseNumberOrNull(parsed.data.max_floor_lvl),
      yearCompleted: parseNumberOrNull(parsed.data.year_completed),
      totalDwellingUnits: parseNumberOrNull(parsed.data.total_dwelling_units),
    });
  }
  return output;
}

export function rekeyPropertyInfo(propertyRows: PropertyInfo[], transactions: ResaleTransaction[]) {
  const knownAddresses = new Map<string, string>();
  for (const transaction of transactions) knownAddresses.set(`${transaction.block}__${transaction.streetName}`, transaction.addressKey);
  return propertyRows.map((row) => ({ ...row, addressKey: knownAddresses.get(`${row.block}__${row.streetName}`) ?? row.addressKey }));
}

export function normalizeMrtFeatures(geoJson: RawGeoJson): MrtExit[] {
  return geoJson.features.flatMap((feature) => {
    const result = mrtFeatureSchema.safeParse(feature);
    if (!result.success) return [];
    return {
      stationName: normalizeText(result.data.properties.STATION_NA),
      lng: result.data.geometry.coordinates[0],
      lat: result.data.geometry.coordinates[1],
    };
  });
}

export function normalizeAmenityGeoJson(
  geoJson: RawGeoJson,
): Array<{ name: string; lat: number; lng: number }> {
  return geoJson.features.flatMap((feature) => {
    const parsed = geoJsonFeatureSchema.safeParse(feature);
    if (!parsed.success) return [];
    const coords = parsed.data.geometry.coordinates;
    const props = parsed.data.properties;
    const name = (props.NAME ?? props.name ?? "Unknown") as string;
    return { name: String(name), lat: coords[1], lng: coords[0] };
  });
}

export async function normalizeSchoolRows(rows: Record<string, string>[], geocodeCache: GeocodeCacheFile, options: { skipGeocoding: boolean; geocodeEndpoint: URL }) {
  const schools: SchoolLocation[] = [];
  let primaryCount = 0;
  let skippedNoCoords = 0;
  let geocodedCount = 0;
  for (const row of rows) {
    const parsed = schoolRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const schoolName = parsed.data.school_name.trim();
    if (!schoolName) continue;
    const mainLevelCode = normalizeText(parsed.data.mainlevel_code ?? "");
    if (mainLevelCode !== "PRIMARY") continue;
    primaryCount += 1;
    const lat = parsed.data.latitude ? Number(parsed.data.latitude) : null;
    const lng = parsed.data.longitude ? Number(parsed.data.longitude) : null;
    if (lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
      schools.push({ name: schoolName, lat, lng, mainLevelCode });
      continue;
    }
    const address = parsed.data.address?.trim();
    const postalCode = parsed.data.postal_code && /^\d{6}$/.test(parsed.data.postal_code) ? parsed.data.postal_code : undefined;
    const cacheKey = `school:${normalizeText(schoolName)}${postalCode ? `:${postalCode}` : address ? `:${normalizeText(address)}` : ""}`;
    const cached = geocodeCache.entries[cacheKey];
    if (cached) {
      schools.push({ name: schoolName, lat: cached.lat, lng: cached.lng, mainLevelCode });
      continue;
    }
    if (options.skipGeocoding) {
      skippedNoCoords += 1;
      continue;
    }
    const searchValue = postalCode ? `${postalCode} SINGAPORE` : address ? `${address} SINGAPORE` : `${schoolName} SINGAPORE`;
    try {
      const geocode = await geocodeAddress(searchValue, options.geocodeEndpoint);
      if (!geocode) {
        console.warn(`School geocode returned no result for ${schoolName} (search: ${searchValue})`);
        skippedNoCoords += 1;
        continue;
      }
      geocodeCache.entries[cacheKey] = geocode;
      geocodedCount += 1;
      schools.push({ name: schoolName, lat: geocode.lat, lng: geocode.lng, mainLevelCode });
      await sleep(300);
    } catch (error) {
      console.warn(`School geocode failed for ${schoolName}: ${error instanceof Error ? error.message : "unknown error"}`);
      skippedNoCoords += 1;
    }
  }
  if (skippedNoCoords > 0) console.warn(`⚠ ${skippedNoCoords}/${primaryCount} primary schools skipped (no coordinates and ${options.skipGeocoding ? "geocoding disabled" : "geocoding failed"}). Run without --skip-geocoding to resolve.`);
  return { schools, geocodedCount };
}

export async function normalizeSupermarketRows(rows: Record<string, string>[], geocodeCache: GeocodeCacheFile, options: { skipGeocoding: boolean; geocodeEndpoint: URL }) {
  const supermarkets: Array<{ name: string; lat: number; lng: number }> = [];
  let skippedNoCoords = 0;
  let geocodedCount = 0;
  for (const row of rows) {
    const parsed = supermarketRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const name = parsed.data.licensee_name.trim();
    if (!name) continue;
    const postalCode = parsed.data.postal_code && /^\d{6}$/.test(parsed.data.postal_code) ? parsed.data.postal_code : undefined;
    const street = parsed.data.street_name?.trim();
    const block = parsed.data.block_house_num?.trim();
    const address = [block, street].filter(Boolean).join(" ");
    const cacheKey = makeSupermarketCacheKey(postalCode, address, name);
    const cached = geocodeCache.entries[cacheKey];
    if (cached) {
      supermarkets.push({ name, lat: cached.lat, lng: cached.lng });
      continue;
    }
    if (options.skipGeocoding) {
      skippedNoCoords += 1;
      continue;
    }
    const searchValue = postalCode ? `${postalCode} SINGAPORE` : address ? `${address} SINGAPORE` : `${name} SINGAPORE`;
    try {
      const geocode = await geocodeAddress(searchValue, options.geocodeEndpoint);
      if (!geocode) {
        skippedNoCoords += 1;
        continue;
      }
      geocodeCache.entries[cacheKey] = geocode;
      geocodedCount += 1;
      supermarkets.push({ name, lat: geocode.lat, lng: geocode.lng });
      await sleep(300);
    } catch {
      skippedNoCoords += 1;
    }
  }
  if (skippedNoCoords > 0) console.warn(`⚠ ${skippedNoCoords}/${rows.length} supermarkets skipped (${options.skipGeocoding ? "geocoding disabled" : "geocoding failed"}).`);
  return { supermarkets, geocodedCount };
}
