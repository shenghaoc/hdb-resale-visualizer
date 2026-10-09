import { boundQueryResult, type ResultColumnBound } from "./proof-model";

export const COMPARABLE_PUBLICATION =
  "4794aa04f6c990fbe5fb6e4ba24b433ac84bebb294bf5b7ab7cbd91959244b0f";
export const TRANSACTION_RESULT_COLUMNS: readonly ResultColumnBound[] = [
  ["id", 6],
  ["month", 7],
  ["town", 15],
  ["block", 4],
  ["street_name", 22],
  ["address_key", 38],
  ["flat_type", 16],
  ["storey_range", 8],
  ["floor_area_sqm", 32],
  ["lease_commence_year", 4],
  ["resale_price", 32],
  ["flat_model", 22],
].map(([name, maximumTextBytes]) => ({
  name: String(name),
  maximumTextBytes: Number(maximumTextBytes),
}));
const TREND_RESULT_COLUMNS: readonly ResultColumnBound[] = [
  { name: "town", maximumTextBytes: 15 },
  { name: "flat_type", maximumTextBytes: 16 },
  { name: "month", maximumTextBytes: 7 },
  { name: "median_price_per_sqm", maximumTextBytes: 32 },
  { name: "transaction_count", maximumTextBytes: 6 },
];
const textConstraints = (columns: readonly ResultColumnBound[]) =>
  columns
    .map((c) => `(octet_length(${c.name}::text) <= ${c.maximumTextBytes} OR ${c.name} IS NULL)`)
    .join(" AND ");

/** One small boolean/certificate result. Runs INSIDE the frozen repeatable-read snapshot. */
export const COMPARABLE_RESULT_PREFLIGHT_SQL = `WITH counts AS MATERIALIZED (
  SELECT
    (SELECT count(*) FROM public.transactions WHERE town=$1 AND block=$2 AND flat_type=$4) AS block_count,
    (SELECT count(*) FROM public.transactions WHERE street_name=$3 AND flat_type=$4) AS street_count,
    (SELECT count(*) FROM public.transactions WHERE town=$1 AND flat_type=$4) AS town_count
), selected AS MATERIALIZED (
  SELECT t.* FROM public.transactions t CROSS JOIN counts c
  WHERE CASE WHEN c.block_count>=8 THEN t.town=$1 AND t.block=$2 AND t.flat_type=$4
    WHEN c.street_count>=8 THEN t.street_name=$3 AND t.flat_type=$4
    WHEN c.town_count>0 THEN t.town=$1 AND t.flat_type=$4 ELSE false END
  ORDER BY t.month DESC,t.id ASC LIMIT 150
), history AS MATERIALIZED (
  SELECT town,flat_type,month,median_price_per_sqm,transaction_count
  FROM public.town_flat_type_trends
  WHERE (town,flat_type) IN (SELECT DISTINCT town,flat_type FROM selected)
)
SELECT (
  (SELECT coalesce(bool_and(block_count<=999999 AND street_count<=999999 AND town_count<=999999),false) FROM counts)
  AND (SELECT coalesce(bool_and(${textConstraints(TRANSACTION_RESULT_COLUMNS)}),true) FROM selected)
  AND (SELECT count(DISTINCT (town,flat_type))<=1 FROM selected)
  AND (SELECT count(*)<=442 AND coalesce(bool_and(${textConstraints(TREND_RESULT_COLUMNS)}),true) FROM history)
  AND (SELECT json->'neonPublication'->>'publicationId'=$5 FROM public.manifest WHERE id=1)
) AS bounded,
(SELECT CASE WHEN count(DISTINCT town)<=1 AND max(octet_length(town))<=15 THEN min(town) ELSE NULL END FROM selected) AS selected_town`;

export type ComparableGateInput = {
  town: string;
  block: string;
  streetName: string;
  flatType: string;
};
type QueryResult = { rows: Record<string, unknown>[] };
type Send = (sql: string, parameters: readonly unknown[]) => Promise<QueryResult>;

