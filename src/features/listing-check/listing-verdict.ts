export {
  performListingCheck,
  type AskingPriceAssessment,
  type Caveat,
  type ComparableQuery,
  type ListingCheckResult,
  type ListingConfidenceResult as ConfidenceResult,
} from "@shared/product-core";
export type ListingCheckParams = Parameters<
  typeof import("@shared/product-core").performListingCheck
>[0];
