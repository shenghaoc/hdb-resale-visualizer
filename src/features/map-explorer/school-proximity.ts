import type { FeatureCollection, Point } from "geojson";
import type { Coordinates, NearbySchool } from "../../types/data";
import {
  classifyPrimarySchoolDistance,
  PRIMARY_SCHOOL_2KM_METERS,
  type SchoolDistanceBand,
} from "../../entities/block/school-proximity";

export type PrimarySchoolWithBand = NearbySchool & {
  coordinates: Coordinates;
  distanceBand: SchoolDistanceBand;
};

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
): FeatureCollection<Point> {
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
