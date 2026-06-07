# Design: Mobile Buyer Usability

## Goals

- Make the five core buyer workflows (check listing, read verdict, inspect comparables, save to shortlist, compare shortlisted flats, reopen/edit shortlist entries) reliable and usable on phone.
- Keep map visible and accessible, but not required for listing checks.
- Reduce horizontal scrolling and touch friction across the mobile flow.
- Ensure evidence presentation is readable on narrow screens using card patterns.
- Add concrete viewport/regression coverage for phone interactions.

## Principles

- **No hover dependence:** all states are explicit and accessible by tap/keyboard.
- **Small screens first:** list-like components become card-first views at `sm` and below.
- **Verdict-first hierarchy:** buyer-facing trust signals (verdict + confidence) come before charts and secondary visualizations.
- **Touch ergonomics:** large primary actions, numeric/mobile-friendly inputs, compact spacing, predictable scrolling.

## User Workflow Rework

### 1) Listing check entry on mobile
- Keep the existing tab/navigation entry point but route mobile buyers into a dedicated single-column `ListingCheckPanel` focus state with `aria-live` result area.
- Auto-hide or dock distracting side controls while a check is being edited so controls above the fold are:
  1. Search/select block,
  2. Ask price/area/flat type/storey/lease fields,
  3. Primary action button.
- Re-using the same analysis pipeline (`findComparableTransactions`, verdict and confidence modules) is mandatory; no new API or runtime external calls.

### 2) Verdict-first result stack
- Result stack order on mobile:
  1. Verdict headline + color theme,
  2. Confidence badge + reason,
  3. Essential metrics (median, fair range, `% vs median`, price delta),
  4. Notes/caveats,
  5. Charts/evidence visualizations,
  6. Compare/share actions.
- Charts load with skeleton placeholders to avoid reflow jumps.

## 3) Comparable evidence cards on small screens
- Introduce a mobile comparator view that switches from existing table to compact cards below `sm`.
- Reuse desktop sorting state and provide the same order semantics.
- Each card must include:
  - Price and `$/sqm`,
  - Month,
  - Block + street,
  - Flat type/storey,
  - Lease,
  - Similarity bar or percentage,
  - Match reason chips.
- Hide table-specific affordances (column sort toggles, wide headers) on mobile; keep only compact card controls and "why these comparables" details.

## 4) Shortlist interactions on phone
- Ensure save action is a single primary button under the result stack.
- In shortlist list rows, add touch-friendly actions:
  - edit notes,
  - edit target price/offer ceiling,
  - open comparison mode.
- Comparison screen for two+ items must support side-by-side card stacks with a mobile layout (vertical list) instead of requiring a desktop table.

## 5) Map isolation from workflow
- If map overlays are visible, the listing check panel should maintain stable z-index and pointer behavior, avoiding capture of taps.
- Keep map panel loading asynchronous and behind dedicated transitions so entering text or submitting form never depends on map completion.
- Optional map details should be gated behind explicit toggles; default should remain on the listing workflow.

## 6) Layout shift prevention
- Reserve minimal deterministic vertical space for:
  - verdict block,
  - shortlist action row,
  - evidence section header.
- Load evidence/map assets with `loading`/placeholder patterns to avoid content jumps.
- Prefer existing `skeleton` or fixed-min-height blocks for panel sections before data arrives.

## 7) Accessibility and resilience
- Inputs:
  - `inputMode="numeric"` and `type="number"` for numeric fields;
  - explicit labels and helper text,
  - visible focus and disabled states.
- No action should depend on `:hover` or pointer-over states.
- Touch targets minimum: 44px for primary controls.

## Implementation Architecture

1. Add mobile viewport branches in `ListingCheckPanel` and `ComparableEvidence*` to render card components under `sm`.
2. Add shared responsive utilities for:
   - verdict-first ordering,
   - card summary rows,
   - shared spacing tokens.
3. Ensure shortlist item form controls use reusable mobile-safe fields used by both check and shortlist edit flows.
4. Connect existing comparison container to mobile stack layout for 2+ shortlist items.
5. Add test ids for key mobile assertions:
   - `mobile-verdict-panel`,
   - `mobile-confidence-badge`,
   - `mobile-comparable-cards`,
   - `mobile-shortlist-edit`,
   - `mobile-compare-action`.

## Testing

- Vitest/component scope:
  - one-handed/mobile input rendering states,
  - no-hover action alternatives (toggle/press),
  - verdict-first ordering.
- Playwright:
  - phone viewport flows for all five core workflows,
  - shortlist save/edit and 2-item compare,
  - evidence rendering switch (table -> cards),
  - no horizontal overflow checks on key containers.

