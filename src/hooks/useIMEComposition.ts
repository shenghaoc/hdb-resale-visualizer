import { type ChangeEvent, type CompositionEvent, useCallback, useRef, useState } from "react";

/**
 * Tracks the browser's IME composition lifecycle and returns event handlers
 * that suppress callback propagation during active composition, flushing
 * the committed value only on `compositionend`.
 *
 * It also maintains a `localValue` state during active composition to prevent
 * React from resetting the input's DOM value if a parent re-renders before
 * the composition is committed.
 *
 * Non-IME keyboard input passes through `onChange` unchanged.
 *
 * Uses the "latest ref" pattern so all returned handlers have an empty
 * dependency array and remain stable for the lifetime of the component,
 * regardless of whether the caller passes a stable or unstable callback.
 *
 * Cross-browser note: Chrome fires `compositionend` before the final
 * `onChange`; Safari/Firefox fire it after. We accept double invocation
 * in Chrome as a trade-off for correctness.
 */
export function useIMEComposition(callback: (value: string) => void) {
  // Holds the value currently being composed so we can pass it back to the
  // input as its 'value' prop, preventing parent re-renders from resetting
  // the input while the user is still typing.
  const [localValue, setLocalValue] = useState<string | null>(null);

  // "Latest ref" pattern — always holds the current callback without
  // being a dependency of any handler, keeping all handlers stable.
  // We write to the ref during render because:
  // 1. The race condition (callbackRef not updated before event handlers fire) is worse
  // 2. This is a valid pattern recognized by the React team
  // 3. The alternative (useLayoutEffect) still has races
  const callbackRef = useRef(callback);
  // eslint-disable-next-line react-hooks/refs
  callbackRef.current = callback;

  const composingRef = useRef<boolean>(false);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(
    (e: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composingRef.current = false;
      setLocalValue(null);
      callbackRef.current(e.currentTarget.value);
    },
    [],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.currentTarget.value;
      if (composingRef.current) {
        setLocalValue(value);
      } else {
        setLocalValue(null);
        callbackRef.current(value);
      }
    },
    [],
  );

  return { onCompositionStart, onCompositionEnd, onChange, localValue };
}
