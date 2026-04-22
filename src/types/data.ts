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
  priceIqr: [number, number];
  pricePerSqmMedian: number;
  pricePerSqftMedian: number | null;
  transactionCount: number;
  floorAreaRange: [number, number];
  leaseCommenceRange: [number, number];
  latestMonth: string;
  availableDateRange: [string, string];
  flatTypes: string[];
  flatModels: string[];
  nearestMrt: NearestMrt | null;
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
  summary: BlockSummary;
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
    lastUpdatedAt: string;
  };
  counts: {
    blocks: number;
    transactions: number;
    towns: number;
    mrtStations: number;
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
