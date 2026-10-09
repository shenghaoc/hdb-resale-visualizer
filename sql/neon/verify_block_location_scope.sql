-- Run only on a disposable Neon branch after sql/neon/001_postgis_nearby.sql.
-- All deliberate source writes roll back; a passing run leaves the branch unchanged.
BEGIN;
DO $verify$
DECLARE
  chosen_key text;
  source_lat double precision;
  source_lng double precision;
  derived_before text;
  derived_after text;
  updated_lat double precision;
  found_location boolean;
BEGIN
  SELECT address_key,lat,lng INTO STRICT chosen_key,source_lat,source_lng
  FROM public.blocks ORDER BY address_key LIMIT 1;

  SELECT xmin::text INTO STRICT derived_before
  FROM public.block_locations WHERE address_key=chosen_key;

  -- In-place publication can update price/count while leaving coordinates
  -- untouched. No derived-table UPDATE may occur for this source operation.
  UPDATE public.blocks SET median_price=median_price+1
  WHERE address_key=chosen_key;
  SELECT xmin::text INTO STRICT derived_after
  FROM public.block_locations WHERE address_key=chosen_key;
  IF derived_before IS DISTINCT FROM derived_after THEN
    RAISE EXCEPTION 'Non-geographic blocks UPDATE rewrote block_locations';
  END IF;

  -- A coordinate update must propagate through the generated geography.
  UPDATE public.blocks SET lat=source_lat+0.0001
  WHERE address_key=chosen_key;
  SELECT lat INTO STRICT updated_lat
  FROM public.block_locations WHERE address_key=chosen_key;
  IF abs(updated_lat-(source_lat+0.0001))>0.0000000001 THEN
    RAISE EXCEPTION 'Coordinate UPDATE failed to synchronize block_locations';
  END IF;

  -- DELETE explicitly cleans the derived row, in addition to FK CASCADE.
  DELETE FROM public.blocks WHERE address_key=chosen_key;
  SELECT EXISTS(SELECT 1 FROM public.block_locations WHERE address_key=chosen_key)
  INTO found_location;
  IF found_location THEN
    RAISE EXCEPTION 'Source DELETE left a derived block location';
  END IF;
END
$verify$;
ROLLBACK;

-- Both source and derived rows must still exist after rollback.
SELECT (SELECT count(*) FROM public.blocks) AS block_count,
       (SELECT count(*) FROM public.block_locations) AS derived_count;
