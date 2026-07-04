# Implementation Plan

- [x] Move lease-year bounds into shared product lease constants.
- [x] Add shared listing-check input parsers for positive decimals and lease commencement years.
- [x] Use the shared parsers in the listing-check panel, legacy asking-price check, and URL state parser.
- [x] Tighten `/api/comparable-transactions` lease-year validation while preserving sanitized error responses.
- [x] Tighten `/api/comparable-transactions` reference-month validation to real `YYYY-MM` months.
- [x] Align the Playwright API mock with the tightened production contract.
- [x] Show **Orig. Price** consistently for adjusted comparables in desktop and mobile evidence views.
- [x] Update buyer-facing guide/docs to match the current evidence-table semantics.
- [x] Add focused regression tests for input parsing and adjusted/original evidence prices.
