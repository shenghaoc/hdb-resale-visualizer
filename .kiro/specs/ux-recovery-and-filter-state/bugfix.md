# Bugfix Requirements: UX Recovery and Filter State

## Introduction

This bugfix removes dead ends and controls whose visible state diverged from
the filters, data, or recovery action they actually controlled.

## Current Behavior and Root Causes

1. A controlled Results sort used a truthiness check, so the valid empty URL
   value was treated as uncontrolled and Reset could leave stale internal
   ordering on screen.
2. The shared error card offered a filter reset for both search failures and
   manifest failures, although resetting filters cannot re-run the one-shot
   manifest request.
3. Month values were length-limited but not calendar-validated in client URL
   state, so malformed deep links reached the server and produced a fatal 400.
4. A failed coarse search was cleared only when another request started; Reset
   could take an early return and leave the previous error mounted.
5. Town comparison requests committed any response that resolved, so an older
   town request could overwrite a newer selection and leave comparison loading
   forever.
6. Compact Results represented affordability with an unexplained, non-focusable
   color dot even though the full layout had a textual status.
7. Live inverted budget/area inputs were normalized by the Worker but evaluated
   in their raw order in the browser, turning valid server results into a false
   zero-match state.
8. A failed town-comparison block request was sticky and its empty fallback
   rendered unavailable evidence as real-looking zero metrics.
9. Global recovery copy appended raw exception messages and API paths after a
   translated heading.
10. A transient Listing Check address-detail failure could not be retried for
    the same selected block.

## Expected Behavior

1. Controlled empty sort state SHALL mean the documented default price order,
   including immediately after Reset.
2. Manifest failure SHALL offer a real manifest retry. Search failure SHALL
   offer Reset filters and retry. The recovery action SHALL trigger a new data
   request even when Reset does not change any filter or loading dependency,
   and SHALL clear the prior error when no follow-up request is needed.
3. Client state SHALL accept only real `YYYY-MM` month values, normalize valid
   inverted deep-link ranges, and discard malformed values before they reach
   the API. Per-keystroke numeric edits SHALL preserve the field being edited;
   browser evaluation SHALL use the same ascending range as the Worker, and
   blur SHALL commit that order back to the visible fields.
4. Only the latest town-comparison request SHALL update comparison state.
   Failed comparison data SHALL render no metrics and offer a real retry.
5. Global recovery SHALL render source-specific translated copy without
   exposing exception text or API paths.
6. Listing Check address-detail failure SHALL expose a retry that repeats the
   request without requiring a different selection.
7. Compact Results SHALL expose affordability in visible translated text; color
   may remain a redundant visual cue.

## Preserved Behavior

- Basic flat-type and budget filters remain usable during cohort migration.
- Uncontrolled `ResultsPane` tests and consumers retain local sort state.
- Numeric bounds remain shared by client and server.
- Temporarily inverted controlled inputs remain editable without keystroke-time
  swapping.
- Manifest retry does not cache, mutate, or write user data.
- Town comparison remains lazy and does not add external requests.
