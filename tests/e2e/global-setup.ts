import "temporal-polyfill/global";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export default function globalSetup() {
  const fixtureDir = join(process.cwd(), "tests/fixtures/public-data");
  const targetDir = join(process.cwd(), "public/data");
  const storageStatePath = join(process.cwd(), "test-results/e2e-storage-state.json");
  const completedSearchProfile = {
    version: 1,
    mainFlatType: "4 ROOM",
    alternativeFlatTypes: [],
    maxBudget: 700000,
    commuteAnchorLabel: "Bedok MRT",
    commuteAnchorMrt: "BEDOK MRT STATION",
    maxComfortableCommuteMinutes: 30,
    commuteStretchMinutes: 10,
    minimumRemainingLeaseYears: 65,
    budgetStretchPercent: 5,
    showStretchOptions: true,
    showAllBlocks: true,
  };

  mkdirSync(targetDir, { recursive: true });
  cpSync(fixtureDir, targetDir, { recursive: true });

  mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
  writeFileSync(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: "http://127.0.0.1:4173",
            localStorage: [
              {
                name: "hdb_resale_search_profile_v1",
                value: JSON.stringify(completedSearchProfile),
              },
              {
                name: "hdb_resale_search_profile_wizard_dismissed_v1",
                value: "1",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
}
