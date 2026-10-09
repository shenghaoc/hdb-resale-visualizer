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
    radius: "1500",
    limit: "5",
    types: "mrt_exit",
  });
  const response = await fetch("/api/nearby-places?" + params.toString(), { signal });
  if (!response.ok) throw new Error("Nearby MRT lookup failed: " + response.status);
  return responseSchema.parse(await response.json()).places;
}
