## Summary

<!-- One-paragraph description of the change and why it's needed. -->

## Test plan

- [ ] `vp run check:pr` passes (format, lint, typecheck, unit tests, build, Playwright E2E)
- [ ] Focused suites run when touching listing-check / comparables / buyer workflow (`vp run test:listing-check`, `vp run test:comparables`, `vp run test:buyer-workflow`)

## Documentation

- [ ] User-facing behaviour is unchanged **OR** `docs/guide/user-guide.md` and the matching in-app pages under `src/features/docs/content/` have been updated
- [ ] Runtime `/api/*` or Worker routing changes are reflected in `docs/architecture/artifact-contracts.md`
- [ ] No new features are undocumented
