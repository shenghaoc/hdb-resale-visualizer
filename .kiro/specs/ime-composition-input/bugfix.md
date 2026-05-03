# Bugfix Requirements Document

## Introduction

When users type using an Input Method Editor (IME) — required for CJK languages such as Mandarin Chinese, Japanese, and Korean — the application processes every intermediate keystroke before the user has committed a composed character. This causes immediate state updates, expensive filtering/rendering cycles, focus loss, and garbled input, making the app unusable for CJK language users. The root cause is that all text input `onChange` handlers fire state updates unconditionally, with zero awareness of the browser's `compositionstart` / `compositionend` lifecycle.

Three input sites are affected:
1. **Search input** in `FilterPanel.tsx` — the primary offender, as it triggers geographic intent resolution, block filtering, and map re-rendering on every keystroke.
2. **Notes textarea** in `ShortlistDrawer.tsx` — triggers shortlist persistence on every keystroke.
3. **Target price input** in `ShortlistDrawer.tsx` — triggers shortlist persistence and gap recalculation on every keystroke.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user is composing text via an IME in the search input (between `compositionstart` and `compositionend` events) THEN the system immediately updates `filters.search` state on every intermediate keystroke, triggering geographic intent resolution, block filtering, and map re-rendering with incomplete/uncommitted text.

1.2 WHEN a user is composing text via an IME in the shortlist notes textarea (between `compositionstart` and `compositionend` events) THEN the system immediately calls `onUpdate` with incomplete/uncommitted text on every intermediate keystroke, causing focus loss and garbled input.

1.3 WHEN a user is composing text via an IME in the shortlist target price input (between `compositionstart` and `compositionend` events) THEN the system immediately calls `onUpdate` with incomplete/uncommitted text on every intermediate keystroke, causing focus loss and garbled input.

1.4 WHEN a user is composing text via an IME in any text input THEN the system has no mechanism to detect or respect the IME composition lifecycle, as no `compositionstart`, `compositionend`, or `isComposing` checks exist anywhere in the codebase.

### Expected Behavior (Correct)

2.1 WHEN a user is composing text via an IME in the search input THEN the system SHALL suppress state updates to `filters.search` until the composition is committed (i.e., `compositionend` fires), and only then propagate the final committed value to trigger filtering and map rendering.

2.2 WHEN a user is composing text via an IME in the shortlist notes textarea THEN the system SHALL suppress `onUpdate` calls until the composition is committed, and only then propagate the final committed value.

2.3 WHEN a user is composing text via an IME in the shortlist target price input THEN the system SHALL suppress `onUpdate` calls until the composition is committed, and only then propagate the final committed value.

2.4 WHEN a user commits a composed character via an IME (on `compositionend`) THEN the system SHALL process the committed text identically to how it processes direct keyboard input — no special post-processing or value transformation beyond what already exists.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user types directly via a standard keyboard (no IME composition active) in the search input THEN the system SHALL CONTINUE TO update `filters.search` state on every keystroke as it does today.

3.2 WHEN a user types directly via a standard keyboard (no IME composition active) in the shortlist notes textarea THEN the system SHALL CONTINUE TO call `onUpdate` on every keystroke as it does today.

3.3 WHEN a user types directly via a standard keyboard (no IME composition active) in the shortlist target price input THEN the system SHALL CONTINUE TO call `onUpdate` on every keystroke as it does today.

3.4 WHEN the search input value changes (via committed IME input or direct keyboard input) THEN the system SHALL CONTINUE TO debounce map rendering via `useDebouncedValue` with the existing 200ms delay.

3.5 WHEN the user clears or deletes text in any of the affected inputs (via backspace, select-all-delete, or cut) THEN the system SHALL CONTINUE TO process the change immediately as it does today.

---

### Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type InputEvent
  OUTPUT: boolean

  // Returns true when the input event occurs during an active IME composition
  RETURN X.isComposing = true OR X.eventType = "compositionstart" OR
         (X.eventType = "change" AND activeComposition = true)
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Fix Checking — IME composition events do not trigger state propagation
FOR ALL X WHERE isBugCondition(X) DO
  stateBeforeEvent ← captureState()
  handleInput(X)
  stateAfterEvent ← captureState()
  ASSERT stateBeforeEvent = stateAfterEvent
  // State must not change during composition
END FOR
```

### Preservation Checking Property

```pascal
// Property: Preservation Checking — Non-IME input continues to work identically
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
  // For all non-composing input events, the fixed code behaves identically to the original
END FOR
```
