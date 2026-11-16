/**
 * The published block list, for refusing an unknown block before any nearby statement is sent.
 *
 * The list is the address keys of the current publication. It is read through the shared public-data cache under
 * an internal path that no route serves, so it is stored once per Cloudflare location and publication like any
 * other public answer, and each isolate keeps the parsed set for a minute. A request for a block that is not
 * published therefore costs no database statement beyond that occasional refresh, however many keys are tried.
 */
import { jsonResponse } from "../functions/_lib/d1";
import type { PublicData } from "../functions/_lib/public-data";
import { withPublicDataCache } from "./public-data-cache";

/** Internal cache path; `PUBLIC_PATH` in `public-data-cache.ts` admits it and `api-route-match.ts` does not route it. */
export const BLOCK_INDEX_PATH = "/api/block-index";
const MEMO_TTL_MS = 60_000;

type SharedCache = Parameters<typeof withPublicDataCache>[2];
type Memo = { namespace: string; keys: Set<string>; loadedAt: number };
let memo: Memo | null = null;
let loading: { namespace: string; promise: Promise<Set<string>> } | null = null;

export function resetNearbyBlockIndexForTests(): void {
  memo = null;
  loading = null;
}

/** Seeds the per-isolate list, so a test about something else does not also exercise loading it. */
export function primeNearbyBlockIndexForTests(namespace: string, keys: string[], now = Date.now()) {
  memo = { namespace, keys: new Set(keys), loadedAt: now };
}

async function loadKeys(
  origin: string,
  data: Pick<PublicData, "manifestJson" | "blockIndex">,
  cache: SharedCache,
): Promise<Set<string>> {
  const response = await withPublicDataCache(
    new Request(`${origin}${BLOCK_INDEX_PATH}`),
    data,
    cache,
    async () => jsonResponse((await data.blockIndex()).map((row) => row.address_key)),
  );
  if (!response.ok) throw new Error(`Block index answered ${response.status}`);
  const keys: unknown = await response.json();
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string"))
    throw new Error("Block index not understood");
  return new Set(keys as string[]);
}

/**
 * Whether `addressKey` is a block of the current publication. Throws when the list cannot be read; the caller
 * refuses the request then, because an unverified block must not reach the database.
 */
export async function isPublishedBlock(
  addressKey: string,
  source: {
    origin: string;
    namespace: string;
    data: Pick<PublicData, "manifestJson" | "blockIndex">;
    cache: SharedCache;
  },
  now: number = Date.now(),
): Promise<boolean> {
  if (memo && memo.namespace === source.namespace && now - memo.loadedAt < MEMO_TTL_MS)
    return memo.keys.has(addressKey);
  // Concurrent requests in one isolate share a single load.
  if (!loading || loading.namespace !== source.namespace) {
    const promise = loadKeys(source.origin, source.data, source.cache);
    const mine = { namespace: source.namespace, promise };
    loading = mine;
    void promise
      .then((keys) => {
        memo = { namespace: source.namespace, keys, loadedAt: now };
      })
      .catch(() => {})
      .finally(() => {
        if (loading === mine) loading = null;
      });
  }
  return (await loading.promise).has(addressKey);
}
