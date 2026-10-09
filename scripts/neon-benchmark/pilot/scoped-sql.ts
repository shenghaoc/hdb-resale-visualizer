import { createHash } from "node:crypto";
export const SCOPED_LOWER_SQL =
  "ALTER ROLE hdb_benchmark_runtime IN DATABASE neondb SET statement_timeout = '2s'";
export const SCOPED_RESTORE_SQL =
  "ALTER ROLE hdb_benchmark_runtime IN DATABASE neondb SET statement_timeout = '60s'";
export const SCOPED_VERIFY_SQL = `SELECT current_user AS role,current_database() AS database,current_setting('default_transaction_read_only') AS read_only,current_setting('statement_timeout') AS statement_timeout,has_table_privilege(current_user,'public.transactions','SELECT') AS transaction_select,has_table_privilege(current_user,'public.transactions','INSERT,UPDATE,DELETE,TRUNCATE') AS transaction_write,has_table_privilege(current_user,'public.shortlists','SELECT,INSERT,UPDATE,DELETE') AS private_access`;
/** Captures exact global/database/role selectors; oversize defaults are rejected, never truncated. */
export const SCOPED_OWNER_RECORD_SQL = `WITH identity AS (
  SELECT (SELECT oid FROM pg_roles WHERE rolname='hdb_benchmark_runtime') AS role_oid,
    (SELECT oid FROM pg_database WHERE datname=current_database()) AS database_oid
), old_defaults AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('setdatabase',s.setdatabase,'setrole',s.setrole,'setconfig',s.setconfig)
    ORDER BY s.setdatabase,s.setrole),'[]'::jsonb)::text AS defaults_json
  FROM pg_db_role_setting s CROSS JOIN identity i
  WHERE s.setrole IN (0,i.role_oid) AND s.setdatabase IN (0,i.database_oid)
)
SELECT current_user AS connected_role,current_database() AS database,
  current_setting('statement_timeout') AS owner_timeout,
  (SELECT source FROM pg_settings WHERE name='statement_timeout') AS owner_timeout_source,
  octet_length(defaults_json)<=64000 AS defaults_bounded,
  CASE WHEN octet_length(defaults_json)<=64000 THEN defaults_json ELSE NULL END AS defaults_json
FROM old_defaults`;
export const scopedSQLFingerprint = (sql: string) => createHash("sha256").update(sql).digest("hex");
