export const MRT_LINE_COLORS = {
  NSL: "#d11141",
  EWL: "#00a651",
  NEL: "#9b26b6",
  CCL: "#fca311",
  DTL: "#00539b",
  TEL: "#764c24",
} as const;

export const MRT_LINE_FALLBACK_COLOR = "#64748b";
export const LRT_LINE_COLOR = "#7c878e";
export const DEFAULT_STATION_COLOR = "#2563eb";

export type MrtLineCode = keyof typeof MRT_LINE_COLORS;
export type RailLineCode = MrtLineCode | "LRT";

export const MRT_LINE_CODES = Object.keys(MRT_LINE_COLORS) as MrtLineCode[];
