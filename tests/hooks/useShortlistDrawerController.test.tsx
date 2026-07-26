import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import { useI18n } from "@/shared/lib/i18n/useI18n";
import {
  useShortlistDrawerController,
  type UseShortlistDrawerControllerOptions,
} from "@/features/shortlist/useShortlistDrawerController";
import { decodeShortlistFromUrl } from "@/features/shortlist/shortlist";
import { DEFAULT_FILTERS } from "@/shared/lib/constants";
import type { BlockSummary, ShortlistItem } from "@/types/data";
import type { ShortlistRow } from "@/features/shortlist/shortlistRows";

function makeBlock(
  addressKey: string,
  options: {
    medianPrice?: number;
    leaseCommenceRange?: [number, number];
    nearestMrt?: BlockSummary["nearestMrt"];
  } = {},
): BlockSummary {
  return {
    addressKey,
    town: "BEDOK",
    block: addressKey,
    streetName: "BEDOK NTH AVE 1",
    coordinates: { lat: 1.33, lng: 103.92 },
    medianPrice: options.medianPrice ?? 500_000,
    pricePerSqmMedian: 5556,
    transactionCount: 5,
    floorAreaRange: [80, 100],
    leaseCommenceRange: options.leaseCommenceRange ?? [1990, 1990],
    latestMonth: "2026-01",
    availableDateRange: ["2023-01", "2026-01"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
    nearestMrt: options.nearestMrt ?? null,
  };
}

function makeItem(
  addressKey: string,
  targetPrice: number | null = null,
  addedAt = "2026-01-01T00:00:00Z",
): ShortlistItem {
  return { addressKey, notes: "", targetPrice, addedAt };
}

function makeRow(
  addressKey: string,
  options: Parameters<typeof makeBlock>[1] = {},
  targetPrice: number | null = null,
  addedAt?: string,
): ShortlistRow {
  return {
    item: makeItem(addressKey, targetPrice, addedAt),
    block: makeBlock(addressKey, options),
    detailSummary: null,
    monthlyTrend: [],
    comparison: null,
  };
}

type TestOptions = Omit<UseShortlistDrawerControllerOptions, "locale" | "t">;

function makeOptions(overrides: Partial<TestOptions> = {}): TestOptions {
  return {
    isOpen: true,
    rows: [makeRow("addr-a")],
    filters: DEFAULT_FILTERS,
    remainingLeaseMin: null,
    isDark: false,
    onRemove: vi.fn(),
    onRestore: vi.fn(() => true),
    ...overrides,
  };
}

function renderController(options: TestOptions) {
  return renderHook(
    () => {
      const { locale, t } = useI18n();
      return useShortlistDrawerController({ ...options, locale, t });
    },
    { wrapper: I18nProvider },
  );
}

function installClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("useShortlistDrawerController", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in list view with the most recently saved row first", () => {
    const rows = [
      makeRow("addr-older", { medianPrice: 600_000 }, 550_000, "2026-01-01T00:00:00Z"),
      makeRow("addr-newer", {}, 490_000, "2026-02-01T00:00:00Z"),
    ];
    const { result } = renderController(makeOptions({ rows }));

    expect(result.current.viewMode).toBe("list");
    expect(result.current.compareMode).toBe("recent");
    expect(result.current.rankedRows.map((row) => row.item.addressKey)).toEqual([
      "addr-newer",
      "addr-older",
    ]);
  });

  it("reranks and rebuilds comparison rows when compare mode changes", () => {
    const rows = [
      makeRow("addr-expensive", { medianPrice: 700_000 }, null),
      makeRow("addr-cheap", { medianPrice: 400_000 }, null),
    ];
    const { result } = renderController(makeOptions({ rows }));

    act(() => result.current.setCompareMode("median-desc"));

    expect(result.current.rankedRows.map((row) => row.item.addressKey)).toEqual([
      "addr-expensive",
      "addr-cheap",
    ]);
    expect(result.current.comparisonRows.map((row) => row.addressKey)).toEqual([
      "addr-expensive",
      "addr-cheap",
    ]);
  });

  it("builds lease-signal lookup data for every row", () => {
    const row = makeRow("addr-old", { leaseCommenceRange: [1950, 1950] });
    const { result } = renderController(makeOptions({ rows: [row], remainingLeaseMin: 80 }));

    expect(
      result.current.leaseSignalsByAddressKey.get("addr-old")?.map((signal) => signal.key),
    ).toEqual(["lease.signal.veryShort", "lease.signal.oldCommence", "lease.signal.belowFilter"]);
  });

  it("keeps offer forms collapsed initially and after an empty-to-non-empty transition", async () => {
    const options = makeOptions({ rows: [] });
    const { result, rerender } = renderController(options);

    expect(result.current.effectiveExpandedKey).toBeNull();

    options.rows = [makeRow("addr-first")];
    rerender();

    await waitFor(() => expect(result.current.effectiveExpandedKey).toBeNull());
  });

  it("collapses the offer form when its expanded row is removed", async () => {
    const first = makeRow("addr-first");
    const second = makeRow("addr-second");
    const options = makeOptions({ rows: [first, second] });
    const { result, rerender } = renderController(options);

    act(() => result.current.setExpandedKey("addr-second"));
    options.rows = [first];
    rerender();

    await waitFor(() => expect(result.current.effectiveExpandedKey).toBeNull());
  });

  it("keeps a deliberate collapse across unrelated rerenders", () => {
    const options = makeOptions();
    const { result, rerender } = renderController(options);

    act(() => result.current.setExpandedKey(null));
    options.filters = { ...DEFAULT_FILTERS, town: "BEDOK" };
    rerender();

    expect(result.current.effectiveExpandedKey).toBeNull();
  });

  it("clears share errors when closing and when row membership changes", async () => {
    const first = makeRow("addr-first");
    const second = makeRow("addr-second");
    const options = makeOptions({ rows: [first] });
    const { result, rerender } = renderController(options);

    act(() => result.current.setShareError("too large"));
    options.isOpen = false;
    rerender();
    await waitFor(() => expect(result.current.shareError).toBeNull());

    options.isOpen = true;
    act(() => result.current.setShareError("too large"));
    options.rows = [first, second];
    rerender();
    await waitFor(() => expect(result.current.shareError).toBeNull());
  });

  it("removes the correct item with its original index and restores it on undo", () => {
    const first = makeRow("addr-first");
    const second = makeRow("addr-second");
    const onRemove = vi.fn();
    const onRestore = vi.fn(() => true);
    const { result } = renderController(
      makeOptions({ rows: [first, second], onRemove, onRestore }),
    );

    act(() => result.current.handleRemove("addr-second"));

    expect(onRemove).toHaveBeenCalledWith("addr-second");
    expect(result.current.pendingRemoval).toMatchObject({
      item: second.item,
      index: 1,
      label: "addr-second BEDOK NTH AVE 1",
    });

    act(() => result.current.undoRemoval());

    expect(onRestore).toHaveBeenCalledWith(second.item, 1);
    expect(result.current.pendingRemoval).toBeNull();
    expect(result.current.restoreError).toBe(false);
  });

  it("delegates removal without creating local undo state in external mode", () => {
    const onRemove = vi.fn();
    const onRestore = vi.fn(() => true);
    const { result } = renderController(
      makeOptions({
        rows: [makeRow("addr-first")],
        onRemove,
        onRestore,
        removalMode: "external",
      }),
    );

    act(() => result.current.handleRemove("addr-first"));

    expect(onRemove).toHaveBeenCalledWith("addr-first");
    expect(onRestore).not.toHaveBeenCalled();
    expect(result.current.pendingRemoval).toBeNull();
  });

  it("keeps unresolved saved items removable and restorable in local undo mode", () => {
    const unresolvedItem = makeItem("retired-block");
    const onRemove = vi.fn();
    const onRestore = vi.fn(() => true);
    const { result } = renderController(
      makeOptions({
        rows: [],
        unresolvedItems: [unresolvedItem],
        onRemove,
        onRestore,
      }),
    );

    act(() => result.current.handleRemove("retired-block"));

    expect(onRemove).toHaveBeenCalledWith("retired-block");
    expect(result.current.pendingRemoval).toMatchObject({
      item: unresolvedItem,
      index: 0,
      label: "retired-block",
    });

    act(() => result.current.undoRemoval());

    expect(onRestore).toHaveBeenCalledWith(unresolvedItem, 0);
    expect(result.current.pendingRemoval).toBeNull();
  });

  it("returns to list view when fewer than two resolved rows remain", async () => {
    const first = makeRow("addr-first");
    const second = makeRow("addr-second");
    const options = makeOptions({ rows: [first, second] });
    const { result, rerender } = renderController(options);

    act(() => result.current.setViewMode("compare"));
    expect(result.current.viewMode).toBe("compare");

    options.rows = [first];
    rerender();

    await waitFor(() => expect(result.current.viewMode).toBe("list"));
  });

  it("builds a share URL with the existing filter state and blocks oversized payloads", () => {
    const shareOptions = makeOptions({
      filters: { ...DEFAULT_FILTERS, town: "BEDOK" },
    });
    const { result } = renderController(shareOptions);

    expect(result.current.shareUrl).toContain("shortlist=");
    expect(result.current.shareUrl).toContain("town=BEDOK");
    expect(result.current.shareBlocked).toBe(false);

    const oversized = makeRow("oversized");
    oversized.item.notes = "x".repeat(10_001);
    const oversizedResult = renderController(makeOptions({ rows: [oversized] }));
    expect(oversizedResult.result.current.shareUrl).toBe("");
    expect(oversizedResult.result.current.shareBlocked).toBe(true);
  });

  it("keeps unavailable entries in share links and blocks oversized unavailable payloads", () => {
    const unavailable = {
      ...makeItem("retired-block", 480_000),
      notes: "Keep this buyer note",
      askingPrice: 510_000,
    };
    const { result } = renderController(
      makeOptions({
        rows: [makeRow("addr-live")],
        unresolvedItems: [unavailable],
      }),
    );
    const encoded = new URL(result.current.shareUrl).searchParams.get("shortlist");

    expect(encoded).not.toBeNull();
    expect(decodeShortlistFromUrl(encoded ?? "").map((item) => item.addressKey)).toEqual([
      "addr-live",
      "retired-block",
    ]);
    expect(decodeShortlistFromUrl(encoded ?? "")[1]).toMatchObject(unavailable);

    const oversizedUnavailable = {
      ...unavailable,
      notes: "x".repeat(10_001),
    };
    const oversizedResult = renderController(
      makeOptions({ rows: [], unresolvedItems: [oversizedUnavailable] }),
    );
    expect(oversizedResult.result.current.shareUrl).toBe("");
    expect(oversizedResult.result.current.shareBlocked).toBe(true);
  });

  it("keeps unavailable entries and their saved fields in CSV", () => {
    const unavailable = {
      ...makeItem("retired-block", 480_000),
      notes: "Keep this buyer note",
      askingPrice: 510_000,
    };
    const { result } = renderController(makeOptions({ unresolvedItems: [unavailable] }));
    const header = result.current.csvExport.getContent().split("\n", 1)[0] ?? "";
    const csv = result.current.csvExport.getContent();

    expect(result.current.csvExport.filename).toBe("hdb-shortlist.csv");
    expect(header.split(",")).toHaveLength(28);
    expect(header.indexOf('"Data Status"')).toBeLessThan(header.indexOf('"Saved Address Key"'));
    expect(header.indexOf('"Saved Address Key"')).toBeLessThan(header.indexOf('"Address"'));
    expect(header.indexOf('"Address"')).toBeLessThan(header.indexOf('"Block Median Price"'));
    expect(header.indexOf('"Block Median Price"')).toBeLessThan(header.indexOf('"Asking Price"'));
    expect(header.indexOf('"Asking Price"')).toBeLessThan(header.indexOf('"Notes"'));
    expect(csv).toContain('"Unavailable in current data","retired-block",,,' + "510000");
    expect(csv).toContain("480000");
    expect(csv).toContain('"Keep this buyer note"');
  });

  it("keeps unavailable entries in the Markdown summary and the two-second copied state", async () => {
    vi.useFakeTimers();
    const writeText = installClipboard();
    const unavailable = makeItem("retired|block", 480_000);
    const { result } = renderController(makeOptions({ unresolvedItems: [unavailable] }));

    await act(async () => {
      result.current.copySummary();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "| Data Status | Saved Address Key | Address | Block Median Price | Target Price |",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "| Unavailable in current data | retired\\|block | - | - | $480,000 |",
      ),
    );
    expect(result.current.copiedKey).toBe("summary");

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.copiedKey).toBe("summary");
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.copiedKey).toBeNull();
  });

  it("clears the copied timer on unmount", async () => {
    vi.useFakeTimers();
    installClipboard();
    const { result, unmount } = renderController(makeOptions());

    await act(async () => {
      result.current.copySummary();
      await Promise.resolve();
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("exports JSON in current ranked-row order without dropping unavailable entries", async () => {
    const blobs: Blob[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:shortlist";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const rows = [
      makeRow("addr-far", { medianPrice: 600_000 }, 550_000),
      makeRow("addr-close", {}, 490_000),
    ];
    const unavailable = {
      ...makeItem("retired-block", 470_000),
      notes: "Raw saved note",
      askingPrice: 520_000,
    };
    const { result } = renderController(makeOptions({ rows, unresolvedItems: [unavailable] }));

    act(() => result.current.exportJson());

    expect(blobs).toHaveLength(1);
    const exported = JSON.parse(await blobs[0].text()) as ShortlistItem[];
    expect(exported.map((item) => item.addressKey)).toEqual([
      "addr-close",
      "addr-far",
      "retired-block",
    ]);
    expect(exported[2]).toEqual(unavailable);
  });

  it("keeps highlight selection and trend chart model stable", () => {
    const cheapest = makeRow(
      "addr-cheapest",
      { medianPrice: 400_000, leaseCommenceRange: [1990, 1990] },
      null,
    );
    const longest = makeRow("addr-longest", {
      medianPrice: 500_000,
      leaseCommenceRange: [2000, 2000],
      nearestMrt: { stationName: "BEDOK", distanceMeters: 600, walkingTimeSeconds: 300 },
    });
    const closest = makeRow("addr-closest", {
      medianPrice: 600_000,
      leaseCommenceRange: [1995, 1995],
      nearestMrt: { stationName: "TANAH MERAH", distanceMeters: 300, walkingTimeSeconds: 180 },
    });
    cheapest.monthlyTrend = [
      { month: "2026-02", medianPrice: 405_000, transactionCount: 1, medianPricePerSqm: 5000 },
    ];
    longest.monthlyTrend = [
      { month: "2026-01", medianPrice: 500_000, transactionCount: 1, medianPricePerSqm: 6000 },
    ];
    const { result } = renderController(makeOptions({ rows: [cheapest, longest, closest] }));

    expect(result.current.highlights.map((highlight) => highlight.row?.item.addressKey)).toEqual([
      "addr-cheapest",
      "addr-longest",
      "addr-closest",
    ]);
    expect(result.current.compareChart).not.toBeNull();

    closest.monthlyTrend = [
      { month: "2026-02", medianPrice: 600_000, transactionCount: 1, medianPricePerSqm: 7000 },
    ];
    expect(
      renderController(makeOptions({ rows: [cheapest, longest, closest] })).result.current
        .compareChart,
    ).toMatchObject({
      seriesKeys: [
        "addr-cheapest BEDOK NTH AVE 1",
        "addr-longest BEDOK NTH AVE 1",
        "addr-closest BEDOK NTH AVE 1",
      ],
      palette: ["#2563eb", "#3a8a6f", "#d97706", "#c026d3"],
    });
  });

  it("suppresses comparative superlatives until at least two homes are saved", () => {
    const { result } = renderController(makeOptions({ rows: [makeRow("addr-only")] }));

    expect(result.current.highlights).toEqual([]);
  });

  it("keeps checklist state and toggling wired through the controller", () => {
    const { result } = renderController(makeOptions());

    act(() => result.current.toggleChecklist("addr-a", "noise"));

    expect(result.current.checklistState["addr-a"]).toContain("noise");
  });
});
