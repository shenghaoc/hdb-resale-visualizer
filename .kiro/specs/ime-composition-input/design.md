# IME Composition Input Handling — Bugfix Design

## Overview

All three text input sites in the application (`FilterPanel` search, `ShortlistDrawer` notes, `ShortlistDrawer` target price) fire their `onChange` callbacks unconditionally on every keystroke. When a user composes text via an IME (required for CJK languages), the browser emits intermediate `onChange` events between `compositionstart` and `compositionend`. These intermediate events carry uncommitted text that triggers expensive downstream effects — geographic intent resolution, map re-rendering, shortlist persistence, and gap recalculation — causing garbled input, focus loss, and an unusable experience for CJK users.

The fix introduces a `useIMEComposition` hook that tracks the browser's composition lifecycle and returns event handlers (`onCompositionStart`, `onCompositionEnd`, `onChange`) that suppress callback propagation during active composition and flush the committed value on `compositionend`. Each affected input site wires these handlers in place of its current bare `onChange`. Non-IME keyboard input passes through unchanged.

## Glossary

- **Bug_Condition (C)**: An `onChange` event fires on an input element while an IME composition session is active (`compositionstart` has fired but `compositionend` has not).
- **Property (P)**: During active composition, no state update callback is invoked. On `compositionend`, the final committed value is propagated exactly once via the existing callback.
- **Preservation**: All non-IME input behavior — direct keyboard typing, mouse interactions, paste, delete, clear — continues to trigger state updates on every `onChange` event exactly as today.
- **`useIMEComposition`**: The new custom React hook in `src/hooks/useIMEComposition.ts` that encapsulates composition lifecycle tracking and callback gating.
- **`InputGroupInput`**: Shadcn wrapper around `<Input>` in `src/components/ui/input-group.tsx`. Passes all props (including `onCompositionStart`, `onCompositionEnd`) through to the native `<input>` element via `...props`.
- **`Textarea`**: Shadcn wrapper around `<textarea>` in `src/components/ui/textarea.tsx`. Passes all props through via `...props`.
- **`useDebouncedValue`**: Existing hook in `src/hooks/useDebouncedValue.ts` that debounces a value by a configurable delay (200ms for map search). Sits downstream of `filters.search` state and is unaffected by this fix.

## Bug Details

### Bug Condition

The bug manifests when a user types using an IME (e.g., Pinyin for Mandarin, Kana for Japanese, Hangul for Korean) in any of the three affected inputs. The browser fires `onChange` events for every intermediate keystroke during composition. The current handlers unconditionally propagate these intermediate values to React state, triggering expensive side effects with incomplete/uncommitted text.

**Formal Specification:**
```
FUNCTION isBugCondition(event)
  INPUT: event of type { inputElement: Element, nativeEvent: Event }
  OUTPUT: boolean

  // The bug triggers when an onChange fires during an active IME composition
  compositionActive ← compositionStartFired AND NOT compositionEndFired
  RETURN event.type = "change" AND compositionActive
END FUNCTION
```

### Examples

- **Search input (Mandarin)**: User types "大巴窑" (Toa Payoh in Chinese). Each Pinyin keystroke ("d", "a", "b", "a", "y", "a", "o") fires `onChange` with partial romanization, triggering geographic intent resolution and map re-rendering 7+ times with garbage text like "d", "da", "dab", etc. Expected: no state update until the user commits "大巴窑".
- **Search input (Japanese)**: User types "東京" via Kana input. Intermediate kana "と", "とう", "とうき", "とうきょ", "とうきょう" each fire `onChange`. Expected: no state update until the user commits "東京".
- **Notes textarea (Korean)**: User types a note in Hangul. Each jamo composition step fires `onUpdate`, persisting incomplete syllables to localStorage. Expected: no persistence until the syllable is committed.
- **Target price input**: Typically numeric and not IME-composed, but on some mobile IME keyboards, number input can briefly enter composition mode. The fix must handle this edge case gracefully.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Direct keyboard input (non-IME) in all three inputs must continue to fire state updates on every `onChange` event exactly as today.
- The `useDebouncedValue` hook (200ms) on `filters.search` for map rendering must continue to operate identically — it receives the same `filters.search` state value, just not intermediate composition values.
- Mouse clicks, paste operations, cut operations, and select-all-delete in all inputs must continue to work immediately.
- The `InputGroupInput` and `Textarea` Shadcn components are not modified — the fix is applied at the consumer level via hook-provided event handlers.
- Shortlist persistence to `localStorage` via `useShortlist.update` continues to fire on every committed change.

**Scope:**
All input events where no IME composition is active should be completely unaffected by this fix. This includes:
- Standard Latin keyboard input (English, French, German, etc.)
- Numeric keypad input
- Paste from clipboard (`Ctrl+V` / `Cmd+V`)
- Backspace, Delete, and cut operations
- Programmatic value changes

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is straightforward:

