export type Sample = { id: string; lat: number; lng: number; radius: number; types?: string };
export type CanonicalCell = { lat: number; lng: number; radius: number; kinds: string[] };
export const SAMPLES: Sample[];
export const KINDS: string[];
export function canonical(sample: Sample): CanonicalCell;
export function queryString(sample: Sample): string;
