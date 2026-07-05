# Design

## Overview

This bugfix keeps the pricing semantics deterministic and centralizes buyer-input parsing in the listing-check feature layer.

## Decisions

- Add shared lease-year bounds to `shared/product/lease.ts` so browser code, Pages Functions, tests, and product-core exports use the same limits.
- Add `src/features/listing-check/listingCheckInputs.ts` for UI and URL parsing of positive decimal values and lease commencement years.
- Keep decimal parsing permissive for buyer convenience, but make lease-year parsing strict because a lease year is a discrete domain value.
- Validate API lease years against the request reference month rather than wall-clock time, preserving deterministic server behavior.
- Display raw registered price as **Orig. Price** in both desktop and mobile evidence layouts when time adjustment is applied.
- Treat `adjustmentApplied` as the single evidence-table switch for original-price visibility across desktop and responsive layouts.
- Keep request-body size enforcement centralized, but catch stream reader acquisition failures before reading begins.
- Distinguish "no comparables" from "trend adjustment failed" so buyer-facing caveats describe the actual missing-data condition.

## Validation

- Unit-test listing-check input parsing.
- Unit-test evidence-table adjusted/raw price semantics.
- Unit-test zero-comparable adjusted API responses.
- Unit-test locked/disturbed request-body reader handling.
- Component-test immediate `null` propagation when listing fact inputs are cleared.
- Keep the Playwright comparable-transactions mock aligned with the production API contract.
- Run targeted tests first, then the repo quality gate before pushing.
