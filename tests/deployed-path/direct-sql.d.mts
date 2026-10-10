import type { Sample } from "./samples.mjs";

export type ShippedSql = { labelled: string; base: string };
export function loadShippedSql(): Promise<ShippedSql>;
export function buildDirectBlock(samples: Sample[], shipped: ShippedSql): string;
export function parseFingerprints(text: string): Record<string, { n: number; md5: string }>;
