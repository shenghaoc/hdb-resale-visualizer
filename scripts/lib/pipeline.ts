import type {
  AddressDetail,
  AddressDetailSummary,
  AddressDetailTransaction,
  BlockSummary,
  ComparisonArtifact,
  Manifest,
  TownFlatTypeTrendPoint,
} from "../../shared/data-types";
import { buildFilterOptions, canonicalFlatType } from "../../shared/filter-options";
import { parseStoreyMidpoint } from "../../shared/comparable-engine";
import { getStationDetails } from "./mrt";
import type { TransactionRow } from "./schemas";

export type ResaleTransaction = {
  id: string;
  month: string;
  town: string;
  flatType: string;
  block: string;
  streetName: string;
  storeyRange: string;
  floorAreaSqm: number;
  flatModel: string;
  leaseCommenceDate: number;
  remainingLease: string;
  resalePrice: number;
  pricePerSqm: number;
  pricePerSqft: number | null;
  addressKey: string;
};

export type PropertyInfo = {
  addressKey: string;
  block: string;
  streetName: string;
  maxFloorLevel: number | null;
  yearCompleted: number | null;
  totalDwellingUnits: number | null;
};

export type MrtExit = {
  stationName: string;
  lat: number;
  lng: number;
};

export type MrtStationFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    stationName: string;
    color: string;
    lines: string[];
    isInterchange: boolean;
  };
};

export type MrtStationFeatureCollection = {
  type: "FeatureCollection";
  features: MrtStationFeature[];
};

export type GeocodeEntry = {
  lat: number;
  lng: number;
  postalCode: string | null;
  displayName: string | null;
  searchValue: string;
};

export type GeocodeCacheFile = {
  version: 1;
  updatedAt: string;
  entries: Record<string, GeocodeEntry>;
};

export type BuildArtifactsInput = {
  transactions: ResaleTransaction[];
  propertyInfo: PropertyInfo[];
  mrtExits: MrtExit[];
  geocodes: Record<string, GeocodeEntry>;
  schools?: SchoolLocation[];
  hawkers?: AmenityLocation[];
  supermarkets?: AmenityLocation[];
  parks?: AmenityLocation[];
  /**
   * Map keyed by `${addressKey}|${stationName}` returning real walking time in
   * seconds for that block → station pair. When a pair is missing (failed API
   * call, no token configured, fixture data), the pipeline falls back to a
   * straight-line estimate so the build never blocks on routing failures.
   */
  walkingTimes?: Map<string, number>;
  metadata: Manifest["sources"];
};

export type SchoolLocation = {
  name: string;
  lat: number;
  lng: number;
  mainLevelCode: string;
};

export type AmenityLocation = {
  name: string;
  lat: number;
  lng: number;
};

export type GeneratedArtifacts = {
  manifest: Manifest;
  blockSummaries: BlockSummary[];
  blocksByTown: Record<string, BlockSummary[]>;
  details: Record<string, AddressDetail>;
  townFlatTypeTrend: TownFlatTypeTrendPoint[];
  comparisons?: Record<string, ComparisonArtifact>;
  /** Full transaction rows for the comparable engine v2 (all rows, not capped). */
  transactions?: import("./schemas").TransactionRow[];
};

type ComparisonBlockMetric = {
  addressKey: string;
  town: string;
  flatType: string;
  geocode: GeocodeEntry | null;
  medianPrice: number;
  medianPricePerSqm: number;
  leaseYear: number;
  mrtDistanceMeters: number;
  transactionCount: number;
  monthsSinceLatestTransaction: number;
};

