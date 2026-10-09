/** Fixed SQL for the isolated publisher. No connections or mutations at import time. */
import { STAGE_DESCRIPTOR, STAGE_TABLES, stageKeyJoin, type StageTable } from "./staged-plan";

export const INGESTION_LOCK_SQL = `LOCK TABLE ${STAGE_TABLES.map((t) => `public.${t}`).join(",")} IN SHARE ROW EXCLUSIVE MODE`;
export const MANIFEST_READ_SQL = "SELECT json FROM public.manifest WHERE id=1";
export const MANIFEST_LOCK_SQL = `${MANIFEST_READ_SQL} FOR UPDATE`;
export const MANIFEST_WRITE_SQL = `UPDATE public.manifest SET json=$1::jsonb,updated_at=$2::timestamptz
WHERE id=1 AND json=$3::jsonb RETURNING json,
pg_database_size(current_database()) AS database_bytes,
pg_total_relation_size('pg_temp.neon_publication_stage') AS temporary_bytes`;

// Includes rules, triggers, RLS, defaults, constraints and index definitions. A new trigger,
// generated column or changed cast cannot silently change sparse UPDATE semantics.
// This catalog payload is hashed locally; PostgreSQL JSONB formatting is not JS formatting.
const schemaTables = [...STAGE_TABLES, "manifest"].map((t) => `'${t}'`).join(",");
export const SCHEMA_CATALOG_SQL = `SELECT jsonb_build_object(
  'tables',COALESCE(jsonb_agg(jsonb_build_object(
    'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'forcedRls',c.relforcerowsecurity,
    'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
       'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
       'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT COALESCE(jsonb_agg(pg_get_constraintdef(o.oid) ORDER BY o.conname),'[]'::jsonb)
      FROM pg_constraint o WHERE o.conrelid=c.oid),
    'indexes',(SELECT COALESCE(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]'::jsonb)
      FROM pg_index i WHERE i.indrelid=c.oid),
    'triggers',(SELECT COALESCE(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname),'[]'::jsonb)
      FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
    'rules',(SELECT COALESCE(jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename),'[]'::jsonb)
      FROM pg_rewrite r WHERE r.ev_class=c.oid AND r.rulename<>'_RETURN')
  ) ORDER BY c.relname),'[]'::jsonb)) AS schema_catalog
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (${schemaTables})`;

function ordinaryMatch(side: "before" | "after") {
  return `NOT EXISTS(SELECT 1 FROM jsonb_each(s.item->'${side}') f
    WHERE to_jsonb(b)->f.key IS DISTINCT FROM to_jsonb(r)->f.key)`;
}
function detailMatch(side: "before" | "after") {
  if (side === "after") return "b.json=s.item->'after'->'json'";
  return "encode(sha256(convert_to(b.json::text,'UTF8')),'hex')=s.item->>'detailBeforePgSHA256'";
}
function targetAggregate(table: StageTable, side: "before" | "after") {
  const key = STAGE_DESCRIPTOR[table].keys[0];
  const normal = ordinaryMatch(side);
  const matches =
    table === "block_details"
      ? `CASE WHEN s.item->>'operation'='update' THEN ${detailMatch(side)} ELSE ${normal} END`
      : normal;
  const value =
    side === "before"
      ? "CASE WHEN s.item->>'operation'='insert' THEN '{}'::jsonb ELSE s.item->'before' END"
      : "s.item->'after'";
  const typed = `LEFT JOIN LATERAL jsonb_populate_record(NULL::public.${table},${value}) r ON true`;
  const valid =
    side === "before"
      ? `CASE WHEN s.item->>'operation'='insert' THEN b.${key} IS NULL ELSE b.${key} IS NOT NULL AND ${matches} END`
      : `b.${key} IS NOT NULL AND ${matches}`;
  return `SELECT '${table}' AS table_name,count(*) AS staged_rows,
    count(*) FILTER(WHERE NOT (${valid})) AS mismatches
    FROM pg_temp.neon_publication_stage s LEFT JOIN public.${table} b ON ${stageKeyJoin(table)}
    ${typed} WHERE s.item->>'table'='${table}'`;
}

// Parameters: retained typed transaction rows; all cache input rows. Cache updated_at is
// deliberately included. Missing entries/changed results cannot reuse a stale context build.
// Only the two compact caches are scanned; no historical transaction scan is performed.
const retainedSQL = `SELECT count(*) FILTER(WHERE b.id IS NULL OR to_jsonb(b) IS DISTINCT FROM to_jsonb(r)) AS n
FROM jsonb_populate_recordset(NULL::public.transactions,$1::jsonb) r
LEFT JOIN public.transactions b ON b.id=r.id`;
const cachesSQL = ["geocode_cache", "walking_time_cache"]
  .map(
    (table) => `(
  SELECT count(*)=(SELECT count(*) FROM public.${table})
    AND COALESCE(bool_and(b.cache_key IS NOT NULL AND to_jsonb(b)=to_jsonb(r)),true)
  FROM jsonb_populate_recordset(NULL::public.${table},$2::jsonb->'${table}') r
  LEFT JOIN public.${table} b ON b.cache_key=r.cache_key
)`,
  )
  .join(" AND ");

export const PRECONDITIONS_SQL = `WITH target_checks AS (
${STAGE_TABLES.map((t) => targetAggregate(t, "before")).join("\nUNION ALL\n")}
),catalog AS (${SCHEMA_CATALOG_SQL})
SELECT (SELECT jsonb_agg(to_jsonb(t) ORDER BY table_name) FROM target_checks t) AS target_checks,
(${retainedSQL}) AS retained_mismatches,
(SELECT id FROM public.transactions ORDER BY id DESC LIMIT 1) AS maximum_transaction_id,
(${cachesSQL}) AS cache_inputs_match,
catalog.schema_catalog FROM catalog`;

export const POSTCONDITIONS_SQL = `WITH target_checks AS (
${STAGE_TABLES.map((t) => targetAggregate(t, "after")).join("\nUNION ALL\n")}
)
SELECT (SELECT jsonb_agg(to_jsonb(t) ORDER BY table_name) FROM target_checks t) AS target_checks,
(${retainedSQL}) AS retained_mismatches,
(SELECT id FROM public.transactions ORDER BY id DESC LIMIT 1) AS maximum_transaction_id,
pg_database_size(current_database()) AS database_bytes,
pg_total_relation_size('pg_temp.neon_publication_stage') AS temporary_bytes`;
