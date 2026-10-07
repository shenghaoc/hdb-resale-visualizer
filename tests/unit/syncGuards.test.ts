import { describe, expect, it } from "vite-plus/test";
import {
  resolveOneMapRoutingEndpoint,
  resolveOneMapSearchEndpoint,
  resolveOneMapTokenEndpoint,
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
    expect(() => resolveOneMapRoutingEndpoint("not-a-url")).toThrow(
      /Invalid ONEMAP_ROUTING_ENDPOINT/,
    );
    expect(() => resolveOneMapTokenEndpoint("/relative")).toThrow(/Invalid ONEMAP_TOKEN_ENDPOINT/);
  });

  it("trims a configured endpoint before parsing it", () => {
    expect(resolveOneMapRoutingEndpoint("  https://example.test/route  ").toString()).toBe(
      "https://example.test/route",
    );
    expect(resolveOneMapTokenEndpoint(" https://example.test/token ").toString()).toBe(
      "https://example.test/token",
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

  it("names only the missing artifact side", () => {
    expect(() =>
      validateGeneratedArtifacts({
        blockSummariesCount: 3,
        detailCount: 0,
        geocodeFailureCount: 0,
      }),
    ).toThrow(/no usable detail artifacts/);

    expect(() =>
      validateGeneratedArtifacts({
        blockSummariesCount: 0,
        detailCount: 2,
        geocodeFailureCount: 0,
      }),
    ).toThrow(/no usable block summaries(?!.*detail artifacts)/);
  });

  it("omits the geocode hint when no lookups failed", () => {
    expect(() =>
      validateGeneratedArtifacts({
        blockSummariesCount: 0,
        detailCount: 0,
        geocodeFailureCount: 0,
      }),
    ).toThrow(/unexpectedly\.$/);
  });
});
