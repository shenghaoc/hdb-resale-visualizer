export type Coordinates = {
  lat: number;
  lng: number;
};

export type NearestMrt = {
  stationName: string;
  distanceMeters: number;
  walkingTimeSeconds: number;
};

export type BlockSummary = {
  addressKey: string;
  town: string;
  block: string;
  streetName: string;
  displayName?: string | null;
  coordinates: Coordinates;
  medianPrice: number;
  pricePerSqmMedian: number;
  transactionCount: number;
  floorAreaRange: [number, number];
  leaseCommenceRange: [number, number];
  latestMonth: string;
  availableDateRange: [string, string];
  flatTypes: string[];
  flatModels: string[];
  medianPriceByFlatType?: Record<string, number>;
  medianPricePerSqmByFlatType?: Record<string, number>;
  nearestMrt: NearestMrt | null;
  nearbyMrts?: NearestMrt[];
  postalCode?: string | null;
};

export type AddressDetailSummary = BlockSummary & {
  priceIqr: [number, number];
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
  medianPricePerSqm: number;
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

export type AffordabilityMode = "" | "comfortable" | "stretch";

export type BlockSortMode =
  | ""
  | "median-asc"
  | "median-desc"
  | "lease-desc"
  | "mrt-asc"
  | "latest-desc"
  | "affordability";

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
  compareTown: string;
  affordable: AffordabilityMode;
  sort: BlockSortMode;
};

export type ShortlistItem = {
  addressKey: string;
  notes: string;
  askingPrice?: number;
  fairRangeLow?: number;
  fairRangeMedian?: number;
  fairRangeHigh?: number;
  suggestedOfferCeiling?: number;
  buyerOpeningOffer?: number;
  valuationReceived?: number;
  estimatedCov?: number;
  viewingDate?: string;
  decisionStatus?:
    | "considering"
    | "viewing booked"
    | "offered"
    | "rejected"
    | "kiv"
    | "dropped";
  pros?: string;
  cons?: string;
  renovation?: string;
  noise?: string;
  transport?: string;
  offerCeiling?: number;
  noiseNotes?: string;
  transportNotes?: string;
  buyerNotes?: string;
  agentRemarks?: string;
  targetPrice: number | null;
  addedAt: string;
};

export type NearbySchool = {
  name: string;
  distanceMeters: number;
  coordinates?: Coordinates;
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

export type SuggestionGroup = "town" | "street" | "block" | "mrt" | "postal";

export type TownSuggestion = {
  group: "town";
  label: string;
  town: string;
};

export type StreetSuggestion = {
  group: "street";
  label: string;
  search: string;
};

export type BlockSuggestion = {
  group: "block";
  label: string;
  addressKey: string;
};

export type MrtSuggestion = {
  group: "mrt";
  label: string;
  stationName: string;
};

export type PostalSuggestion = {
  group: "postal";
  label: string;
  search: string;
};

export type Suggestion =
  | TownSuggestion
  | StreetSuggestion
  | BlockSuggestion
  | MrtSuggestion
  | PostalSuggestion;

export type SuggestResponse = {
  suggestions: Suggestion[];
};

/** Normalized transaction row matching the `transactions` D1 table.
 *  Populated by sync-data, consumed by the comparable engine API. */
export type TransactionRow = {
  id: string;
  month: string;
  town: string;
  block: string;
  streetName: string;
  addressKey: string;
  flatType: string;
  storeyRange: string;
  storeyMidpoint: number;
  floorAreaSqm: number;
  leaseCommenceDate: number | null;
  resalePrice: number;
  pricePerSqm: number;
  flatModel: string;
};

/** Structured label for a time-adjusted comparable. Resolved to a translated
 *  string on the client so both en-SG and zh-SG users see their language. */
export type AdjustmentLabel =
  | { type: "at_latest" }
  | { type: "adjusted_from"; month: string };

/** Extended comparable with time adjustment fields.
 *  Populated by the comparable-transactions API when ?adjust=time is used. */
export type TimeAdjustedComparable = {
  /** Original resale price (always present). */
  rawResalePrice: number;
  /** Original price per sqm (always present). */
  rawPricePerSqm: number;
  /** Time-adjusted resale price, or null if adjustment unavailable. */
  adjustedResalePrice: number | null;
  /** Time-adjusted price per sqm, or null if adjustment unavailable. */
  adjustedPricePerSqm: number | null;
  /** The computed adjustment factor, or null. */
  adjustmentFactor: number | null;
  /** Structured label for translation, or null if adjustment unavailable. */
  adjustmentLabel: AdjustmentLabel | null;
};
