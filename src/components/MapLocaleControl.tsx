import { LocaleSelector } from "@/components/LocaleSelector";
import { cn } from "@/lib/utils";

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
      <div className="pointer-events-auto flex items-center rounded-xl border border-border/20 bg-background/90 p-1 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.08)] dark:border-primary/15 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_4px_24px_rgba(4,12,24,0.7)]">
        <LocaleSelector />
      </div>
    </div>
  );
}
