import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  ScratchDatabaseExistsError,
  createScratchDatabases,
  describeCleanup,
  newRunId,
  scratchDatabaseName,
  type RunSql,
} from "../../scripts/lib/scratch-database";

/**
 * A stand-in for psql against one cluster. It understands exactly the four statements the helper is allowed to issue and
 * throws on anything else, so a FORCE drop or a pg_terminate_backend call would fail the test.
 */
function fakeCluster(existing: string[] = [], lingeringSessions: Record<string, number> = {}) {
  const databases = new Set(existing);
  const sessions = { ...lingeringSessions };
  const statements: string[] = [];
  const run: RunSql = (_database, sql) => {
    statements.push(sql);
    let match: RegExpExecArray | null;
    if ((match = /^SELECT 1 FROM pg_database WHERE datname = '([a-z0-9_]+)'$/.exec(sql))) {
      return databases.has(match[1]) ? "1\n" : "";
    }
    if ((match = /^CREATE DATABASE "([a-z0-9_]+)"$/.exec(sql))) {
      if (databases.has(match[1])) throw new Error(`database "${match[1]}" already exists`);
      databases.add(match[1]);
      return "";
    }
    if (
      (match =
        /^SELECT count\(\*\) FROM pg_stat_activity WHERE datname = '([a-z0-9_]+)' AND pid <> pg_backend_pid\(\)$/.exec(
          sql,
        ))
    ) {
      const count = sessions[match[1]] ?? 0;
      return `${count}\n`;
    }
    if ((match = /^DROP DATABASE "([a-z0-9_]+)"$/.exec(sql))) {
      if (!databases.has(match[1])) throw new Error(`database "${match[1]}" does not exist`);
      if ((sessions[match[1]] ?? 0) > 0) throw new Error("being accessed by other users");
      databases.delete(match[1]);
      return "";
    }
    throw new Error(`unexpected statement: ${sql}`);
  };
  return { run, databases, statements, sessions };
}

/** A clock the test advances by sleeping, so waiting costs no real time. `onSleep` sees the new time after each nap. */
function fakeClock(onSleep: (time: number) => void = () => {}) {
  let time = 0;
  return {
    now: () => time,
    sleep: (ms: number) => {
      time += ms;
      onSleep(time);
    },
  };
}

describe("scratch database names", () => {
  it("carry the prefix and a run id, and differ between runs", () => {
    const first = newRunId();
    const second = newRunId();
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
    expect(scratchDatabaseName("hdb_bench_10000", first)).toBe(`hdb_bench_10000_${first}`);
  });

  it("refuse anything that is not a plain lowercase identifier, or is too long for PostgreSQL", () => {
    for (const prefix of ["Hdb", "hdb-bench", 'hdb"x', "hdb x", "", "1hdb", "hdb;drop"]) {
      expect(() => scratchDatabaseName(prefix, "abcdef123456"), prefix).toThrow("prefix");
    }
    for (const runId of ["", "ABCDEF123456", "abc", "abc def 123", "a".repeat(17), "ab'cdef"]) {
      expect(() => scratchDatabaseName("hdb", runId), runId).toThrow("run id");
    }
    expect(() => scratchDatabaseName("h".repeat(60), "abcdef123456")).toThrow("longer than 63");
  });
});

