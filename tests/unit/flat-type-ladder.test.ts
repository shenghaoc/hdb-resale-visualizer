import { describe, expect, it } from "vitest";
import { deriveFlatTypePriceLadder, median } from "@/features/block-detail/flat-type-ladder";
import type { AddressDetailTransaction } from "@/types/data";

function tx(flatType: string, resalePrice: number): Pick<AddressDetailTransaction, "flatType" | "resalePrice"> {
  return { flatType, resalePrice };
}

describe("median helper", () => {
  it("computes median for odd and even counts", () => {
    expect(median([10])).toBe(10);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([100, 200, 300, 400])).toBe(250);
  });
  it("throws on empty", () => {
    expect(() => median([])).toThrow(/empty/);
  });
});

describe("deriveFlatTypePriceLadder", () => {
  it("returns entries in canonical order with null for missing types", () => {
    const available = ["3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE"];
    const transactions = [tx("3 ROOM", 400000), tx("3 ROOM", 420000), tx("5 ROOM", 650000)];
    const ladder = deriveFlatTypePriceLadder(available, transactions);
    expect(ladder.map((e) => e.flatType)).toEqual(["3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE"]);
    expect(ladder[0]).toMatchObject({ flatType: "3 ROOM", medianPrice: 410000, transactionCount: 2 });
    expect(ladder[1]).toMatchObject({ flatType: "4 ROOM", medianPrice: null, transactionCount: 0 });
    expect(ladder[2]).toMatchObject({ flatType: "5 ROOM", medianPrice: 650000, transactionCount: 1 });
    expect(ladder[3]).toMatchObject({ flatType: "EXECUTIVE", medianPrice: null, transactionCount: 0 });
  });

  it("handles extra non-standard flat types by appending sorted", () => {
    const available = ["2 ROOM", "MODEL A"]; // MODEL A not in order list
    const transactions = [tx("2 ROOM", 300000), tx("MODEL A", 500000)];
    const ladder = deriveFlatTypePriceLadder(available, transactions);
    expect(ladder.map((e) => e.flatType)).toEqual(["2 ROOM", "MODEL A"]);
  });

  it("deduplicates repeated flat types in availableFlatTypes", () => {
    const available = ["3 ROOM", "3 ROOM", "4 ROOM"];
    const ladder = deriveFlatTypePriceLadder(available, [tx("3 ROOM", 400000)]);
    expect(ladder).toHaveLength(2);
    expect(ladder[0].flatType).toBe("3 ROOM");
    expect(ladder[1].flatType).toBe("4 ROOM");
  });

  it("rounds median price to nearest integer", () => {
    const available = ["3 ROOM"];
    const transactions = [tx("3 ROOM", 400001), tx("3 ROOM", 400002)];
    const ladder = deriveFlatTypePriceLadder(available, transactions);
    expect(ladder[0].medianPrice).toBe(400002); // (400001+400002)/2 = 400001.5 -> round? wait, Math.round(400001.5)=400002? In JS Math.round( .5) to even? No, to nearest, .5 up.
    // Actually 400001.5 rounds to 400002 yes.
  });
});
