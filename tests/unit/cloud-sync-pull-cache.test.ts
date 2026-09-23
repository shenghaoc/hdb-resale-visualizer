import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { pullShortlist } from "@/features/shortlist/cloudSync";

type CacheEntry = { url: string };

function installCaches(entries: CacheEntry[]) {
  const store = new Map(entries.map((entry) => [entry.url, entry]));
  const cache = {
    keys: vi.fn(async () => [...store.values()].map((entry) => new Request(entry.url))),
    delete: vi.fn(async (request: Request) => store.delete(request.url)),
  };
  const cachesApi = {
    keys: vi.fn(async () => ["hdb-api-get-v1"]),
    open: vi.fn(async () => cache),
  };
  vi.stubGlobal("caches", cachesApi);
  return { cache, store };
}

describe("pullShortlist cache bypass", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deletes cached shortlist GETs before fetching with no-store", async () => {
    const { store } = installCaches([
      { url: "https://example.test/api/shortlist/code-1" },
      { url: "https://example.test/api/search?town=TAMPINES" },
    ]);
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await pullShortlist("code-1");

    expect(store.has("https://example.test/api/shortlist/code-1")).toBe(false);
    expect(store.has("https://example.test/api/search?town=TAMPINES")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shortlist/code-1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
