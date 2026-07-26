import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { AmenityLayersControl } from "@/features/map-explorer/AmenityLayersControl";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Translator } from "@/shared/lib/i18n";

const t: Translator = (key) => {
  const messages: Record<string, string> = {
    "amenity.label": "Amenities",
    "amenity.mrt": "MRT",
    "amenity.schools": "Up to 3 primary schools",
    "amenity.schoolsHint": "select a block",
    "schoolOverlay.loading": "Loading nearby schools for the selected block.",
    "schoolOverlay.enable": "Show up to 3 nearest primary school markers",
    "schoolOverlay.disable": "Hide up to 3 nearest primary school markers",
    "schoolOverlay.unavailable": "Select a block to show up to 3 nearest primary school markers.",
    "schoolOverlay.noSchoolsNearby":
      "No primary schools within 2km with map coordinates for this block.",
  };
  return messages[key] ?? key;
};

function renderControl(overrides: Partial<ComponentProps<typeof AmenityLayersControl>> = {}) {
  const onToggleMrt = vi.fn();
  const onToggleSchoolOverlay = vi.fn();

  const result = render(
    <TooltipProvider>
      <AmenityLayersControl
        mrtEnabled={false}
        schoolOverlayEnabled={false}
        schoolOverlayAvailable={true}
        schoolOverlayLoading={false}
        hasBlockSelection={true}
        onToggleMrt={onToggleMrt}
        onToggleSchoolOverlay={onToggleSchoolOverlay}
        t={t}
        {...overrides}
      />
    </TooltipProvider>,
  );

  return { ...result, onToggleMrt, onToggleSchoolOverlay };
}

describe("AmenityLayersControl", () => {
  it("toggles a single MRT layer control and reflects aria-checked state", async () => {
    const user = userEvent.setup();
    const { onToggleMrt, rerender } = renderControl({ mrtEnabled: false });

    const mrtSwitch = screen.getByRole("switch", { name: "MRT" });
    expect(mrtSwitch).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("switch", { name: /MRT Stations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /MRT Exits/i })).not.toBeInTheDocument();

    await user.click(mrtSwitch);
    expect(onToggleMrt).toHaveBeenCalledTimes(1);

    rerender(
      <TooltipProvider>
        <AmenityLayersControl
          mrtEnabled={true}
          schoolOverlayEnabled={false}
          schoolOverlayAvailable={true}
          schoolOverlayLoading={false}
          hasBlockSelection={true}
          onToggleMrt={onToggleMrt}
          onToggleSchoolOverlay={vi.fn()}
          t={t}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("switch", { name: "MRT" })).toHaveAttribute("aria-checked", "true");
  });

  it("separates coarse-pointer hit areas from the visual switch tracks", () => {
    renderControl();
    const mrtSwitch = screen.getByRole("switch", { name: "MRT" });
    const track = mrtSwitch.firstElementChild;

    expect(mrtSwitch).toHaveAttribute("data-touch-target");
    expect(mrtSwitch).toHaveClass("h-7", "w-11");
    expect(track).toHaveClass("h-6", "w-10", "rounded-full");
  });

  it("disables the school overlay switch while loading", () => {
    renderControl({ schoolOverlayLoading: true });

    const schoolSwitch = screen.getByRole("switch", {
      name: "Loading nearby schools for the selected block.",
    });
    expect(schoolSwitch).toBeDisabled();
    expect(schoolSwitch).toHaveAttribute("aria-checked", "false");
    expect(schoolSwitch).toHaveAttribute("aria-busy", "true");
  });

  it("preserves the enabled school state while loading", () => {
    renderControl({ schoolOverlayEnabled: true, schoolOverlayLoading: true });

    const schoolSwitch = screen.getByRole("switch", {
      name: "Loading nearby schools for the selected block.",
    });
    expect(schoolSwitch).toBeDisabled();
    expect(schoolSwitch).toHaveAttribute("aria-checked", "true");
    expect(schoolSwitch).toHaveAttribute("aria-busy", "true");
  });

  it("shows the unavailable school label when no block is selected", () => {
    renderControl({
      schoolOverlayEnabled: true,
      hasBlockSelection: false,
      schoolOverlayAvailable: false,
    });

    expect(screen.getByText(/select a block/i)).toBeInTheDocument();
    const schoolSwitch = screen.getByRole("switch", {
      name: "Select a block to show up to 3 nearest primary school markers.",
    });
    expect(schoolSwitch).toBeDisabled();
    expect(schoolSwitch).toHaveAttribute("aria-checked", "false");
    expect(schoolSwitch.firstElementChild).toHaveClass("bg-muted-foreground/30");
  });

  it("renders an unavailable selected block as inactive even when the saved preference is on", () => {
    renderControl({
      schoolOverlayEnabled: true,
      schoolOverlayAvailable: false,
      hasBlockSelection: true,
    });

    const schoolSwitch = screen.getByRole("switch", {
      name: "No primary schools within 2km with map coordinates for this block.",
    });
    expect(schoolSwitch).toBeDisabled();
    expect(schoolSwitch).toHaveAttribute("aria-checked", "false");
    expect(schoolSwitch.firstElementChild).toHaveClass("bg-muted-foreground/30");
  });
});
