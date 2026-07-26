# Requirements: Buyer Workflow E2E Tests

> Extend the existing Playwright suite (`tests/e2e/*`) with buyer-first
> listing-price-check coverage. These are **test-only** requirements — no
> product/runtime code changes. The new tests reuse the existing Playwright
> config, global setup, storage state, and static-fixture strategy, and mock the
> same-origin `/api/comparable-transactions` endpoint. No live D1 is touched.

## R1 — Entry without the map

- **R1.1** A first-time buyer can reach and begin a listing price check from the
  primary navigation (the **Check** tab) without interacting with the map.
- **R1.2** WHEN the Check tab is opened THEN the panel exposes the entry
  affordances: the "Check a listing price" primary action, a block search input,
  and the "Search and select a block …" hint. It does not expose a sample
  listing CTA or synthetic unit defaults.

## R2 — Enter listing facts and asking price

- **R2.1** A buyer can arrive at the Check panel with a selected block and
  listing facts (floor area, flat type, storey range, lease commence year). The
  deterministic entry path is a deep link (`?checkAddress=…&checkSqm=…&…`), which
  auto-opens the Check tab but does not submit the analysis.
- **R2.2** The listing facts are captured in the form and remain editable; the
  entered floor area is visible in the floor-area field.
- **R2.3** A buyer can type an asking price into the asking-price field.

## R3 — Verdict, confidence, fair range, comparable count

- **R3.1** After the required facts + asking price are present and the buyer
  explicitly activates "Check this listing", the verdict card renders a verdict
  label (e.g. "In line with market").
- **R3.2** The verdict card shows a confidence label ("Confidence: …").
- **R3.3** The verdict card shows the fair range and the comparable count
  (e.g. "8 comparable transactions").

## R4 — Comparable evidence

- **R4.1** The comparable evidence table/cards render the actual transaction
  rows backing the verdict, including a sortable "Similarity" column (desktop)
  and per-row match-reason badges (e.g. "Same flat type").

## R5 — Time-adjusted evidence

- **R5.1** Submitting a listing check sends the comparable request to
  `/api/comparable-transactions?adjust=time`. The UI has no raw-vs-adjusted
  toggle; adjusted evidence is the default.
- **R5.2** When adjustment metadata is available, the evidence shows adjusted
  Price / $/sqm plus the original registered price. When adjustment is
  unavailable, a caveat explains that raw prices are shown.

## R6 — Save to shortlist

- **R6.1** A buyer can save the listing-check result to the shortlist from the
  verdict card; the action's button transitions to a saved state ("Saved ✓").

## R7 — Saved item preservation

- **R7.1** WHEN a listing check is saved THEN the saved shortlist item is
  visible in the Saved panel by its block address.
- **R7.2** The saved item preserves the seller's asking price in
  `ShortlistItem.askingPrice`; it does not overwrite the buyer's `targetPrice`
  or notes.
- **R7.3** The save action does not persist a generic confidence verdict or
  structured fair-range fields. The test asserts the address and asking price
  that are genuinely preserved.

## R8 — Mobile coverage

- **R8.1** On a phone viewport (390×844) a buyer can complete the main
  listing-check flow (verdict + evidence + save) without horizontal scrolling
  (`scrollWidth - clientWidth ≤ 1px`).

## R9 — Test mechanics (non-functional)

- **R9.1** Reuse the existing `playwright.config.ts` (Chromium desktop
  project; mobile coverage in this spec uses a per-test 390×844 viewport).
- **R9.2** Reuse the existing fixture strategy: static GET fixtures staged into
  `public/api/` plus `page.route` mocks for the POST
  `/api/comparable-transactions`.
- **R9.3** No `fetch()` to external domains; no live D1; deterministic data.
- **R9.4** Prefer roles, labels, visible text, and stable `data-testid`/`id`
  hooks (`#desktop-check-content`, `#mobile-check-content`,
  `shortlist-drawer`). Avoid brittle CSS-value assertions.
- **R9.5** Existing E2E tests continue to pass (no product code changed).
