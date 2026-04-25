export type Coordinates = {
  lat: number;
  lng: number;
};

export type NearestMrt = {
  stationName: string;
  distanceMeters: number;
};

export type BlockSummary = {
  addressKey: string;
  town: string;
  block: string;
  streetName: string;
  displayName?: string | null;
  coordinates: Coordinates;
  medianPrice: number;
  transactionCount: number;
  floorAreaRange: [number, number];
  leaseCommenceRange: [number, number];
  latestMonth: string;
  availableDateRange: [string, string];
  flatTypes: string[];
  flatModels: string[];
  nearestMrt: NearestMrt | null;
  nearbyMrts?: NearestMrt[];
};

export type AddressDetailSummary = BlockSummary & {
  priceIqr: [number, number];
  pricePerSqmMedian: number;
  pricePerSqftMedian: number | null;
};

export type AddressDetailTransaction = {
  id: string;
  month: string;
  flatType: string;
  storeyRange: string;
  floorAreaSqm: number;
  flatModel: string;
  leaseCommenceDate: number;
  remainingLease: string;
  resalePrice: number;
  pricePerSqm: number;
  pricePerSqft: number | null;
};

export type AddressTrendPoint = {
  month: string;
  medianPrice: number;
  transactionCount: number;
  medianPricePerSqm: number;
};

export type AddressDetail = {
  summary: AddressDetailSummary;
  recentTransactions: AddressDetailTransaction[];
  monthlyTrend: AddressTrendPoint[];
};

export type TownFlatTypeTrendPoint = {
  town: string;
  flatType: string;
  month: string;
  medianPrice: number;
  transactionCount: number;
};

export type FilterOptions = {
  towns: string[];
  flatTypes: string[];
  flatModels: string[];
};

export type Manifest = {
  schemaVersion: string;
  generatedAt: string;
  dataWindow: {
    minMonth: string;
    maxMonth: string;
  };
  sources: {
    resaleCollectionId: string;
    resaleDatasetIds: string[];
    propertyDatasetId: string;
    mrtDatasetId: string;
    moeSchoolDatasetId?: string;
    neaHawkerDatasetId?: string;
    sfaSupermarketDatasetId?: string;
    nparksParksDatasetId?: string;
    lastUpdatedAt: string;
  };
  filterOptions: FilterOptions;
  counts: {
    blocks: number;
    transactions: number;
    towns: number;
    mrtStations: number;
    comparisons?: number;
  };
};

export type FilterState = {
  search: string;
  town: string;
  flatType: string;
  flatModel: string;
  budgetMin: number | null;
  budgetMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  remainingLeaseMin: number | null;
  startMonth: string | null;
  endMonth: string | null;
  mrtMax: number | null;
  selectedAddressKey: string | null;
};

export type ShortlistItem = {
  addressKey: string;
  notes: string;
  targetPrice: number | null;
  addedAt: string;
};

export type NearbySchool = {
  name: string;
  distanceMeters: number;
};

export type AmenityComparison = {
  primarySchoolsWithin1km: number;
  primarySchoolsWithin2km: number;
  nearestPrimarySchoolMeters: number | null;
  nearestPrimarySchools: NearbySchool[];
  hawkerCentresWithin1km: number;
  nearestHawkerCentreMeters: number | null;
  supermarketsWithin1km: number;
  nearestSupermarketMeters: number | null;
  parksWithin1km: number;
  nearestParkMeters: number | null;
};

export type PercentileRanks = {
  pricePercentile: number;
  pricePerSqmPercentile: number;
  leasePercentile: number;
  mrtDistancePercentile: number;
  transactionCountPercentile: number;
  recencyPercentile: number;
};

export type ComparisonArtifact = {
  addressKey: string;
  town: string;
  flatType: string;
  amenities: AmenityComparison;
  percentileRanks: PercentileRanks;
  generatedAt: string;
};
