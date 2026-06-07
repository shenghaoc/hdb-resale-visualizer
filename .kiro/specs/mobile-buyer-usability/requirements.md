# Requirements: Mobile Buyer Usability

## R1 — Mobile listing-check entry and flow
- **R1.1** The phone workflow must let a buyer start a listing check without opening the map panel.
- **R1.2** The listing-check workflow must remain usable one-handed, including entering price, area, flat type, storey, and optional lease year.
- **R1.3** At no point should a user be required to hover, drag horizontally, or pinch zoom to perform a core listing-check action.

## R2 — Verdict and confidence visibility
- **R2.1** After running a listing check, the verdict (e.g., well below/fair/above) and confidence tier (high/medium/low) must be visible within the first visible viewport on phone and before chart-heavy blocks.
- **R2.2** Verdict and confidence text and badges must be readable without horizontal scrolling at viewport widths of 320px and above.
- **R2.3** Plain-English confidence reason text must be adjacent to confidence badge on mobile.
- **R2.4** No critical action should be hidden behind a chart or table scroll area.

## R3 — Comparable evidence on small screens
- **R3.1** For viewport widths below the `sm` breakpoint, comparable evidence must render as cards, not a wide table.
- **R3.2** Card layout must include minimum fields for interpretation: month, price, `$ / sqm`, block/street, flat type/storey, lease, similarity, and match reasons.
- **R3.3** Card order should match the same sort order used by desktop evidence sorting.
- **R3.4** Each evidence card must be tappable with proper touch targets and readable spacing.

## R4 — Shortlist and management on mobile
- **R4.1** A buyer must be able to save a listing check to shortlist from mobile.
- **R4.2** Saved items must be editable from shortlist: updating notes and offer ceiling on phone.
- **R4.3** Shortlist comparison mode must support selecting and comparing at least two items on mobile without requiring desktop-only layouts.
- **R4.4** Empty, loading, and disabled states for shortlist actions must be explicit and not blocked by layout overflow.

## R5 — Map interaction separation
- **R5.1** The listing-check form and verdict output must remain interactable when map panel or map overlays are visible.
- **R5.2** The map should not prevent submission of the listing-check form in any responsive state.
- **R5.3** Map layers and map controls must remain visually and functionally independent from listing-check controls during a check workflow.

## R6 — Input controls and motion safety
- **R6.1** All interactive mobile inputs must use touch-appropriate controls (`type="number"`, select/combobox with explicit controls, adequate spacing, no hover-only affordance).
- **R6.2** Controls that reveal secondary content must use explicit toggles/buttons rather than hover.
- **R6.3** The mobile workflow should avoid heavy layout shifts when loading comparable evidence or map panels.

## R7 — Responsive and viewport testing
- **R7.1** Add responsive unit or component coverage for mobile-specific rendering branches.
- **R7.2** Add Playwright viewport test(s) for at least two phone widths (e.g., `390x844` and `360x640`) that validate:
  - listing check submit flow,
  - verdict and confidence are visible before charts,
  - comparable cards appear instead of table,
  - shortlist save and edit/offer update works,
  - compare at least two shortlisted items.
- **R7.3** Add regression test(s) asserting no horizontal overflow on core buyer cards at mobile widths.

## Acceptance Criteria
- A mobile user can complete a listing check without opening the map.
- A mobile user can understand the verdict and confidence level without horizontal scrolling.
- A mobile user can save the result to shortlist.
- A mobile user can compare at least two shortlisted flats without desktop layout.

