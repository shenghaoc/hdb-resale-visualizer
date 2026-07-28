import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { E2E_BASE_URL } from "./runtime-config";

export default function globalSetup() {
  const storageStatePath = join(process.cwd(), "test-results/e2e-storage-state.json");
  const completedSearchProfile = {
    version: 3,
    mainFlatType: "4 ROOM",
    maxBudget: 700000,
    minimumRemainingLeaseYears: 65,
    age: 35,
    coApplicantAge: 33,
    cpfOABalance: 120000,
    monthlyIncome: 9000,
  };

  // Fixtures are staged into `public/api/` by `vp run setup:fixtures` (invoked
  // from the playwright webServer command), so no copying happens here.

  mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
  writeFileSync(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: E2E_BASE_URL,
            localStorage: [
              {
                name: "hdb_resale_search_profile_v3",
                value: JSON.stringify(completedSearchProfile),
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
