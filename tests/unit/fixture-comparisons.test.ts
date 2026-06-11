import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { comparisonArtifactSchema } from "@/shared/lib/dataSchemas";
import { getPrimarySchoolsForOverlay } from "@/features/map-explorer/school-proximity";

const FIXTURE_BLOCKS_DIR = join(process.cwd(), "tests/fixtures/public-data/blocks");
const FIXTURE_COMPARISONS_DIR = join(process.cwd(), "tests/fixtures/public-data/comparisons");

describe("fixture comparison artifacts", () => {
  it("provides map-ready school coordinates for every fixture block", () => {
    const blockFiles = readdirSync(FIXTURE_BLOCKS_DIR).filter((name) => name.endsWith(".json"));
    const addressKeys = blockFiles.flatMap((file) => {
      const blocks = JSON.parse(readFileSync(join(FIXTURE_BLOCKS_DIR, file), "utf8")) as Array<{
        addressKey: string;
      }>;
      return blocks.map((block) => block.addressKey);
    });

    expect(addressKeys.length).toBeGreaterThan(0);

    for (const addressKey of addressKeys) {
      const raw = readFileSync(join(FIXTURE_COMPARISONS_DIR, `${addressKey}.json`), "utf8");
      const comparison = comparisonArtifactSchema.parse(JSON.parse(raw));
      const overlaySchools = getPrimarySchoolsForOverlay(
        comparison.amenities.nearestPrimarySchools,
      );
      expect(overlaySchools.length, addressKey).toBeGreaterThan(0);
    }
  });
});
