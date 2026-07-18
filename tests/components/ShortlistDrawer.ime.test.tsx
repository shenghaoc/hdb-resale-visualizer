/**
 * Integration tests — ShortlistDrawer IME composition handling.
 *
 * Renders ShortlistDrawer with a single expanded row, simulates IME
 * composition on the notes textarea and target price input, and verifies
 * that onUpdate is NOT called during composition but IS called once on commit.
 *
 * _Requirements: 2.2, 2.3, 3.2, 3.3_
 */
import { describe, expect, it, vi } from "vite-plus/test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShortlistDrawer } from "@/components/ShortlistDrawer";
import { DEFAULT_FILTERS } from "@/shared/lib/constants";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import type { BlockSummary, ComparisonArtifact, ShortlistItem } from "@/types/data";

const mockBlock: BlockSummary = {
  addressKey: "test-block",
  town: "Ang Mo Kio",
  block: "101",
  streetName: "Ang Mo Kio Ave 3",
  coordinates: { lat: 1.3521, lng: 103.8198 },
  medianPrice: 500000,
  pricePerSqmMedian: 6250,
  transactionCount: 10,
  floorAreaRange: [70, 90],
  leaseCommenceRange: [1990, 2000],
  latestMonth: "2024-01",
  availableDateRange: ["2023-01", "2024-01"],
  flatTypes: ["3 ROOM"],
  flatModels: ["Model A"],
  nearestMrt: {
    stationName: "Ang Mo Kio",
    distanceMeters: 500,
    walkingTimeSeconds: 400,
  },
};

const mockShortlistItem: ShortlistItem = {
  addressKey: "test-block",
  notes: "",
  targetPrice: null,
  addedAt: "2024-01-01T00:00:00Z",
};

const mockComparison: ComparisonArtifact = {
  addressKey: "test-block",
  town: "Ang Mo Kio",
  flatType: "3 ROOM",
  amenities: {
    primarySchoolsWithin1km: 2,
    primarySchoolsWithin2km: 5,
    nearestPrimarySchoolMeters: 300,
    nearestPrimarySchools: [{ name: "ANG MO KIO PRIMARY SCHOOL", distanceMeters: 300 }],
    hawkerCentresWithin1km: 1,
    nearestHawkerCentreMeters: 400,
    supermarketsWithin1km: 3,
    nearestSupermarketMeters: 200,
    parksWithin1km: 2,
    nearestParkMeters: 150,
  },
  percentileRanks: {
    pricePercentile: 25.5,
    pricePerSqmPercentile: 30.2,
    leasePercentile: 75.8,
    mrtDistancePercentile: 60.1,
    transactionCountPercentile: 45.3,
    recencyPercentile: 80.9,
  },
  generatedAt: "2024-01-01T00:00:00Z",
};

const mockRow = {
  item: mockShortlistItem,
  block: mockBlock,
  detailSummary: null,
  monthlyTrend: [],
  comparison: mockComparison,
};

function renderDrawer(onUpdate = vi.fn()) {
  const result = render(
    <I18nProvider>
      <ShortlistDrawer
        isOpen={true}
        filters={DEFAULT_FILTERS}
        remainingLeaseMin={null}
        rows={[mockRow]}
        onToggleOpen={() => {}}
        onRemove={() => {}}
        onRestore={() => {}}
        onUpdate={onUpdate}
        onSelectAddress={() => {}}
      />
    </I18nProvider>,
  );

  return { ...result, onUpdate };
}

describe("ShortlistDrawer — IME composition on notes textarea", () => {
  it("does not call onUpdate during composition, calls once on commit", () => {
    const onUpdate = vi.fn();
    renderDrawer(onUpdate);

    const notesTextarea = screen.getByLabelText("Notes");

    // Start IME composition
    fireEvent.compositionStart(notesTextarea);

    // Intermediate keystrokes (Korean jamo composition)
    fireEvent.change(notesTextarea, { target: { value: "ㅎ" } });
    fireEvent.change(notesTextarea, { target: { value: "하" } });
    fireEvent.change(notesTextarea, { target: { value: "한" } });

    // onUpdate should NOT have been called during composition
    expect(onUpdate).not.toHaveBeenCalled();

    // User commits the composed text
    Object.defineProperty(notesTextarea, "value", {
      writable: true,
      value: "한글",
    });
    fireEvent.compositionEnd(notesTextarea, { data: "한글" });

    // onUpdate should be called exactly once with the committed value
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith("test-block", { notes: "한글" });
  });
});

describe("ShortlistDrawer — IME composition on target price input", () => {
  it("does not call onUpdate during composition, calls once on commit", () => {
    const onUpdate = vi.fn();
    renderDrawer(onUpdate);

    const priceInput = screen.getByLabelText("Your target price");

    // Start IME composition (some mobile IMEs do this for number input)
    fireEvent.compositionStart(priceInput);

    // Intermediate keystrokes
    fireEvent.change(priceInput, { target: { value: "5" } });
    fireEvent.change(priceInput, { target: { value: "50" } });

    // onUpdate should NOT have been called during composition
    expect(onUpdate).not.toHaveBeenCalled();

    // User commits
    Object.defineProperty(priceInput, "value", {
      writable: true,
      value: "500000",
    });
    fireEvent.compositionEnd(priceInput, { data: "500000" });

    // onUpdate should be called exactly once with the committed value (converted to number)
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith("test-block", { targetPrice: 500000 });
  });
});
