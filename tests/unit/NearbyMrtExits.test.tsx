import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NearbyMrtExits } from "@/features/block-detail/NearbyMrtExits";
import type { PrecomputedMrtExit } from "@shared/data-types";
import { I18nProvider } from "@/shared/lib/i18n";

const first: PrecomputedMrtExit = {
  stationName: "BUGIS MRT STATION",
  exitLabel: "E",
  distanceMeters: 83.2,
  exitId: "mrt_geojson:mrt_exit:101",
};
const renderPanel = (exits?: readonly PrecomputedMrtExit[]) =>
  render(
    <I18nProvider>
      <NearbyMrtExits exits={exits} />
    </I18nProvider>,
  );

describe("published nearby MRT exits", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows nothing when the detail document is from an older publication", () => {
    renderPanel();
    expect(screen.queryByTestId("nearby-mrt-exits")).not.toBeInTheDocument();
  });

  it("shows published stations on expansion with no additional fetch", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderPanel([first]);
    const toggle = screen.getByRole("button", { name: "View nearby MRT exits" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("BUGIS MRT STATION")).toBeInTheDocument();
    expect(screen.getByText(/E · 83/)).toBeInTheDocument();
    expect(screen.getByText("Straight-line distances; actual walking routes may be longer.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("distinguishes an authoritative empty list from an absent older field", () => {
    renderPanel([]);
    expect(screen.getByTestId("nearby-mrt-exits")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View nearby MRT exits" }));
    expect(screen.getByText("No station exits found within 1.5 km.")).toBeInTheDocument();
  });

  it("preserves source-native short exit codes and ordering", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      ...first,
      exitId: "mrt_geojson:mrt_exit:" + i,
      stationName: "STATION " + i,
      exitLabel: i === 0 ? "E" : "Exit " + i,
      distanceMeters: i * 100 + 83.2,
    }));
    renderPanel(rows);
    fireEvent.click(screen.getByRole("button", { name: "View nearby MRT exits" }));
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("STATION 0"),
      expect.stringContaining("STATION 1"),
      expect.stringContaining("STATION 2"),
      expect.stringContaining("STATION 3"),
      expect.stringContaining("STATION 4"),
    ]);
    expect(items[0].textContent).toContain("E ·");
  });
});