1. **No composition awareness**: The three `onChange` handlers in `FilterPanel.tsx` (line 142) and `ShortlistDrawer.tsx` (lines 917, 965) call their state-update callbacks unconditionally. There is no check for `event.nativeEvent.isComposing` and no `compositionstart`/`compositionend` event listeners.

2. **Immediate state propagation**: Each `onChange` directly calls either `onChange({ search: event.target.value })` (FilterPanel) or `onUpdate(addressKey, { ... })` (ShortlistDrawer), which immediately triggers React state updates and downstream effects.

3. **Expensive downstream effects amplify the problem**: The search input is the worst offender because `filters.search` state change triggers:
   - Geographic intent resolution (town name matching against `sortedTowns`)
   - Block filtering across the entire dataset
   - Map marker re-rendering
   - Even with the 200ms debounce on `debouncedSearch`, the `filters.search` state itself updates immediately, causing the results list to re-filter on every intermediate keystroke.

4. **No existing composition infrastructure**: The codebase has zero references to `compositionstart`, `compositionend`, or `isComposing` — this is a missing feature, not a regression.

## Correctness Properties

Property 1: Bug Condition — IME Composition Suppresses State Updates

_For any_ `onChange` event that fires on an affected input while an IME composition is active (between `compositionstart` and `compositionend`), the state-update callback (either `onChange({ search })` or `onUpdate(addressKey, patch)`) SHALL NOT be invoked, and the application state SHALL remain unchanged.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition — Committed Value Propagates on compositionend

_For any_ `compositionend` event on an affected input, the state-update callback SHALL be invoked exactly once with the final committed value from `event.target.value`, and the value SHALL be processed identically to a direct keyboard input (no special transformation).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 3: Preservation — Non-IME Input Unchanged

_For any_ `onChange` event that fires on an affected input while NO IME composition is active, the state-update callback SHALL be invoked immediately with `event.target.value`, preserving the existing per-keystroke update behavior exactly as the original code.

**Validates: Requirements 3.1, 3.2, 3.3, 3.5**

Property 4: Preservation — Debounce Chain Intact

_For any_ committed search value (whether from IME or direct input), the value SHALL flow through the existing `useDebouncedValue(filters.search, 200)` hook for map rendering, preserving the existing debounce behavior.

**Validates: Requirements 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/hooks/useIMEComposition.ts` (new file)

**Hook**: `useIMEComposition`

**Specific Changes**:

1. **Create `useIMEComposition` hook**: A new custom hook that returns composition-aware event handlers.
   - Maintains a `composingRef` (`useRef<boolean>(false)`) to track whether a composition session is active.
   - Returns `{ onCompositionStart, onCompositionEnd, onChange }` handlers.
   - `onCompositionStart`: Sets `composingRef.current = true`.
   - `onCompositionEnd`: Sets `composingRef.current = false`, then invokes the user-provided callback with `event.target.value` (the committed text). Uses `event.currentTarget.value` as fallback for cross-browser safety.
   - `onChange`: Checks `composingRef.current`. If `true`, suppresses the callback. If `false`, invokes the callback with `event.target.value` (pass-through behavior).

   ```typescript
   // Pseudocode
   function useIMEComposition(callback: (value: string) => void) {
     const composingRef = useRef(false)

     const onCompositionStart = useCallback(() => {
       composingRef.current = true
     }, [])

     const onCompositionEnd = useCallback((e: CompositionEvent) => {
       composingRef.current = false
       callback(e.currentTarget.value)
     }, [callback])

     const onChange = useCallback((e: ChangeEvent) => {
       if (!composingRef.current) {
         callback(e.target.value)
       }
     }, [callback])

     return { onCompositionStart, onCompositionEnd, onChange }
   }
   ```

2. **Wire hook into `FilterPanel.tsx` search input**:
   - Call `useIMEComposition((value) => onChange({ search: value }))` in the component body.
   - Spread the returned handlers onto `InputGroupInput`: `onCompositionStart`, `onCompositionEnd`, `onChange`.

3. **Wire hook into `ShortlistDrawer.tsx` notes textarea**:
   - For each shortlist row's notes `Textarea`, use the hook's handlers. Since the hook is per-callback and the callback depends on `row.item.addressKey`, the hook call must be structured to handle the dynamic key. Two approaches:
     - **Option A**: Extract the row's editable section into a small sub-component that calls the hook internally.
     - **Option B**: Use the hook with a stable callback that receives the value and dispatches to `onUpdate` with the current row's key.
   - Option A is cleaner for React rules-of-hooks compliance (no hooks in loops).

4. **Wire hook into `ShortlistDrawer.tsx` target price input**:
   - Same approach as notes textarea. The callback converts the string value to `number | null` before calling `onUpdate`.

5. **Cross-browser consideration**: On Chrome, `compositionend` fires *before* the final `onChange`. On Safari/Firefox, `compositionend` fires *after* the final `onChange`. The `composingRef` approach handles both cases correctly:
   - Chrome: `compositionend` fires → `composingRef` set to `false` → callback invoked from `onCompositionEnd` handler → subsequent `onChange` (if any) also passes through (harmless duplicate, same value).
   - Safari/Firefox: `onChange` fires while `composingRef` is still `true` → suppressed → `compositionend` fires → `composingRef` set to `false` → callback invoked from `onCompositionEnd` handler.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that `onChange` handlers fire state updates during composition on the unfixed code.

**Test Plan**: Write unit tests using `@testing-library/react` and `@testing-library/user-event` that simulate IME composition events (`compositionstart`, input changes, `compositionend`) on each affected input. Run these tests on the UNFIXED code to observe that state updates fire during composition.

**Test Cases**:
1. **Search Input Composition Test**: Simulate `compositionstart` → type intermediate characters → verify `onChange` callback fires during composition (will demonstrate bug on unfixed code)
2. **Notes Textarea Composition Test**: Simulate `compositionstart` → type intermediate characters → verify `onUpdate` fires during composition (will demonstrate bug on unfixed code)
3. **Target Price Composition Test**: Simulate `compositionstart` → type intermediate characters → verify `onUpdate` fires during composition (will demonstrate bug on unfixed code)
4. **Multi-keystroke Composition Test**: Simulate a full Pinyin sequence ("dby" → "大巴窑") and count how many times the callback fires (will show N intermediate calls on unfixed code)

**Expected Counterexamples**:
- State-update callbacks are invoked on every intermediate keystroke during composition
- The search input triggers filtering with partial romanization text
- The notes textarea persists incomplete syllables to localStorage

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code suppresses intermediate updates and propagates only the committed value.

**Pseudocode:**
```
FOR ALL event WHERE isBugCondition(event) DO
  callbackCallCount_before ← callbackSpy.callCount
  fireOnChange(event)
  ASSERT callbackSpy.callCount = callbackCallCount_before
  // Callback must NOT be invoked during composition
