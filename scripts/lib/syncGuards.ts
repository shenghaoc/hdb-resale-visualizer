const DEFAULT_ONEMAP_SEARCH_ENDPOINT = "https://www.onemap.gov.sg/api/common/elastic/search";

export function resolveOneMapSearchEndpoint(rawValue = process.env.ONEMAP_SEARCH_ENDPOINT): URL {
  const normalizedValue = rawValue?.trim();
  const endpoint = normalizedValue ? normalizedValue : DEFAULT_ONEMAP_SEARCH_ENDPOINT;

  try {
    return new URL(endpoint);
  } catch {
    throw new Error(
      `Invalid ONEMAP_SEARCH_ENDPOINT: expected an absolute URL but received ${JSON.stringify(rawValue ?? "")}.`,
    );
  }
}

export function validateGeneratedArtifacts(options: {
  blockSummariesCount: number;
  detailCount: number;
  geocodeFailureCount: number;
}) {
  const { blockSummariesCount, detailCount, geocodeFailureCount } = options;
  if (blockSummariesCount > 0 && detailCount > 0) {
    return;
  }

  const reasons = [
    blockSummariesCount === 0 ? "block summaries" : null,
    detailCount === 0 ? "detail artifacts" : null,
  ].filter((value): value is string => value !== null);

  const geocodeHint =
    geocodeFailureCount > 0
      ? ` Geocoding reported ${geocodeFailureCount} failed address lookups.`
      : "";

  throw new Error(
    `Data sync produced no usable ${reasons.join(" and ")}. This usually means geocoding failed or upstream source data changed unexpectedly.${geocodeHint}`,
  );
}
