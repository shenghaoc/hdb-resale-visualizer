import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/shared/lib/i18n";
import { DocsPage } from "@/features/docs/DocsPage";

function renderDocs() {
  return render(
    <I18nProvider>
      <DocsPage />
    </I18nProvider>,
  );
}

describe("DocsPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/docs");
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("renders the overview with nav and disclaimer at /docs", () => {
    renderDocs();
    expect(
      screen.getByRole("heading", { level: 1, name: /HDB Resale Explorer — User Guide/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "User guide sections" })).toBeInTheDocument();
    expect(
      screen.getByText(/financial, legal, valuation, property, or purchasing advice/i),
    ).toBeInTheDocument();
  });

  it("marks the active section and navigates between sections via pushState", () => {
    renderDocs();
    const nav = screen.getByRole("navigation", { name: "User guide sections" });
    expect(within(nav).getByText("Overview")).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(nav).getByText("Troubleshooting"));
    expect(window.location.pathname).toBe("/docs/troubleshooting");
    expect(within(nav).getByText("Troubleshooting")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: "Troubleshooting" })).toBeInTheDocument();
  });

  it("renders the section for a deep-linked subpath", () => {
    window.history.replaceState({}, "", "/docs/faq");
    renderDocs();
    expect(screen.getByRole("heading", { level: 1, name: "FAQ" })).toBeInTheDocument();
  });

  it("preserves the query string when navigating back to the app", () => {
    window.history.replaceState({}, "", "/docs?town=BEDOK");
    renderDocs();
    fireEvent.click(screen.getByRole("button", { name: "Back to app" }));
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?town=BEDOK");
  });

  it("finds sections through local search", () => {
    renderDocs();
    const input = screen.getByRole("combobox", { name: "Search the user guide" });
    fireEvent.change(input, { target: { value: "stale cache" } });
    const listbox = screen.getByRole("listbox", { name: "Search the user guide" });
    const option = within(listbox).getAllByRole("option")[0];
    expect(option).toHaveTextContent("Troubleshooting");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(window.location.pathname).toBe("/docs/troubleshooting");
  });
});
