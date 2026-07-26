import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceHeatmapControl } from "@/features/map-explorer/PriceHeatmapControl";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Translator } from "@/shared/lib/i18n";

const t: Translator = (key) => key;

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

function ControlledMode({ initialMode }: { initialMode: "price" | "perSqm" }) {
  const [mode, setMode] = useState(initialMode);
  return (
    <PriceHeatmapControl {...baseProps} hasScope isEnabled mode={mode} onModeChange={setMode} />
  );
}

const baseProps = {
  isEnabled: false,
  opacity: 0.7,
  mode: "price" as const,
  onToggle: vi.fn(),
  onOpacityChange: vi.fn(),
  onModeChange: vi.fn(),
  t,
};

describe("PriceHeatmapControl — hasScope=false", () => {
  it("renders the toggle button as disabled", () => {
    renderWithProviders(<PriceHeatmapControl {...baseProps} hasScope={false} />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeDisabled();
  });

  it("sets aria-checked to false regardless of isEnabled", () => {
    renderWithProviders(<PriceHeatmapControl {...baseProps} isEnabled={true} hasScope={false} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("does not call onToggle when clicked via keyboard", async () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <PriceHeatmapControl {...baseProps} hasScope={false} onToggle={onToggle} />,
    );
    await userEvent.click(screen.getByRole("switch"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("hides mode buttons and opacity slider even if isEnabled is true", () => {
    renderWithProviders(<PriceHeatmapControl {...baseProps} isEnabled={true} hasScope={false} />);
    expect(screen.queryByText("heatmap.modePrice")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});

describe("PriceHeatmapControl — hasScope=true", () => {
  it("renders the toggle button as enabled", () => {
    renderWithProviders(<PriceHeatmapControl {...baseProps} hasScope={true} />);
    expect(screen.getByRole("switch")).not.toBeDisabled();
  });

  it("separates the coarse-pointer hit area from the visual switch track", () => {
    renderWithProviders(<PriceHeatmapControl {...baseProps} hasScope={true} />);
    const toggle = screen.getByRole("switch");
    const track = toggle.firstElementChild;

    expect(toggle).toHaveAttribute("data-touch-target");
    expect(toggle).toHaveClass("size-7");
    expect(track).toHaveClass("h-4", "w-7", "rounded-full");
  });

  it("sets aria-checked to true when isEnabled and hasScope", () => {
    renderWithProviders(<PriceHeatmapControl {...baseProps} isEnabled={true} hasScope={true} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    renderWithProviders(<PriceHeatmapControl {...baseProps} hasScope={true} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows mode buttons and opacity slider when isEnabled and hasScope", () => {
    renderWithProviders(<PriceHeatmapControl {...baseProps} isEnabled={true} hasScope={true} />);
    expect(screen.getByText("heatmap.modePrice")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it.each([
    ["price", "{ArrowRight}", "perSqm"],
    ["price", "{ArrowDown}", "perSqm"],
    ["price", "{ArrowLeft}", "perSqm"],
    ["price", "{ArrowUp}", "perSqm"],
    ["perSqm", "{ArrowRight}", "price"],
    ["perSqm", "{ArrowDown}", "price"],
    ["perSqm", "{ArrowLeft}", "price"],
    ["perSqm", "{ArrowUp}", "price"],
    ["perSqm", "{Home}", "price"],
    ["price", "{End}", "perSqm"],
  ] as const)("moves and wraps from %s with %s", async (initialMode, key, expectedMode) => {
    const user = userEvent.setup();
    renderWithProviders(<ControlledMode initialMode={initialMode} />);
    const initial = screen.getByRole("radio", {
      name: initialMode === "price" ? "heatmap.modePrice" : "heatmap.modePerSqm",
    });
    initial.focus();

    await user.keyboard(key);

    const expected = screen.getByRole("radio", {
      name: expectedMode === "price" ? "heatmap.modePrice" : "heatmap.modePerSqm",
    });
    expect(expected).toHaveAttribute("aria-checked", "true");
    expect(expected).toHaveFocus();
  });
});
