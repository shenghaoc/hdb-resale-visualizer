import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DocsPage } from "@/features/docs/DocsPage";
import { DOCS_SYNCED_AT_TOKEN } from "@/features/docs/docsManifest";
import { I18nProvider } from "@/shared/lib/i18n";
import { formatDateTime } from "@/shared/lib/format";

const storedLocale = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/shared/lib/storage", () => ({
  safeStorage: {
    getItem: (key: string) => (key === "hdb-resale-locale" ? storedLocale.value : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

const SYNCED_AT = "2026-11-14T02:30:00.000Z";

const renderSourcesPage = (lastSyncedAt: string | null) =>
  render(
    <I18nProvider>
      <DocsPage lastSyncedAt={lastSyncedAt} />
    </I18nProvider>,
  );

const notice = () =>
  screen.getByText(/^Contains information from the datasets listed below, accessed on /);

describe("Data sources page access date", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/docs/data-sources");
  });

  afterEach(() => {
    cleanup();
    storedLocale.value = null;
    window.history.replaceState({}, "", "/");
  });

  it("states the sync time as the access date, formatted for English", () => {
    renderSourcesPage(SYNCED_AT);
    const date = formatDateTime(SYNCED_AT, "en-SG");
    expect(notice()).toHaveTextContent(
      `accessed on ${date}, the date of the most recent sync, from data.gov.sg`,
    );
    expect(document.body).not.toHaveTextContent(DOCS_SYNCED_AT_TOKEN);
  });

  it("gives a zh-SG reader the English sentence with the en-SG date, since the guide is English-only", () => {
    storedLocale.value = "zh-SG";
    renderSourcesPage(SYNCED_AT);
    const date = formatDateTime(SYNCED_AT, "en-SG");
    // The UI is in Chinese (the guide chrome proves it), but the English page gets no Chinese date or phrase.
    expect(screen.getByRole("button", { name: "返回应用" })).toBeInTheDocument();
    expect(notice()).toHaveTextContent(
      `accessed on ${date}, the date of the most recent sync, from data.gov.sg`,
    );
    expect(notice()).not.toHaveTextContent(formatDateTime(SYNCED_AT, "zh-SG"));
    expect(notice()).not.toHaveTextContent("最近一次同步");
    expect(document.body).not.toHaveTextContent(DOCS_SYNCED_AT_TOKEN);
  });

  it("says plainly that the date is unavailable when the copy has no sync time", () => {
    renderSourcesPage(null);
    expect(notice()).toHaveTextContent(
      "accessed on the date of the most recent sync (not available in this copy), from data.gov.sg",
    );
    expect(document.body).not.toHaveTextContent(DOCS_SYNCED_AT_TOKEN);
  });

  it("gives a zh-SG reader the English fallback when the copy has no sync time", () => {
    storedLocale.value = "zh-SG";
    renderSourcesPage(null);
    expect(screen.getByRole("button", { name: "返回应用" })).toBeInTheDocument();
    expect(notice()).toHaveTextContent(
      "accessed on the date of the most recent sync (not available in this copy), from data.gov.sg",
    );
    expect(notice()).not.toHaveTextContent("最近一次同步");
    expect(document.body).not.toHaveTextContent(DOCS_SYNCED_AT_TOKEN);
  });
});
