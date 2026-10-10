import { badRequest, jsonResponse, privateJsonResponse, serverError } from "../_lib/d1";
import type { PublicRouteContext, PublicRouteHandler } from "../_lib/public-data";
import { parseNearbyPlacesRequest } from "../../shared/nearby-places";
import type { PublicationLabel } from "../../shared/publication-state";

/**
 * What the route produced. `publication` is set only when a database statement ran and returned a label (null:
 * the database stores no manifest). It is undefined for answers that came from no such statement (invalid input,
 * an unavailable backend, a failed query), which the shared cache neither labels nor stores.
 */
export type NearbyPlacesRead = { response: Response; publication?: PublicationLabel | null };

/**
 * Straight-line proximity only; never replaces existing walking-time evidence.
 *
 * `admit` runs after the request is known to be valid and answerable, immediately before the one statement is sent,
 * and may refuse it with a response of its own. Requests that never reach the database (invalid input, a backend
 * without PostGIS) therefore never spend the rate-limit or statement allowance.
 */
export async function readNearbyPlaces(
  { request, publicData }: PublicRouteContext,
  admit?: () => Promise<Response | null>,
): Promise<NearbyPlacesRead> {
  const parsed = parseNearbyPlacesRequest(new URL(request.url));
  if (!parsed.ok) return { response: badRequest(parsed.error) };
  // D1 rollback still serves every established route. This new indexed
  // PostGIS-only operation is explicitly unavailable, never a fake empty result.
  if (!publicData.nearbyPlaces)
    return {
      response: privateJsonResponse(
        { error: "Spatial search is unavailable on this backend" },
        { status: 503 },
      ),
    };
  const refused = await admit?.();
  if (refused) return { response: refused };
  try {
    const { places, publication } = await publicData.nearbyPlaces(parsed.request);
    return {
      response: jsonResponse({
        center: { lat: parsed.request.lat, lng: parsed.request.lng },
        radiusMeters: parsed.request.radiusMeters,
        limit: parsed.request.limit,
        types: parsed.request.kinds,
        distanceBasis: "straight-line",
        places,
      }),
      publication,
    };
  } catch (error) {
    console.error("Nearby places spatial query failed:", error);
    return { response: serverError("Internal server error") };
  }
}

export const onRequestGet: PublicRouteHandler = async (context) =>
  (await readNearbyPlaces(context)).response;
