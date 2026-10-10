-- Disposable database ONLY. Executes quota writes in a transaction that is always rolled back.
-- Requires sql/neon/002_nearby_daily_budget.sql and role hdb_nearby_budget.
-- Run: psql -v ON_ERROR_STOP=1 -f sql/neon/verify_nearby_daily_budget.sql
BEGIN;
DO $verify$
DECLARE
  first boolean;
  second boolean;
  third boolean;
  count_after integer;
BEGIN
  DELETE FROM public.nearby_daily_budget
    WHERE day = (clock_timestamp() AT TIME ZONE 'UTC')::date;

  SELECT public.reserve_nearby_statement(2) INTO first;
  SELECT public.reserve_nearby_statement(2) INTO second;
  SELECT public.reserve_nearby_statement(2) INTO third;

  SELECT used INTO count_after FROM public.nearby_daily_budget
    WHERE day = (clock_timestamp() AT TIME ZONE 'UTC')::date;
  ASSERT first AND second AND NOT third, 'exact daily ceiling must be enforced';
  ASSERT count_after = 2, 'refused reservations must not advance the counter';

  BEGIN
    PERFORM public.reserve_nearby_statement(10001);
    RAISE EXCEPTION 'Out-of-range ceiling was admitted';
  EXCEPTION WHEN check_violation OR raise_exception THEN
    -- A violation of the ceiling is required. Recheck exact message below in application-level tests.
    NULL;
  END;
  RAISE NOTICE 'Neon nearby daily budget checked, state will be rolled back';
END;
$verify$;
ROLLBACK;