END FOR

// Then on compositionend:
fireCompositionEnd(committedValue)
ASSERT callbackSpy.calledOnceWith(committedValue)
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL event WHERE NOT isBugCondition(event) DO
  ASSERT F(event) = F'(event)
  // For all non-composing onChange events, the callback fires immediately with event.target.value
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random string inputs to verify that non-IME onChange always propagates
- It catches edge cases like empty strings, whitespace-only input, special characters, and very long strings
- It provides strong guarantees that the hook is transparent for non-composing input

**Test Plan**: Write property-based tests using `fast-check` that generate random string values, simulate non-composing `onChange` events, and assert the callback is invoked with the exact value. Compare behavior against a baseline (direct callback invocation).

**Test Cases**:
1. **Direct Keyboard Preservation**: For any random string value, verify that `onChange` without active composition invokes the callback immediately with that value
2. **Paste Preservation**: Verify that paste events (no composition) continue to propagate immediately
3. **Clear/Delete Preservation**: Verify that clearing input (empty string onChange) propagates immediately
4. **Callback Identity Preservation**: Verify that the value passed to the callback is identical to `event.target.value` with no transformation

### Unit Tests

- Test `useIMEComposition` hook in isolation: composition lifecycle (start → intermediate → end) suppresses intermediate callbacks and flushes on end
- Test `useIMEComposition` hook: non-composing onChange passes through immediately
- Test `useIMEComposition` hook: multiple composition sessions in sequence each flush correctly
- Test `useIMEComposition` hook: compositionend with empty string (user cancelled composition)
- Test `useIMEComposition` hook: rapid composition start/end (single character commit)
- Test FilterPanel search input integration: IME composition does not update `filters.search` until commit
- Test ShortlistDrawer notes textarea integration: IME composition does not call `onUpdate` until commit
- Test ShortlistDrawer target price input integration: IME composition does not call `onUpdate` until commit

### Property-Based Tests

- Generate random strings and verify `useIMEComposition` onChange pass-through for non-composing input (preservation)
- Generate random composition sequences (start → N intermediate values → end with committed value) and verify only the committed value reaches the callback (fix checking)
- Generate random interleaved composing/non-composing event sequences and verify correct callback invocation count

### Integration Tests

- Test full FilterPanel rendering with simulated IME composition: verify no intermediate re-renders of results list
- Test full ShortlistDrawer rendering with simulated IME composition on notes: verify no intermediate localStorage writes
- Test that `useDebouncedValue` chain remains intact: committed search value still debounces for map rendering
