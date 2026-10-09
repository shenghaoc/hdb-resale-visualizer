import { badRequest, jsonResponse, privateJsonResponse, serverError } from "../_lib/d1";
import type { PublicRouteHandler } from "../_lib/public-data";
import { parseNearbyPlacesRequest } from "../../shared/nearby-places";

/** Straight-line proximity only; never replaces existing walking-time evidence. */
export const onRequestGet: PublicRouteHandler = async ({ request, publicData }) => {
  const parsed = parseNearbyPlacesRequest(new URL(request.url));
  if (!parsed.ok) return badRequest(parsed.error);
  // D1 rollback still serves every established route. This new indexed
  // PostGIS-only operation is explicitly unavailable, never a fake empty result.
  if (!publicData.nearbyPlaces)
    return privateJsonResponse(
      { error: "Spatial search is unavailable on this backend" },
      { status: 503 },
    );
  try {
    const places = await publicData.nearbyPlaces(parsed.request);
    return jsonResponse({
      center: { lat: parsed.request.lat, lng: parsed.request.lng },
      radiusMeters: parsed.request.radiusMeters,
      limit: parsed.request.limit,
      types: parsed.request.kinds,
      distanceBasis: "straight-line",
      places,
    });
  } catch (error) {
    console.error("Nearby places spatial query failed:", error);
    return serverError("Internal server error");
  }
};
