/**
 * Buyer-side MRT exit discovery over the application's own PostGIS Worker API.
 * No direct database connections, geocoding, or upstream network traffic.
 */
import { z } from "zod";

const nearbyExitSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("mrt_exit"),
  name: z.string().min(1),
  lat: z.number().finite(),
  lng: z.number().finite(),
  distanceMeters: z.number().finite().nonnegative(),
  addressKey: z.null(),
  stationName: z.string().min(1),
  exitCode: z.string().min(1),
});
const responseSchema = z.object({
  distanceBasis: z.literal("straight-line"),
  places: z.array(nearbyExitSchema).max(25),
});
export type NearbyMrtExit = z.infer<typeof nearbyExitSchema>;
export type NearbyMrtStation = {
  stationName: string;
  exitLabel: string;
  distanceMeters: number;
  exitId: string;
};
export const NEARBY_MRT_RADIUS_METERS = 1500;
export const NEARBY_MRT_EXIT_REQUEST_LIMIT = 25;
export const NEARBY_MRT_STATION_DISPLAY_LIMIT = 5;

/** SQL provides distinct stations; no name-based client reconciliation. */
/**
 * SQL already groups MRT exits by source_properties.STATION_NA before LIMIT.
 * The client only projects the server's independent source fields.
 */
export function groupNearbyMrtExits(exits: readonly NearbyMrtExit[]): NearbyMrtStation[] {
  return exits.slice(0, NEARBY_MRT_STATION_DISPLAY_LIMIT).map((exit) => ({
    stationName: exit.stationName,
    exitLabel: exit.exitCode,
    distanceMeters: exit.distanceMeters,
    exitId: exit.id,
  }));
}

let capabilityPromise: Promise<boolean> | null = null;

/**
 * Memoise only successful boolean capability probes, including successful false.
 * Errors and malformed responses are transient and can be retried on next selection.
 */
export function getNearbySpatialAvailable(): Promise<boolean> {
  if (capabilityPromise) return capabilityPromise;
  const pending = fetch("/api/nearby-capabilities", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Nearby capability probe failed");
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("available" in body) ||
        typeof body.available !== "boolean"
      ) {
        throw new Error("Invalid nearby capability response");
      }
      return body.available;
    })
    .catch(() => {
      if (capabilityPromise === pending) capabilityPromise = null;
      return false;
    });
  capabilityPromise = pending;
  return pending;
}

export function resetNearbySpatialAvailableForTests(): void {
  capabilityPromise = null;
}

export async function fetchNearbyMrtExits(
  lat: number,
  lng: number,
  signal: AbortSignal,
): Promise<NearbyMrtExit[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(NEARBY_MRT_RADIUS_METERS),
    limit: String(NEARBY_MRT_EXIT_REQUEST_LIMIT),
    types: "mrt_exit",
  });
  const response = await fetch("/api/nearby-places?" + params.toString(), { signal });
  if (!response.ok) throw new Error("Nearby MRT lookup failed: " + response.status);
  return responseSchema.parse(await response.json()).places;
}
