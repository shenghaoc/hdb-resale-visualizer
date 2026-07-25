import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { MobileTabBar } from "@/components/MobileTabBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Translator } from "@/shared/lib/i18n";

const t: Translator = (key) => key;

describe("MobileTabBar", () => {
  it("makes the map an explicit primary destination without a Guide item", async () => {
    const user = userEvent.setup();
    const onMapClick = vi.fn();

    render(
      <TooltipProvider>
        <MobileTabBar
          mobileTab={null}
          shortlistCount={0}
          theme="light"
          t={t}
          onMapClick={onMapClick}
          onFiltersClick={vi.fn()}
          onResultsClick={vi.fn()}
          onCheckClick={vi.fn()}
          onSavedClick={vi.fn()}
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>,
    );

    const mapButton = screen.getByRole("button", { name: "tab.map" });
    expect(mapButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "app.openGuide" })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("mobile-tab-bar")).getAllByRole("button")).toHaveLength(6);

    await user.click(mapButton);
    expect(onMapClick).toHaveBeenCalledTimes(1);
  });
});
