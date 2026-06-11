import { describe, expect, it } from "vite-plus/test";
import {
  resolveOneMapSearchEndpoint,
  validateGeneratedArtifacts,
} from "../../scripts/lib/syncGuards";

describe("sync guards", () => {
  it("falls back to the default OneMap endpoint when the env var is blank", () => {
    expect(resolveOneMapSearchEndpoint("").toString()).toBe(
      "https://www.onemap.gov.sg/api/common/elastic/search",
    );
  });

  it("falls back to the default OneMap endpoint when the env var is whitespace", () => {
    expect(resolveOneMapSearchEndpoint("   ").toString()).toBe(
      "https://www.onemap.gov.sg/api/common/elastic/search",
    );
  });

  it("throws a clear error for malformed non-empty endpoints", () => {
    expect(() => resolveOneMapSearchEndpoint("not-a-url")).toThrow(
      /Invalid ONEMAP_SEARCH_ENDPOINT/,
    );
  });

  it("throws when sync produces zero block and detail artifacts", () => {
    expect(() =>
      validateGeneratedArtifacts({
        blockSummariesCount: 0,
        detailCount: 0,
        geocodeFailureCount: 42,
      }),
    ).toThrow(/Geocoding reported 42 failed address lookups/);
  });

  it("allows non-empty generated artifacts", () => {
    expect(() =>
      validateGeneratedArtifacts({
        blockSummariesCount: 1,
        detailCount: 1,
        geocodeFailureCount: 0,
      }),
    ).not.toThrow();
  });
});
