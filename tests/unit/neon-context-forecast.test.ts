import { describe, expect, it } from "vite-plus/test";
import { publicationBreakdown } from "../../scripts/neon-benchmark/forecast-reconciliation";
import {
  jsonInsertStatements,
  jsonUpdateStatements,
  jsonDetailPatchStatements,
} from "../../scripts/lib/sync/statements";
import { validateNeonPublicationPlan } from "../../scripts/lib/sync/neon";
import type { Manifest } from "../../shared/data-types";

const indexes = [
  { tbl_name: "transactions", sql: "CREATE UNIQUE INDEX transactions_pkey ON transactions(id)" },
  {
    tbl_name: "transactions",
    sql: "CREATE INDEX tx_block ON transactions(town,block,flat_type,month)",
  },
  {
    tbl_name: "transactions",
    sql: "CREATE INDEX tx_street ON transactions(street_name,flat_type,month)",
  },
  { tbl_name: "transactions", sql: "CREATE INDEX tx_town ON transactions(town,flat_type,month)" },
  { tbl_name: "blocks", sql: "CREATE UNIQUE INDEX blocks_pkey ON blocks(address_key)" },
  { tbl_name: "blocks", sql: "CREATE INDEX blocks_town ON blocks(town)" },
  { tbl_name: "blocks", sql: "CREATE INDEX blocks_sort ON blocks(median_price,transaction_count)" },
  {
    tbl_name: "block_details",
    sql: "CREATE UNIQUE INDEX details_pkey ON block_details(address_key)",
  },
];
describe("offline mutation cost attribution", () => {
  it("isolates mandatory source/price work while retaining non-indexed field-patch costs", () => {
    const statements = [
      ...jsonInsertStatements("transactions", ["id"], [[1], [2]]),
      ...jsonUpdateStatements(
        "blocks",
        ["address_key"],
        ["median_price", "transaction_count"],
        [
          ["a", 10, 2],
          ["b", 20, 3],
          ["c", 30, 4],
        ],
      ),
      ...jsonUpdateStatements("blocks", ["address_key"], ["postal_code"], [["d", "123456"]]),
      ...jsonDetailPatchStatements(
        ["summary"],
        [
          ["a", {}],
          ["b", {}],
        ],
      ),
    ];
    // 2*5 transaction writes + 3*3 price/count writes + 1 non-indexed patch + 2 details + manifest.
    const breakdown = publicationBreakdown(statements, indexes, 23);
    expect(breakdown.groups.transactions.forecast).toBe(10);
    expect(breakdown.groups.blocks).toMatchObject({ inserted: 0, updated: 4, forecast: 10 });
    expect(breakdown.groups.block_details.forecast).toBe(2);
    expect(breakdown.mandatoryPinnedSourceSubset).toMatchObject({
      transactionInsertForecast: 10,
      blockMedianOrCountRows: 3,
      blockMedianOrCountForecast: 9,
      combinedForecast: 19,
    });
  });
  it("never admits a full publication just because its partial mandatory subset equals the limit", () => {
    const statements = jsonInsertStatements(
      "transactions",
      ["id"],
      Array.from({ length: 5000 }, (_, i) => [i + 1]),
    );
    const partial = publicationBreakdown(statements, indexes, 25001);
    expect(partial.mandatoryPinnedSourceSubset.passesWriteGuard).toBe(true);
    expect(() =>
      validateNeonPublicationPlan(
        { statements, changedRows: { transactions: 5000 }, forecastWriteUpperBound: 25001 },
        {} as Manifest,
      ),
    ).toThrow("safety bound");
    const excessive = jsonInsertStatements(
      "transactions",
      ["id"],
      Array.from({ length: 5001 }, (_, i) => [i + 1]),
    );
    expect(
      publicationBreakdown(excessive, indexes, 25006).mandatoryPinnedSourceSubset.passesWriteGuard,
    ).toBe(false);
  });
  it("rejects diagnostics that disagree with the compiler or lose the price-index inventory", () => {
    const statements = jsonUpdateStatements(
      "blocks",
      ["address_key"],
      ["median_price"],
      [["a", 10]],
    );
    expect(() => publicationBreakdown(statements, indexes, 99)).toThrow(
      "differ from shared compiler",
    );
    expect(() =>
      publicationBreakdown(
        statements,
        indexes.filter((index) => !index.sql.includes("blocks_sort")),
        2,
      ),
    ).toThrow("index inventory changed");
  });
});
