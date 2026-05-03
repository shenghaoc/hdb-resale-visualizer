import { type ChangeEvent, type CompositionEvent, useCallback, useRef } from "react";

/**
 * Tracks the browser's IME composition lifecycle and returns event handlers
 * that suppress callback propagation during active composition, flushing
 * the committed value only on `compositionend`.
 *
 * Non-IME keyboard input passes through `onChange` unchanged.
 *
 * Cross-browser note: Chrome fires `compositionend` before the final
 * `onChange`; Safari/Firefox fire it after. Using `currentTarget.value`
 * in `onCompositionEnd` ensures the committed value is captured in both cases.
 */
export function useIMEComposition(callback: (value: string) => void) {
  const composingRef = useRef<boolean>(false);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(
    (e: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composingRef.current = false;
      callback(e.currentTarget.value);
    },
    [callback],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!composingRef.current) {
        callback(e.target.value);
      }
    },
    [callback],
  );

  return { onCompositionStart, onCompositionEnd, onChange };
}
