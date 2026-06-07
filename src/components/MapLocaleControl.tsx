import { LocaleSelector } from "@/components/LocaleSelector";
import { cn } from "@/shared/lib/utils";

type MapLocaleControlProps = {
  isDesktop: boolean;
};

/**
 * Floating language selector anchored to the map canvas top-right, paired with
 * MapLibre zoom/geolocate controls. Stays visible when the header chip is dismissed.
 */
export function MapLocaleControl({ isDesktop }: MapLocaleControlProps) {
  return (
    <div
      data-testid="map-locale-control"
      className={cn(
        "pointer-events-none absolute z-35",
        isDesktop
          ? "right-6 top-6"
          : "right-2 top-[calc(env(safe-area-inset-top,0px)+0.75rem)]",
      )}
    >
      <div className="pointer-events-auto flex items-center rounded-xl border bg-popover/90 p-1 backdrop-blur-[20px] shadow-lg">
        <LocaleSelector />
      </div>
    </div>
  );
}
