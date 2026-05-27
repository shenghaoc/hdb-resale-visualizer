import type { Coordinates, NearbySchool } from "../types/data";

const PRIMARY_SCHOOL_1KM_METERS = 1_000;
const PRIMARY_SCHOOL_2KM_METERS = 2_000;

export type SchoolDistanceBand = "within1km" | "within2km" | "beyond2km";

export type PrimarySchoolWithBand = NearbySchool & {
  coordinates: Coordinates;
  distanceBand: SchoolDistanceBand;
};

export function classifyPrimarySchoolDistance(distanceMeters: number): SchoolDistanceBand | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return null;
  }

  if (distanceMeters <= PRIMARY_SCHOOL_1KM_METERS) {
    return "within1km";
  }

  if (distanceMeters <= PRIMARY_SCHOOL_2KM_METERS) {
    return "within2km";
  }

  return "beyond2km";
}

export function getPrimarySchoolsForOverlay(
  schools: NearbySchool[],
  maxDistanceMeters = PRIMARY_SCHOOL_2KM_METERS,
): PrimarySchoolWithBand[] {
  return schools.flatMap((school) => {
    const distanceBand = classifyPrimarySchoolDistance(school.distanceMeters);
    if (!school.coordinates || !distanceBand || school.distanceMeters > maxDistanceMeters) {
      return [];
    }

    return [
      {
        ...school,
        coordinates: school.coordinates,
        distanceBand,
      },
    ];
  });
}

export function primarySchoolsToGeoJson(
  schools: PrimarySchoolWithBand[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: schools.map((school) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [school.coordinates.lng, school.coordinates.lat],
      },
      properties: {
        name: school.name,
        distance_meters: school.distanceMeters,
        distance_band: school.distanceBand,
      },
    })),
  };
}
