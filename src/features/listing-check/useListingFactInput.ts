import { useCallback, useState, type ChangeEvent } from "react";

export type UseListingFactInputOptions = {
  value: number | null;
  parse: (raw: string) => number | null;
  onCommit: (value: number | null) => void;
};

export type ListingFactInput = {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
};

/**
 * Narrow draft-input helper for listing fact numbers (asking price, floor area,
 * lease year). Keeps intermediate invalid text while editing, commits valid
 * values immediately, and displays the latest external value when idle.
 *
 * No state is updated during render — external prop changes appear via the
 * idle display path without a prop-to-state sync effect.
 */
export function useListingFactInput({
  value,
  parse,
  onCommit,
}: UseListingFactInputOptions): ListingFactInput {
  const [draft, setDraft] = useState<string | null>(null);
  /** True only after the user has typed; focus alone is not dirty. */
  const [dirty, setDirty] = useState(false);
  const isEditing = draft !== null;
  const displayValue = isEditing ? draft : value == null ? "" : String(value);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      setDraft(raw);
      setDirty(true);
      if (raw.trim() === "") {
        onCommit(null);
        return;
      }
      const parsed = parse(raw);
      if (parsed != null) {
        onCommit(parsed);
      }
    },
    [onCommit, parse],
  );

  const onFocus = useCallback(() => {
    setDraft(value == null ? "" : String(value));
    setDirty(false);
  }, [value]);

  const onBlur = useCallback(() => {
    // Only normalize when the user actually edited. Idle blur and focus→blur
    // without typing must not overwrite a parent value that may have changed
    // while the field was focused (sample apply, deep-link, re-hydration).
    if (draft === null) return;
    if (dirty) {
      onCommit(parse(draft));
    }
    setDraft(null);
    setDirty(false);
  }, [draft, dirty, onCommit, parse]);

  return {
    value: displayValue,
    onChange,
    onFocus,
    onBlur,
  };
}
