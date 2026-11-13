import { describe, expect, it } from "vite-plus/test";
import {
  planTransactionDelta,
  transactionStatements,
  transactionTuple,
  type StoredTransaction,
} from "../../scripts/lib/sync/incremental";

const row: StoredTransaction = {
  id: 41,
  month: "2026-08",
  town: "BEDOK",
  block: "1",
  street_name: "TEST ST",
  address_key: "bedok-1",
  flat_type: "4 ROOM",
  storey_range: "01 TO 03",
  floor_area_sqm: 90,
  lease_commence_year: 1980,
  resale_price: 500000,
  flat_model: "MODEL",
};

describe("incremental transaction reconciliation", () => {
  it("writes nothing for identical shuffled facts, retaining rowids", () => {
    const duplicate = { ...row, id: 42 };
    const plan = planTransactionDelta([row, duplicate], [duplicate, row]);
    expect(transactionStatements(plan)).toEqual([]);
    expect(plan.affectedBlocks.size).toBe(0);
  });
  it.each([1, 100, 134])("inserts only +%i preserving duplicate multiplicity", (count) => {
    const plan = planTransactionDelta(
      [row],
      Array.from({ length: count + 1 }, () => row),
    );
    expect(plan.inserts).toHaveLength(count);
    expect(plan.inserts[0].id).toBe(42);
    expect(plan.inserts.at(-1)?.id).toBe(41 + count);
    expect(plan.affectedBlocks).toEqual(new Set([row.address_key]));
    expect(plan.affectedTownTypes).toEqual(new Set([JSON.stringify([row.town, row.flat_type])]));
    expect(
      transactionStatements(plan).every((statement) => (statement.params?.length ?? 0) <= 100),
    ).toBe(true);
  });
  it("blocks corrections/disappearance rather than appending stale and corrected facts", () => {
    expect(() => planTransactionDelta([row], [{ ...row, resale_price: 600000 }])).toThrow(
      "Reconciliation required",
    );
    expect(() => planTransactionDelta([row], [])).toThrow("partial source");
  });
  it("updates only explicitly paired correction rowids and affects both old and new cohorts", () => {
    const correction = {
      ...row,
      resale_price: 600000,
      address_key: "new-block",
      flat_type: "5 ROOM",
    };
    const plan = planTransactionDelta([row], [correction], {
      corrections: new Map([[41, correction]]),
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([correction]);
    expect(plan.affectedBlocks).toEqual(new Set([row.address_key, "new-block"]));
    expect(transactionStatements(plan)[0].sql).toMatch(/^UPDATE transactions/);
  });
  it("rejects massive delta and unknown correction IDs", () => {
    expect(() =>
      planTransactionDelta(
        [row],
        Array.from({ length: 1002 }, () => row),
      ),
    ).toThrow("massive delta");
    expect(() =>
      planTransactionDelta([row], [row], { corrections: new Map([[999, row]]) }),
    ).toThrow("unknown rowid");
  });
  it("exact tuple identity does not collide on embedded separators", () => {
    expect(transactionTuple({ ...row, town: "A|B", block: "C" })).not.toBe(
      transactionTuple({ ...row, town: "A", block: "B|C" }),
    );
  });
});
