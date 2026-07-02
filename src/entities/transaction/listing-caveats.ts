export { generateListingCaveats as generateCaveats, type Caveat } from "@shared/product-core";
export type GenerateCaveatsParams = Parameters<
  typeof import("@shared/product-core").generateListingCaveats
>[0];
