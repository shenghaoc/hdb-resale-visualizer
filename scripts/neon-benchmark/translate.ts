// Thin benchmark adapter for the existing artifact compiler's finite SQL forms.
// It rejects unknown shapes; it is not a replacement runtime or general SQL translator.
import type { D1Statement } from "../lib/sync/d1";
export function translate(statement: D1Statement, types: Record<string, string>): D1Statement {
  const sql = statement.sql;
  const table = sql.match(/^(?:INSERT(?: OR REPLACE)? INTO|UPDATE) ([a-z_]+)/)?.[1];
  const cast = (column: string, expression: string) =>
    `${expression}::${
      types[`${table}.${column}`] ??
      (() => {
        throw new Error(`Unknown benchmark column ${table}.${column}`);
      })()
    }`;
  if (/^INSERT INTO [a-z_]+ \([a-z_,]+\) SELECT /.test(sql)) {
    const columns = sql.match(/^INSERT INTO [a-z_]+ \(([^)]+)\)/)![1].split(",");
    return {
      sql: `INSERT INTO ${table} (${columns.join(",")}) SELECT ${columns.map((c, i) => cast(c, `(value->>${i})`)).join(",")} FROM jsonb_array_elements($1::jsonb) AS value`,
      params: statement.params,
    };
  }
  if (sql.startsWith("UPDATE block_details SET json=json_set(")) {
    const fields = [
      ...sql.matchAll(/'\$\.([a-zA-Z]+)',json_extract\(patch.value,'\$\[(\d+)\]'\)/g),
    ];
    if (!fields.length) throw new Error("Unknown detail patch");
    let expression = "block_details.json";
    for (const [, field, index] of fields)
      expression = `jsonb_set(${expression},'{${field}}',patch.value->${index},true)`;
    return {
      sql: `UPDATE block_details SET json=${expression} FROM jsonb_array_elements($1::jsonb) AS patch(value) WHERE block_details.address_key=patch.value->>0`,
      params: statement.params,
    };
  }
  if (/^UPDATE .* FROM json_each\(\?\) AS patch WHERE /.test(sql)) {
    return {
      sql: sql
        .replace(
          /([a-z_]+)=json_extract\(patch.value,'\$\[(\d+)\]'\)/g,
          (_, column, index) => `${column}=${cast(column, `(patch.value->>${index})`)}`,
        )
        .replace("json_each(?) AS patch", "jsonb_array_elements($1::jsonb) AS patch(value)"),
      params: statement.params,
    };
  }
  if (
    /^UPDATE transactions SET .* WHERE id = \?$/.test(sql) ||
    /^INSERT OR REPLACE INTO (geocode_cache|walking_time_cache)/.test(sql)
  ) {
    let n = 0;
    let text = sql.replace(/\?/g, () => `$${++n}`);
    if (text.startsWith("INSERT OR REPLACE")) {
      text = text.replace("INSERT OR REPLACE", "INSERT");
      const columns = text
        .match(/\(([^)]+)\) VALUES/)![1]
        .split(",")
        .map((c) => c.trim());
      text += ` ON CONFLICT(cache_key) DO UPDATE SET ${columns
        .filter((c) => c !== "cache_key")
        .map((c) => `${c}=excluded.${c}`)
        .join(",")}`;
    }
    return { sql: text, params: statement.params };
  }
  throw new Error(`Unsupported publisher shape for ${table}`);
}
