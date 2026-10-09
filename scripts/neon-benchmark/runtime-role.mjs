// Branch-local least privilege. Administrator is used only for this isolated role/grant setup.
import crypto from "node:crypto";
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { connect, benchmarkUrl, SCRATCH } from "./common.mjs";
import os from "node:os";
const role = "hdb_benchmark_runtime";
const password = crypto.randomBytes(32).toString("base64url");
const { client } = await connect();
try {
  if ((await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount)
    throw new Error("Existing benchmark runtime role must be preserved");
  await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${pg.escapeLiteral(password)}`);
  await client.query(
    `GRANT CONNECT ON DATABASE ${pg.escapeIdentifier(new URL(benchmarkUrl()).pathname.slice(1))} TO ${role}`,
  );
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await client.query(
    `GRANT SELECT ON transactions,blocks,block_details,comparisons,town_flat_type_trends,manifest,mrt_geojson TO ${role}`,
  );
  const url = new URL(benchmarkUrl());
  url.username = role;
  url.password = password;
  writeFileSync(`${SCRATCH}/runtime-connection.txt`, url.toString(), { mode: 0o600 });
  const secrets = JSON.parse(readFileSync(`${SCRATCH}/worker-secrets.json`, "utf8"));
  secrets.DATABASE_URL = url.toString();
  writeFileSync(`${SCRATCH}/worker-secrets.json`, JSON.stringify(secrets), { mode: 0o600 });
  writeFileSync(
    `${SCRATCH}/worker-local.env`,
    `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=${url.toString()}\n`,
    { mode: 0o600 },
  );
  const resource = JSON.parse(readFileSync(`${SCRATCH}/worker-resource.json`, "utf8"));
  const auth = readFileSync(
    `${os.homedir()}/Library/Preferences/.wrangler/config/default.toml`,
    "utf8",
  );
  const token = JSON.parse(auth.match(/^oauth_token\s*=\s*(".*")/m)?.[1] ?? "null");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${resource.account}/hyperdrive/configs/${resource.hyperdriveId}`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        origin: {
          scheme: "postgresql",
          host: url.hostname,
          port: 5432,
          database: url.pathname.slice(1),
          user: role,
          password,
        },
        caching: { disabled: true },
      }),
    },
  );
  const body = await response.json();
  if (!response.ok || !body.success)
    throw new Error(`Temporary Hyperdrive runtime role update failed: HTTP ${response.status}`);
  console.log(
    JSON.stringify({
      branch: "br-wispy-boat-b34glczl",
      role,
      publicTables: "SELECT only",
      shortlists: "No privileges; no production user records copied",
      hyperdriveCachingDisabled: true,
      localEnvIgnored: true,
    }),
  );
} finally {
  await client.end();
}
