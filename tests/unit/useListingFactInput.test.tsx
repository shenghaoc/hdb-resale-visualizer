import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { useListingFactInput } from "@/features/listing-check/useListingFactInput";
import {
  parseLeaseCommenceYearInput,
  parsePositiveDecimalInput,
} from "@/features/listing-check/listingCheckInputs";
import type { ChangeEvent } from "react";

function changeEvent(value: string): ChangeEvent<HTMLInputElement> {
  return { target: { value } } as ChangeEvent<HTMLInputElement>;
}

describe("useListingFactInput", () => {
  it("displays committed external value when idle", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useListingFactInput({
        value: 650000,
        parse: parsePositiveDecimalInput,
        onCommit,
      }),
    );
    expect(result.current.value).toBe("650000");
  });

  it("preserves intermediate invalid draft while editing", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useListingFactInput({
        value: 650000,
        parse: parsePositiveDecimalInput,
        onCommit,
      }),
    );

    act(() => {
      result.current.onFocus();
    });
    act(() => {
      result.current.onChange(changeEvent("0"));
    });

    expect(result.current.value).toBe("0");
    // "0" is not a positive decimal — should not commit
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("clearing immediately commits null", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useListingFactInput({
        value: 650000,
        parse: parsePositiveDecimalInput,
        onCommit,
      }),
    );

    act(() => {
      result.current.onFocus();
    });
    act(() => {
      result.current.onChange(changeEvent(""));
    });

    expect(onCommit).toHaveBeenCalledWith(null);
    expect(result.current.value).toBe("");
  });

  it("valid decimal commits", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useListingFactInput({
        value: null,
        parse: parsePositiveDecimalInput,
        onCommit,
      }),
    );

    act(() => {
      result.current.onFocus();
    });
    act(() => {
      result.current.onChange(changeEvent("93.5"));
    });

    expect(onCommit).toHaveBeenCalledWith(93.5);
    expect(result.current.value).toBe("93.5");
  });

  it("invalid value normalizes on blur", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useListingFactInput({
        value: 100,
        parse: parsePositiveDecimalInput,
        onCommit,
      }),
    );

    act(() => {
      result.current.onFocus();
    });
    act(() => {
      result.current.onChange(changeEvent("abc"));
    });
    act(() => {
      result.current.onBlur();
    });

    expect(onCommit).toHaveBeenLastCalledWith(null);
    // After blur, draft is cleared; external value still 100 until parent updates
    expect(result.current.value).toBe("100");
  });

  it("idle blur does not clear a committed parent value", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useListingFactInput({
        value: 650000,
        parse: parsePositiveDecimalInput,
        onCommit,
      }),
    );

    act(() => {
      result.current.onBlur();
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.value).toBe("650000");
  });

  it("external sample/deep-link value appears when not editing", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: number | null }) =>
        useListingFactInput({
          value,
          parse: parsePositiveDecimalInput,
          onCommit,
        }),
      { initialProps: { value: 100 as number | null } },
    );

    expect(result.current.value).toBe("100");

    rerender({ value: 999999 });
    expect(result.current.value).toBe("999999");
  });

  it("external prop changes do not overwrite an active draft", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: number | null }) =>
        useListingFactInput({
          value,
          parse: parsePositiveDecimalInput,
          onCommit,
        }),
      { initialProps: { value: 100 as number | null } },
    );

    act(() => {
      result.current.onFocus();
    });
    act(() => {
      result.current.onChange(changeEvent("12"));
    });
    expect(result.current.value).toBe("12");

    rerender({ value: 999 });
    expect(result.current.value).toBe("12");
  });

  it("latest committed external value appears after editing ends", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: number | null }) =>
        useListingFactInput({
          value,
          parse: parsePositiveDecimalInput,
          onCommit,
        }),
      { initialProps: { value: 100 as number | null } },
    );

    act(() => {
      result.current.onFocus();
    });
    act(() => {
      result.current.onChange(changeEvent("200"));
    });
    act(() => {
      result.current.onBlur();
    });

    rerender({ value: 200 });
    expect(result.current.value).toBe("200");
  });

  it("lease parser rejects incomplete years while preserving draft text", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useListingFactInput({
        value: 1990,
        parse: parseLeaseCommenceYearInput,
        onCommit,
      }),
    );

    act(() => {
      result.current.onFocus();
    });
    act(() => {
      result.current.onChange(changeEvent("198"));
    });

    expect(result.current.value).toBe("198");
    expect(onCommit).not.toHaveBeenCalled();
  });
});
