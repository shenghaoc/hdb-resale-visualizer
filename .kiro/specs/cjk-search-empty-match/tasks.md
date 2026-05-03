# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Unrecognized CJK Input Matches All Blocks
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate unrecognized CJK/emoji/symbol input matches ALL blocks instead of matching nothing
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — inputs where `rawQuery.trim().length > 0` AND `tokenizeSearchText(rawQuery)` returns `[]`
  - Test file: `tests/unit/cjk-search-empty-match.exploration.test.ts`
  - Test setup:
    - Import `matchesFilter` from `@/lib/filtering` and `DEFAULT_FILTERS` from `@/lib/constants`
    - Create a representative block fixture (e.g., Ang Mo Kio block with standard fields)
    - Use `fast-check` to generate strings from CJK Unicode ranges not in the alias map
  - Test cases using `fast-check`:
    - **Property**: For all strings where `rawQuery.trim().length > 0` AND normalization produces zero tokens, `matchesFilter(block, { ...filters, search: rawQuery })` should return `false`
    - Concrete cases: `"你好"`, `"🏠🏢"`, `"###"`, `"你好世界"`, `"★★★"`, `"こんにちは"`
    - Generate random CJK strings via `fc.stringOf(fc.char().filter(c => /[\u4e00-\u9fff]/.test(c) && !knownAliases.includes(c)))` — assert `matchesFilter` returns `false` for all
    - Generate random emoji strings via `fc.stringOf(fc.char().filter(c => /[\u{1F300}-\u{1F9FF}]/u.test(c)))` — assert `matchesFilter` returns `false` for all
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (matchesFilter returns `true` for all blocks when given unrecognized CJK input, proving the bug exists)
  - Document counterexamples found (e.g., "`matchesFilter(block, { search: '你好' })` returns `true` instead of `false`")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Empty Search and English/Numeric Queries Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `tests/unit/cjk-search-empty-match.preservation.test.ts`
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: `matchesFilter(block, { search: "" })` returns `true` for all blocks
    - Observe: `matchesFilter(block, { search: "   " })` returns `true` for all blocks
    - Observe: `matchesFilter(angMoKioBlock, { search: "ang mo kio" })` returns `true`
    - Observe: `matchesFilter(angMoKioBlock, { search: "bedok" })` returns `false`
    - Observe: `matchesFilter(angMoKioBlock, { search: "大巴窑" })` returns `true` (known alias → "toa payoh")
    - Observe: `matchesFilter(angMoKioBlock, { search: "560101" })` returns `true` (postal code match)
    - Observe: `matchesFilter(angMoKioBlock, { search: "碧山" })` returns `false` (known alias → "bishan", doesn't match AMK)
  - Write property-based tests using `fast-check`:
    - **Property A (Empty search)**: For all whitespace-only strings (including empty), `matchesFilter(block, { search: ws })` returns `true` for all blocks
    - **Property B (English/numeric)**: For all strings generated from `[a-zA-Z0-9 ]` that produce at least one token, `matchesFilter` returns the same result as the current (unfixed) implementation
    - **Property C (Known CJK aliases)**: For all known CJK alias keys ("大巴窑", "碧山", "宏茂桥", etc.), search continues to produce non-empty tokens and match the correct town blocks
    - Generate random whitespace strings via `fc.stringOf(fc.constantFrom(' ', '\t', '\n'))` — assert all return `true`
    - Generate random English search strings via `fc.stringOf(fc.char().filter(c => /[a-z0-9 ]/.test(c)))` — record results on unfixed code as baseline
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for CJK search empty match bug

  - [x] 3.1 Implement the fix in `searchMatchesBlock`
    - File: `src/lib/filtering.ts`
    - Function: `searchMatchesBlock`
    - Change the zero-token early return from `return true` to `return query.trim().length === 0`
    - This distinguishes "user typed nothing" (empty field → show all) from "user typed something that normalized to nothing" (unrecognized CJK/emoji/symbols → show nothing)
    - Current code:
      ```typescript
      if (searchTokens.length === 0) {
        return true;
      }
      ```
    - Fixed code:
      ```typescript
      if (searchTokens.length === 0) {
        return query.trim().length === 0;
      }
      ```
    - _Bug_Condition: isBugCondition(input) where input.rawQuery.trim().length > 0 AND tokenizeSearchText(input.rawQuery).length = 0_
    - _Expected_Behavior: searchMatchesBlock returns false when raw query is non-empty but produces zero tokens_
    - _Preservation: Empty/whitespace-only queries continue to return true (match all blocks); queries producing tokens are unaffected_
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Unrecognized CJK Input Matches No Blocks
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (non-empty query with zero tokens → `false`)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run: `bun run test tests/unit/cjk-search-empty-match.exploration.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Empty Search and English/Numeric Queries Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run: `bun run test tests/unit/cjk-search-empty-match.preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all property-based tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `bun run test`
  - Run typecheck: `bun run typecheck`
  - Run lint: `bun run lint`
  - Verify existing search-preservation and search-regression tests still pass
  - Ensure all tests pass, ask the user if questions arise.
