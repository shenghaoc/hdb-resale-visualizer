import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SearchCombobox } from "@/components/SearchCombobox";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import type { Suggestion } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchSuggestions: vi.fn<(query: string, signal?: AbortSignal) => Promise<Suggestion[]>>(),
}));

vi.mock("@/shared/lib/data", () => ({
  fetchSuggestions: dataMocks.fetchSuggestions,
}));

function Harness({
  onSelectSuggestion = vi.fn(),
  updateValueOnSelection = false,
}: {
  onSelectSuggestion?: (item: Suggestion) => void;
  updateValueOnSelection?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <I18nProvider>
      <SearchCombobox
        value={value}
        onValueChange={setValue}
        onSelectSuggestion={(item) => {
          onSelectSuggestion(item);
          if (updateValueOnSelection) {
            setValue(item.label);
          }
        }}
        t={(key) => key}
        aria-label="Block search"
        groups={["block"]}
      />
    </I18nProvider>
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("SearchCombobox constrained groups", () => {
  beforeEach(() => {
    dataMocks.fetchSuggestions.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not open an empty popover for a disallowed-only response", async () => {
    dataMocks.fetchSuggestions.mockResolvedValue([
      { group: "postal", label: "Postal 123456", search: "123456" },
    ]);
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Block search" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "12" } });

    await waitFor(() =>
      expect(dataMocks.fetchSuggestions).toHaveBeenCalledWith("12", expect.anything()),
    );
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows and selects only actionable suggestions from a mixed response", async () => {
    const onSelectSuggestion = vi.fn();
    dataMocks.fetchSuggestions.mockResolvedValue([
      { group: "postal", label: "Postal 123456", search: "123456" },
      {
        group: "block",
        label: "123 Bedok North Street 2",
        addressKey: "bedok-123-example",
      },
    ]);
    render(<Harness onSelectSuggestion={onSelectSuggestion} />);

    const input = screen.getByRole("combobox", { name: "Block search" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "123" } });

    expect(await screen.findByRole("option", { name: /123 Bedok North Street 2/ })).toBeVisible();
    expect(screen.queryByText("Postal 123456")).toBeNull();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ group: "block", addressKey: "bedok-123-example" }),
    );
  });

  it("never exposes a deferred response after the controlled value changes", async () => {
    vi.useFakeTimers();
    const staleResponse = createDeferred<Suggestion[]>();
    const currentResponse = createDeferred<Suggestion[]>();
    const onSelectSuggestion = vi.fn();
    dataMocks.fetchSuggestions.mockImplementation((query) =>
      query === "12" ? staleResponse.promise : currentResponse.promise,
    );
    render(<Harness onSelectSuggestion={onSelectSuggestion} />);

    const input = screen.getByRole("combobox", { name: "Block search" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "12" } });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(dataMocks.fetchSuggestions).toHaveBeenCalledWith("12", expect.anything());

    fireEvent.change(input, { target: { value: "123" } });
    await act(async () => {
      staleResponse.resolve([
        {
          group: "block",
          label: "12 Stale Street",
          addressKey: "stale-12",
        },
      ]);
      await Promise.resolve();
    });

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("option", { name: /12 Stale Street/ })).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectSuggestion).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(dataMocks.fetchSuggestions).toHaveBeenCalledWith("123", expect.anything());

    await act(async () => {
      currentResponse.resolve([
        {
          group: "block",
          label: "123 Current Street",
          addressKey: "current-123",
        },
      ]);
      await Promise.resolve();
    });
    expect(screen.getByRole("option", { name: /123 Current Street/ })).toBeVisible();
  });

  it("keeps the popover closed after selection until the user edits again", async () => {
    vi.useFakeTimers();
    const selectedSuggestion: Suggestion = {
      group: "block",
      label: "123 Bedok North Street 2",
      addressKey: "bedok-123-example",
    };
    dataMocks.fetchSuggestions.mockResolvedValue([selectedSuggestion]);
    render(<Harness updateValueOnSelection />);

    const input = screen.getByRole("combobox", { name: "Block search" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "123" } });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("option", { name: /123 Bedok North Street 2/ }));
    expect(input).toHaveValue("123 Bedok North Street 2");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(dataMocks.fetchSuggestions).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "123 Bedok" } });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(dataMocks.fetchSuggestions).toHaveBeenLastCalledWith("123 Bedok", expect.anything());
    expect(screen.getByRole("option", { name: /123 Bedok North Street 2/ })).toBeVisible();
  });
});
