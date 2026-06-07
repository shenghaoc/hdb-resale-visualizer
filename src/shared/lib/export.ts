/**
 * CSV export helpers. All user-facing text fields are sanitized against
 * spreadsheet formula injection at the **start** of the cell value.
 *
 * Do not use the regex `m` (multiline) flag on the formula prefix pattern —
 * only the first line of a cell is evaluated by Excel/Sheets; multiline
 * sanitization would corrupt legitimate multi-line notes.
 */
const CSV_FORMULA_PREFIX = /^\s*[=+\-@\t\r|]/;

/** Prefix formula-trigger characters at the start of a cell with a single quote. */
export function sanitizeCsvCell(value: string): string {
  if (CSV_FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

/** Quote-escape a string field and apply formula sanitization. */
export function escapeCsvQuotedField(value: string): string {
  const safe = sanitizeCsvCell(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

export function formatCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value === "") {
    return "";
  }
  return escapeCsvQuotedField(value);
}

export function buildCsvContent(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const headerLine = headers.map((header) => escapeCsvQuotedField(header)).join(",");
  const dataLines = rows.map((row) => row.map((cell) => formatCsvCell(cell)).join(","));
  return `${headerLine}\n${dataLines.join("\n")}`;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export type ShortlistCsvRowInput = {
  address: string;
  medianPrice: number;
  askingPrice: number | null;
  fairRangeLow: number | null;
  fairRangeMedian: number | null;
  fairRangeHigh: number | null;
  suggestedOfferCeiling: number | null;
  buyerOpeningOffer: number | null;
  valuationReceived: number | null;
  estimatedCov: number | null;
  viewingDate: string;
  decisionStatus: string;
  buyerNotes: string;
  pros: string;
  cons: string;
  renovation: string;
  noiseNotes: string;
  transportNotes: string;
  agentRemarks: string;
  targetPrice: number | null;
  schools1km: number | string;
  hawkers1km: number | string;
  supermarkets1km: number | string;
  parks1km: number | string;
  mrtDistanceMeters: number | string;
  notes: string;
};

export function buildShortlistCsvContent(
  headers: string[],
  rows: ShortlistCsvRowInput[],
): string {
  const dataRows = rows.map((row) => [
    row.address,
    row.medianPrice,
    row.askingPrice ?? "",
    row.fairRangeLow ?? "",
    row.fairRangeMedian ?? "",
    row.fairRangeHigh ?? "",
    row.suggestedOfferCeiling ?? "",
    row.buyerOpeningOffer ?? "",
    row.valuationReceived ?? "",
    row.estimatedCov ?? "",
    row.viewingDate || "",
    row.decisionStatus || "",
    row.buyerNotes || "",
    row.pros || "",
    row.cons || "",
    row.renovation || "",
    row.noiseNotes || "",
    row.transportNotes || "",
    row.agentRemarks || "",
    row.targetPrice ?? "",
    row.schools1km,
    row.hawkers1km,
    row.supermarkets1km,
    row.parks1km,
    row.mrtDistanceMeters,
    row.notes,
  ]);
  return buildCsvContent(headers, dataRows);
}

export type ResultsCsvRowInput = {
  address: string;
  town: string;
  medianPrice: number;
  pricePerSqm: number;
  transactionCount: number;
  remainingLeaseYears: number | string;
  mrtDistanceMeters: number | string;
  flatTypes: string;
};

export function buildResultsCsvContent(
  headers: string[],
  rows: ResultsCsvRowInput[],
): string {
  const dataRows = rows.map((row) => [
    row.address,
    row.town,
    row.medianPrice,
    row.pricePerSqm,
    row.transactionCount,
    row.remainingLeaseYears,
    row.mrtDistanceMeters,
    row.flatTypes,
  ]);
  return buildCsvContent(headers, dataRows);
}
