import { describe, expect, it } from "vitest";
import { getBudgetMatchSignal } from "@/features/listing-check/budget-signals";

describe("budget signals", () => {
  it("returns no-budget when no filters are set", () => {
    const result = getBudgetMatchSignal(500000, null, null);
    expect(result.status).toBe("no-budget");
    expect(result.diffAmount).toBeNull();
  });

  it("returns within when price is within budget range", () => {
    const result = getBudgetMatchSignal(500000, 400000, 600000);
    expect(result.status).toBe("within");
    expect(result.diffAmount).toBeNull();
  });

  it("returns within when only min is set and price is above", () => {
    const result = getBudgetMatchSignal(500000, 400000, null);
    expect(result.status).toBe("within");
    expect(result.diffAmount).toBeNull();
  });

  it("returns within when only max is set and price is below", () => {
    const result = getBudgetMatchSignal(500000, null, 600000);
    expect(result.status).toBe("within");
    expect(result.diffAmount).toBeNull();
  });

  it("returns above-max when price exceeds max budget", () => {
    const result = getBudgetMatchSignal(700000, 400000, 600000);
    expect(result.status).toBe("above-max");
    expect(result.diffAmount).toBe(100000);
  });

  it("returns below-min when price is below min budget", () => {
    const result = getBudgetMatchSignal(300000, 400000, 600000);
    expect(result.status).toBe("below-min");
    expect(result.diffAmount).toBe(100000);
  });

  it("returns near-above when price is slightly above max (within 10%)", () => {
    const maxBudget = 600000;
    const price = 650000; // 8.3% above max
    const result = getBudgetMatchSignal(price, 400000, maxBudget);
    expect(result.status).toBe("near-above");
    expect(result.diffAmount).toBe(50000);
  });

  it("returns near-below when price is slightly below min (within 10%)", () => {
    const minBudget = 400000;
    const price = 370000; // 7.5% below min
    const result = getBudgetMatchSignal(price, minBudget, 600000);
    expect(result.status).toBe("near-below");
    expect(result.diffAmount).toBe(30000);
  });

  it("returns near-above when only max is set and price is slightly above", () => {
    const result = getBudgetMatchSignal(650000, null, 600000);
    expect(result.status).toBe("near-above");
    expect(result.diffAmount).toBe(50000);
  });

  it("returns near-below when only min is set and price is slightly below", () => {
    const result = getBudgetMatchSignal(370000, 400000, null);
    expect(result.status).toBe("near-below");
    expect(result.diffAmount).toBe(30000);
  });

  it("returns above-max when price is significantly above max (over 10%)", () => {
    const maxBudget = 600000;
    const price = 700000; // 16.7% above max
    const result = getBudgetMatchSignal(price, 400000, maxBudget);
    expect(result.status).toBe("above-max");
    expect(result.diffAmount).toBe(100000);
  });

  it("returns below-min when price is significantly below min (over 10%)", () => {
    const minBudget = 400000;
    const price = 300000; // 25% below min
    const result = getBudgetMatchSignal(price, minBudget, 600000);
    expect(result.status).toBe("below-min");
    expect(result.diffAmount).toBe(100000);
  });

  it("handles edge case at exact budget boundaries", () => {
    const resultAtMin = getBudgetMatchSignal(400000, 400000, 600000);
    expect(resultAtMin.status).toBe("within");

    const resultAtMax = getBudgetMatchSignal(600000, 400000, 600000);
    expect(resultAtMax.status).toBe("within");
  });

  it("calculates near threshold correctly for small budgets", () => {
    const minBudget = 100000;
    const price = 95000; // 5% below
    const result = getBudgetMatchSignal(price, minBudget, 200000);
    expect(result.status).toBe("near-below");
    expect(result.diffAmount).toBe(5000);
  });
});
