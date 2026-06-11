import { describe, expect, it, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceHeatmapControl } from "@/components/PriceHeatmapControl";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Translator } from "@/shared/lib/i18n";

const t: Translator = (key) => key;

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
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
});
