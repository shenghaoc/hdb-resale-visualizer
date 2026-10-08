import type { PublicData } from "../functions/_lib/public-data";
import { createD1PublicData } from "./public-data-d1";
import { createNeonPublicData, type PublicReadQuery } from "./public-data-neon";

export type PublicReadTransport = {
  query: PublicReadQuery;
  snapshot: <T>(respond: () => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};
export type PublicDataCache = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};

export function namespacePublicCache(cache: PublicDataCache | null, namespace: string) {
  if (!cache) return null;
  const key = (request: Request) => {
    const url = new URL(request.url);
    url.pathname = `/__public-backend/${encodeURIComponent(namespace)}${url.pathname}`;
    return new Request(url, request);
  };
  return {
    match: (request: Request) => cache.match(key(request)),
    put: (request: Request, response: Response) => cache.put(key(request), response),
  };
}

/** One request's public reads, all from the backend it captured at entry. */
export type PublicReadScope = {
  backend: "d1" | "neon";
  /** `<backend>-<epoch>`: every cache entry built from these reads is kept under it. */
  namespace: string;
  data: PublicData;
  /** Runs `respond` on one consistent snapshot (Neon: a read-only repeatable-read transaction). */
  comparableSnapshot: <T>(respond: () => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

/** Capture one backend for every public read; private shortlist storage stays on the D1 binding. */
export function createPublicReadScope(
  env: Env,
  factory: (binding: Hyperdrive) => PublicReadTransport,
): PublicReadScope {
  const backend = env.PUBLIC_DATA_BACKEND ?? "d1";
  if (backend !== "d1" && backend !== "neon") throw new Error("Invalid public read backend");
  const epoch =
    backend === "neon"
      ? (env.NEON_PUBLIC_CACHE_EPOCH ?? "neon-candidate-v1")
      : (env.D1_PUBLIC_CACHE_EPOCH ?? "d1-cutover-v1");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(epoch)) throw new Error("Invalid public cache epoch");
  let transport: PublicReadTransport | undefined;
  if (backend === "neon") {
    if (!env.HDB_PUBLIC_NEON) throw new Error("Missing Neon public read binding");
    transport = factory(env.HDB_PUBLIC_NEON);
  }
  return {
    backend,
    namespace: `${backend}-${epoch}`,
    data: transport ? createNeonPublicData(transport.query) : createD1PublicData(env.DB),
    comparableSnapshot: <T>(respond: () => Promise<T>) =>
      transport ? transport.snapshot(respond) : respond(),
    close: async () => transport?.close(),
  };
}
