// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import {
  ComparableReturnedDataGate,
  COMPARABLE_RESULT_PREFLIGHT_SQL,
  COMPARABLE_PUBLICATION,
  TRANSACTION_RESULT_COLUMNS,
} from "../../scripts/neon-benchmark/pilot/returned-data";
import { PILOT_SERVER_STATS_SQL } from "../../scripts/neon-benchmark/pilot/worker";
import { createNeonPublicData } from "../../worker/public-data-neon";

const input = { town: "JURONG WEST", block: "211", streetName: "BOON LAY PL", flatType: "3 ROOM" };
// The gate admits exactly the statements the Worker's own Neon read implementation sends for a comparable
// search: three scope counts, the 150-row projection of the block scope, and the full trend history.
// (Main replaced the runtime SQL compiler this test was first written against with that implementation.)
const emitted: { sql: string; params: readonly unknown[] }[] = [];
const comparableReads = createNeonPublicData(async (sql, params) => {
  emitted.push({ sql, params });
  return [];
});
const blockScope = {
  kind: "block",
  town: input.town,
  block: input.block,
  flatType: input.flatType,
} as const;
await comparableReads.countTransactions(blockScope);
await comparableReads.countTransactions({
  kind: "street",
  streetName: input.streetName,
  flatType: input.flatType,
});
await comparableReads.countTransactions({
  kind: "town",
  town: input.town,
  flatType: input.flatType,
});
await comparableReads.recentTransactions(blockScope);
await comparableReads.trendHistory([{ town: input.town, flatType: input.flatType }]);
const countQueries = emitted.slice(0, 3);
const rowsQuery = emitted[3];
const trendQuery = emitted[4];
const row = {
  id: 280851,
  month: "2026-09",
  town: input.town,
  block: input.block,
  street_name: input.streetName,
  address_key: "211 BOON LAY PL",
  flat_type: input.flatType,
  storey_range: "07 TO 09",
  floor_area_sqm: 93,
  lease_commence_year: 1990,
  resale_price: 400_000,
  flat_model: "Improved",
};
const stats = {
  role: "hdb_benchmark_runtime",
  read_only: "on",
  statement_timeout: "2s",
  publication_id: COMPARABLE_PUBLICATION,
  successful_sql_calls: 100,
  successful_sql_ms: 20,
};
const send = () =>
  vi.fn(async (sql: string) => {
    if (sql === COMPARABLE_RESULT_PREFLIGHT_SQL)
      return { rows: [{ bounded: true, selected_town: input.town }] };
    if (sql === PILOT_SERVER_STATS_SQL) return { rows: [stats] };
    if (sql.includes("COUNT(*)")) return { rows: [{ cnt: 30 }] };
    if (sql.includes("FROM public.town_flat_type_trends"))
      return {
        rows: [
          {
            town: input.town,
            flat_type: input.flatType,
            month: "2026-09",
            median_price_per_sqm: 4000,
            transaction_count: 10,
          },
        ],
      };
    if (sql.startsWith("SELECT")) return { rows: [row] };
    return { rows: [] };
  });
const begin = (gate: ComparableReturnedDataGate, driver: ReturnType<typeof send>) =>
  gate.run("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", [], driver);

