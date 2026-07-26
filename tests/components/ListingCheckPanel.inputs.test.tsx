import { type ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ListingCheckPanel } from "@/features/listing-check/ListingCheckPanel";
import { formatCompactCurrency } from "@/shared/lib/format";
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

function renderPanel(
  shortlistFull = false,
  overrides: Partial<ComponentProps<typeof ListingCheckPanel>> = {},
) {
  const callbacks = {
    onAddressSelect: vi.fn(),
    onAskingPriceChange: vi.fn(),
    onFloorAreaChange: vi.fn(),
    onFlatTypeChange: vi.fn(),
    onStoreyRangeChange: vi.fn(),
    onLeaseYearChange: vi.fn(),
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
        {...overrides}
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
    window.localStorage.removeItem("hdb-resale-locale");
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

  it("waits for an explicit Check submission before fetching comparables", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByLabelText(/asking price/i);
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /check this listing/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it.each([
    { label: "asking price", overrides: { askingPrice: null } },
    { label: "floor area", overrides: { floorAreaSqm: null } },
    { label: "flat type", overrides: { flatType: null } },
    { label: "storey", overrides: { storeyRange: null } },
  ])("requires an explicit $label before enabling Check", async ({ overrides }) => {
    renderPanel(false, overrides);

    const button = await screen.findByRole("button", { name: /check this listing/i });
    expect(button).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a flat-type selector even when the block has one option and never selects it", async () => {
    const callbacks = renderPanel(false, { flatType: null });

    await screen.findByLabelText(/flat type/i);
    expect(callbacks.onFlatTypeChange).not.toHaveBeenCalled();
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
    const user = userEvent.setup();
    renderPanel(true);

    await user.click(await screen.findByRole("button", { name: /check this listing/i }));
    const button = await screen.findByRole("button", { name: /shortlist full/i });
    expect(button).toBeDisabled();
  });

  it("localizes confidence, caveats, match reasons, and compact prices in zh-SG", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("hdb-resale-locale", "zh-SG");
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "检查此房源" }));

    expect(await screen.findByTestId("listing-check-confidence-summary")).toHaveTextContent(
      "低可信度",
    );
    expect(screen.getAllByText(/仅找到 1 笔可比交易/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("同一栋组屋").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("相同房型").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("listing-check-verdict")).toHaveTextContent(
      formatCompactCurrency(620000, "zh-SG"),
    );
  });
});
