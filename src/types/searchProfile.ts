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
  age: number | null;
  coApplicantAge: number | null;
  cpfOABalance: number | null;
  monthlyIncome: number | null;
};

export type SearchProfilePatch = Partial<SearchProfile>;
