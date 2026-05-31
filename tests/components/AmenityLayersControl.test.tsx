import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AmenityLayersControl } from "@/components/AmenityLayersControl";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Translator } from "@/lib/i18n";

const t: Translator = (key) => {
  const messages: Record<string, string> = {
    "amenity.label": "Amenities",
    "amenity.mrtStations": "MRT Stations",
    "amenity.mrtExits": "MRT Exits",
    "amenity.schools": "Schools",
    "amenity.schoolsHint": "select a block",
    "schoolOverlay.loading": "Loading nearby schools for the selected block.",
    "schoolOverlay.enable": "Show nearby primary school markers",
    "schoolOverlay.disable": "Hide nearby primary school markers",
    "schoolOverlay.unavailable": "Select a block to show nearby primary school markers.",
    "schoolOverlay.noSchoolsNearby": "No primary schools within 2km with map coordinates for this block.",
  };
  return messages[key] ?? key;
};

function renderControl(
  overrides: Partial<ComponentProps<typeof AmenityLayersControl>> = {},
) {
  const onToggleMrtStations = vi.fn();
  const onToggleMrtExits = vi.fn();
  const onToggleSchoolOverlay = vi.fn();

  const result = render(
    <TooltipProvider>
    <AmenityLayersControl
      mrtStationsEnabled={false}
      mrtExitsEnabled={false}
      schoolOverlayEnabled={false}
      schoolOverlayAvailable={true}
      schoolOverlayLoading={false}
      hasBlockSelection={true}
      onToggleMrtStations={onToggleMrtStations}
      onToggleMrtExits={onToggleMrtExits}
      onToggleSchoolOverlay={onToggleSchoolOverlay}
      t={t}
      {...overrides}
    />
    </TooltipProvider>,
  );

  return { ...result, onToggleMrtStations, onToggleMrtExits, onToggleSchoolOverlay };
}

describe("AmenityLayersControl", () => {
  it("toggles MRT station layer and reflects aria-checked state", async () => {
    const user = userEvent.setup();
    const { onToggleMrtStations, rerender } = renderControl({ mrtStationsEnabled: false });

    const stationSwitch = screen.getByRole("switch", { name: "MRT Stations" });
    expect(stationSwitch).toHaveAttribute("aria-checked", "false");

    await user.click(stationSwitch);
    expect(onToggleMrtStations).toHaveBeenCalledTimes(1);

    rerender(
      <TooltipProvider>
        <AmenityLayersControl
          mrtStationsEnabled={true}
          mrtExitsEnabled={false}
          schoolOverlayEnabled={false}
          schoolOverlayAvailable={true}
          schoolOverlayLoading={false}
          hasBlockSelection={true}
          onToggleMrtStations={onToggleMrtStations}
          onToggleMrtExits={vi.fn()}
          onToggleSchoolOverlay={vi.fn()}
          t={t}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("switch", { name: "MRT Stations" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("disables the school overlay switch while loading", () => {
    renderControl({ schoolOverlayLoading: true });

    const schoolSwitch = screen.getByRole("switch", {
      name: "Loading nearby schools for the selected block.",
    });
    expect(schoolSwitch).toBeDisabled();
    expect(schoolSwitch).toHaveAttribute("aria-checked", "false");
  });

  it("shows the unavailable school label when no block is selected", () => {
    renderControl({
      hasBlockSelection: false,
      schoolOverlayAvailable: false,
    });

    expect(screen.getByText(/select a block/i)).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: "Select a block to show nearby primary school markers.",
      }),
    ).toBeDisabled();
  });
});
