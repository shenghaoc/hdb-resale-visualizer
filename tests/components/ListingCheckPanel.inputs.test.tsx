import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ListingCheckPanel } from "@/features/listing-check/ListingCheckPanel";
import { I18nProvider } from "@/shared/lib/i18n";
import type { AddressDetail, Suggestion } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchAddressDetail: vi.fn<(addressKey: string) => Promise<AddressDetail | null>>(),
  fetchSuggestions: vi.fn<(query: string, signal?: AbortSignal) => Promise<Suggestion[]>>(),
}));

vi.mock("@/shared/lib/data", () => ({
  fetchAddressDetail: dataMocks.fetchAddressDetail,
  fetchSuggestions: dataMocks.fetchSuggestions,
}));

function makeDetail(): AddressDetail {
  return {
    summary: {
      addressKey: "ang-mo-kio-123a",
      town: "ANG MO KIO",
      block: "123A",
      streetName: "ANG MO KIO AVE 1",
      displayName: null,
      coordinates: { lat: 1.37, lng: 103.84 },
      medianPrice: 600000,
      pricePerSqmMedian: 6452,
      transactionCount: 4,
      floorAreaRange: [90, 96],
      leaseCommenceRange: [1990, 1990],
      latestMonth: "2026-04",
      availableDateRange: ["2023-04", "2026-04"],
      flatTypes: ["4 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: null,
      nearbyMrts: [],
      postalCode: null,
      priceIqr: [550000, 650000],
      pricePerSqftMedian: null,
    },
    recentTransactions: [
      {
        id: "tx-1",
        month: "2026-03",
        flatType: "4 ROOM",
        storeyRange: "07 TO 09",
        floorAreaSqm: 93,
        flatModel: "MODEL A",
        leaseCommenceDate: 1990,
        remainingLease: "63 years",
        resalePrice: 600000,
        pricePerSqm: 6452,
        pricePerSqft: null,
      },
    ],
    monthlyTrend: [],
  };
}

function renderPanel(shortlistFull = false) {
  const callbacks = {
    onAddressSelect: vi.fn(),
    onAskingPriceChange: vi.fn(),
    onFloorAreaChange: vi.fn(),
    onFlatTypeChange: vi.fn(),
    onStoreyRangeChange: vi.fn(),
    onLeaseYearChange: vi.fn(),
    onUseSampleCheck: vi.fn(),
    onSaveToShortlist: vi.fn(),
    onShare: vi.fn(),
  };

  render(
    <I18nProvider>
      <ListingCheckPanel
        selectedAddressKey="ang-mo-kio-123a"
        askingPrice={650000}
        floorAreaSqm={93}
        flatType="4 ROOM"
        storeyRange="07 TO 09"
        leaseCommenceYear={1990}
        savedToShortlist={false}
        shortlistFull={shortlistFull}
        referenceMonth="2026-04"
        {...callbacks}
      />
    </I18nProvider>,
  );

  return callbacks;
}

describe("ListingCheckPanel input clearing", () => {
  beforeEach(() => {
    dataMocks.fetchAddressDetail.mockReset();
    dataMocks.fetchAddressDetail.mockResolvedValue(makeDetail());
    dataMocks.fetchSuggestions.mockReset();
    dataMocks.fetchSuggestions.mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          comparables: [
            {
              transactionId: "cmp-1",
              month: "2026-03",
              town: "ANG MO KIO",
              block: "123A",
              streetName: "ANG MO KIO AVE 1",
              flatType: "4 ROOM",
              storeyRange: "07 TO 09",
              floorAreaSqm: 93,
              leaseCommenceDate: 1990,
              resalePrice: 620000,
              pricePerSqm: 6667,
              similarity: 0.95,
              matchReasons: ["Same block", "Same flat type"],
            },
          ],
          sameBlockCount: 1,
          sameStreetCount: 1,
          sameTownCount: 1,
          newestComparableAgeMonths: 1,
          widenedSearch: false,
          caveats: [],
          adjustmentApplied: false,
          adjustmentCaveats: [],
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("propagates null immediately when listing fact inputs are cleared", async () => {
    const user = userEvent.setup();
    const callbacks = renderPanel();

    const askingPrice = await screen.findByLabelText(/asking price/i);
    const floorArea = screen.getByLabelText(/floor area/i);
    const leaseYear = screen.getByLabelText(/lease commence year/i);

    await user.clear(askingPrice);
    expect(callbacks.onAskingPriceChange).toHaveBeenLastCalledWith(null);

    await user.clear(floorArea);
    expect(callbacks.onFloorAreaChange).toHaveBeenLastCalledWith(null);

    await user.clear(leaseYear);
    expect(callbacks.onLeaseYearChange).toHaveBeenLastCalledWith(null);

    await waitFor(() =>
      expect(dataMocks.fetchAddressDetail).toHaveBeenCalledWith("ang-mo-kio-123a"),
    );
  });

  it("does not repeat candidate and shortlist navigation inside the check workflow", async () => {
    renderPanel();

    await screen.findByLabelText(/asking price/i);
    expect(screen.getAllByText(/check a listing price/i)).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /find candidate blocks/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compare my shortlist/i })).not.toBeInTheDocument();
  });

  it("explains when the shortlist limit prevents another save", async () => {
    renderPanel(true);

    const button = await screen.findByRole("button", { name: /shortlist full/i });
    expect(button).toBeDisabled();
  });
});
