import { createNeonReadDb } from "./neon-read-db";
import type { PublicReadQuery } from "./neon-public-read-sql";

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

/** Capture one backend for every public read; private shortlist storage stays on original DB. */
export function createPublicReadScope(
  env: Env,
  factory: (binding: Hyperdrive) => PublicReadTransport,
) {
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
  const publicEnv: Env = {
    ...env,
    PUBLIC_DATA_BACKEND: backend,
    PUBLIC_DATA_CACHE_NAMESPACE: `${backend}-${epoch}`,
    DB: transport ? (createNeonReadDb(transport.query) as unknown as D1Database) : env.DB,
  };
  return {
    backend,
    publicEnv,
    namespace: publicEnv.PUBLIC_DATA_CACHE_NAMESPACE!,
    comparableSnapshot: <T>(respond: () => Promise<T>) =>
      transport ? transport.snapshot(respond) : respond(),
    close: async () => transport?.close(),
  };
}
