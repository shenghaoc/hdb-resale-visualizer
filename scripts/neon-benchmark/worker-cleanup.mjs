// Delete only the user-approved temporary resources; preserve the Neon branch and evidence.
import { readFileSync } from "node:fs";
import os from "node:os";
import { SCRATCH, save } from "./common.mjs";
const resource = JSON.parse(readFileSync(`${SCRATCH}/worker-resource.json`, "utf8"));
if (
  resource.name !== "hdb-neon-benchmark-20261004" ||
  !/^[a-f0-9]{32}$/.test(resource.hyperdriveId) ||
  resource.role !== "hdb_benchmark_runtime" ||
  resource.branch !== "br-wispy-boat-b34glczl" ||
  resource.account !== "059214b3bd95f4adf743d960c23936dc"
)
  throw new Error("Exact temporary resource identity guard");
const auth = readFileSync(
  `${os.homedir()}/Library/Preferences/.wrangler/config/default.toml`,
  "utf8",
);
const token = JSON.parse(auth.match(/^oauth_token\s*=\s*(".*")/m)?.[1] ?? "null");
if (!token) throw new Error("Existing Wrangler authentication missing");
const inspected = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${resource.account}/hyperdrive/configs/${resource.hyperdriveId}`,
  { headers: { authorization: `Bearer ${token}` } },
);
let config = await inspected.json();
let hyperdriveAbsent = false;
if (inspected.status === 404) {
  const listed = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${resource.account}/hyperdrive/configs`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const found = await listed.json();
  if (!listed.ok || !found.success || !Array.isArray(found.result))
    throw new Error("Cannot verify temporary Hyperdrive absence; nothing deleted");
  const matches = found.result.filter((item) => item.name === resource.name);
  if (matches.length > 1)
    throw new Error("Ambiguous temporary Hyperdrive identity; nothing deleted");
  if (matches.length === 0) hyperdriveAbsent = true;
  else {
    config = { success: true, result: matches[0] };
    resource.hyperdriveId = matches[0].id;
  }
}
if (
  !hyperdriveAbsent &&
  (!config.success ||
    config.result.name !== resource.name ||
    !/^[a-f0-9]{32}$/.test(config.result.id) ||
    config.result.origin.host !== "ep-steep-moon-b35xjj4d.c-4.ap-southeast-1.aws.neon.tech" ||
    config.result.origin.user !== "hdb_benchmark_runtime" ||
    config.result.caching.disabled !== true)
)
  throw new Error("Temporary Hyperdrive identity/role/caching guard failed; nothing deleted");
const results = [];
for (const [name, path] of [
  ["worker", `workers/scripts/${resource.name}`],
  ["hyperdrive", `hyperdrive/configs/${resource.hyperdriveId}`],
]) {
  if (name === "hyperdrive" && hyperdriveAbsent) {
    results.push({ resource: name, status: 404, success: true, alreadyAbsent: true });
    continue;
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${resource.account}/${path}`,
    { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
  );
  const body = await response.json();
  const result = {
    resource: name,
    status: response.status,
    success: body.success === true || response.status === 404,
    alreadyAbsent: response.status === 404,
    errors: body.errors,
  };
  results.push(result);
  save("cleanup", {
    at: new Date().toISOString(),
    results,
    preservedBranch: "br-wispy-boat-b34glczl",
  });
  console.log(JSON.stringify(result));
  if ((!response.ok || !body.success) && response.status !== 404)
    throw new Error(`Temporary ${name} deletion failed; no further deletions`);
}
save("cleanup", {
  at: new Date().toISOString(),
  results,
  preservedBranch: "br-wispy-boat-b34glczl",
});
