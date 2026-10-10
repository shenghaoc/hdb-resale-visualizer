/**
 * Disposable PostgreSQL 18 integration verification for the Neon nearby daily budget.
 *
 * Works on an empty, throwaway database supplied by CI (or an explicitly disposable
 * local PostgreSQL database). It changes roles and tables. NEVER point this at Neon
 * serving, benchmark or an existing personal database. No output/artifact upload.
 *
 * Required: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, HDB_TEST_ROLE_PASSWORD.
 * CI uses an isolated postgres:18 service with a synthetic test-only password.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

if (process.env.HDB_DISPOSABLE_POSTGRES_TEST !== "yes") {
  throw new Error(
    "Explicit HDB_DISPOSABLE_POSTGRES_TEST=yes required; disposable test database only",
  );
}
const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, HDB_TEST_ROLE_PASSWORD } = process.env;
if (!PGHOST || !PGPORT || !PGDATABASE || !PGUSER || !PGPASSWORD || !HDB_TEST_ROLE_PASSWORD) {
  throw new Error("Missing disposable PostgreSQL integration environment");
}
if (!["127.0.0.1", "localhost", "::1"].includes(PGHOST)) {
  throw new Error("Only loopback PostgreSQL is permitted by this verification script");
}
const adminConfig = {
  host: PGHOST,
  port: Number(PGPORT),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
};
if (!Number.isInteger(adminConfig.port) || adminConfig.port <= 0) {
  throw new Error("Invalid PostgreSQL test port");
}
const admin = new pg.Client(adminConfig);
const roleConfig = (user) => ({
  ...adminConfig,
  user,
  password: HDB_TEST_ROLE_PASSWORD,
});

function assert(value, message) {
  if (!value) throw new Error(message);
}
async function expectDenied(run, message) {
  let denied = false;
  try {
    await run();
  } catch (error) {
    denied = true;
    assert(error && typeof error.code === "string", message + ": PostgreSQL error code missing");
  }
  assert(denied, message + ": operation unexpectedly succeeded");
}
async function expectGrant(client, expected) {
  const { rows } = await client.query(
    "SELECT public.reserve_nearby_statement($1::integer) AS granted",
    [7],
  );
  assert(rows.length === 1 && rows[0].granted === expected, "Budget grant mismatch");
}

await admin.connect();
let budget;
let reader;
try {
  // The service starts with an empty database and has no existing application roles.
  const db = await admin.query("SELECT current_database() AS name, current_user AS user_name");
  assert(db.rows[0].name === PGDATABASE && db.rows[0].user_name === PGUSER, "Wrong test database");

  await admin.query(
    `CREATE ROLE hdb_nearby_budget LOGIN PASSWORD '${HDB_TEST_ROLE_PASSWORD.replaceAll("'", "''")}'`,
  );
  await admin.query(
    `CREATE ROLE hdb_nearby_reader LOGIN PASSWORD '${HDB_TEST_ROLE_PASSWORD.replaceAll("'", "''")}'`,
  );
  await admin.query(
    "GRANT CONNECT ON DATABASE " +
      '"' +
      PGDATABASE.replaceAll('"', '""') +
      '"' +
      " TO hdb_nearby_budget, hdb_nearby_reader",
  );
  await admin.query("ALTER ROLE hdb_nearby_reader SET default_transaction_read_only = on");

  const migration = readFileSync(
    join(process.cwd(), "sql/neon/002_nearby_daily_budget.sql"),
    "utf8",
  );
  await admin.query(migration);

  // This verification is self-rolling-back; no state leaks into the concurrent test.
  const standalone = readFileSync(
    join(process.cwd(), "sql/neon/verify_nearby_daily_budget.sql"),
    "utf8",
  );
  await admin.query(standalone);
  const start = await admin.query("SELECT count(*)::integer AS n FROM public.nearby_daily_budget");
  assert(start.rows[0].n === 0, "Rollback-only verifier mutated quota data");

  budget = new pg.Client(roleConfig("hdb_nearby_budget"));
  reader = new pg.Client(roleConfig("hdb_nearby_reader"));
  await Promise.all([budget.connect(), reader.connect()]);
  const config = await budget.query("SHOW default_transaction_read_only");
  assert(
    config.rows[0].default_transaction_read_only === "off",
    "Quota-only role must be writable",
  );
  const ro = await reader.query("SHOW default_transaction_read_only");
  assert(
    ro.rows[0].default_transaction_read_only === "on",
    "Reader role must remain transaction-read-only",
  );

  await expectDenied(
    () => budget.query("SELECT used FROM public.nearby_daily_budget"),
    "Budget role read of protected table",
  );
  await expectDenied(
    () => budget.query("UPDATE public.nearby_daily_budget SET used = used + 1"),
    "Budget role direct update",
  );
  await expectDenied(
    () => reader.query("SELECT public.reserve_nearby_statement(7)"),
    "Read-only role must not execute function",
  );
  await budget.query("BEGIN READ ONLY");
  await expectDenied(
    () => budget.query("SELECT public.reserve_nearby_statement(7)"),
    "Function cannot override read-only transaction",
  );
  await budget.query("ROLLBACK");

  await expectGrant(budget, true);
  await expectGrant(budget, true);
  const current = await admin.query("SELECT used FROM public.nearby_daily_budget");
  assert(current.rows.length === 1 && current.rows[0].used === 2, "Sequential count mismatch");

  await admin.query("TRUNCATE TABLE public.nearby_daily_budget");
  const contenders = Array.from(
    { length: 12 },
    () => new pg.Client(roleConfig("hdb_nearby_budget")),
  );
  try {
    await Promise.all(contenders.map((client) => client.connect()));
    const admissions = await Promise.all(
      contenders.map((client) =>
        client
          .query("SELECT public.reserve_nearby_statement(7) AS granted")
          .then((r) => r.rows[0]?.granted),
      ),
    );
    assert(
      admissions.filter((allowed) => allowed === true).length === 7,
      "Concurrent budget oversubscription",
    );
    assert(
      admissions.filter((allowed) => allowed === false).length === 5,
      "Concurrent refusals inconsistent",
    );
    const after = await admin.query("SELECT used FROM public.nearby_daily_budget");
    assert(after.rows[0].used === 7, "Concurrent counter final value incorrect");
  } finally {
    await Promise.allSettled(contenders.map((client) => client.end()));
  }
  await expectDenied(
    () => budget.query("SELECT public.reserve_nearby_statement(10001)"),
    "Hard 10,000 maximum ceiling",
  );
  console.log(
    "Neon budget verified: rollback, permissions, read-only refusal, serial and 12-way atomic contention",
  );
} finally {
  await Promise.allSettled([budget?.end(), reader?.end(), admin.end()]);
}