describe("producer-side comparable result proof in the frozen snapshot", () => {
  it("refuses an insufficient result lease before client/driver work", () => {
    expect(() => new ComparableReturnedDataGate(input, 100, PILOT_SERVER_STATS_SQL)).toThrow(
      "before client",
    );
    expect(
      () =>
        new ComparableReturnedDataGate(
          { ...input, town: "x".repeat(100) },
          2_000_000,
          PILOT_SERVER_STATS_SQL,
        ),
    ).toThrow("Unbounded pilot candidate");
  });
  it("adds one bounded preflight inside the existing snapshot then preserves full rows/history", async () => {
    const gate = new ComparableReturnedDataGate(input, 2_000_000, PILOT_SERVER_STATS_SQL);
    const driver = send();
    await begin(gate, driver);
    for (const query of countQueries) await gate.run(query.sql, query.params, driver);
    const data = await gate.run(rowsQuery.sql, rowsQuery.params, driver);
    await gate.run(trendQuery.sql, trendQuery.params, driver);
    await gate.run("COMMIT", [], driver);
    await gate.run(PILOT_SERVER_STATS_SQL, [], driver);
    expect(data.rows).toEqual([row]);
    expect(driver.mock.calls[1][0]).toBe(COMPARABLE_RESULT_PREFLIGHT_SQL);
    expect(
      driver.mock.calls.filter(([sql]) => sql === COMPARABLE_RESULT_PREFLIGHT_SQL),
    ).toHaveLength(1);
    expect(gate.snapshot()).toMatchObject({
      producerProof: true,
      completePhysicalSocketUpper: null,
      opaqueHyperdriveTrafficUpper: null,
    });
    expect(gate.snapshot().resultMessageBytesUpperObserved).toBeLessThan(
      gate.reservedResultMessageBytes,
    );
    expect(gate.reservedResultMessageBytes).toBe(86_111);
    expect(TRANSACTION_RESULT_COLUMNS.map((c) => c.name)).toEqual(Object.keys(row));
  });
  it("refuses every row query when the source manifest/cardinality/field preflight fails", async () => {
    const gate = new ComparableReturnedDataGate(input, 2_000_000, PILOT_SERVER_STATS_SQL);
    const driver = send();
    await begin(gate, driver);
    driver.mockResolvedValueOnce({
      rows: [{ bounded: false, selected_town: input.town }],
    } as never);
    await expect(gate.run(countQueries[0].sql, countQueries[0].params, driver)).rejects.toThrow(
      "producer-side",
    );
    expect(driver.mock.calls.some(([sql]) => sql === countQueries[0].sql)).toBe(false);
    await gate.run("ROLLBACK", [], driver);
    await gate.run(PILOT_SERVER_STATS_SQL, [], driver);
    expect(gate.snapshot().producerProof).toBe(false);
  });
  it("binds preflight to the exact candidate and publication, not arbitrary SQL or parameters", async () => {
    const gate = new ComparableReturnedDataGate(input, 2_000_000, PILOT_SERVER_STATS_SQL);
    const driver = send();
    await begin(gate, driver);
    await expect(
      gate.run(countQueries[0].sql, ["OTHER TOWN", input.block, input.flatType], driver),
    ).rejects.toThrow("outside bounded");
    expect(driver.mock.calls).toHaveLength(2);
    expect(COMPARABLE_RESULT_PREFLIGHT_SQL).toContain(
      "json->'neonPublication'->>'publicationId'=$5",
    );
    expect(COMPARABLE_RESULT_PREFLIGHT_SQL).toContain("count(DISTINCT (town,flat_type))<=1");
    expect(COMPARABLE_RESULT_PREFLIGHT_SQL).toContain("count(*)<=442");
    expect(COMPARABLE_RESULT_PREFLIGHT_SQL).toContain("LIMIT 150");
  });
  it("blocks replayed counts and unreserved semanticqueries before driver send", async () => {
    const gate = new ComparableReturnedDataGate(input, 2_000_000, PILOT_SERVER_STATS_SQL);
    const driver = send();
    await begin(gate, driver);
    await gate.run(countQueries[0].sql, countQueries[0].params, driver);
    const before = driver.mock.calls.length;
    await expect(gate.run(countQueries[0].sql, countQueries[0].params, driver)).rejects.toThrow(
      "Count replay",
    );
    expect(driver.mock.calls).toHaveLength(before);
  });
  it("fails closed if a driver violates the producer certificate; postparse checks are not a socket guarantee", async () => {
    const gate = new ComparableReturnedDataGate(input, 2_000_000, PILOT_SERVER_STATS_SQL);
    const driver = send();
    await begin(gate, driver);
    for (const query of countQueries) await gate.run(query.sql, query.params, driver);
    driver.mockResolvedValueOnce({ rows: [{ ...row, address_key: "x".repeat(1000) }] } as never);
    await expect(gate.run(rowsQuery.sql, rowsQuery.params, driver)).rejects.toThrow("field proof");
    await expect(gate.run(trendQuery.sql, trendQuery.params, driver)).rejects.toThrow(
      "before snapshot/proof",
    );
    expect(gate.snapshot().completePhysicalSocketUpper).toBeNull();
  });
  it("requires the frozen single-town/flat full-history query rather than silently truncating trends", async () => {
    const gate = new ComparableReturnedDataGate(input, 2_000_000, PILOT_SERVER_STATS_SQL);
    const driver = send();
    await begin(gate, driver);
    for (const query of countQueries) await gate.run(query.sql, query.params, driver);
    await gate.run(rowsQuery.sql, rowsQuery.params, driver);
    const before = driver.mock.calls.length;
    await expect(
      gate.run(trendQuery.sql + " LIMIT 442", trendQuery.params, driver),
    ).rejects.toThrow("outside bounded");
    expect(driver.mock.calls).toHaveLength(before);
  });
});
