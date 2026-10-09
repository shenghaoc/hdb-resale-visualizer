// Creates only named temporary resources; secrets are read/written privately and never logged.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { SCRATCH, save, ENDPOINT, BRANCH } from "./common.mjs";
const account = "059214b3bd95f4adf743d960c23936dc";
const name = "hdb-neon-benchmark-20261004";
const authPath = [
  `${os.homedir()}/.wrangler/config/default.toml`,
  `${os.homedir()}/Library/Preferences/.wrangler/config/default.toml`,
].find(existsSync);
const token = JSON.parse(
  readFileSync(authPath, "utf8").match(/^oauth_token\s*=\s*(".*")/m)?.[1] ?? "null",
);
if (!token) throw new Error("Existing Wrangler authentication missing");
if (!process.argv.includes("--recreate-readonly-benchmark"))
  throw new Error("Explicit authorized isolated read-only recreation required");
const runtimeUrl = readFileSync(`${SCRATCH}/runtime-connection.txt`, "utf8").trim();
const url = new URL(runtimeUrl);
if (
  url.username !== "hdb_benchmark_runtime" ||
  url.hostname !== `${ENDPOINT}.c-4.ap-southeast-1.aws.neon.tech` ||
  url.pathname !== "/neondb" ||
  !url.password
)
  throw new Error("Only the existing SELECT-only isolated benchmark role is authorized");
for (const path of [`workers/scripts/${name}`, "hyperdrive/configs"]) {
  const existing = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (path.startsWith("workers/") && existing.status === 404) continue;
  const found = await existing.json();
  if (!existing.ok || !found.success)
    throw new Error("Cannot establish absence of existing temporary resources");
  if (path.startsWith("workers/") || found.result.some((config) => config.name === name))
    throw new Error("Preserve existing remote resource; temporary name already exists");
}
save("worker-setup-attempt", {
  name,
  account,
  branch: BRANCH,
  absenceConfirmedAt: new Date().toISOString(),
});
if (existsSync(`${SCRATCH}/worker-resource.json`))
  writeFileSync(
    `${SCRATCH}/worker-resource-prior.json`,
    readFileSync(`${SCRATCH}/worker-resource.json`),
  );
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/hyperdrive/configs`,
  {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name,
      origin: {
        scheme: "postgresql",
        host: url.hostname,
        port: 5432,
        database: url.pathname.slice(1),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      },
      caching: { disabled: true },
      origin_connection_limit: 5,
      mtls: { sslmode: "require" },
    }),
  },
);
const body = await response.json();
if (!response.ok || !body.success) {
  console.log(JSON.stringify({ status: response.status, errors: body.errors }));
  throw new Error("Temporary Hyperdrive creation failed");
}
const id = body.result.id;
save("worker-resource", {
  name,
  account,
  hyperdriveId: id,
  createdAt: new Date().toISOString(),
  cachingDisabled: true,
  role: "hdb_benchmark_runtime",
  branch: BRANCH,
});
writeFileSync(
  `${SCRATCH}/wrangler.jsonc`,
  JSON.stringify(
    {
      name,
      account_id: account,
      main: "../scripts/neon-benchmark/worker.mts",
      compatibility_date: "2026-10-04",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: true,
      hyperdrive: [{ binding: "HYPERDRIVE", id }],
      observability: { enabled: false },
    },
    null,
    2,
  ),
);
writeFileSync(
  `${SCRATCH}/worker-secrets.json`,
  JSON.stringify({
    DATABASE_URL: runtimeUrl,
    BENCHMARK_TOKEN: crypto.randomBytes(32).toString("hex"),
  }),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({ name, hyperdriveId: id, cachingDisabled: true, secretsWrittenPrivately: true }),
);
