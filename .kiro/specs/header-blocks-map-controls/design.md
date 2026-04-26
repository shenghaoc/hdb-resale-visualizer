# Header Blocks Map Controls Bugfix Design

## Overview

The GlobalHeader card component is blocking user interaction with MapLibre GL JS map controls (zoom in/out buttons and compass navigation). The bug occurs because the header card is positioned in a container with `z-index: 20`, while the map controls are positioned with `z-index: 30` on mobile but have no explicit z-index on desktop. The header's parent container creates a stacking context that places it above the map controls in the visual hierarchy, preventing pointer events from reaching the controls.

The fix will use CSS `pointer-events: none` on the header's container while preserving `pointer-events: auto` on interactive elements within the header, allowing click events to pass through the non-interactive portions of the header to reach the map controls beneath.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when the GlobalHeader is visible and positioned over map controls, blocking pointer events
- **Property (P)**: The desired behavior - map controls remain fully interactive despite header visibility
- **Preservation**: All existing header functionality (theme toggle, language selector, dismiss button, mobile info toggle) must continue to work
- **GlobalHeader**: The header component in `src/components/StatsBar.tsx` that displays app title, data window, transaction count, and controls
- **MapLibre GL Controls**: The zoom in/out buttons and compass navigation rendered by MapLibre GL JS in the top-right corner
- **Stacking Context**: CSS concept where elements with z-index create layering hierarchies
- **pointer-events**: CSS property that controls whether an element can be the target of pointer events

## Bug Details

### Bug Condition

The bug manifests when the GlobalHeader is visible and positioned over the map controls in the top-right corner. The header's parent container (`.pointer-events-none` wrapper with `z-index: 20`) creates a stacking context, but the header card itself does not have `pointer-events: none`, causing it to block click events on the map controls beneath it.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UserInteraction
  OUTPUT: boolean
  
  RETURN input.target IN ['zoom-in', 'zoom-out', 'compass']
         AND headerIsVisible()
         AND headerOverlapsControl(input.target)
         AND NOT controlReceivesClick(input.target)
END FUNCTION
```

### Examples

- **Desktop Scenario**: User clicks on the zoom-in button that is visually obscured by the header card - Expected: map zooms in, Actual: no response
- **Desktop Scenario**: User clicks on the compass control that is partially covered by the header - Expected: map resets bearing, Actual: no response
- **Mobile Scenario**: User taps zoom controls on smaller screens where header overlaps controls - Expected: zoom controls respond, Actual: no response
- **Edge Case**: User clicks on header controls (theme toggle, language selector) - Expected: these should continue to work (preservation requirement)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Theme toggle button must continue to switch between light and dark modes
- Language selector must continue to allow switching between English and Chinese
- Dismiss button (X) must continue to hide the header
- Mobile info toggle button must continue to show/hide metadata on mobile devices
- Header card visual styling (backdrop blur, transparency, shadows) must remain unchanged
- Header content display (title, badges, metadata) must remain unchanged

**Scope:**
All inputs that do NOT involve clicking on map controls should be completely unaffected by this fix. This includes:
- Clicks on header interactive elements (buttons, selects)
- Clicks on other parts of the map
- Clicks on the desktop panel toggle button
- Clicks on mobile tab bar buttons

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Incorrect Pointer Events Configuration**: The header card component does not have `pointer-events: none` applied, causing it to intercept all pointer events even though its parent container has `pointer-events-none` class
   - The parent container at `src/App.tsx:665` has `pointer-events-none` class
   - The header card itself (rendered by GlobalHeader) does not inherit or apply `pointer-events: none`
   - Interactive elements within the header need `pointer-events: auto` to remain clickable

2. **Z-Index Stacking Context Issue**: The header's parent container has `z-index: 20` while map controls have varying z-index values
   - Desktop map controls (`.maplibregl-ctrl-top-right`) have no explicit z-index, defaulting to auto
   - Mobile map controls have `z-index: 30` (line 402 in `src/styles.css`)
   - The header container's `z-index: 20` creates a stacking context that may place it above controls on desktop

3. **Layout Positioning Conflict**: The header is positioned in a flex container that may overlap with the map control positioning
   - Header is in a flex container with `gap-3 lg:gap-4 lg:pl-36`
   - Map controls are positioned `top-right` by MapLibre GL
   - On desktop, the header may extend into the top-right area where controls are positioned

4. **CSS Specificity and Inheritance**: The `pointer-events-none` class on the parent may not be properly inherited or may be overridden by component styles
   - Card component may have default pointer-events behavior
   - Backdrop blur and transparency effects may affect pointer event handling

## Correctness Properties

Property 1: Bug Condition - Map Controls Remain Interactive

_For any_ user interaction where a map control (zoom in, zoom out, compass) is clicked and the GlobalHeader is visible, the fixed implementation SHALL allow the pointer event to reach the map control, causing the control to respond with its intended behavior (zoom in, zoom out, reset bearing).

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Header Controls Continue to Function

_For any_ user interaction that targets header controls (theme toggle, language selector, dismiss button, mobile info toggle), the fixed implementation SHALL produce exactly the same behavior as the original implementation, preserving all existing header functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/components/StatsBar.tsx`