describe("createScratchDatabases", () => {
  it("creates `<prefix>_<run id>` with a plain CREATE DATABASE and remembers it", () => {
    const cluster = fakeCluster(["postgres"]);
    const scratch = createScratchDatabases(cluster.run, { runId: "abcdef123456" });
    const name = scratch.create("hdb_realpath_local");
    expect(name).toBe("hdb_realpath_local_abcdef123456");
    expect(cluster.databases.has(name)).toBe(true);
    expect(scratch.created()).toEqual([name]);
    expect(cluster.statements.filter((sql) => sql.startsWith("CREATE"))).toEqual([
      `CREATE DATABASE "${name}"`,
    ]);
  });

  it("draws a fresh run id for every run, so two runs never share a name", () => {
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      names.add(createScratchDatabases(fakeCluster().run).create("hdb_bench_10000"));
    }
    expect(names.size).toBe(20);
  });

  it("REFUSES a database that already exists, and never drops it", () => {
    const taken = "hdb_realpath_local_abcdef123456";
    const cluster = fakeCluster(["postgres", taken]);
    const scratch = createScratchDatabases(cluster.run, { runId: "abcdef123456" });

    expect(() => scratch.create("hdb_realpath_local")).toThrow(ScratchDatabaseExistsError);
    expect(() => scratch.create("hdb_realpath_local")).toThrow(
      `refusing to use database "${taken}": it already exists and this run did not create it`,
    );
    expect(scratch.created()).toEqual([]);
    expect(cluster.statements.some((sql) => sql.startsWith("CREATE"))).toBe(false);

    // Whatever the caller does next, including the cleanup in its `finally`, the pre-existing database stays.
    expect(scratch.dropAll()).toEqual({ dropped: [], left: [] });
    expect(() => scratch.drop(taken)).toThrow("this run did not create it");
    expect(cluster.databases.has(taken)).toBe(true);
    expect(cluster.statements.some((sql) => sql.startsWith("DROP"))).toBe(false);
  });

  it("does not register a name when CREATE DATABASE itself fails (for example a concurrent creator)", () => {
    const taken = "hdb_bench_10000_abcdef123456";
    const cluster = fakeCluster();
    const racing: RunSql = (database, sql) => {
      // The existence check sees nothing; the database appears just before this run's CREATE.
      if (sql.startsWith("CREATE")) cluster.databases.add(taken);
      return cluster.run(database, sql);
    };
    const scratch = createScratchDatabases(racing, { runId: "abcdef123456" });
    expect(() => scratch.create("hdb_bench_10000")).toThrow("already exists");
    expect(scratch.created()).toEqual([]);
    scratch.dropAll();
    expect(cluster.databases.has(taken)).toBe(true);
  });
});

