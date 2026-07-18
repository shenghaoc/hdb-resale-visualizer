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
  const isEditing = draft !== null;
  const displayValue = isEditing ? draft : value == null ? "" : String(value);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      setDraft(raw);
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
  }, [value]);

  const onBlur = useCallback(() => {
    // Only commit when an edit session is active. A programmatic or double blur
    // with draft === null must not overwrite a valid parent value with null.
    if (draft === null) return;
    onCommit(parse(draft));
    setDraft(null);
  }, [draft, onCommit, parse]);

  return {
    value: displayValue,
    onChange,
    onFocus,
    onBlur,
  };
}
