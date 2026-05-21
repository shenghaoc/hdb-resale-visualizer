import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterChipsBar, type FilterChip } from "@/components/FilterChipsBar";
import type { Translator } from "@/lib/i18n";

const t: Translator = (key, vars) => {
  if (key === "filters.title") return "Filters";
  if (key === "filters.removeChip") return `Remove filter: ${vars?.label ?? ""}`;
  if (key === "filters.openPanel") return "Open filters panel";
  if (key === "tab.filters") return "Filters";
  return key;
};

function renderFilterChipsBar(chips: FilterChip[]) {
  const onOpenFilters = vi.fn();
  const result = render(
    <FilterChipsBar chips={chips} isDesktop={false} t={t} onOpenFilters={onOpenFilters} />,
  );

  return { ...result, onOpenFilters };
}

describe("FilterChipsBar", () => {
  it("exposes removable chips and the filters action as toolbar buttons", async () => {
    const user = userEvent.setup();
    const removeTown = vi.fn();
    const removeFlatType = vi.fn();
    const { onOpenFilters } = renderFilterChipsBar([
      { key: "town", label: "Town · BEDOK", onRemove: removeTown },
      { key: "flatType", label: "4 ROOM", onRemove: removeFlatType },
    ]);

    expect(screen.getByRole("toolbar", { name: "Filters" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove filter: Town · BEDOK" }));
    expect(removeTown).toHaveBeenCalledTimes(1);
    expect(removeFlatType).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open filters panel" }));
    expect(onOpenFilters).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when there are no chips", () => {
    renderFilterChipsBar([]);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("renders nothing when hidden is true, even with chips present", () => {
    render(
      <FilterChipsBar
        chips={[{ key: "town", label: "BEDOK", onRemove: vi.fn() }]}
        isDesktop={true}
        t={t}
        onOpenFilters={vi.fn()}
        hidden={true}
      />,
    );
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("renders chips when hidden is false on desktop", () => {
    render(
      <FilterChipsBar
        chips={[{ key: "town", label: "BEDOK", onRemove: vi.fn() }]}
        isDesktop={true}
        t={t}
        onOpenFilters={vi.fn()}
        hidden={false}
      />,
    );
    expect(screen.getByRole("toolbar", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter: BEDOK" })).toBeInTheDocument();
  });

  it("keeps keyboard focus in a wrapping roving tab order", async () => {
    const user = userEvent.setup();
    renderFilterChipsBar([
      { key: "town", label: "Town · BEDOK", onRemove: vi.fn() },
      { key: "flatType", label: "4 ROOM", onRemove: vi.fn() },
    ]);

    const townChip = screen.getByRole("button", { name: "Remove filter: Town · BEDOK" });
    const flatTypeChip = screen.getByRole("button", { name: "Remove filter: 4 ROOM" });
    const filtersButton = screen.getByRole("button", { name: "Open filters panel" });

    const assertTabIndices = (town: "0" | "-1", flatType: "0" | "-1", filters: "0" | "-1") => {
      expect(townChip).toHaveAttribute("tabindex", town);
      expect(flatTypeChip).toHaveAttribute("tabindex", flatType);
      expect(filtersButton).toHaveAttribute("tabindex", filters);
    };

    assertTabIndices("0", "-1", "-1");

    townChip.focus();
    await user.keyboard("{ArrowRight}");
    expect(flatTypeChip).toHaveFocus();
    assertTabIndices("-1", "0", "-1");

    await user.keyboard("{End}");
    expect(filtersButton).toHaveFocus();
    assertTabIndices("-1", "-1", "0");

    await user.keyboard("{ArrowRight}");
    expect(townChip).toHaveFocus();
    assertTabIndices("0", "-1", "-1");

    await user.keyboard("{ArrowLeft}");
    expect(filtersButton).toHaveFocus();
    assertTabIndices("-1", "-1", "0");

    await user.keyboard("{Home}");
    expect(townChip).toHaveFocus();
    assertTabIndices("0", "-1", "-1");

    await user.keyboard("{ArrowDown}");
    expect(flatTypeChip).toHaveFocus();
    assertTabIndices("-1", "0", "-1");

    await user.keyboard("{ArrowUp}");
    expect(townChip).toHaveFocus();
    assertTabIndices("0", "-1", "-1");
  });
});
