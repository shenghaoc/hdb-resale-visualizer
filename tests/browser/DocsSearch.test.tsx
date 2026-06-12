import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import { useI18n } from "@/shared/lib/i18n/useI18n";
import { DocsSearch } from "@/features/docs/DocsSearch";

/** Wrapper that provides I18nProvider and passes the translator to DocsSearch. */
function DocsSearchWithI18n() {
  const { t } = useI18n();
  return <DocsSearch t={t} />;
}

function renderSearch() {
  return render(
    <I18nProvider>
      <DocsSearchWithI18n />
    </I18nProvider>,
  );
}

describe("DocsSearch", () => {
  it("renders a combobox input with correct ARIA attributes", () => {
    renderSearch();

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("autocomplete", "off");
  });

  it("shows results when typing a matching query", async () => {
    const user = userEvent.setup();
    renderSearch();

    const input = screen.getByRole("combobox");
    await user.type(input, "filter");

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows no-results message when query does not match", async () => {
    const user = userEvent.setup();
    renderSearch();

    const input = screen.getByRole("combobox");
    await user.type(input, "zzzznonexistentquery");

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/no matching guide sections/i)).toBeInTheDocument();
  });

  it("closes the dropdown on Escape key", async () => {
    const user = userEvent.setup();
    renderSearch();

    const input = screen.getByRole("combobox");
    await user.type(input, "filter");
    expect(input).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("");
  });
});
