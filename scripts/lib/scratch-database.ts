/**
 * Scratch PostgreSQL databases for the local verification scripts (the nearby-places rehearsal, the PostGIS benchmark).
 *
 * Those scripts run against a developer's own cluster, which may hold databases they care about. So a script never
 * uses a fixed database name and never drops a database it did not create itself in the same run:
 *
 *   - every database is named `<prefix>_<run id>`, with a fresh random run id per run;
 *   - `create` refuses (ScratchDatabaseExistsError) when that name is already taken, and registers a name only after
 *     CREATE DATABASE has returned success, so a pre-existing database can never reach the drop list;
 *   - `drop` and `dropAll` act only on registered names, with a plain DROP DATABASE: no FORCE, no
 *     pg_terminate_backend. They wait for the run's own sessions to disconnect and, if those never do, leave the
 *     database in place and say which one, so nobody else's session is ever cut.
 */
import { randomBytes } from "node:crypto";

/** Runs one SQL statement through psql against `database` and returns its trimmed output; throws when psql fails. */
export type RunSql = (database: string, sql: string) => string;

/** PostgreSQL's NAMEDATALEN - 1: longer identifiers are silently truncated, which would break the name bookkeeping. */
const MAX_IDENTIFIER_BYTES = 63;
const PREFIX_PATTERN = /^[a-z][a-z0-9_]*$/;
const RUN_ID_PATTERN = /^[a-z0-9]{6,16}$/;

export class ScratchDatabaseExistsError extends Error {
  readonly database: string;

  constructor(database: string) {
    super(
      `refusing to use database "${database}": it already exists and this run did not create it`,
    );
    this.name = "ScratchDatabaseExistsError";
    this.database = database;
  }
}

/** A fresh, unguessable run id: 12 lowercase hex characters. */
export function newRunId(): string {
  return randomBytes(6).toString("hex");
}

export function assertRunId(runId: string): string {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`run id must match ${RUN_ID_PATTERN} (6-16 lowercase letters and digits)`);
  }
  return runId;
}

export function scratchDatabaseName(prefix: string, runId: string): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`database prefix must match ${PREFIX_PATTERN}`);
  }
  const name = `${prefix}_${assertRunId(runId)}`;
  if (name.length > MAX_IDENTIFIER_BYTES) {
    throw new Error(`database name "${name}" is longer than ${MAX_IDENTIFIER_BYTES} bytes`);
  }
  return name;
}

export type DropOutcome = {
  dropped: string[];
  /** Databases that were created by this run but could not be dropped, with the reason. */
  left: { database: string; reason: string }[];
};

export type ScratchDatabases = {
  readonly runId: string;
  /** Creates `<prefix>_<run id>`, or throws ScratchDatabaseExistsError if that name is already taken. */
  create(prefix: string): string;
  /** Databases this run created and has not dropped yet. */
  created(): readonly string[];
  /** Drops one database this run created; returns why it was left in place, or null once it is gone. */
  drop(database: string): string | null;
  /** Drops every database this run created, newest first. Never throws on a database it cannot drop. */
  dropAll(): DropOutcome;
};

export type ScratchOptions = {
  runId?: string;
  /** How long `drop` waits for the run's own sessions to disconnect before it leaves the database alone. */
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => void;
  now?: () => number;
};

/** The lines a script should print after `dropAll`, and whether every database it created is gone. */
export function describeCleanup(outcome: DropOutcome): { lines: string[]; complete: boolean } {
  const lines = outcome.dropped.map((database) => `dropped database ${database}`);
  for (const { database, reason } of outcome.left) {
    lines.push(
      `LEFT IN PLACE: database ${database} (${reason}). Once nothing is connected to it: psql -d postgres -c 'DROP DATABASE "${database}"'`,
    );
  }
  return { lines, complete: outcome.left.length === 0 };
}

/** Runs `cleanup` on Ctrl-C or SIGTERM, then exits with the conventional 128 + signal number. */
export function cleanupOnSignals(cleanup: () => void): void {
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    process.once(signal, () => {
      cleanup();
      process.exit(code);
    });
  }
}

const pauseSync = (ms: number) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const messageOf = (error: unknown) => {
  const text =
    error instanceof Error
      ? String((error as { stderr?: unknown }).stderr || error.message)
      : String(error);
  return text.trim().split("\n").at(-1) ?? text;
};

export function createScratchDatabases(
  run: RunSql,
  options: ScratchOptions = {},
): ScratchDatabases {
  const runId = assertRunId(options.runId ?? newRunId());
  const waitMs = options.waitMs ?? 20_000;
  const pollMs = options.pollMs ?? 250;
  const sleep = options.sleep ?? pauseSync;
  const now = options.now ?? Date.now;
  const created: string[] = [];

  const sessionsOn = (database: string) =>
    Number(
      run(
        "postgres",
        `SELECT count(*) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid()`,
      ),
    );

  function drop(database: string): string | null {
    if (!created.includes(database)) {
      throw new Error(`refusing to drop "${database}": this run did not create it`);
    }
    try {
      const deadline = now() + waitMs;
      let sessions = sessionsOn(database);
      while (sessions > 0 && now() < deadline) {
        sleep(pollMs);
        sessions = sessionsOn(database);
      }
      if (sessions > 0) {
        return `${sessions} session(s) are still connected; they are not this script's to cut`;
      }
      run("postgres", `DROP DATABASE "${database}"`);
    } catch (error) {
      return messageOf(error);
    }
    created.splice(created.indexOf(database), 1);
    return null;
  }

  return {
    runId,
    create(prefix) {
      const database = scratchDatabaseName(prefix, runId);
      const taken = run("postgres", `SELECT 1 FROM pg_database WHERE datname = '${database}'`);
      if (taken.trim() === "1") throw new ScratchDatabaseExistsError(database);
      // Plain CREATE DATABASE: it also fails if another session creates the same name between the check and here.
      run("postgres", `CREATE DATABASE "${database}"`);
      created.push(database);
      return database;
    },
    created: () => [...created],
    drop,
    dropAll() {
      const outcome: DropOutcome = { dropped: [], left: [] };
      for (const database of [...created].reverse()) {
        const reason = drop(database);
        if (reason === null) outcome.dropped.push(database);
        else outcome.left.push({ database, reason });
      }
      return outcome;
    },
  };
}
