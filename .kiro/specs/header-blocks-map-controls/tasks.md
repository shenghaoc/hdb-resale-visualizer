# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Map Controls Blocked by Header
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test that map controls (zoom in, zoom out, compass) receive click events when GlobalHeader is visible and positioned over them
  - Use Playwright to simulate clicking on map controls when header overlaps them
  - Test on both desktop (no explicit z-index on controls) and mobile (z-index: 30 on controls) viewports
  - The test assertions should match the Expected Behavior Properties from design: controls respond to clicks despite header visibility
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: which controls don't respond, on which viewport sizes, what error messages appear
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Header Controls Continue to Function
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for header interactions (theme toggle, language selector, dismiss button, mobile info toggle)
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Test theme toggle switches between light and dark modes
  - Test language selector switches between English and Chinese
  - Test dismiss button hides the header
  - Test mobile info toggle shows/hides metadata on mobile devices
  - Test visual styling (backdrop blur, transparency, shadows) renders correctly
  - Test content display (title, badges, metadata) appears correctly
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for header blocking map controls

  - [x] 3.1 Implement the pointer-events fix
    - Add `pointer-events-none` class to the Card component in GlobalHeader to allow click events to pass through non-interactive areas
    - Add `pointer-events-auto` class to CardHeader to restore pointer event handling for all interactive elements (theme toggle, language selector, dismiss button, mobile info toggle)
    - Verify the fix works across all viewport sizes (desktop and mobile)
    - Test that map controls receive clicks when header is visible and overlapping
    - Test that header controls remain clickable and functional
    - _Bug_Condition: isBugCondition(input) where input.target IN ['zoom-in', 'zoom-out', 'compass'] AND headerIsVisible() AND headerOverlapsControl(input.target) AND NOT controlReceivesClick(input.target)_
    - _Expected_Behavior: Map controls remain fully interactive despite header visibility - pointer events reach controls through non-interactive header areas_
    - _Preservation: Theme toggle, language selector, dismiss button, mobile info toggle, visual styling, and content display all continue to work exactly as before_
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Map Controls Remain Interactive
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify map controls respond to clicks on desktop and mobile viewports
    - Verify zoom in, zoom out, and compass controls all work correctly
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Header Controls Continue to Function
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm theme toggle, language selector, dismiss button, and mobile info toggle all still work
    - Confirm visual styling and content display remain unchanged
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run all tests (bug condition + preservation) to verify complete fix
  - Verify no console errors or warnings appear
  - Test manually on different viewport sizes to ensure fix works universally
  - Ask the user if questions arise or if additional testing is needed

- [x] 5. UI Polish & Responsiveness (Review Feedback)
  - [x] 5.1 Correct DetailDrawer close icon
    - Replace `Maximize2` with `X` icon in `DetailDrawer.tsx`
  - [x] 5.2 Implement responsive shortlist labels
    - Update `DetailDrawer.tsx` to use `t("results.save")`/`t("results.saved")` on mobile and full labels on desktop
  - [x] 5.3 Fix Results header truncation
    - Update `ResultsPane.tsx` to use `basis-full` for the sort select container on mobile
  - [x] 5.4 Simplify redundant Tailwind classes
    - Remove `sm:basis-auto` and `justify-end` from the Results header sort container in `ResultsPane.tsx`
