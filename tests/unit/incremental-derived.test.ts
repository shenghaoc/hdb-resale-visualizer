import { describe, expect, it } from "vite-plus/test";
import {
  buildArtifacts,
  toTransactionRow,
  type ResaleTransaction,
} from "../../scripts/lib/pipeline";
import {
  assignStableTransactionIds,
  planTransactionDelta,
  type StoredTransaction,
} from "../../scripts/lib/sync/incremental";

function setup() {
  const rows: ResaleTransaction[] = Array.from({ length: 90 }, (_, index) => {
    const address = `block-${index % 3}`;
    return {
      id: `csv-${index}`,
      month: "2026-08",
      town: index % 3 === 2 ? "OTHER" : "BEDOK",
      addressKey: address,
      block: String(index % 3),
      streetName: "TEST ST",
      flatType: "4 ROOM",
      storeyRange: "01 TO 03",
      floorAreaSqm: 90,
      flatModel: "MODEL",
      leaseCommenceDate: 1980,
      remainingLease: "53 years",
      resalePrice: 500000 + index * 1000,
      pricePerSqm: Number(((500000 + index * 1000) / 90).toFixed(2)),
      pricePerSqft: null,
    };
  });
  const stored: StoredTransaction[] = rows.map((row, index) => ({
    ...toTransactionRow(row)!,
    id: index + 1,
  }));
  const zero = planTransactionDelta(stored, stored);
  assignStableTransactionIds(rows, stored, zero, toTransactionRow);
  const input = {
    transactions: rows,
    geocodes: Object.fromEntries(
      [0, 1, 2].map((index) => [
        `block-${index}`,
        { lat: 1.3, lng: 103.8, displayName: null, postalCode: null, searchValue: "TEST ST" },
      ]),
    ),
    propertyInfo: [],
    mrtExits: [],
    parks: [{ name: "PARK", lat: 1.3, lng: 103.8 }],
    metadata: { lastUpdatedAt: "fixture" },
  };
  const previous = buildArtifacts(input);
  return { rows, stored, zero, input, previous };
}

