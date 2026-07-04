# Design

## Overview

This bugfix keeps the pricing semantics deterministic and centralizes buyer-input parsing in the listing-check feature layer.

## Decisions

- Add shared lease-year bounds to `shared/product/lease.ts` so browser code, Pages Functions, tests, and product-core exports use the same limits.
- Add `src/features/listing-check/listingCheckInputs.ts` for UI and URL parsing of positive decimal values and lease commencement years.
- Keep decimal parsing permissive for buyer convenience, but make lease-year parsing strict because a lease year is a discrete domain value.
- Validate API lease years against the request reference month rather than wall-clock time, preserving deterministic server behavior.
- Display raw registered price as **Orig. Price** in both desktop and mobile evidence layouts when time adjustment is applied.

## Validation

- Unit-test listing-check input parsing.
- Unit-test evidence-table adjusted/raw price semantics.
- Keep the Playwright comparable-transactions mock aligned with the production API contract.
- Run targeted tests first, then the repo quality gate before pushing.
