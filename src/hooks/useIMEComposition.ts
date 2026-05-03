import { type ChangeEvent, type CompositionEvent, useCallback, useRef } from "react";

/**
 * Tracks the browser's IME composition lifecycle and returns event handlers
 * that suppress callback propagation during active composition, flushing
 * the committed value only on `compositionend`.
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
      callbackRef.current(e.currentTarget.value);
    },
    [],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!composingRef.current) {
        callbackRef.current(e.currentTarget.value);
      }
    },
    [],
  );

  return { onCompositionStart, onCompositionEnd, onChange };
}
