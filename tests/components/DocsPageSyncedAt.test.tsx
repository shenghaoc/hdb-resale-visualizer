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

  it("states the sync time formatted for zh-SG", () => {
    storedLocale.value = "zh-SG";
    renderSourcesPage(SYNCED_AT);
    const date = formatDateTime(SYNCED_AT, "zh-SG");
    expect(date).not.toBe(formatDateTime(SYNCED_AT, "en-SG"));
    expect(notice()).toHaveTextContent(
      `accessed on ${date}（最近一次同步的日期）, from data.gov.sg`,
    );
    expect(document.body).not.toHaveTextContent(DOCS_SYNCED_AT_TOKEN);
  });

  it("says plainly that the date is unavailable when the copy has no sync time", () => {
    renderSourcesPage(null);
    expect(notice()).toHaveTextContent(
      "accessed on the date of the most recent sync (not available in this copy), from data.gov.sg",
    );
    expect(document.body).not.toHaveTextContent(DOCS_SYNCED_AT_TOKEN);
  });

  it("says the same in zh-SG when the copy has no sync time", () => {
    storedLocale.value = "zh-SG";
    renderSourcesPage(null);
    expect(notice()).toHaveTextContent(
      "accessed on 最近一次同步的日期（此副本中不可用）, from data.gov.sg",
    );
    expect(document.body).not.toHaveTextContent(DOCS_SYNCED_AT_TOKEN);
  });
});
