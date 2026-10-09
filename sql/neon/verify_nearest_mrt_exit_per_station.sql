-- Disposable Neon branch only. Requires sql/neon/001_postgis_nearby.sql.
-- Grounded case: central-area-535-upp-cross-st has >25 MRT exits in 1500 m.
-- Verify that grouping uses source_properties.STATION_NA, NOT the display name,
-- and is performed before the final 25-row response limit.
DO $test$
DECLARE total_exits integer; unique_stations integer; returned integer; distinct_returned integer; has_short_code boolean;
BEGIN
  WITH center AS (
    SELECT location AS point FROM public.block_locations
    WHERE address_key='central-area-535-upp-cross-st'
  ), within_radius AS (
    SELECT p.source_id,p.source_properties->>'STATION_NA' AS station,
           p.source_properties->>'EXIT_CODE' AS exit_code,
           ST_Distance(p.location,c.point) AS metres
    FROM public.poi_locations p CROSS JOIN center c
    WHERE p.poi_kind='mrt_exit'
      AND ST_DWithin(p.location,c.point,1500)
  ), ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY station ORDER BY metres,source_id COLLATE "C") AS rn
    FROM within_radius
  ), selected AS (
    SELECT * FROM ranked WHERE rn=1 ORDER BY metres,source_id LIMIT 25
  )
  SELECT (SELECT count(*) FROM within_radius),
         (SELECT count(DISTINCT station) FROM within_radius),
         (SELECT count(*) FROM selected),
         (SELECT count(DISTINCT station) FROM selected),
         (SELECT bool_or(exit_code='E') FROM selected)
    INTO total_exits,unique_stations,returned,distinct_returned,has_short_code;

  IF total_exits <= 25 THEN
    RAISE EXCEPTION 'Fixture no longer has more than 25 nearby exits: %',total_exits;
  END IF;
  IF returned <> LEAST(unique_stations,25) OR returned <> distinct_returned THEN
    RAISE EXCEPTION 'Station grouping incorrect: exits %, stations %, returned %, distinct %',
      total_exits,unique_stations,returned,distinct_returned;
  END IF;
  IF NOT has_short_code THEN
    RAISE EXCEPTION 'Expected a selected exit with code E (no Exit prefix)';
  END IF;
END
$test$;
