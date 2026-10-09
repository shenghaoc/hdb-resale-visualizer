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
  places: z.array(nearbyExitSchema).max(5),
});
export type NearbyMrtExit = z.infer<typeof nearbyExitSchema>;

let capabilityPromise: Promise<boolean> | null = null;

/** Capability is stable during one deployed page session; cache the probe. */
export function getNearbySpatialAvailable(): Promise<boolean> {
  capabilityPromise ??= fetch("/api/nearby-capabilities", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return false;
      const body: unknown = await response.json();
      return (
        typeof body === "object" && body !== null && "available" in body && body.available === true
      );
    })
    .catch(() => false);
  return capabilityPromise;
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
    radius: "1500",
    limit: "5",
    types: "mrt_exit",
  });
  const response = await fetch("/api/nearby-places?" + params.toString(), { signal });
  if (!response.ok) throw new Error("Nearby MRT lookup failed: " + response.status);
  return responseSchema.parse(await response.json()).places;
}
