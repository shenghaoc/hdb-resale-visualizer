import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { SearchProfileWizard } from "@/features/search-profile/SearchProfileWizard";
import { formatCompactCurrency } from "@/shared/lib/format";
import { I18nProvider } from "@/shared/lib/i18n";
import type { FilterOptions } from "@/types/data";

vi.mock("@/shared/lib/storage", () => ({
  safeStorage: {
    getItem: (key: string) => (key === "hdb-resale-locale" ? "zh-SG" : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

const options: FilterOptions = {
  towns: ["BEDOK"],
  flatTypes: ["4 ROOM"],
  flatModels: [],
};

describe("SearchProfileWizard locale presentation", () => {
  it("uses localized compact currency and accessible field names in zh-SG", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <SearchProfileWizard options={options} onComplete={vi.fn()} onSkip={vi.fn()} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));

    expect(screen.getByRole("spinbutton", { name: "最高预算（新元）" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: formatCompactCurrency(1_200_000, "zh-SG") }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("spinbutton", { name: "最低剩余地契（年）" })).toBeVisible();
  });
});
