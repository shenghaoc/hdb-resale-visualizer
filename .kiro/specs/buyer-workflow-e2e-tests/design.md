# Design: Buyer Workflow E2E Tests

> Status: Implemented. Adds focused Playwright coverage for the buyer
> listing-price-check workflow. Test-only — no runtime/product code changes.

## Problem

The existing E2E suite (`tests/e2e/*`) covers the map-first journey: app boot,
search, results selection, detail drawer, shortlist save/persistence, comparison
binding, and mobile behaviours. It does **not** cover the buyer-first
**listing price check** journey — a buyer who arrives with a specific listing's
facts and asking price, wants a verdict + confidence + fair range + comparable
evidence, and saves the result to their shortlist. That journey is now a
first-class entry point (`ListingCheckPanel`, the **Check** tab, and the v2
`/api/comparable-transactions` engine) and needs regression protection.

## Approach

Add one new spec file (`tests/e2e/buyer-listing-check.spec.ts`) and a small
fixtures module (`tests/e2e/listing-check.fixtures.ts`). No product code is
touched, so the existing suite is unaffected.

### Reaching the panel deterministically

Three candidate entry paths were considered:

1. **Block search combobox** — rejected. The staged `suggest.json` fixture has
   only `town` and `mrt` suggestions; `ListingCheckPanel.handleSelectSuggestion`
   acts only on `group === "block"`, so no block can be selected this way.
2. **"Try sample listing check" CTA** — rejected for the data-driven flow. The
   sample block is the alphabetically-first entry of `pipeline.blocks`, which is
   empty until map scope loads; at cold start it falls back to
   `406-ANG MO KIO AVE 10`, which has **no** detail fixture, producing an error
   state. (The CTA's mere presence is still asserted in the entry test.)
3. **Deep link** — chosen. The app reads `?checkAddress=…&checkPrice=…&…` via
   `useListingCheckUrlState` and an effect auto-opens the Check tab when
   `checkAddress` is present. We deep-link to `bedok-106-lengkong-tiga`, which
   has a staged detail fixture (`tests/fixtures/public-data/details/…`) and a
   block-summaries entry (so the shortlist row resolves after saving). This is
   fully under test control and independent of map scope.

### Mocking the comparable engine

`ListingCheckPanel` POSTs to `/api/comparable-transactions`. E2E runs against
`vite preview` (static), which cannot serve a POST, so the test intercepts it
with `page.route("**/api/comparable-transactions**", …)` and fulfills a
controlled `ListingComparableSet`. The GET `/api/details/…` is served by the
existing staged fixtures. No live D1, no external `fetch`.

The mock mirrors the real contract so it cannot mask a regression:
- the real endpoint is `onRequestPost` only, so non-POST methods are passed
  through (`route.continue()`) — a regression to GET would hit the static
  server (404) and fail the test;
- the POST body is validated against the `CandidateListing` shape (town, block,
  street, flat type, storey, positive floor area, `YYYY-MM` reference month,
  numeric-or-null lease year); an invalid body returns 400, so dropping a
  listing fact fails the dependent verdict assertions.

Two deterministic data sets (`listing-check.fixtures.ts`):

- **`highConfidenceSet`** — 8 same-block, recent comparables; median resale
  1,200,000 ⇒ asking 1,200,000 yields the **"In line with market"** verdict.
  Strong sample/recency/scope/match signals ⇒ high confidence tier. Each row
  carries match reasons (`Same flat type`, `Similar floor area`,
  `Similar storey`) so the evidence table and the confidence match-signal are
  populated.
- **`lowSampleSet`** — 2 stale, widened comparables. A comparable count below
  `OVERRIDE_MIN_COUNT` (3) in `shared/confidence-system.ts` deterministically
  caps the confidence tier at **Low**, and an injected caveat surfaces the
  low-sample warning.

### Verdict / confidence determinism

The verdict comes from `assessAskingPrice` (`pctVsMedian` buckets) and confidence
from `computeConfidence`. Because the median (1,200,000) and asking price are
controlled, the happy-path verdict is "In line with market"; because count < 3
forces Low, the low-sample test pins "Confidence: Low". The happy-path test
asserts a confidence label is present without pinning the tier name beyond the
visible "Confidence:" string, keeping it robust to scoring-weight tweaks while
still proving confidence is surfaced.

### Selectors

Roles/labels/text and stable container hooks are preferred:

- Check panel: `#desktop-check-content`, `#mobile-check-content`.
- Inputs: `getByRole("spinbutton", { name: /asking price|floor area/i })`.
- Verdict/confidence/fair range/count: visible text
  (`/in line with market/i`, `/confidence:/i`, `/fair range/i`,
  `/8 comparable transactions/i`).
- Evidence: `getByRole("columnheader", { name: /similarity/i })` and the
  `Same flat type` match-reason badge.
- Nav: `.desktop-tab-bar` Check button; Saved tab; `shortlist-drawer` testid.

### Mobile

The mobile case uses `test.use({ viewport: 390×844 })` within the webkit desktop
project (the same pattern `app.spec.ts` and `mobile-regression.spec.ts` use), so
no `playwright.config.ts` change is needed. Horizontal scroll is asserted via
`document.documentElement.scrollWidth - clientWidth ≤ 1` before and after save.

## Test inventory

| Test | Requirements |
| --- | --- |
| Start from Check tab without the map | R1 |
| Enter facts + asking price → verdict/confidence/fair range/count → evidence → save → saved-item preservation | R2, R3, R4, R6, R7 |
| Low-confidence / low-sample verdict + caveat | R3, R5 (gap noted) |
| Mobile flow without horizontal scroll | R8 |

## Out of scope / gaps

- **Time-adjusted toggle (R5):** `ListingCheckPanel` does not render a
  raw-vs-time-adjusted toggle today (`adjustmentEnabled` is permanently
  `false`); the evidence table only shows an "Adj. Price" column when the
  response carries `timeAdjustedPrice`, which the panel never requests. No
  toggle test is written; documented as a gap.
- **Structured fair-range persistence (R7.3):** the check-save path persists
  `targetPrice` + a `notes` JSON blob, not the structured
  `fairRangeLow/Median/High` fields. The save test asserts only what is
  genuinely preserved. Enriching the save payload is a potential follow-up.
- Coverage is intentionally targeted (happy path, low-sample, save, one mobile
  flow) rather than exhaustive.
