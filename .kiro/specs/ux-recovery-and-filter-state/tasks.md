# Tasks: UX Recovery and Filter State

- [x] Normalize controlled empty Results sort and cover reset by rerender.
- [x] Add source-specific manifest retry and search-filter recovery actions.
- [x] Make block-data recovery retry even when Reset leaves loading inputs unchanged.
- [x] Clear stale block-loading errors before no-request early returns.
- [x] Validate calendar months on hydration and filter patches with shared logic.
- [x] Normalize restored numeric ranges without swapping controlled input values per keystroke.
- [x] Evaluate live numeric ranges in Worker-aligned ascending order and commit
  visible endpoints on blur.
- [x] Guard town comparison against out-of-order responses.
- [x] Keep failed town-comparison evidence out of metric snapshots and expose a
  working retry for failed block/trend requests.
- [x] Replace raw recovery exception text with source-specific translated copy.
- [x] Add a same-selection retry for transient Listing Check detail failures.
- [x] Replace compact affordability's color-only dot with translated text.
- [x] Cover valid/invalid months, manifest retry, search reset, controlled sort,
  live range order, comparison failure/retry, localized recovery copy, Listing
  Check detail retry, request ordering, and compact affordability with focused
  tests.
- [ ] Run the exact-head CI and deployed-preview UX checks after push.
