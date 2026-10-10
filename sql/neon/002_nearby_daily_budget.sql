-- PostgreSQL-only operational budget. Apply on a disposable Neon serving child, never on D1.
-- Prerequisites: role hdb_nearby_budget already created with LOGIN, no table DML grants,
-- default_transaction_read_only=off, and a distinct Hyperdrive origin credential.
-- Do not change hdb_benchmark_runtime (its default_transaction_read_only remains ON).
-- Run as a trusted migration owner inside one transaction.
DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hdb_nearby_budget') THEN
    RAISE EXCEPTION 'Missing dedicated hdb_nearby_budget role';
  END IF;
END
$preflight$;

CREATE TABLE public.nearby_daily_budget (
  day date PRIMARY KEY,
  used integer NOT NULL CHECK (used >= 0 AND used <= 10000)
);

REVOKE ALL ON TABLE public.nearby_daily_budget FROM PUBLIC;

-- EXECUTE is the only permission needed by the narrow budget role.
-- Both the hard maximum and the operator-selected lower ceiling are enforced in the database.
CREATE FUNCTION public.reserve_nearby_statement(p_ceiling integer)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  admitted boolean := false;
BEGIN
  IF p_ceiling IS NULL OR p_ceiling < 1 OR p_ceiling > 10000 THEN
    RAISE EXCEPTION 'Invalid nearby daily ceiling';
  END IF;

  INSERT INTO public.nearby_daily_budget(day, used)
  VALUES ((clock_timestamp() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (day) DO UPDATE
    SET used = public.nearby_daily_budget.used + 1
    WHERE public.nearby_daily_budget.used < p_ceiling
  RETURNING true INTO admitted;

  RETURN COALESCE(admitted, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_nearby_statement(integer) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hdb_nearby_budget;
GRANT EXECUTE ON FUNCTION public.reserve_nearby_statement(integer) TO hdb_nearby_budget;
