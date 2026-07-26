import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SearchCombobox } from "@/components/SearchCombobox";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import type { Suggestion } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchSuggestions: vi.fn<(query: string) => Promise<Suggestion[]>>(),
}));

vi.mock("@/shared/lib/data", () => ({
  fetchSuggestions: dataMocks.fetchSuggestions,
}));

function Harness({
  onSelectSuggestion = vi.fn(),
}: {
  onSelectSuggestion?: (item: Suggestion) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <I18nProvider>
      <SearchCombobox
        value={value}
        onValueChange={setValue}
        onSelectSuggestion={onSelectSuggestion}
        t={(key) => key}
        aria-label="Block search"
        groups={["block"]}
      />
    </I18nProvider>
  );
}

describe("SearchCombobox constrained groups", () => {
  beforeEach(() => {
    dataMocks.fetchSuggestions.mockReset();
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
});
