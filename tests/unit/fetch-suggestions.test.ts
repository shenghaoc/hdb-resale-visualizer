import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
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

  it("rejects an aborted caller without cancelling the shared in-flight fetch", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const aborted = fetchSuggestions("Bedok", controller.signal);
    const kept = fetchSuggestions("Bedok");
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });

    resolveFetch!(
      new Response(
        JSON.stringify({
          suggestions: [{ group: "town", label: "Bedok", town: "BEDOK" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(kept).resolves.toEqual([{ group: "town", label: "Bedok", town: "BEDOK" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest suggest cache entry after 32 distinct queries", async () => {
    const fetchMock = vi.mocked(fetch);
    for (let i = 0; i < 32; i += 1) {
      await fetchSuggestions(`q${String(i).padStart(2, "0")}`);
    }
    expect(fetchMock).toHaveBeenCalledTimes(32);

    await fetchSuggestions("q31");
    expect(fetchMock).toHaveBeenCalledTimes(32);

    await fetchSuggestions("q32");
    expect(fetchMock).toHaveBeenCalledTimes(33);

    await fetchSuggestions("q00");
    expect(fetchMock).toHaveBeenCalledTimes(34);
  });
});
