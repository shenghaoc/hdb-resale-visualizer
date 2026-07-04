# Bugfix Requirements Document

## Introduction

PR #336 collects audit fixes found while hardening the buyer listing-check flow and shared runtime code. The current cleanup focuses on two review findings that can mislead buyers or accept invalid input: adjusted comparable prices must be labelled consistently, and lease commencement years must not be derived by stripping arbitrary characters from malformed text.

## Bug Analysis

### Current Behavior (Defects)

1.1 WHEN time-adjusted comparables are displayed THEN the evidence table can describe the raw registered price as an adjusted price in documentation or responsive UI copy.

1.2 WHEN a user enters a malformed lease year such as `1995.5` or `1e3` THEN some input paths can coerce it into another positive number instead of rejecting it.

1.3 WHEN the listing-check URL state or comparable-transactions API receives an out-of-range lease commencement year THEN validation is weaker than the dataset schema validation used elsewhere.

1.4 WHEN price and floor-area inputs are parsed in separate components THEN duplicated parsing rules can drift between the current listing-check panel and the legacy asking-price check.

1.5 WHEN the comparable-transactions API receives an impossible reference month such as `2026-99` THEN validation can accept the shape even though no real calendar month exists.

### Expected Behavior

2.1 The primary **Price** and **$/sqm** evidence values SHALL be the time-adjusted values when adjustment data is available; otherwise they SHALL be raw registered values.

2.2 The evidence table SHALL show **Orig. Price** only when time adjustment is available, and that value SHALL be the raw registered resale price.

2.3 Lease commencement input SHALL accept only four-digit years within the project lease-year bounds.

2.4 The URL state parser and `/api/comparable-transactions` endpoint SHALL reject malformed or out-of-range lease commencement years.

2.5 Current and legacy listing-check surfaces SHALL share one positive decimal parser for asking price and floor area.

2.6 The `/api/comparable-transactions` endpoint SHALL accept only real `YYYY-MM` calendar months.

### Unchanged Behavior

3.1 Asking price and floor-area inputs SHALL continue to tolerate currency symbols, commas, and unit suffixes when those strings still represent a single positive decimal value, and SHALL reject malformed values rather than concatenating digits.

3.2 The comparable-transactions endpoint SHALL continue to return generic sanitized validation errors.

3.3 No runtime OneMap, data.gov.sg, geocoding, or walking-time calls are introduced.
