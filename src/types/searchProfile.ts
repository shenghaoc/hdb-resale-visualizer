export type SearchProfile = {
  version: 1;
  mainFlatType: string;
  alternativeFlatTypes: string[];
  maxBudget: number | null;
  commuteAnchorLabel: string;
  commuteAnchorMrt: string | null;
  maxComfortableCommuteMinutes: number | null;
  commuteStretchMinutes: number;
  minimumRemainingLeaseYears: number | null;
  budgetStretchPercent: number;
  showStretchOptions: boolean;
  showAllBlocks: boolean;
};

export type SearchProfilePatch = Partial<SearchProfile>;