describe("affected derived dependency closure", () => {
  it("no-change and reordered source retain every untouched product and capped detail selection", () => {
    const { rows, stored, zero, input, previous } = setup();
    const reversed = rows.map((row) => ({ ...row, id: "changed-csv-position" })).reverse();
    assignStableTransactionIds(reversed, stored, zero, toTransactionRow);
    const fullReordered = buildArtifacts({ ...input, transactions: reversed });
    expect(fullReordered.details).toEqual(previous.details);
    const incremental = buildArtifacts({
      ...input,
      transactions: reversed,
      incremental: { previous, delta: zero },
    });
    expect(incremental.computation).toMatchObject({
      blocks: 0,
      trendGroups: 0,
      comparisonBlocks: 0,
    });
    expect(incremental.details["block-2"]).toBe(previous.details["block-2"]);
  });
  it.each([1, 100])(
    "+%i recomputes the changed block and its comparison population, retaining other-town output",
    (count) => {
      const { rows, stored, input, previous } = setup();
      const added = Array.from({ length: count }, (_, index) => ({
        ...rows[0],
        id: `new-csv-${index}`,
        resalePrice: 600000 + index,
        pricePerSqm: Number(((600000 + index) / 90).toFixed(2)),
      }));
      const incoming = [...rows.map((row) => ({ ...row })), ...added];
      const delta = planTransactionDelta(
        stored,
        incoming.map((row) => toTransactionRow(row)!),
      );
      assignStableTransactionIds(incoming, stored, delta, toTransactionRow);
      const next = buildArtifacts({
        ...input,
        transactions: incoming,
        incremental: { previous, delta },
      });
      expect(next.computation).toMatchObject({ blocks: 1, trendGroups: 1, comparisonBlocks: 2 });
      expect(next.details["block-2"]).toBe(previous.details["block-2"]);
      expect(next.comparisons?.["block-2"]).toBe(previous.comparisons?.["block-2"]);
      const full = buildArtifacts({ ...input, transactions: incoming });
      expect(next.blockSummaries).toEqual(full.blockSummaries);
      expect(next.details).toEqual(full.details);
      const evidence = (value: typeof next.comparisons) =>
        Object.fromEntries(
          Object.entries(value ?? {}).map(([key, comparison]) => [
            key,
            { ...comparison, generatedAt: null },
          ]),
        );
      expect(evidence(next.comparisons)).toEqual(evidence(full.comparisons));
    },
  );
  it("explicit correction, changed context and month/window changes invalidate the appropriate closure", () => {
    const { rows, stored, input, previous } = setup();
    const corrected = { ...rows[0], resalePrice: 900000, pricePerSqm: 10000 };
    const incoming = [corrected, ...rows.slice(1)];
    const fact = toTransactionRow(corrected)!;
    const delta = planTransactionDelta(
      stored,
      incoming.map((row) => toTransactionRow(row)!),
      { corrections: new Map([[1, fact]]) },
    );
    assignStableTransactionIds(incoming, stored, delta, toTransactionRow);
    const next = buildArtifacts({
      ...input,
      transactions: incoming,
      incremental: { previous, delta },
    });
    expect(next.computation).toMatchObject({ blocks: 1, comparisonBlocks: 2 });
    const contextChanged = buildArtifacts({
      ...input,
      parks: [{ name: "MOVED PARK", lat: 1.4, lng: 103.8 }],
      incremental: { previous, delta: planTransactionDelta(stored, stored) },
    });
    expect(contextChanged.computation).toMatchObject({
      blocks: 3,
      comparisonBlocks: 3,
      contextChanged: true,
    });
    const newer = { ...rows[0], id: "new", month: "2026-09" };
    const monthDelta = planTransactionDelta(stored, [...stored, toTransactionRow(newer)!]);
    const monthChanged = buildArtifacts({
      ...input,
      transactions: [...rows, newer],
      incremental: { previous, delta: monthDelta },
    });
    expect(monthChanged.computation?.comparisonBlocks).toBe(3);
  });
  it("changed remaining-lease presentation refreshes its detail even though persisted source columns are unchanged", () => {
    const { rows, zero, input, previous } = setup();
    const incoming = rows.map((row) => ({
      ...row,
      remainingLease: row.addressKey === "block-0" ? "corrected lease text" : row.remainingLease,
    }));
    const next = buildArtifacts({
      ...input,
      transactions: incoming,
      incremental: { previous, delta: zero },
    });
    expect(next.computation).toMatchObject({ blocks: 1, comparisonBlocks: 0 });
    expect(next.details["block-0"].recentTransactions[0].remainingLease).toBe(
      "corrected lease text",
    );
  });
});

it("unparseable storey additions cannot silently retain stale derived evidence", () => {
  const { rows, zero, input, previous } = setup();
  const added = { ...rows[0], id: "invalid-storey", storeyRange: "UNKNOWN", resalePrice: 990000 };
  const transactions = [...rows, added];
  const full = buildArtifacts({ ...input, transactions });
  const incremental = buildArtifacts({
    ...input,
    transactions,
    incremental: { previous, delta: zero },
  });
  expect(incremental.blockSummaries).toEqual(full.blockSummaries);
  expect(incremental.details).toEqual(full.details);
  expect(incremental.townFlatTypeTrend).toEqual(full.townFlatTypeTrend);
  const withoutTimestamp = (values: typeof full.comparisons) =>
    Object.fromEntries(
      Object.entries(values ?? {}).map(([key, { generatedAt: _timestamp, ...value }]) => [
        key,
        value,
      ]),
    );
  expect(withoutTimestamp(incremental.comparisons)).toEqual(withoutTimestamp(full.comparisons));
  expect(incremental.manifest.syncBuildState?.excludedSourceDigest).not.toBe(
    previous.manifest.syncBuildState?.excludedSourceDigest,
  );
});

it("stored duplicates with different presentation-only leases keep deterministic ordering", () => {
  const { rows } = setup();
  const source = [
    { ...rows[0], remainingLease: "53 years" },
    { ...rows[0], remainingLease: "52 years" },
  ];
  const stored = source.map((row, index) => ({ ...toTransactionRow(row)!, id: index + 1 }));
  const delta = planTransactionDelta(stored, stored);
  const reversed = source.map((row) => ({ ...row })).reverse();
  assignStableTransactionIds(source, stored, delta, toTransactionRow);
  assignStableTransactionIds(reversed, stored, delta, toTransactionRow);
  expect(source.map(({ id, remainingLease }) => ({ id, remainingLease }))).toEqual(
    reversed.map(({ id, remainingLease }) => ({ id, remainingLease })).reverse(),
  );
});
