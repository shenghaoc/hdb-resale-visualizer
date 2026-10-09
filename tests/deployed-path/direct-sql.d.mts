import type { Sample } from "./samples.mjs";

export function loadShippedSql(): Promise<string>;
export function buildDirectBlock(samples: Sample[], shippedSql: string): string;
export function parseFingerprints(text: string): Record<string, { n: number; md5: string }>;
