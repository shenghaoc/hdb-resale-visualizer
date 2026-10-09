import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { NEARBY_SPATIAL_SQL } from "../../worker/nearby-spatial-query";

const verifier = readFileSync(
  join(process.cwd(), "sql/neon/verify_nearby_spatial_sql.sql"),
  "utf8",
);

describe("sql/neon/verify_nearby_spatial_sql.sql", () => {
  it("embeds the shipped NEARBY_SPATIAL_SQL verbatim, so a passing run verifies what the Worker sends", () => {
    // Exactly two worker_sql dollar-quote markers: the opening and the closing one.
    const parts = verifier.split("$worker_sql$");
    expect(parts).toHaveLength(3);
    // If this fails after editing the query, paste the new text between the markers and rerun the
    // script on a disposable branch; the copy is what that run executes.
    expect(parts[1]).toBe(NEARBY_SPATIAL_SQL);
  });

  it("only runs inside a READ ONLY transaction", () => {
    expect(verifier).toMatch(/^BEGIN READ ONLY;$/m);
    expect(verifier).toContain("current_setting('transaction_read_only') <> 'on'");
    expect(verifier).toMatch(/^ROLLBACK;$/m);
  });
});
