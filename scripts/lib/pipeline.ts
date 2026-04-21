import type { AddressDetail, AddressDetailTransaction, BlockSummary, Manifest, TownFlatTypeTrendPoint } from "@/types/data";
import { getStationDetails } from "./mrt";

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
  metadata: Manifest["sources"];
};

export type GeneratedArtifacts = {
  manifest: Manifest;
  blockSummaries: BlockSummary[];
  details: Record<string, AddressDetail>;
  townFlatTypeTrend: TownFlatTypeTrendPoint[];
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
    return new Date().getFullYear();
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

function resolveLeaseCommenceYear(leaseYears: number[], yearCompleted: number | null | undefined) {
  if (
    typeof yearCompleted === "number" &&
    Number.isFinite(yearCompleted) &&
    yearCompleted >= 1900 &&
    yearCompleted <= new Date().getFullYear()
  ) {
    return yearCompleted;
  }

  return getModeYear(leaseYears);
}

export function parseRemainingLease(value: string | undefined, leaseCommenceDate: number) {
  if (value && value.trim().length > 0) {
    return value.trim();
  }

  const currentYear = new Date().getFullYear();
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
  metadata,
}: BuildArtifactsInput): GeneratedArtifacts {
  const grouped = new Map<string, ResaleTransaction[]>();
  const allMonths = new Set<string>();
  const towns = new Set<string>();
  const propertyByAddress = new Map(propertyInfo.map((row) => [row.addressKey, row]));

  for (const transaction of transactions) {
    allMonths.add(transaction.month);
    towns.add(transaction.town);
    const list = grouped.get(transaction.addressKey) ?? [];
    list.push(transaction);
    grouped.set(transaction.addressKey, list);
  }

  const sortedMonths = [...allMonths].sort();
  const maxMonth = sortedMonths[sortedMonths.length - 1];
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

  for (const [addressKey, blockTransactions] of grouped.entries()) {
    const sortedTransactions = [...blockTransactions].sort((left, right) =>
      right.month.localeCompare(left.month),
    );
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
    const floorAreas = sortedTransactions.map((transaction) => transaction.floorAreaSqm);
    const leaseYears = sortedTransactions.map((transaction) => transaction.leaseCommenceDate);

    const nearestStations = new Map<string, number>();
    for (const exit of mrtExits) {
      const distance = haversineDistanceMeters(
        { lat: geocode.lat, lng: geocode.lng },
        { lat: exit.lat, lng: exit.lng },
      );
      const currentDistance = nearestStations.get(exit.stationName);
      if (currentDistance === undefined || distance < currentDistance) {
        nearestStations.set(exit.stationName, distance);
      }
    }
    const nearbyMrts = [...nearestStations.entries()]
      .sort((left, right) => left[1] - right[1])
      .slice(0, 3)
      .map(([stationName, distanceMeters]) => ({ stationName, distanceMeters: Math.round(distanceMeters) }));
    const nearestMrt: BlockSummary["nearestMrt"] = nearbyMrts[0] ?? null;
    const property = propertyByAddress.get(addressKey);
    const leaseCommenceYear = resolveLeaseCommenceYear(leaseYears, property?.yearCompleted);
    const summary: BlockSummary = {
      addressKey,
      town: latest.town,
      block: latest.block,
      streetName: latest.streetName,
      displayName: sanitizeDisplayName(geocode.displayName, latest.block, latest.streetName),
      coordinates: { lat: geocode.lat, lng: geocode.lng },
      medianPrice: Math.round(median(priceValues)),
      priceIqr: [Math.round(quantile(priceValues, 0.25)), Math.round(quantile(priceValues, 0.75))],
      pricePerSqmMedian: Number(median(pricePerSqmValues).toFixed(2)),
      pricePerSqftMedian:
        pricePerSqftValues.length > 0 ? Number(median(pricePerSqftValues).toFixed(2)) : null,
      transactionCount: sourceWindow.length,
      floorAreaRange: [Math.min(...floorAreas), Math.max(...floorAreas)],
      leaseCommenceRange: [leaseCommenceYear, leaseCommenceYear],
      latestMonth: latest.month,
      availableDateRange: [
        sortedTransactions[sortedTransactions.length - 1].month,
        sortedTransactions[0].month,
      ],
      flatTypes: [...new Set(sortedTransactions.map((transaction) => transaction.flatType))].sort(),
      flatModels: [...new Set(sortedTransactions.map((transaction) => transaction.flatModel))].sort(),
      nearestMrt,
      nearbyMrts,
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
        ...summary,
        flatModels: property?.maxFloorLevel
          ? [...summary.flatModels, `MAX FLOOR ${property.maxFloorLevel}`]
          : summary.flatModels,
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

  const manifest: Manifest = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    dataWindow: {
      minMonth: sortedMonths[0],
      maxMonth,
    },
    sources: metadata,
    counts: {
      blocks: blockSummaries.length,
      transactions: transactions.length,
      towns: towns.size,
      mrtStations: new Set(mrtExits.map((exit) => exit.stationName)).size,
    },
  };

  return {
    manifest,
    blockSummaries,
    details,
    townFlatTypeTrend,
  };
}
