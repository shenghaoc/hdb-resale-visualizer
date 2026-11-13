import { describe, expect, it } from "vite-plus/test";
import { getDocsSection } from "@/features/docs/docsManifest";
import {
  MOE_SCHOOL_DATASET_ID,
  MRT_DATASET_ID,
  NEA_HAWKER_DATASET_ID,
  NPARKS_PARKS_DATASET_ID,
  PROPERTY_DATASET_ID,
  RESALE_COLLECTION_ID,
  SFA_SUPERMARKET_DATASET_ID,
} from "../../scripts/lib/sync/constants";

const page = getDocsSection("data-sources").content;

describe("Data sources and licence guide page", () => {
  it("carries the notice the Singapore Open Data Licence asks for, with its link", () => {
    expect(page).toContain("Contains information from the datasets listed below");
    expect(page).toContain("from [data.gov.sg](https://data.gov.sg)");
    expect(page).toContain(
      "[Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence)",
    );
    expect(page).toContain("accessed on the date shown as **Synced** in the header");
  });

  it("lists every dataset the sync pulls from data.gov.sg, so the page cannot fall behind the pipeline", () => {
    expect(page).toContain(`https://data.gov.sg/collections/${RESALE_COLLECTION_ID}/view`);
    for (const id of [
      PROPERTY_DATASET_ID,
      MRT_DATASET_ID,
      MOE_SCHOOL_DATASET_ID,
      NEA_HAWKER_DATASET_ID,
      SFA_SUPERMARKET_DATASET_ID,
      NPARKS_PARKS_DATASET_ID,
    ]) {
      expect(page, id).toContain(`https://data.gov.sg/datasets/${id}/view`);
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
