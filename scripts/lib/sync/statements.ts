import type { D1Statement } from "./d1";

export const MAX_FORECAST_WRITES = 25_000;
export const MAX_ATOMIC_STATEMENTS = 100;
export const MAX_ATOMIC_BYTES = 90_000_000;
export const MAX_JSON_PARAMETER_BYTES = 1_000_000;

export function jsonRowChunks(rows: unknown[][]): string[] {
  const chunks: string[] = [];
  let current: unknown[][] = [];
  let bytes = 2;
  for (const row of rows) {
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
    if (rowBytes + 2 > MAX_JSON_PARAMETER_BYTES)
      throw new Error("Row exceeds safe D1 JSON parameter size");
    if (current.length >= 500 || bytes + rowBytes > MAX_JSON_PARAMETER_BYTES) {
      chunks.push(JSON.stringify(current));
      current = [];
      bytes = 2;
    }
    current.push(row);
    bytes += rowBytes;
  }
  if (current.length) chunks.push(JSON.stringify(current));
  return chunks;
}

export function jsonInsertStatements(
  table: string,
  columns: readonly string[],
  rows: unknown[][],
): D1Statement[] {
  return jsonRowChunks(rows).map((json) => ({
    sql: `INSERT INTO ${table} (${columns.join(",")}) SELECT ${columns.map((_, index) => `json_extract(value,'$[${index}]')`).join(",")} FROM json_each(?)`,
    params: [json],
  }));
}

export function jsonUpdateStatements(
  table: string,
  keys: string[],
  columns: string[],
  rows: unknown[][],
): D1Statement[] {
  return jsonRowChunks(rows).map((json) => ({
    sql: `UPDATE ${table} SET ${columns.map((column, index) => `${column}=json_extract(patch.value,'$[${keys.length + index}]')`).join(",")} FROM json_each(?) AS patch WHERE ${keys.map((key, index) => `${table}.${key}=json_extract(patch.value,'$[${index}]')`).join(" AND ")}`,
    params: [json],
  }));
}

/** Replace only changed top-level fields of a large detail JSON blob. */
export function jsonDetailPatchStatements(fields: string[], rows: unknown[][]): D1Statement[] {
  if (fields.some((field) => !["summary", "monthlyTrend", "recentTransactions"].includes(field)))
    throw new Error("Unsupported detail patch field");
  return jsonRowChunks(rows).map((json) => ({
    sql: `UPDATE block_details SET json=json_set(block_details.json,${fields.flatMap((field, index) => [`'$.${field}'`, `json_extract(patch.value,'$[${index + 1}]')`]).join(",")}) FROM json_each(?) AS patch WHERE block_details.address_key=json_extract(patch.value,'$[0]')`,
    params: [json],
  }));
}