type ComparisonMetricPopulation = {
  prices: number[];
  pricesPerSqm: number[];
  leases: number[];
  mrtDistances: number[];
  transactionCounts: number[];
  recencies: number[];
};

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function makeAddressKey(town: string, block: string, streetName: string): string {
  const source = `${normalizeText(town)}-${normalizeText(block)}-${normalizeText(streetName)}`;

  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const earthRadius = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return earthRadius * c;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function quantile(values: number[], percentile: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const base = Math.floor(position);
  const rest = position - base;

  if (sorted[base + 1] === undefined) {
    return sorted[base];
  }

  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function getModeYear(values: number[]) {
  if (values.length === 0) {
    throw new Error("getModeYear called with empty array — no transactions to derive lease year from");
  }

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let mode = values[0];
  let highestCount = 0;

  for (const [value, count] of counts.entries()) {
    if (count > highestCount || (count === highestCount && value > mode)) {
      mode = value;
      highestCount = count;
    }
  }

  return mode;
}

function countAmenitiesWithinDistance(
  amenities: AmenityLocation[],
  blockCoords: { lat: number; lng: number },
  distanceMeters: number,
): number {
  let count = 0;
  // ⚡ Bolt: Fast bounding box check to short-circuit expensive haversine calc.
  // 1 degree is roughly 110,000 meters.
  const threshold = distanceMeters / 110_000;

  for (const amenity of amenities) {
    if (
      Math.abs(amenity.lat - blockCoords.lat) > threshold ||
      Math.abs(amenity.lng - blockCoords.lng) > threshold
    ) {
      continue;
    }
    const distance = haversineDistanceMeters(blockCoords, { lat: amenity.lat, lng: amenity.lng });
    if (distance <= distanceMeters) {
      count++;
    }
  }
  return count;
}

function findNearestAmenity(
  amenities: AmenityLocation[],
  blockCoords: { lat: number; lng: number },
): number | null {
  if (amenities.length === 0) {
    return null;
  }

  let minDistance = Infinity;
  for (const amenity of amenities) {
    const threshold = minDistance / 110_000;
    if (
      Math.abs(amenity.lat - blockCoords.lat) > threshold ||
      Math.abs(amenity.lng - blockCoords.lng) > threshold
    ) {
      continue;
    }
    const distance = haversineDistanceMeters(blockCoords, { lat: amenity.lat, lng: amenity.lng });
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance === Infinity ? null : Math.round(minDistance);
}

export type NearestSchool = {
  name: string;
  distanceMeters: number;
  coordinates: { lat: number; lng: number };
};

function findNearestSchools(
  schools: SchoolLocation[],
  blockCoords: { lat: number; lng: number },
  limit = 3,
): NearestSchool[] {
  const nearest: NearestSchool[] = [];

  for (const school of schools) {
    const thresholdDist = nearest.length === limit ? nearest[nearest.length - 1].distanceMeters : Infinity;
    const threshold = thresholdDist === Infinity ? Infinity : (thresholdDist + 1) / 110_000;

    if (
      Math.abs(school.lat - blockCoords.lat) > threshold ||
      Math.abs(school.lng - blockCoords.lng) > threshold
    ) {
      continue;
    }

    const distanceMeters = Math.round(
      haversineDistanceMeters(blockCoords, { lat: school.lat, lng: school.lng }),
    );

    if (nearest.length < limit || distanceMeters <= nearest[nearest.length - 1].distanceMeters) {
      nearest.push({
        name: school.name,
        distanceMeters,
        coordinates: { lat: school.lat, lng: school.lng }
      });
      nearest.sort((left, right) => {
        if (left.distanceMeters !== right.distanceMeters) {
          return left.distanceMeters - right.distanceMeters;
        }
        return left.name.localeCompare(right.name);
      });
      if (nearest.length > limit) {
        nearest.pop();
      }
    }
  }

  return nearest;
}

/**
 * Calculates the percentile rank of a value within a pre-sorted population using binary search.
 * The population array MUST be sorted in ascending order.
 */
export function calculatePercentileSorted(value: number, values: number[]): number {
  if (values.length === 0) {
    return 50;
  }

  let left = 0;
  let right = values.length;
  while (left < right) {
    const mid = (left + right) >>> 1;
    if (values[mid] <= value) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const count = left;
  return Math.round((count / values.length) * 100);
}

function sortTransactionsByLatest(transactions: ResaleTransaction[]) {
  return [...transactions].sort(
    (left, right) =>
      right.month.localeCompare(left.month) ||
      left.flatType.localeCompare(right.flatType) ||
      left.id.localeCompare(right.id),
  );
}

function findNearestMrtDistanceMeters(
  mrtExits: MrtExit[],
  geocode: GeocodeEntry | null | undefined,
) {
  if (!geocode || mrtExits.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let minMrtDistance = Number.POSITIVE_INFINITY;
  for (const exit of mrtExits) {
    const threshold = minMrtDistance / 110_000;
    if (
      Math.abs(exit.lat - geocode.lat) > threshold ||
      Math.abs(exit.lng - geocode.lng) > threshold
    ) {
      continue;
    }
    const distance = haversineDistanceMeters(
      { lat: geocode.lat, lng: geocode.lng },
      { lat: exit.lat, lng: exit.lng },
    );
    minMrtDistance = Math.min(minMrtDistance, distance);
  }

  return minMrtDistance;
}

export type NearestStationPick = {
  stationName: string;
  distanceMeters: number;
  exitLat: number;
  exitLng: number;
};

/**
 * Returns the top-N nearest stations for a block, keyed by station name with the
 * closest exit selected. Exposed so callers can pre-route walking times against
 * the same pairs the artifact pipeline will materialise.
 */
export function pickNearestStations(
  geocode: { lat: number; lng: number },
  mrtExits: MrtExit[],
  limit = 3,
): NearestStationPick[] {
  const closestExitByStation = new Map<
    string,
    { distance: number; exitLat: number; exitLng: number }
  >();

  for (const exit of mrtExits) {
    const distance = haversineDistanceMeters(geocode, { lat: exit.lat, lng: exit.lng });
    const current = closestExitByStation.get(exit.stationName);
    if (current === undefined || distance < current.distance) {
      closestExitByStation.set(exit.stationName, {
        distance,
        exitLat: exit.lat,
        exitLng: exit.lng,
      });
    }
  }

  return [...closestExitByStation.entries()]
    .sort(([nameL, left], [nameR, right]) =>
      left.distance - right.distance || nameL.localeCompare(nameR),
    )
    .slice(0, limit)
    .map(([stationName, info]) => ({
      stationName,
      distanceMeters: Math.round(info.distance),
      exitLat: info.exitLat,
      exitLng: info.exitLng,
    }));
}

// Conservative pedestrian pace: distance / 1.25 m/s ≈ 75 m/min. Slightly slower
// than the 80 m/min commute-proxy elsewhere in the codebase to account for
// crossings, stairs, and detours that straight-line distance can't see.
const FALLBACK_WALKING_PACE_M_PER_S = 1.25;

export function estimateWalkingTimeSeconds(distanceMeters: number): number {
  return Math.round(distanceMeters / FALLBACK_WALKING_PACE_M_PER_S);
}

export function walkingTimeLookupKey(addressKey: string, stationName: string): string {
  return `${addressKey}|${stationName}`;
}

function resolveWalkingTimeSeconds(
  addressKey: string,
  stationName: string,
  distanceMeters: number,
  lookup: Map<string, number> | undefined,
): number {
  const cached = lookup?.get(walkingTimeLookupKey(addressKey, stationName));
  if (cached !== undefined) {
    return cached;
  }
  return estimateWalkingTimeSeconds(distanceMeters);
}

function resolveLeaseCommenceYear(leaseYears: number[]) {
  // For HDB, all units in a block share the same 99-year lease that starts
  // when the land is acquired from the state — use the lease_commence_date
  // from transaction records (the authoritative source), not yearCompleted.
  return getModeYear(leaseYears);
}

export function parseRemainingLease(value: string | undefined, leaseCommenceDate: number) {
  if (value && value.trim().length > 0) {
    return value.trim();
  }

  const currentYear = Temporal.Now.plainDateISO().year;
  const remaining = Math.max(0, 99 - (currentYear - leaseCommenceDate));
  return `${remaining} years`;
}

function sanitizeDisplayName(
  displayName: string | null,
  block: string,
  streetName: string,
): string | null {
  if (!displayName) {
    return null;
  }

  const normalizedDisplayName = normalizeText(displayName);
  if (normalizedDisplayName === "NIL") {
    return null;
  }

  const normalizedAddress = normalizeText(`${block} ${streetName}`);
  const normalizedDisplayNameWithoutBlockPrefix = normalizedDisplayName.replace(
    /^(BLK|BLOCK)\s+/,
    "",
  );

  if (
    normalizedDisplayName === normalizedAddress ||
    normalizedDisplayNameWithoutBlockPrefix === normalizedAddress
  ) {
    return null;
  }

  return normalizedDisplayName;
}

export function buildMrtStationsGeoJson(mrtExits: MrtExit[]): MrtStationFeatureCollection {
  const stations = new Map<
    string,
    {
      latSum: number;
      lngSum: number;
      count: number;
    }
  >();

  for (const exit of mrtExits) {
    const station = stations.get(exit.stationName) ?? {
      latSum: 0,
      lngSum: 0,
      count: 0,
    };
    station.latSum += exit.lat;
    station.lngSum += exit.lng;
    station.count += 1;
    stations.set(exit.stationName, station);
  }

  return {
    type: "FeatureCollection",
    features: [...stations.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stationName, station]) => {
        const details = getStationDetails(stationName);
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [station.lngSum / station.count, station.latSum / station.count],
          },
          properties: {
            stationName,
            color: details.color,
            lines: details.lines,
            isInterchange: details.isInterchange,
          },
        };
      }),
  };
}

export function buildArtifacts({
  transactions,
  propertyInfo,
  mrtExits,
  geocodes,
  schools,
  hawkers,
  supermarkets,
  parks,
  walkingTimes,
  metadata,
}: BuildArtifactsInput): GeneratedArtifacts {
  const runTimestamp = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
  const grouped = new Map<string, ResaleTransaction[]>();
  const allMonths = new Set<string>();
  const propertyByAddress = new Map(propertyInfo.map((row) => [row.addressKey, row]));

  for (const transaction of transactions) {
    allMonths.add(transaction.month);
    const list = grouped.get(transaction.addressKey) ?? [];
    list.push(transaction);
    grouped.set(transaction.addressKey, list);
  }

  const sortedMonths = [...allMonths].sort();
  const maxMonth = sortedMonths[sortedMonths.length - 1];
  const maxMonthYM = Temporal.PlainYearMonth.from(maxMonth);
  const recentThreshold = sortedMonths[Math.max(0, sortedMonths.length - 24)] ?? maxMonth;
  const blockSummaries: BlockSummary[] = [];
  const details: Record<string, AddressDetail> = {};
  const townFlatTypeGroups = new Map<string, ResaleTransaction[]>();

  for (const transaction of transactions) {
    const key = `${transaction.town}__${transaction.flatType}__${transaction.month}`;
    const list = townFlatTypeGroups.get(key) ?? [];
    list.push(transaction);
    townFlatTypeGroups.set(key, list);
  }

  // Collect full transaction rows for the comparable engine v2 (all rows,
  // not capped). storeyMidpoint is pre-computed here so the API doesn't
  // need to parse storeyRange strings at query time.
  const allTransactions: TransactionRow[] = [];

  for (const [addressKey, blockTransactions] of grouped.entries()) {
    const sortedTransactions = sortTransactionsByLatest(blockTransactions);

    // Map ALL sorted transactions (before the 20-row cap) to D1 rows.
    // storey_midpoint and price_per_sqm are derived at read time in the API.
    for (const tx of sortedTransactions) {
      if (parseStoreyMidpoint(tx.storeyRange) == null) continue; // skip unparseable storey ranges
      allTransactions.push({
        month: tx.month,
        town: tx.town,
        block: tx.block,
        street_name: tx.streetName,
        address_key: tx.addressKey,
        flat_type: tx.flatType,
        storey_range: tx.storeyRange,
        floor_area_sqm: tx.floorAreaSqm,
        lease_commence_year: tx.leaseCommenceDate || null,
        resale_price: tx.resalePrice,
        flat_model: tx.flatModel,
      });
    }

    const summaryWindow = sortedTransactions.filter(
      (transaction) => transaction.month >= recentThreshold,
    );
    const sourceWindow = summaryWindow.length > 0 ? summaryWindow : sortedTransactions;
    const latest = sortedTransactions[0];
    const geocode = geocodes[addressKey];

    if (!latest || !geocode) {
      continue;
    }

    const priceValues = sourceWindow.map((transaction) => transaction.resalePrice);
    const pricePerSqmValues = sourceWindow.map((transaction) => transaction.pricePerSqm);
    const pricePerSqftValues = sourceWindow
      .map((transaction) => transaction.pricePerSqft)
      .filter((value): value is number => value !== null);

    // Math.min/Math.max spread can exhaust the call stack on large arrays; single-pass avoids the intermediate allocation too.
    let minFloorArea = Infinity;
    let maxFloorArea = -Infinity;
    for (const transaction of sortedTransactions) {
      const area = transaction.floorAreaSqm;
      if (area < minFloorArea) { minFloorArea = area; }
      if (area > maxFloorArea) { maxFloorArea = area; }
    }

    const leaseYears = sortedTransactions.map((transaction) => transaction.leaseCommenceDate);

    const nearbyStationPicks = pickNearestStations(
      { lat: geocode.lat, lng: geocode.lng },
      mrtExits,
      3,
    );
    const nearbyMrts = nearbyStationPicks.map((pick) => ({
      stationName: pick.stationName,
      distanceMeters: pick.distanceMeters,
      walkingTimeSeconds: resolveWalkingTimeSeconds(
        addressKey,
        pick.stationName,
        pick.distanceMeters,
        walkingTimes,
      ),
    }));
    const nearestMrt: BlockSummary["nearestMrt"] = nearbyMrts[0] ?? null;
    const property = propertyByAddress.get(addressKey);
    const leaseCommenceYear = resolveLeaseCommenceYear(leaseYears);
    const pricePerSqmMedian = Number(median(pricePerSqmValues).toFixed(2));
    // Compute per-flat-type median prices and PPSM for accurate budget filtering and heatmap
    const medianPriceByFlatType: Record<string, number> = {};
    const medianPricePerSqmByFlatType: Record<string, number> = {};
    const transactionsByFlatType = new Map<string, { prices: number[]; ppsmValues: number[] }>();
    for (const transaction of sourceWindow) {
      const ft = transactionsByFlatType.get(transaction.flatType) ?? { prices: [], ppsmValues: [] };
      ft.prices.push(transaction.resalePrice);
      ft.ppsmValues.push(transaction.pricePerSqm);
      transactionsByFlatType.set(transaction.flatType, ft);
    }
    for (const [flatType, { prices: ftPrices, ppsmValues: ftPpsm }] of transactionsByFlatType.entries()) {
      const key = canonicalFlatType(flatType);
      medianPriceByFlatType[key] = Math.round(median(ftPrices));
      medianPricePerSqmByFlatType[key] = Number(median(ftPpsm).toFixed(2));
    }

    const summary: BlockSummary = {
      addressKey,
      town: latest.town,
      block: latest.block,
      streetName: latest.streetName,
      displayName: sanitizeDisplayName(geocode.displayName, latest.block, latest.streetName),
      coordinates: { lat: geocode.lat, lng: geocode.lng },
      medianPrice: Math.round(median(priceValues)),
      pricePerSqmMedian,
      transactionCount: sourceWindow.length,
      floorAreaRange: [minFloorArea, maxFloorArea],
      leaseCommenceRange: [leaseCommenceYear, leaseCommenceYear],
      latestMonth: latest.month,
      availableDateRange: [
        sortedTransactions[sortedTransactions.length - 1].month,
        sortedTransactions[0].month,
      ],
      flatTypes: [...new Set(sortedTransactions.map((transaction) => transaction.flatType))].sort(),
      flatModels: [...new Set(sortedTransactions.map((transaction) => transaction.flatModel))].sort(),
      medianPriceByFlatType,
      medianPricePerSqmByFlatType,
      nearestMrt,
      nearbyMrts,
      postalCode: geocode.postalCode ?? null,
    };
    const detailSummary: AddressDetailSummary = {
      ...summary,
      priceIqr: [Math.round(quantile(priceValues, 0.25)), Math.round(quantile(priceValues, 0.75))],
      pricePerSqftMedian:
        pricePerSqftValues.length > 0 ? Number(median(pricePerSqftValues).toFixed(2)) : null,
    };

    const trendByMonth = new Map<string, ResaleTransaction[]>();
    for (const transaction of sortedTransactions) {
      const monthGroup = trendByMonth.get(transaction.month) ?? [];
      monthGroup.push(transaction);
      trendByMonth.set(transaction.month, monthGroup);
    }

    const monthlyTrend = [...trendByMonth.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, monthTransactions]) => ({
        month,
        medianPrice: Math.round(median(monthTransactions.map((transaction) => transaction.resalePrice))),
        transactionCount: monthTransactions.length,
        medianPricePerSqm: Number(
          median(monthTransactions.map((transaction) => transaction.pricePerSqm)).toFixed(2),
        ),
      }));

    const recentTransactions: AddressDetailTransaction[] = sortedTransactions
      .slice(0, 20)
      .map((transaction) => ({
        id: transaction.id,
        month: transaction.month,
        flatType: transaction.flatType,
        storeyRange: transaction.storeyRange,
        floorAreaSqm: transaction.floorAreaSqm,
        flatModel: transaction.flatModel,
        leaseCommenceDate: transaction.leaseCommenceDate,
        remainingLease: transaction.remainingLease,
        resalePrice: transaction.resalePrice,
        pricePerSqm: transaction.pricePerSqm,
        pricePerSqft: transaction.pricePerSqft,
      }));

    details[addressKey] = {
      summary: {
        ...detailSummary,
        flatModels: property?.maxFloorLevel
          ? [...detailSummary.flatModels, `MAX FLOOR ${property.maxFloorLevel}`]
          : detailSummary.flatModels,
      },
      monthlyTrend,
      recentTransactions,
    };

    blockSummaries.push(summary);
  }

  const townFlatTypeTrend: TownFlatTypeTrendPoint[] = [...townFlatTypeGroups.entries()]
    .map(([groupKey, groupTransactions]) => {
      const [town, flatType, month] = groupKey.split("__");
      return {
        town,
        flatType,
        month,
        medianPrice: Math.round(median(groupTransactions.map((transaction) => transaction.resalePrice))),
        medianPricePerSqm: Number(
          median(groupTransactions.map((transaction) => transaction.pricePerSqm)).toFixed(2),
        ),
        transactionCount: groupTransactions.length,
      };
    })
    .sort((left, right) => {
      if (left.town !== right.town) {
        return left.town.localeCompare(right.town);
      }

      if (left.flatType !== right.flatType) {
        return left.flatType.localeCompare(right.flatType);
      }

      return left.month.localeCompare(right.month);
    });

  blockSummaries.sort((left, right) => {
    if (right.medianPrice !== left.medianPrice) {
      return right.medianPrice - left.medianPrice;
    }

    return right.transactionCount - left.transactionCount;
  });

  const blocksByTown: Record<string, BlockSummary[]> = {};
  for (const block of blockSummaries) {
    if (!blocksByTown[block.town]) {
      blocksByTown[block.town] = [];
    }
    blocksByTown[block.town].push(block);
  }

  const filterOptions = buildFilterOptions(blockSummaries);

  // Generate comparison artifacts if amenity data is available
  const comparisons: Record<string, ComparisonArtifact> = {};
  const schoolsData: SchoolLocation[] = schools ?? [];
  const hawkersData: AmenityLocation[] = hawkers ?? [];
  const supermarketsData: AmenityLocation[] = supermarkets ?? [];
  const parksData: AmenityLocation[] = parks ?? [];
  const hasAmenityData =
    schoolsData.length > 0 ||
    hawkersData.length > 0 ||
    supermarketsData.length > 0 ||
    parksData.length > 0;

  if (hasAmenityData) {
    const blockMetrics: ComparisonBlockMetric[] = [];

    for (const [addressKey, blockTransactions] of grouped.entries()) {
      const sortedTransactions = sortTransactionsByLatest(blockTransactions);
      const cohort = sortedTransactions[0];
      if (!cohort) {
        continue;
      }

      const cohortTransactions = sortedTransactions.filter(
        (transaction) => transaction.town === cohort.town && transaction.flatType === cohort.flatType,
      );
      const summaryWindow = cohortTransactions.filter(
        (transaction) => transaction.month >= recentThreshold,
      );
      const sourceWindow = summaryWindow.length > 0 ? summaryWindow : cohortTransactions;
      const geocode = geocodes[addressKey];

      blockMetrics.push({
        addressKey,
        town: cohort.town,
        flatType: cohort.flatType,
        geocode: geocode ?? null,
        medianPrice: median(sourceWindow.map((transaction) => transaction.resalePrice)),
        medianPricePerSqm: median(sourceWindow.map((transaction) => transaction.pricePerSqm)),
        leaseYear: resolveLeaseCommenceYear(
          cohortTransactions.map((transaction) => transaction.leaseCommenceDate)
        ),
        mrtDistanceMeters: findNearestMrtDistanceMeters(mrtExits, geocode),
        transactionCount: sourceWindow.length,
        monthsSinceLatestTransaction: Math.max(
          0,
          Temporal.PlainYearMonth.from(cohort.month).until(
            maxMonthYM,
            { largestUnit: "months" },
          ).months,
        ),
      });
    }

    const townFlatTypeMetrics = new Map<string, ComparisonMetricPopulation>();

    for (const metric of blockMetrics) {
      const key = `${metric.town}__${metric.flatType}`;
      const population = townFlatTypeMetrics.get(key) ?? {
        prices: [],
        pricesPerSqm: [],
        leases: [],
        mrtDistances: [],
        transactionCounts: [],
        recencies: [],
      };

      population.prices.push(metric.medianPrice);
      population.pricesPerSqm.push(metric.medianPricePerSqm);
      population.leases.push(metric.leaseYear);
      population.mrtDistances.push(metric.mrtDistanceMeters);
      population.transactionCounts.push(metric.transactionCount);
      population.recencies.push(metric.monthsSinceLatestTransaction);

      townFlatTypeMetrics.set(key, population);
    }

    for (const population of townFlatTypeMetrics.values()) {
      population.prices.sort((a, b) => a - b);
      population.pricesPerSqm.sort((a, b) => a - b);
      population.leases.sort((a, b) => a - b);
      population.mrtDistances.sort((a, b) => a - b);
      population.transactionCounts.sort((a, b) => a - b);
      population.recencies.sort((a, b) => a - b);
    }

    for (const metric of blockMetrics) {
      const geocode = metric.geocode;
      if (!geocode) {
        continue;
      }

      const key = `${metric.town}__${metric.flatType}`;
      const metrics = townFlatTypeMetrics.get(key);
      if (!metrics) {
        continue;
      }

      const amenities = {
        primarySchoolsWithin1km: countAmenitiesWithinDistance(schoolsData, geocode, 1000),
        primarySchoolsWithin2km: countAmenitiesWithinDistance(schoolsData, geocode, 2000),
        nearestPrimarySchoolMeters: findNearestAmenity(schoolsData, geocode),
        nearestPrimarySchools: findNearestSchools(schoolsData, geocode),
        hawkerCentresWithin1km: countAmenitiesWithinDistance(hawkersData, geocode, 1000),
        nearestHawkerCentreMeters: findNearestAmenity(hawkersData, geocode),
        supermarketsWithin1km: countAmenitiesWithinDistance(supermarketsData, geocode, 1000),
        nearestSupermarketMeters: findNearestAmenity(supermarketsData, geocode),
        parksWithin1km: countAmenitiesWithinDistance(parksData, geocode, 1000),
        nearestParkMeters: findNearestAmenity(parksData, geocode),
      };

      const percentileRanks = {
        pricePercentile: calculatePercentileSorted(metric.medianPrice, metrics.prices),
        pricePerSqmPercentile: calculatePercentileSorted(metric.medianPricePerSqm, metrics.pricesPerSqm),
        leasePercentile: calculatePercentileSorted(metric.leaseYear, metrics.leases),
        mrtDistancePercentile: 100 - calculatePercentileSorted(metric.mrtDistanceMeters, metrics.mrtDistances),
        transactionCountPercentile: calculatePercentileSorted(metric.transactionCount, metrics.transactionCounts),
        recencyPercentile: 100 - calculatePercentileSorted(
          metric.monthsSinceLatestTransaction,
          metrics.recencies,
        ),
      };

      comparisons[metric.addressKey] = {
        addressKey: metric.addressKey,
        town: metric.town,
        flatType: metric.flatType,
        amenities,
        percentileRanks,
        generatedAt: runTimestamp,
      };
    }
  }

  const manifest: Manifest = {
    schemaVersion: "2.0.0",
    generatedAt: runTimestamp,
    dataWindow: {
      minMonth: sortedMonths[0],
      maxMonth,
    },
    sources: metadata,
    filterOptions,
    counts: {
      blocks: blockSummaries.length,
      transactions: transactions.length,
      towns: filterOptions.towns.length,
      mrtStations: new Set(mrtExits.map((exit) => exit.stationName)).size,
      comparisons: Object.keys(comparisons).length,
    },
  };

  return {
    manifest,
    blockSummaries,
    blocksByTown,
    details,
    townFlatTypeTrend,
    comparisons: Object.keys(comparisons).length > 0 ? comparisons : undefined,
    transactions: allTransactions.length > 0 ? allTransactions : undefined,
  };
}
