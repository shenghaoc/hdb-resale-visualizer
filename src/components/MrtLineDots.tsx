import { getStationDetails } from "@/lib/mrt-station-details";
import {
  LRT_LINE_COLOR,
  MRT_LINE_COLORS,
  MRT_LINE_FALLBACK_COLOR,
  type RailLineCode,
} from "@/lib/mrt-colors";
import { cn } from "@/lib/utils";

type MrtLineDotsProps = {
  stationName: string;
  className?: string;
  dotClassName?: string;
};

function lineColor(line: RailLineCode) {
  if (line === "LRT") {
    return LRT_LINE_COLOR;
  }
  return MRT_LINE_COLORS[line] ?? MRT_LINE_FALLBACK_COLOR;
}

export function MrtLineDots({ stationName, className, dotClassName }: MrtLineDotsProps) {
  const { lines, color } = getStationDetails(stationName);

  if (lines.length === 0) {
    return (
      <span
        className={cn("size-1.5 shrink-0 rounded-full", dotClassName)}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
    );
  }

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)} aria-hidden="true">
      {lines.map((line) => (
        <span
          key={line}
          className={cn("size-1.5 rounded-full", dotClassName)}
          style={{ backgroundColor: lineColor(line) }}
        />
      ))}
    </span>
  );
}
