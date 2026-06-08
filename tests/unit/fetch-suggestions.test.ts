import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSuggestions, resetSuggestCacheForTests } from "@/shared/lib/data";

describe("fetchSuggestions", () => {
  beforeEach(() => {
    resetSuggestCacheForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              suggestions: [{ group: "town", label: "Bedok", town: "BEDOK" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );
  });

  afterEach(() => {
    resetSuggestCacheForTests();
    vi.unstubAllGlobals();
  });

  it("returns empty array for short queries without fetching", async () => {
    const fetchMock = vi.mocked(fetch);
    await expect(fetchSuggestions("a")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses cached promises for the same normalised query", async () => {
    const fetchMock = vi.mocked(fetch);
    await fetchSuggestions("Bedok");
    await fetchSuggestions("bedok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
