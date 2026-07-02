export { generateListingCaveats as generateCaveats, type Caveat } from "@shared/product";
export type GenerateCaveatsParams = Parameters<
  typeof import("@shared/product").generateListingCaveats
>[0];