function equal(a: readonly unknown[], b: readonly unknown[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function byteLength(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
    throw new Error("Unbounded comparable result value");
  return new TextEncoder().encode(String(value)).byteLength;
}

/** Query/row admission, not a physical socket or opaque Hyperdrive traffic promise. */
export class ComparableReturnedDataGate {
  private snapshotOpen = false;
  private proof = false;
  private selectedTown: string | null = null;
  private failed = false;
  private counts = new Set<string>();
  private transactions = false;
  private trends = false;
  private controls = 0;
  private stats = false;
  private resultBytes = 0;
  readonly reservedResultMessageBytes: number;

  constructor(
    private readonly input: ComparableGateInput,
    private readonly maximumResultMessageBytes: number,
    private readonly finalDiagnosticSQL: string,
  ) {
    for (const [field, maximum] of [
      [input.town, 15],
      [input.block, 4],
      [input.streetName, 22],
      [input.flatType, 16],
    ] as const)
      if (!field || byteLength(field) > maximum) throw new Error("Unbounded pilot candidate");
    // Three counts, one 150-row projection, full 442-row history, certificate,
    // three failure-inclusive controls, and final stats. No query-result truncation.
    this.reservedResultMessageBytes =
      3 *
        boundQueryResult([{ name: "cnt", maximumTextBytes: 6 }], 1)
          .maximumExpectedResultMessageBytes +
      boundQueryResult(TRANSACTION_RESULT_COLUMNS, 150).maximumExpectedResultMessageBytes +
      boundQueryResult(TREND_RESULT_COLUMNS, 442).maximumExpectedResultMessageBytes +
      boundQueryResult(
        [
          { name: "bounded", maximumTextBytes: 5 },
          { name: "selected_town", maximumTextBytes: 15 },
        ],
        1,
      ).maximumExpectedResultMessageBytes +
      60 +
      447;
    if (
      !Number.isSafeInteger(maximumResultMessageBytes) ||
      maximumResultMessageBytes < this.reservedResultMessageBytes ||
      maximumResultMessageBytes > 25_000_000
    )
      throw new Error("Comparable returned-data reservation refused before client construction");
  }

  private accept(result: QueryResult, columns: readonly ResultColumnBound[], maximumRows: number) {
    if (!Array.isArray(result.rows) || result.rows.length > maximumRows)
      throw new Error("Comparable result row proof violated");
    const bound = boundQueryResult(columns, result.rows.length);
    for (const row of result.rows) {
      if (
        Object.keys(row).length !== columns.length ||
        Object.keys(row).some((name) => !columns.some((c) => c.name === name))
      )
        throw new Error("Unexpected comparable result column");
      for (const column of columns)
        if (byteLength(row[column.name]) > column.maximumTextBytes)
          throw new Error("Comparable result field proof violated");
    }
    this.resultBytes += bound.maximumExpectedResultMessageBytes;
    if (this.resultBytes > this.maximumResultMessageBytes)
      throw new Error("Comparable returned-data allowance exhausted");
  }

  async run(sql: string, parameters: readonly unknown[], send: Send): Promise<QueryResult> {
    try {
      if (sql === "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY") {
        if (this.snapshotOpen || this.failed || parameters.length)
          throw new Error("Snapshot replay");
        this.snapshotOpen = true;
        this.controls++;
        this.resultBytes += 20;
        return await send(sql, parameters);
      }
      if (/^(COMMIT|ROLLBACK)$/.test(sql)) {
        if (!this.snapshotOpen || ++this.controls > 3 || parameters.length)
          throw new Error("Unreserved snapshot control");
        this.resultBytes += 20;
        return await send(sql, parameters);
      }
      if (sql === this.finalDiagnosticSQL) {
        if (this.stats || parameters.length) throw new Error("Stats replay");
        this.stats = true;
        const result = await send(sql, parameters);
        if (result.rows.length !== 1) throw new Error("Unbounded stats rows");
        this.accept(
          result,
          [
            { name: "role", maximumTextBytes: 21 },
            { name: "read_only", maximumTextBytes: 3 },
            { name: "statement_timeout", maximumTextBytes: 8 },
            { name: "publication_id", maximumTextBytes: 64 },
            { name: "successful_sql_calls", maximumTextBytes: 32 },
            { name: "successful_sql_ms", maximumTextBytes: 32 },
          ],
          1,
        );
        return result;
      }
      if (!this.snapshotOpen || this.failed)
        throw new Error("Comparable query before snapshot/proof");
      if (!this.proof) {
        const certificate = await send(COMPARABLE_RESULT_PREFLIGHT_SQL, [
          this.input.town,
          this.input.block,
          this.input.streetName,
          this.input.flatType,
          COMPARABLE_PUBLICATION,
        ]);
        this.accept(
          certificate,
          [
            { name: "bounded", maximumTextBytes: 5 },
            { name: "selected_town", maximumTextBytes: 15 },
          ],
          1,
        );
        if (certificate.rows.length !== 1 || certificate.rows[0].bounded !== true)
          throw new Error("Comparable snapshot does not satisfy producer-side result bounds");
        const town = certificate.rows[0].selected_town;
        if (town !== null && typeof town !== "string") throw new Error("Invalid snapshot town");
        this.selectedTown = town;
        this.proof = true;
      }
      const scopes = [
        {
          sql: "town = $1 AND block = $2 AND flat_type = $3",
          params: [this.input.town, this.input.block, this.input.flatType],
        },
        {
          sql: "street_name = $1 AND flat_type = $2",
          params: [this.input.streetName, this.input.flatType],
        },
        { sql: "town = $1 AND flat_type = $2", params: [this.input.town, this.input.flatType] },
      ];
      for (const scope of scopes) {
        const count = `SELECT COUNT(*)::integer AS cnt FROM public.transactions WHERE ${scope.sql}`;
        if (sql === count && equal(parameters, scope.params)) {
          if (this.counts.has(sql)) throw new Error("Count replay");
          this.counts.add(sql);
          const result = await send(sql, parameters);
          this.accept(result, [{ name: "cnt", maximumTextBytes: 6 }], 1);
          return result;
        }
        const projection = TRANSACTION_RESULT_COLUMNS.map((c) => c.name).join(", ");
        const rows = `SELECT ${projection} FROM public.transactions WHERE ${scope.sql} ORDER BY month DESC, id ASC LIMIT 150`;
        if (sql === rows && equal(parameters, scope.params)) {
          if (this.transactions || this.counts.size !== 3)
            throw new Error("Projection replay/order");
          this.transactions = true;
          const result = await send(sql, parameters);
          this.accept(result, TRANSACTION_RESULT_COLUMNS, 150);
          return result;
        }
      }
      const trendSQL =
        'SELECT town, flat_type, month, median_price_per_sqm, transaction_count FROM public.town_flat_type_trends WHERE (town, flat_type) IN (($1,$2)) ORDER BY town COLLATE "C", flat_type COLLATE "C", month COLLATE "C"';
      if (
        sql === trendSQL &&
        this.transactions &&
        !this.trends &&
        equal(parameters, [this.selectedTown, this.input.flatType])
      ) {
        this.trends = true;
        const result = await send(sql, parameters);
        this.accept(result, TREND_RESULT_COLUMNS, 442);
        return result;
      }
      throw new Error("SQL/parameters outside bounded pilot result contract");
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }

  snapshot() {
    return {
      producerProof: this.proof,
      resultMessageBytesUpperObserved: this.resultBytes,
      reservedResultMessageBytes: this.reservedResultMessageBytes,
      completePhysicalSocketUpper: null,
      opaqueHyperdriveTrafficUpper: null,
    };
  }
}