**Component**: `GlobalHeader`

**Specific Changes**:
1. **Add pointer-events: none to Card**: Apply `pointer-events: none` to the Card component to allow click events to pass through non-interactive areas
   - Add `pointer-events-none` to the Card's className
   - This allows clicks on the card background to pass through to map controls beneath

2. **Add pointer-events: auto to Interactive Elements**: Restore pointer event handling for all interactive elements within the header
   - Add `pointer-events-auto` to CardHeader (contains all interactive elements)
   - This ensures theme toggle, language selector, dismiss button, and mobile info toggle remain clickable

3. **Verify Z-Index Layering**: Ensure the fix works across all viewport sizes
   - Test on desktop where controls have no explicit z-index
   - Test on mobile where controls have `z-index: 30`
   - Verify header container's `z-index: 20` doesn't interfere after pointer-events fix

4. **Alternative Approach (if needed)**: If pointer-events approach doesn't fully resolve the issue, consider adjusting z-index values
   - Increase map controls z-index on desktop to match mobile (`z-index: 30`)
   - Reduce header container z-index to below controls
   - This is a fallback if pointer-events alone is insufficient

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write automated tests using Playwright that simulate clicking on map controls when the header is visible and positioned over them. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Desktop Zoom In Test**: Click zoom-in button when header overlaps it (will fail on unfixed code)
2. **Desktop Zoom Out Test**: Click zoom-out button when header overlaps it (will fail on unfixed code)
3. **Desktop Compass Test**: Click compass control when header overlaps it (will fail on unfixed code)
4. **Mobile Controls Test**: Tap map controls on mobile viewport when header is visible (will fail on unfixed code)

**Expected Counterexamples**:
- Map controls do not respond to clicks when header is visible and overlapping
- Possible causes: pointer-events blocking, z-index stacking context, CSS specificity issues

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handleMapControlClick_fixed(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Test Plan**: After implementing the fix, run the same tests to verify map controls respond correctly when header is visible.

**Test Cases**:
1. **Desktop Zoom In Works**: Verify zoom-in button responds when header is visible
2. **Desktop Zoom Out Works**: Verify zoom-out button responds when header is visible
3. **Desktop Compass Works**: Verify compass control responds when header is visible
4. **Mobile Controls Work**: Verify all map controls work on mobile with header visible

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleHeaderInteraction_original(input) = handleHeaderInteraction_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for header interactions, then write tests capturing that behavior.

**Test Cases**:
1. **Theme Toggle Preservation**: Verify theme toggle button continues to switch themes after fix
2. **Language Selector Preservation**: Verify language selector continues to work after fix
3. **Dismiss Button Preservation**: Verify dismiss button continues to hide header after fix
4. **Mobile Info Toggle Preservation**: Verify mobile info toggle continues to work after fix
5. **Visual Styling Preservation**: Verify backdrop blur, transparency, and shadows remain unchanged
6. **Content Display Preservation**: Verify title, badges, and metadata display correctly

### Unit Tests

- Test that map controls receive click events when header is visible
- Test that header controls (theme toggle, language selector, dismiss button) continue to work
- Test on both desktop and mobile viewport sizes
- Test edge cases (header partially overlapping controls, header fully overlapping controls)

### Property-Based Tests

- Generate random viewport sizes and verify map controls always work when header is visible
- Generate random header visibility states and verify preservation of header functionality
- Test across many scenarios to ensure no regressions in header or map control behavior

### Integration Tests

- Test full user flow: load app, interact with map controls, verify zoom and compass work
- Test header dismissal flow: dismiss header, verify map controls still work
- Test theme switching flow: toggle theme, verify map controls and header both work
- Test language switching flow: change language, verify all functionality preserved
