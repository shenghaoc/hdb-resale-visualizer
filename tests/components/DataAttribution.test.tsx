import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DataAttribution } from "@/components/DataAttribution";
import { I18nProvider } from "@/shared/lib/i18n";
import { ONEMAP_HOME_URL, SINGAPORE_OPEN_DATA_LICENCE_URL } from "@/shared/lib/constants";

const storedLocale = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/shared/lib/storage", () => ({
  safeStorage: {
    getItem: (key: string) => (key === "hdb-resale-locale" ? storedLocale.value : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

const renderCredit = () =>
  render(
    <I18nProvider>
      <DataAttribution />
    </I18nProvider>,
  );

afterEach(() => {
  storedLocale.value = null;
  window.history.replaceState({}, "", "/");
});

describe("map credit", () => {
  it("keeps the OneMap credit and adds the Singapore Open Data Licence notice with its link", () => {
    renderCredit();
    const credit = screen.getByTestId("map-attribution");

    const oneMap = within(credit).getByRole("link", { name: "© OneMap contributors" });
    expect(oneMap).toHaveAttribute("href", ONEMAP_HOME_URL);
    expect(oneMap).toHaveAttribute("target", "_blank");
    expect(oneMap).toHaveAttribute("rel", expect.stringContaining("noopener"));

    // The licence asks for "a conspicuous notice acknowledging the source of the datasets" and "a link to the most
    // recent version of this Licence": both are in the one credit, and the link is the licence's own page.
    expect(credit).toHaveTextContent(
      "Data from data.gov.sg under the Singapore Open Data Licence v1.0",
    );
    const licence = within(credit).getByRole("link", { name: "Singapore Open Data Licence v1.0" });
    expect(licence).toHaveAttribute("href", "https://data.gov.sg/open-data-licence");
    expect(licence).toHaveAttribute("href", SINGAPORE_OPEN_DATA_LICENCE_URL);
    expect(licence).toHaveAttribute("target", "_blank");
    expect(licence).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("links to the page that names every dataset, and opens it without leaving the app", async () => {
    renderCredit();
    const sources = within(screen.getByTestId("map-attribution")).getByRole("link", {
      name: "Data sources",
    });
    expect(sources).toHaveAttribute("href", "/docs/data-sources");
    await userEvent.click(sources);
    expect(window.location.pathname).toBe("/docs/data-sources");
  });

  it("is readable in Chinese while the licence keeps its official English name", () => {
    storedLocale.value = "zh-SG";
    renderCredit();
    const credit = screen.getByTestId("map-attribution");
    expect(credit).toHaveTextContent("数据来自 data.gov.sg，适用 Singapore Open Data Licence v1.0");
    expect(within(credit).getByRole("link", { name: "数据来源" })).toHaveAttribute(
      "href",
      "/docs/data-sources",
    );
    expect(
      within(credit).getByRole("link", { name: "Singapore Open Data Licence v1.0" }),
    ).toHaveAttribute("href", SINGAPORE_OPEN_DATA_LICENCE_URL);
  });
});
