# Tasks: UX Docs, Accessibility, and Locale Coherence

- [x] Preserve stable Listing Check engine identifiers and add a UI-only
  localization adapter for confidence summaries, caveats, and match reasons.
- [x] Carry structured caveat interpolation values across the shared boundary
  while retaining English fallback messages.
- [x] Pass the selected locale through Listing Check, map-popup, shortlist,
  and block-history chart currency formatting; localize filter range copy.
- [x] Localize the lazy map loading fallback and cover zh-SG rendering.
- [x] Give Buyer setup budget and lease inputs translated accessible names and
  correct the Chinese lease-commencement label.
- [x] Implement wrapping four-arrow plus Home/End keyboard behavior for the
  heatmap mode radiogroup.
- [x] Add focused English/Chinese presentation, form-label, and heatmap
  keyboard regressions, plus accessibility smoke coverage for Buyer setup.
- [x] Make base CI invoke `vp run check` and correct the separate E2E workflow
  comments.
- [x] Align README, AGENTS, steering, architecture docs, and affected Kiro
  specs with Node 24, pnpm/Vite+, Chromium, Worker/D1 local development,
  forward-only migrations, map pan/zoom behavior, and flat-type cohort
  readiness.
- [ ] Run exact-head CI and the deployed desktop/mobile bilingual UX audit
  after push.
