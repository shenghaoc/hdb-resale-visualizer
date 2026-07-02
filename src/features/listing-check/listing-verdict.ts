export {
  performListingCheck,
  type AskingPriceAssessment,
  type Caveat,
  type ComparableQuery,
  type ListingCheckResult,
  type ListingConfidenceResult as ConfidenceResult,
} from "@shared/product";
export type ListingCheckParams = Parameters<
  typeof import("@shared/product").performListingCheck
>[0];
