import { describe, expect, it } from "vite-plus/test";
import {
  buildDocsSearchEntries,
  DOCS_SYNCED_AT_TOKEN,
  getDocsSection,
} from "@/features/docs/docsManifest";
import * as syncConstants from "../../scripts/lib/sync/constants";

const page = getDocsSection("data-sources").content;

// Every data.gov.sg id the sync knows about, found by naming convention rather than listed by hand, so a dataset
// added to constants.ts fails this test until the page names it too.
const syncSourceUrls = Object.entries(syncConstants).flatMap(([name, id]) => {
  if (name.endsWith("_DATASET_ID")) return [[name, `https://data.gov.sg/datasets/${id}/view`]];
  if (name.endsWith("_COLLECTION_ID"))
    return [[name, `https://data.gov.sg/collections/${id}/view`]];
  return [];
});

describe("Data sources and licence guide page", () => {
  it("carries the notice the Singapore Open Data Licence asks for, with its link", () => {
    expect(page).toContain("Contains information from the datasets listed below");
    expect(page).toContain("from [data.gov.sg](https://data.gov.sg)");
    expect(page).toContain(
      "[Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence)",
    );
    // The access date is the sync time, put into the page itself when it renders (DocsPage), not left to the
    // header, which hides it on small screens.
    expect(page).toContain(`accessed on ${DOCS_SYNCED_AT_TOKEN}, from`);
  });

  it("keeps the access-date placeholder out of guide search snippets", () => {
    const sourceEntries = buildDocsSearchEntries().filter((entry) => entry.slug === "data-sources");
    expect(sourceEntries.length).toBeGreaterThan(0);
    for (const entry of sourceEntries) {
      expect(entry.body).not.toContain("{{");
    }
    expect(sourceEntries.map((entry) => entry.body).join(" ")).toContain(
      "accessed on the date of the most recent sync, from",
    );
  });

  it("lists every dataset the sync pulls from data.gov.sg, so the page cannot fall behind the pipeline", () => {
    // Guards the naming convention itself: if the suffixes were renamed, the loop below would check nothing.
    expect(syncSourceUrls.length).toBeGreaterThanOrEqual(7);
    for (const [name, url] of syncSourceUrls) {
      expect(page, name).toContain(url);
    }
  });

  it("names each publisher, and says the tool has no official status and no endorsement", () => {
    for (const publisher of [
      "Housing & Development Board",
      "Land Transport Authority",
      "Ministry of Education",
      "National Environment Agency",
      "National Parks Board",
    ]) {
      expect(page, publisher).toContain(publisher);
    }
    expect(page).toContain("has no official status");
    expect(page).toContain("none of the agencies above endorses it");
  });

  it("keeps the OneMap credit its terms ask for", () => {
    expect(page).toContain("© OneMap contributors, Singapore Land Authority");
  });
});
