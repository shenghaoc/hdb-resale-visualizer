import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { MapSkeleton } from "@/features/map-explorer/MapSkeleton";
import { I18nProvider } from "@/shared/lib/i18n";

vi.mock("@/shared/lib/storage", () => ({
  safeStorage: {
    getItem: (key: string) => (key === "hdb-resale-locale" ? "zh-SG" : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

describe("MapSkeleton locale presentation", () => {
  it("renders the map-loading state in zh-SG", () => {
    render(
      <I18nProvider>
        <MapSkeleton />
      </I18nProvider>,
    );

    expect(screen.getByTestId("map-skeleton")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("正在加载地图…")).toBeVisible();
    expect(screen.queryByText("Loading map…")).toBeNull();
  });
});
