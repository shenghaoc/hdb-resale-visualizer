import type { BlockSummary } from "@/types/data";

const PROPERTY_GURU_BASE = "https://www.propertyguru.com.sg/property-for-sale";
const NINETYNINE_CO_BASE = "https://www.99.co/singapore/sale";
const SRX_BASE = "https://www.srx.com.sg/search/sale/hdb";

const NINETYNINE_RADIUS_METERS = 1000;

function buildFreetext(block: BlockSummary): string {
  return `${block.block} ${block.streetName}`.trim().replace(/\s+/g, " ");
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replaceAll("%20", "+");
}

export function propertyGuruUrl(block: BlockSummary): string {
  const params = new URLSearchParams();
  params.set("market", "residential");
  params.append("property_type_code[]", "H");
  params.set("freetext", buildFreetext(block));
  return `${PROPERTY_GURU_BASE}?${params.toString()}`;
}

export function ninetyNineCoUrl(block: BlockSummary): string {
  const params = new URLSearchParams();
  params.set("listing_type", "sale");
  params.set("main_category", "hdb");
  params.set("query_coords", `${block.coordinates.lat},${block.coordinates.lng}`);
  params.set("query_limit", "radius");
  params.set("radius_max", String(NINETYNINE_RADIUS_METERS));
  const qs = params.toString();
  // URLSearchParams encodes commas as %2C, but 99.co expects literal commas
  // in query_coords (e.g. "1.3217,103.9357" not "1.3217%2C103.9357").
  // Only decode the query_coords value to avoid unintended side-effects.
  return `${NINETYNINE_CO_BASE}?${qs.replace(/((?:^|&)query_coords=[^&]*)%2C/g, "$1,")}`;
}

export function srxUrl(block: BlockSummary): string {
  return `${SRX_BASE}/${encodePathSegment(buildFreetext(block))}`;
}
