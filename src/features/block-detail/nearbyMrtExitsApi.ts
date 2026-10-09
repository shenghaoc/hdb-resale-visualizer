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

/** Group the nearest 25 exits into up to five station records, keeping the
 * closest exit for each. This does not claim to enumerate every station when
 * more than 25 exit features fall within the selected radius.
 */
export function groupNearbyMrtExits(exits: readonly NearbyMrtExit[]): NearbyMrtStation[] {
  const byStation = new Map<string, NearbyMrtStation>();
  for (const exit of exits) {
    // The persisted MRT admission source builds "STATION_NA (EXIT_CODE)".
    const match = /^(.*?)\s+\((Exit [^)]+)\)$/i.exec(exit.name.trim());
    const stationName = match?.[1]?.trim() || exit.name.trim();
    const exitLabel = match?.[2] || exit.name.trim();
    const key = stationName.normalize("NFKC").toUpperCase();
    const previous = byStation.get(key);
    if (
      !previous ||
      exit.distanceMeters < previous.distanceMeters ||
      (exit.distanceMeters === previous.distanceMeters && exit.id < previous.exitId)
    ) {
      byStation.set(key, {
        stationName,
        exitLabel,
        distanceMeters: exit.distanceMeters,
        exitId: exit.id,
      });
    }
  }
  return [...byStation.values()]
    .sort(
      (a, b) =>
        a.distanceMeters - b.distanceMeters ||
        a.stationName.localeCompare(b.stationName, "en") ||
        a.exitId.localeCompare(b.exitId, "en"),
    )
    .slice(0, NEARBY_MRT_STATION_DISPLAY_LIMIT);
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