describe("dropping", () => {
  it("drops only what this run created, newest first, and leaves every other database alone", () => {
    const bystanders = ["postgres", "template1", "hdb_bench_10000", "hdb_realpath_local", "mine"];
    const cluster = fakeCluster(bystanders);
    const scratch = createScratchDatabases(cluster.run, { runId: "abcdef123456" });
    const first = scratch.create("hdb_bench_10000");
    const second = scratch.create("hdb_bench_100000");

    const outcome = scratch.dropAll();

    expect(outcome).toEqual({ dropped: [second, first], left: [] });
    expect([...cluster.databases].sort()).toEqual([...bystanders].sort());
    expect(scratch.created()).toEqual([]);
    expect(cluster.statements.filter((sql) => sql.startsWith("DROP"))).toEqual([
      `DROP DATABASE "${second}"`,
      `DROP DATABASE "${first}"`,
    ]);
  });

  it("drops one database on request and refuses one it did not create, with no statement issued", () => {
    const cluster = fakeCluster(["postgres", "someone_elses"]);
    const scratch = createScratchDatabases(cluster.run, { runId: "abcdef123456" });
    const mine = scratch.create("hdb_bench_10000");
    const issued = cluster.statements.length;

    for (const other of ["postgres", "someone_elses", "hdb_bench_10000"]) {
      expect(() => scratch.drop(other), other).toThrow("this run did not create it");
    }
    expect(cluster.statements).toHaveLength(issued);

    expect(scratch.drop(mine)).toBeNull();
    expect(cluster.databases.has(mine)).toBe(false);
    expect(scratch.dropAll()).toEqual({ dropped: [], left: [] }); // nothing left to do, nothing issued
  });

  it("never uses FORCE or terminates a backend", () => {
    const cluster = fakeCluster();
    const scratch = createScratchDatabases(cluster.run, { runId: "abcdef123456" });
    scratch.create("hdb_bench_10000");
    scratch.dropAll();
    for (const sql of cluster.statements) {
      expect(sql).not.toMatch(/FORCE|pg_terminate_backend|pg_cancel_backend|IF EXISTS/i);
    }
  });

  it("waits for the run's own sessions to disconnect before dropping", () => {
    const cluster = fakeCluster();
    let name = "";
    const clock = fakeClock((time) => {
      if (time >= 1_500) cluster.sessions[name] = 0; // the Worker's connections go away after 1.5 s
    });
    const scratch = createScratchDatabases(cluster.run, {
      runId: "abcdef123456",
      waitMs: 10_000,
      pollMs: 500,
      ...clock,
    });
    name = scratch.create("hdb_realpath_local");
    cluster.sessions[name] = 2;

    expect(scratch.dropAll()).toEqual({ dropped: [name], left: [] });
    expect(cluster.databases.has(name)).toBe(false);
    expect(clock.now()).toBe(1_500);
  });

  it("leaves a database in place, and says why, if other sessions never disconnect", () => {
    const cluster = fakeCluster();
    const clock = fakeClock();
    const scratch = createScratchDatabases(cluster.run, {
      runId: "abcdef123456",
      waitMs: 2_000,
      pollMs: 500,
      ...clock,
    });
    const name = scratch.create("hdb_realpath_local");
    cluster.sessions[name] = 3;

    const outcome = scratch.dropAll();

    expect(outcome.dropped).toEqual([]);
    expect(outcome.left).toEqual([
      {
        database: name,
        reason: "3 session(s) are still connected; they are not this script's to cut",
      },
    ]);
    expect(cluster.databases.has(name)).toBe(true);
    expect(clock.now()).toBeGreaterThanOrEqual(2_000);
    expect(cluster.statements.some((sql) => sql.startsWith("DROP"))).toBe(false);
    expect(scratch.created()).toEqual([name]);
  });

  it("reports a failed DROP instead of throwing, and keeps the database on the list", () => {
    const cluster = fakeCluster();
    const failing: RunSql = (database, sql) => {
      if (sql.startsWith("DROP")) throw new Error("ERROR:  permission denied to drop database");
      return cluster.run(database, sql);
    };
    const scratch = createScratchDatabases(failing, { runId: "abcdef123456" });
    const name = scratch.create("hdb_bench_10000");
    const outcome = scratch.dropAll();
    expect(outcome.left).toEqual([
      { database: name, reason: "ERROR:  permission denied to drop database" },
    ]);
    expect(scratch.created()).toEqual([name]);
  });
});

describe("describeCleanup", () => {
  it("lists what was dropped, and names what was left with the manual command", () => {
    const done = describeCleanup({ dropped: ["a_abcdef123456"], left: [] });
    expect(done).toEqual({ lines: ["dropped database a_abcdef123456"], complete: true });

    const partial = describeCleanup({
      dropped: [],
      left: [{ database: "b_abcdef123456", reason: "1 session(s) are still connected" }],
    });
    expect(partial.complete).toBe(false);
    expect(partial.lines[0]).toContain("LEFT IN PLACE: database b_abcdef123456");
    expect(partial.lines[0]).toContain(`psql -d postgres -c 'DROP DATABASE "b_abcdef123456"'`);
  });
});

describe("scripts that use scratch databases", () => {
  const source = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

  it("the local rehearsal never drops a database by a fixed name or with FORCE", () => {
    const rehearsal = source("tests/deployed-path/local-rehearsal.mjs");
    expect(rehearsal).not.toMatch(/WITH\s*\(\s*FORCE\s*\)/i);
    expect(rehearsal).not.toMatch(/DROP\s+DATABASE/i);
    expect(rehearsal).not.toMatch(/pg_terminate_backend/i);
    expect(rehearsal).toContain('scratch.create("hdb_realpath_local")');
    expect(rehearsal).toContain("scratch.dropAll()");
  });
});
