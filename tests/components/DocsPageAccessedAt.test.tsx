import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DocsPage } from "@/features/docs/DocsPage";
import { DOCS_ACCESSED_AT_TOKEN } from "@/features/docs/docsManifest";
import { I18nProvider } from "@/shared/lib/i18n";
import { deriveDataQualityState } from "@/shared/lib/dataQuality";
import { formatDateTime } from "@/shared/lib/format";
import type { Manifest } from "@/types/data";

const storedLocale = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/shared/lib/storage", () => ({
  safeStorage: {
    getItem: (key: string) => (key === "hdb-resale-locale" ? storedLocale.value : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

// The pipeline's run time (manifest.generatedAt) is when this copy downloaded the data; sources.lastUpdatedAt is
// data.gov.sg's own "last updated" time for the resale collection, which the header labels "Synced". They differ here
// so a test can tell which one the page shows.
const GENERATED_AT = "2026-11-14T02:30:00.000Z";
const PUBLISHER_UPDATED_AT = "2026-10-01T09:15:00.000Z";

const manifestWith = (generatedAt: string | undefined) =>
  ({
    generatedAt,
    sources: { lastUpdatedAt: PUBLISHER_UPDATED_AT, resaleCollectionId: "189" },
  }) as Partial<Manifest>;

// The same derivation AppWithErrorBoundary uses to feed DocsPage.
const renderSourcesPage = (manifest: Partial<Manifest>) =>
  render(
    <I18nProvider>
      <DocsPage dataAccessedAt={deriveDataQualityState(manifest).generatedAt} />
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

  it("states when this copy downloaded the data, formatted for English", () => {
    renderSourcesPage(manifestWith(GENERATED_AT));
    const date = formatDateTime(GENERATED_AT, "en-SG");
    expect(notice()).toHaveTextContent(
      `accessed on ${date}, the date this copy last downloaded the data, from data.gov.sg`,
    );
    expect(document.body).not.toHaveTextContent(DOCS_ACCESSED_AT_TOKEN);
  });

  it("uses the download time, not the publisher's update time, when the two differ", () => {
    const manifest = manifestWith(GENERATED_AT);
    // Guard the premise: the header's "Synced" value is the publisher's time and differs from ours.
    expect(deriveDataQualityState(manifest).lastSyncedAt).toBe(PUBLISHER_UPDATED_AT);
    const ours = formatDateTime(GENERATED_AT, "en-SG");
    const publishers = formatDateTime(PUBLISHER_UPDATED_AT, "en-SG");
    expect(ours).not.toBe(publishers);

    renderSourcesPage(manifest);
    for (const element of screen.getAllByText(/accessed on /)) {
      expect(element).toHaveTextContent(ours);
      expect(element).not.toHaveTextContent(publishers);
    }
    expect(document.body).not.toHaveTextContent(publishers);
  });

  it("gives a zh-SG reader the English sentence with the en-SG date, since the guide is English-only", () => {
    storedLocale.value = "zh-SG";
    renderSourcesPage(manifestWith(GENERATED_AT));
    const date = formatDateTime(GENERATED_AT, "en-SG");
    // The UI is in Chinese (the guide chrome proves it), but the English page gets no Chinese date or phrase.
    expect(screen.getByRole("button", { name: "返回应用" })).toBeInTheDocument();
    expect(notice()).toHaveTextContent(
      `accessed on ${date}, the date this copy last downloaded the data, from data.gov.sg`,
    );
    expect(notice()).not.toHaveTextContent(formatDateTime(GENERATED_AT, "zh-SG"));
    expect(document.body).not.toHaveTextContent(DOCS_ACCESSED_AT_TOKEN);
  });

  it("says plainly that the date is unavailable when the copy has no download time", () => {
    // The publisher's time alone must not stand in for ours.
    renderSourcesPage(manifestWith(undefined));
    expect(notice()).toHaveTextContent(
      "accessed on the date this copy last downloaded the data (not available in this copy), from data.gov.sg",
    );
    expect(document.body).not.toHaveTextContent(formatDateTime(PUBLISHER_UPDATED_AT, "en-SG"));
    expect(document.body).not.toHaveTextContent(DOCS_ACCESSED_AT_TOKEN);
  });

  it("gives a zh-SG reader the English fallback when the copy has no download time", () => {
    storedLocale.value = "zh-SG";
    renderSourcesPage(manifestWith(undefined));
    expect(screen.getByRole("button", { name: "返回应用" })).toBeInTheDocument();
    expect(notice()).toHaveTextContent(
      "accessed on the date this copy last downloaded the data (not available in this copy), from data.gov.sg",
    );
    expect(notice()).not.toHaveTextContent("最近一次同步");
    expect(document.body).not.toHaveTextContent(DOCS_ACCESSED_AT_TOKEN);
  });
});
