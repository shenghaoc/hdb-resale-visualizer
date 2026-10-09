-- Read-only coordinate-system contract check (.kiro/specs/geospatial-programme, R1). Needs PostGIS only; it reads no
-- application table and creates no object, so it is safe on any branch, including a copy of the serving one.
--
--   psql -v ON_ERROR_STOP=1 -f sql/neon/verify_crs_contract.sql
--
-- Or paste it into any SQL runner after `SET TRANSACTION READ ONLY`. It raises on the first broken assertion and ends with
-- one NOTICE line that carries the measured figures.
--
-- Each block shows the mistake the contract forbids and asserts that the contract's guard catches it:
--   1. longitude/latitude axis order and the Singapore bounding-box guard (lat 1.15..1.55, lng 103.55..104.15);
--   2. ST_SetSRID is a label, not a conversion; only ST_Transform converts;
--   3. geometry(4326) distances are degrees: "500 metres" would be 500 degrees; geography distances are metres;
--   4. SVY21 (EPSG:3414) round trip and its distance against the spheroidal geodesic;
--   5. the spherical approximation's error band (haversine, KNN operator) against the spheroid.
DO $contract$
DECLARE
  sg_lng constant double precision := 103.8198;
  sg_lat constant double precision := 1.3521;
  far_lng constant double precision := 104.04;
  far_lat constant double precision := 1.47;
  p geometry := ST_SetSRID(ST_MakePoint(sg_lng, sg_lat), 4326);
  q geometry;
  a geometry;
  b geometry;
  geo double precision;
  sph double precision;
  svy double precision;
  worst_round_trip_deg double precision := 0;
  worst_svy_m double precision := 0;
  rel_max double precision := -1;
  rel_min double precision := 1;
  n int := 0;
BEGIN
  -- 1. Axis order. ST_MakePoint takes (x, y) = (longitude, latitude).
  ASSERT ST_X(p) = sg_lng AND ST_Y(p) = sg_lat, 'x must be longitude and y latitude';
  q := ST_SetSRID(ST_MakePoint(sg_lat, sg_lng), 4326); -- the mistake: swapped arguments
  ASSERT NOT (ST_X(q) BETWEEN 103.55 AND 104.15 AND ST_Y(q) BETWEEN 1.15 AND 1.55),
    'a longitude/latitude swap must fall outside the Singapore bounding box';

  -- 2. Label versus conversion. Relabelling projected metres as degrees produces nonsense, not a point near Singapore.
  q := ST_SetSRID(ST_Transform(p, 3414), 4326); -- the mistake: SVY21 metres labelled as WGS84
  ASSERT NOT (ST_X(q) BETWEEN 103.55 AND 104.15 AND ST_Y(q) BETWEEN 1.15 AND 1.55),
    'relabelled SVY21 coordinates must fall outside the Singapore bounding box';
  ASSERT ST_X(ST_Transform(p, 3414)) BETWEEN 10000 AND 60000 AND ST_Y(ST_Transform(p, 3414)) BETWEEN 10000 AND 60000,
    'SVY21 coordinates of a point in Singapore are tens of thousands of metres from the origin';

  -- 3. Units. The same call means degrees on geometry(4326) and metres on geography.
  q := ST_SetSRID(ST_MakePoint(far_lng, far_lat), 4326);
  ASSERT ST_DWithin(p, q, 500),
    'on geometry(4326) a radius of 500 is 500 degrees, so everything is within it (the mistake this guards against)';
  ASSERT NOT ST_DWithin(p::geography, q::geography, 500),
    'on geography the same radius is 500 metres, and these points are about 24 km apart';
  ASSERT ST_Distance(p::geography, q::geography) BETWEEN 20000 AND 30000, 'geography distance is metres';

  -- 4 and 5. Round trip and distance error over 500 deterministic pairs up to 3 km apart.
  FOR i IN 1..500 LOOP
    a := ST_SetSRID(ST_MakePoint(103.62 + (hashint8(i * 3)::bigint + 2147483648) / 4294967296.0 * 0.43,
                                 1.22 + (hashint8(i * 5)::bigint + 2147483648) / 4294967296.0 * 0.25), 4326);
    b := ST_Project(a::geography, 50 + (hashint8(i * 7)::bigint + 2147483648) / 4294967296.0 * 2950,
                    radians((hashint8(i * 11)::bigint + 2147483648) / 4294967296.0 * 360))::geometry;
    geo := ST_Distance(a::geography, b::geography);
    sph := ST_Distance(a::geography, b::geography, false);
    svy := ST_Distance(ST_Transform(a, 3414), ST_Transform(b, 3414));
    worst_round_trip_deg := greatest(worst_round_trip_deg,
      abs(ST_X(ST_Transform(ST_Transform(a, 3414), 4326)) - ST_X(a)),
      abs(ST_Y(ST_Transform(ST_Transform(a, 3414), 4326)) - ST_Y(a)));
    worst_svy_m := greatest(worst_svy_m, abs(svy - geo));
    rel_max := greatest(rel_max, (sph - geo) / geo);
    rel_min := least(rel_min, (sph - geo) / geo);
    n := n + 1;
  END LOOP;
  ASSERT worst_round_trip_deg < 1e-8, format('SVY21 round trip drifted by %s degrees', worst_round_trip_deg);
  ASSERT worst_svy_m < 0.05, format('SVY21 planar distance differs from the geodesic by %s m (limit 0.05 m up to 3 km)', worst_svy_m);
  ASSERT rel_max BETWEEN 0.005 AND 0.006 AND rel_min BETWEEN -0.0013 AND -0.0010,
    format('the sphere should read north-south +0.56%% and east-west -0.11%% off the spheroid; got %s and %s', rel_max, rel_min);

  RAISE NOTICE 'CRS contract holds: % pairs, SVY21 round trip worst % deg, SVY21 vs geodesic worst % m, sphere vs spheroid % to % (relative)',
    n, worst_round_trip_deg, round(worst_svy_m::numeric, 4), round(rel_min::numeric, 5), round(rel_max::numeric, 5);
END
$contract$;
