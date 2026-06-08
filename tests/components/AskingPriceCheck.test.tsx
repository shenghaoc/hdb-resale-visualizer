import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AskingPriceCheck } from "@/components/AskingPriceCheck";
import { I18nProvider } from "@/shared/lib/i18n";
import { formatNumber } from "@/shared/lib/format";
import {
  assessAskingPrice,
  findComparableTransactions,
  parseStoreyMidpoint,
} from "@/entities/transaction/transaction-analysis";
import type { AddressDetail, AddressDetailTransaction } from "@/types/data";

function tx(overrides: Partial<AddressDetailTransaction>): AddressDetailTransaction {
  return {
    id: overrides.id ?? "tx-a",
    month: overrides.month ?? "2024-06",
    flatType: overrides.flatType ?? "4 ROOM",
    storeyRange: overrides.storeyRange ?? "10 TO 12",
    floorAreaSqm: overrides.floorAreaSqm ?? 93,
    flatModel: overrides.flatModel ?? "MODEL A",
    leaseCommenceDate: overrides.leaseCommenceDate ?? 1990,
    remainingLease: overrides.remainingLease ?? "65 years",
    resalePrice: overrides.resalePrice ?? 600000,
    pricePerSqm: overrides.pricePerSqm ?? 6451.6,
    pricePerSqft: overrides.pricePerSqft ?? 599.2,
  };
}

// pricePerSqm values equal Math.round(resalePrice / 93) so the fixture stays
// consistent with its own resalePrice/floorAreaSqm — assessAskingPrice reads
// pricePerSqm directly into the median computation.
const comparableTransactions = [
  tx({ id: "a", resalePrice: 550000, pricePerSqm: 5914 }),
  tx({ id: "b", resalePrice: 600000, pricePerSqm: 6452 }),
  tx({ id: "c", resalePrice: 650000, pricePerSqm: 6989 }),
  tx({ id: "d", resalePrice: 700000, pricePerSqm: 7527 }),
];

// Matches the locale I18nProvider resolves to in jsdom, so formatNumber output
// in assertions mirrors the component's formatNumber(value, 0, locale) calls.
const LOCALE = "en-SG" as const;

function makeDetail(transactions: AddressDetailTransaction[]): AddressDetail {
  return {
    summary: { addressKey: "test-block" } as AddressDetail["summary"],
    recentTransactions: transactions,
    monthlyTrend: [],
  };
}

function renderCheck(transactions = comparableTransactions) {
  return render(
    <I18nProvider>
      <AskingPriceCheck detail={makeDetail(transactions)} />
    </I18nProvider>,
  );
}

describe("AskingPriceCheck", () => {
  it("prompts for an asking price when the input is empty", () => {
    renderCheck();
    expect(
      screen.getByText(
        /enter the seller's asking price above to see how it compares/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/in line with market/i)).not.toBeInTheDocument();
  });

  it("shows price-per-sqm and verdict from known asking price and floor area", async () => {
    const user = userEvent.setup();
    const askingPrice = 625_000;
    const floorAreaSqm = 93;
    const comparables = findComparableTransactions(comparableTransactions, {
      flatType: "4 ROOM",
      storeyMidpoint: parseStoreyMidpoint("10 TO 12"),
      floorAreaSqm,
    });
    const expected = assessAskingPrice({
      askingPrice,
      floorAreaSqm,
      comparables,
    });
    expect(expected).not.toBeNull();
    expect(expected!.verdict).toBe("fair");
    expect(expected!.askingPricePerSqm).toBeCloseTo(askingPrice / floorAreaSqm, 5);
    expect(expected!.pricePerSqmDeltaPct).not.toBeNull();

    renderCheck();

    await user.type(screen.getByLabelText(/asking price/i), String(askingPrice));
    await user.type(screen.getByLabelText(/floor area/i), String(floorAreaSqm));

    expect(screen.getByText(/in line with market/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        `$${formatNumber(expected!.askingPricePerSqm!, 0, LOCALE)}/sqm`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `$${formatNumber(expected!.summary.medianPricePerSqm, 0, LOCALE)}/sqm`,
      ),
    ).toBeInTheDocument();
    const deltaSign = expected!.pricePerSqmDeltaPct! > 0 ? "+" : expected!.pricePerSqmDeltaPct! < 0 ? "−" : "";
    expect(
      screen.getByText(`${deltaSign}${Math.abs(expected!.pricePerSqmDeltaPct!).toFixed(1)}%`),
    ).toBeInTheDocument();
  });

  it("warns when a price is entered but there are no transactions to compare", async () => {
    const user = userEvent.setup();
    renderCheck([]);

    await user.type(screen.getByLabelText(/asking price/i), "800000");

    expect(
      screen.getByText(/no comparable transactions found with these filters/i),
    ).toBeInTheDocument();
  });
});
